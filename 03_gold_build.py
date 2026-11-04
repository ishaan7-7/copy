# Databricks notebook source
# MAGIC %md
# MAGIC # Unit 3 - Gold build: graph node/edge projection (thin graph, thick lakehouse)
# MAGIC
# MAGIC Projects every SILVER table into a graph-ready shape, ported directly from the reference design's
# MAGIC `config/graph_model.yaml` (same source dataset, so every table/column reference resolves against our own
# MAGIC `silver_<system>__<table>` tables unchanged - verified directly against `_metadata/table_inventory.csv` and
# MAGIC `nbs_common.py` before this notebook was written, not assumed).
# MAGIC
# MAGIC **Scope of this unit** (deliberately narrower than the reference's own `03_gold_build.py`):
# MAGIC * `gold_graph_nodes` - one row per graph node (32 labels): `label`, `key` + 4 traversal properties
# MAGIC   (`name`, `category`, `ts_from`, `ts_to`). CDF enabled for Unit 4's incremental Neo4j sync.
# MAGIC * `gold_graph_edges` - one row per relationship (58 types): `type`, endpoints, `edge_id` + 4 traversal
# MAGIC   properties (`step`, `ts_from`, `ts_to`, `qty`). CDF enabled.
# MAGIC * `ops_graph_build_report` - candidate vs. dangling edge counts per type (a **finding**, not an error -
# MAGIC   e.g. an NCR trace value that matches no container - inspect before Unit 4 syncs it to Neo4j).
# MAGIC
# MAGIC **Deliberately deferred, not part of this unit:**
# MAGIC * The ~39 `gold_v_*` hydration views (property lookups for the "thick lakehouse" side) - real, useful,
# MAGIC   but a separate self-contained piece of work -> Unit 3b.
# MAGIC * The `change_events` unified timeline and the `facts` parameterized query catalog from the reference's
# MAGIC   `hydration.yaml` - those back an agent/API layer nobody has asked for yet on this replica. Flagging this
# MAGIC   explicitly rather than silently building (or silently skipping) scope beyond what was asked.

# COMMAND ----------

dbutils.widgets.text("catalog", "cmegtmdev")
dbutils.widgets.text("schema", "manufacturing_coe")
CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
FQN = f"{CATALOG}.{SCHEMA}"

import yaml
from pyspark.sql import functions as F

spark.conf.set("spark.sql.session.timeZone", "UTC")
TS_FMT = "yyyy-MM-dd'T'HH:mm:ss"


def render(sql):
    # {silver}.normalize_resource is a SQL function registered directly on {FQN} in Unit 2 (no separate
    # "silver" schema to qualify it with here), not a silver_<system>__<table> table - handle it before the
    # general table-reference rewrite below, or it would get mangled into a nonexistent "silver_normalize_resource".
    sql = sql.replace("{silver}.normalize_resource", f"{FQN}.normalize_resource")
    return sql.replace("{silver}.", f"{FQN}.silver_")

# COMMAND ----------

# MAGIC %md ## 1. The graph model - ported verbatim from the reference's `config/graph_model.yaml`
# MAGIC (only the `{silver}.` placeholder addressing changed, from a separate schema to this project's
# MAGIC single-schema `silver_<system>__<table>` naming - the node/edge SQL itself is untouched)

# COMMAND ----------

GRAPH_MODEL_YAML = r"""
nodes:
  Material:
    system: ERP
    desc: SAP material (also MES product, Maximo item)
    sql: |
      SELECT m.matnr AS key, t.maktx AS name, m.mtart AS category, CAST(NULL AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.erp__mara m LEFT JOIN {silver}.erp__makt t ON t.matnr = m.matnr
  ItemRevision:
    system: PLM
    desc: Teamcenter item revision (key = item_id/revision)
    sql: |
      SELECT concat(item_id, '/', item_revision_id) AS key, object_name AS name, release_status AS category,
             date_released AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.plm__tc_item_revision
  Characteristic:
    system: PLM
    desc: Product characteristic (CC/SC) on an item revision
    sql: |
      SELECT char_id AS key, characteristic AS name, coalesce(classification, 'Standard') AS category,
             CAST(NULL AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.plm__tc_characteristic
  ChangeNotice:
    system: PLM
    desc: Engineering change notice (ECN)
    sql: |
      SELECT item_id AS key, object_name AS name, status AS category,
             try_cast(effectivity_date AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.plm__tc_change_notice
  ChangeRequest:
    system: PLM
    desc: Engineering change request (ECR)
    sql: |
      SELECT item_id AS key, object_name AS name, status AS category, creation_date AS ts_from, decision_date AS ts_to
      FROM {silver}.plm__tc_change_request
  ProblemReport:
    system: PLM
    desc: Problem report (PR)
    sql: |
      SELECT item_id AS key, object_name AS name, status AS category, creation_date AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.plm__tc_problem_report
  Vendor:
    system: ERP
    desc: Supplier
    sql: |
      SELECT lifnr AS key, name1 AS name, sortl AS category, CAST(NULL AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.erp__lfa1
  Customer:
    system: ERP
    desc: Customer
    sql: |
      SELECT kunnr AS key, name1 AS name, ktokd AS category, CAST(NULL AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.erp__kna1
  Batch:
    system: ERP
    desc: SAP batch (key = MATNR|CHARG)
    sql: |
      SELECT concat(matnr, '|', charg) AS key, concat(matnr, ' / ', charg) AS name,
             CASE WHEN lifnr IS NOT NULL THEN 'Purchased' ELSE 'Produced' END AS category,
             CAST(lwedt AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.erp__mcha
  ProductionOrder:
    system: ERP
    desc: SAP production order (= MES MfgOrder)
    sql: |
      SELECT a.aufnr AS key, k.ktext AS name, k.auart AS category, CAST(a.gstrp AS TIMESTAMP) AS ts_from, CAST(a.getri AS TIMESTAMP) AS ts_to
      FROM {silver}.erp__afko a JOIN {silver}.erp__aufk k ON k.aufnr = a.aufnr
  WorkCenter:
    system: ERP
    desc: SAP work center
    sql: |
      SELECT h.arbpl AS key, t.ktext AS name, h.verwe AS category, CAST(NULL AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.erp__crhd h LEFT JOIN {silver}.erp__crtx t ON t.objid = h.objid
  Resource:
    system: MES
    desc: Machine / station / tester (canonical equipment identity)
    sql: |
      SELECT resource_name AS key, description AS name, resource_type AS category, CAST(NULL AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.mes__resource
  Asset:
    system: CMMS
    desc: Maximo asset (incl. sub-assets and utilities)
    sql: |
      SELECT assetnum AS key, description AS name, failurecode AS category, try_cast(installdate AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.cmms__asset
  Spec:
    system: MES
    desc: MES spec / process step (revisions are hydrated, revision used is on PROCESSED_UNDER edges)
    sql: |
      SELECT spec_name AS key, max(description) AS name, max(operation) AS category, min(effective_from) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.mes__spec GROUP BY spec_name
  Container:
    system: MES
    desc: MES container (lot / pack lot)
    sql: |
      SELECT container_name AS key, container_name AS name, product AS category, start_date AS ts_from, completed_date AS ts_to
      FROM {silver}.mes__container
  Serial:
    system: MES
    desc: Serialized caliper
    sql: |
      SELECT serial_number AS key, serial_number AS name, final_status AS category, st10_timestamp AS ts_from, eol_timestamp AS ts_to
      FROM {silver}.mes__serial_test_result
  ToolInstance:
    system: MES
    desc: Cutting tool instance (mounted on a machine for a period)
    sql: |
      SELECT tool_instance_id AS key, tool_description AS name, tool_pocket AS category, mounted_date AS ts_from, removed_date AS ts_to
      FROM {silver}.mes__tool_life
  Employee:
    system: MES
    desc: Person (key = lower-case login, shared by MES / SAP user / Maximo / Teamcenter)
    sql: |
      SELECT lower(employee_name) AS key, full_name AS name, role AS category, hire_date AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.mes__employee
  Delivery:
    system: ERP
    desc: Outbound delivery
    sql: |
      SELECT vbeln AS key, concat('Delivery ', vbeln) AS name, lfart AS category, CAST(wadat AS TIMESTAMP) AS ts_from, CAST(wadat_ist AS TIMESTAMP) AS ts_to
      FROM {silver}.erp__likp
  Defect:
    system: MES
    desc: Defect record (container- or serial-level)
    sql: |
      SELECT defect_id AS key, defect_description AS name, defect_code AS category, txn_date AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.mes__defect
  Hold:
    system: MES
    desc: Container hold
    sql: |
      SELECT hold_id AS key, hold_reason AS name, hold_reason AS category, hold_date AS ts_from, release_date AS ts_to
      FROM {silver}.mes__hold
  NCR:
    system: QMS
    sql: |
      SELECT ncr_id AS key, title AS name, ncr_type AS category, date_opened AS ts_from, date_closed AS ts_to
      FROM {silver}.qms__ncr
  Complaint:
    system: QMS
    sql: |
      SELECT complaint_id AS key, symptom AS name, complaint_type AS category, date_received AS ts_from, date_closed AS ts_to
      FROM {silver}.qms__customer_complaint
  EightD:
    system: QMS
    sql: |
      SELECT eight_d_id AS key, title AS name, status AS category, date_opened AS ts_from, date_closed AS ts_to
      FROM {silver}.qms__eight_d
  CAPA:
    system: QMS
    sql: |
      SELECT capa_id AS key, description AS name, capa_type AS category, date_opened AS ts_from, date_completed AS ts_to
      FROM {silver}.qms__capa
  SCAR:
    system: QMS
    sql: |
      SELECT scar_id AS key, problem_description AS name, status AS category, date_issued AS ts_from, date_closed AS ts_to
      FROM {silver}.qms__scar
  Deviation:
    system: QMS
    sql: |
      SELECT deviation_id AS key, deviating_condition AS name, deviation_type AS category, start_date AS ts_from, end_date AS ts_to
      FROM {silver}.qms__deviation
  Gauge:
    system: QMS
    sql: |
      SELECT gauge_id AS key, description AS name, gauge_type AS category, last_cal_date AS ts_from, next_due_date AS ts_to
      FROM {silver}.qms__gauge
  LabTest:
    system: QMS
    sql: |
      SELECT lab_test_id AS key, test_type AS name, result AS category, request_date AS ts_from, completed_date AS ts_to
      FROM {silver}.qms__lab_test
  WorkOrder:
    system: CMMS
    sql: |
      SELECT wonum AS key, description AS name, worktype AS category, reportdate AS ts_from, actfinish AS ts_to
      FROM {silver}.cmms__workorder
  PM:
    system: CMMS
    sql: |
      SELECT pmnum AS key, description AS name, frequnit AS category, CAST(NULL AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.cmms__pm
  MeasurePoint:
    system: CMMS
    sql: |
      SELECT pointnum AS key, description AS name, metername AS category, CAST(NULL AS TIMESTAMP) AS ts_from, CAST(NULL AS TIMESTAMP) AS ts_to
      FROM {silver}.cmms__measurepoint

# -----------------------------------------------------------------------------
edges:
  # ---- engineering ---------------------------------------------------------
  DEFINED_BY:            {from: Material, to: ItemRevision, sql: "SELECT matnr AS src_key, concat(zeinr, '/', zeivr) AS dst_key FROM {silver}.erp__mara WHERE zeinr IS NOT NULL"}
  HAS_CHARACTERISTIC:    {from: ItemRevision, to: Characteristic, sql: "SELECT concat(item_id, '/', item_revision_id) AS src_key, char_id AS dst_key FROM {silver}.plm__tc_characteristic"}
  RELEASED:
    from: ChangeNotice
    to: ItemRevision
    sql: |
      SELECT r.released_by_change AS src_key, concat(r.item_id, '/', r.item_revision_id) AS dst_key, r.date_released AS ts_from
      FROM {silver}.plm__tc_item_revision r JOIN {silver}.plm__tc_change_notice n ON n.item_id = r.released_by_change
  IMPLEMENTS:
    polymorphic: true
    sql: |
      SELECT 'ChangeNotice' AS src_label, primary_object AS src_key, 'ChangeRequest' AS dst_label, secondary_object AS dst_key
      FROM {silver}.plm__tc_change_relation WHERE relation_type = 'CMImplements' AND secondary_type = 'ChangeRequest'
      UNION ALL
      SELECT 'ChangeRequest', primary_object, 'ProblemReport', secondary_object
      FROM {silver}.plm__tc_change_relation WHERE relation_type = 'CMImplements' AND secondary_type = 'ProblemReport'
  IMPACTS:               {from: ChangeRequest, to: ItemRevision, sql: "SELECT primary_object AS src_key, secondary_object AS dst_key FROM {silver}.plm__tc_change_relation WHERE relation_type = 'CMHasImpactedItem'"}
  HAS_SOLUTION_ITEM:     {from: ChangeNotice, to: ItemRevision, sql: "SELECT primary_object AS src_key, secondary_object AS dst_key FROM {silver}.plm__tc_change_relation WHERE relation_type = 'CMHasSolutionItem'"}
  RAISED_FROM:           {from: ProblemReport, to: Complaint, sql: "SELECT item_id AS src_key, external_reference AS dst_key FROM {silver}.plm__tc_problem_report WHERE external_reference IS NOT NULL"}
  SPEC_IMPLEMENTS:
    from: Spec
    to: Characteristic
    sql: |
      SELECT spec_name AS src_key, characteristic_ref AS dst_key, max(spec_revision) AS step
      FROM {silver}.mes__spec_parameter WHERE characteristic_ref IS NOT NULL GROUP BY spec_name, characteristic_ref

  # ---- supply chain & orders ---------------------------------------------
  OF_MATERIAL:           {from: Batch, to: Material, sql: "SELECT concat(matnr, '|', charg) AS src_key, matnr AS dst_key FROM {silver}.erp__mcha"}
  SUPPLIED_BY:           {from: Batch, to: Vendor, sql: "SELECT concat(matnr, '|', charg) AS src_key, lifnr AS dst_key, CAST(lwedt AS TIMESTAMP) AS ts_from FROM {silver}.erp__mcha WHERE lifnr IS NOT NULL"}
  PRODUCES:              {from: ProductionOrder, to: Batch, sql: "SELECT aufnr AS src_key, concat(matnr, '|', charg) AS dst_key FROM {silver}.erp__afpo"}
  FOR_MATERIAL:          {from: ProductionOrder, to: Material, sql: "SELECT aufnr AS src_key, plnbez AS dst_key FROM {silver}.erp__afko"}
  TO_CUSTOMER:           {from: Delivery, to: Customer, sql: "SELECT vbeln AS src_key, kunnr AS dst_key, CAST(wadat_ist AS TIMESTAMP) AS ts_from FROM {silver}.erp__likp"}
  DELIVERS_BATCH:        {from: Delivery, to: Batch, sql: "SELECT vbeln AS src_key, concat(matnr, '|', charg) AS dst_key, sum(try_cast(lfimg AS DOUBLE)) AS qty FROM {silver}.erp__lips GROUP BY vbeln, matnr, charg"}

  # ---- shop floor genealogy -----------------------------------------------
  FROM_ORDER:            {from: Container, to: ProductionOrder, sql: "SELECT container_name AS src_key, mfg_order_name AS dst_key, start_date AS ts_from FROM {silver}.mes__container"}
  OF_PRODUCT:            {from: Container, to: Material, sql: "SELECT container_name AS src_key, product AS dst_key FROM {silver}.mes__container"}
  CONSUMED:
    from: Container
    to: Batch
    sql: |
      SELECT container_name AS src_key, concat(component_product, '|', component_lot) AS dst_key, min(step_name) AS step,
             min(txn_date) AS ts_from, sum(try_cast(issue_qty AS DOUBLE)) AS qty
      FROM {silver}.mes__component_issue
      WHERE component_lot IS NOT NULL AND from_container_name IS NULL
      GROUP BY container_name, component_product, component_lot
  CONSUMED_CONTAINER:
    from: Container
    to: Container
    sql: |
      SELECT container_name AS src_key, from_container_name AS dst_key, min(txn_date) AS ts_from, sum(try_cast(issue_qty AS DOUBLE)) AS qty
      FROM {silver}.mes__component_issue WHERE from_container_name IS NOT NULL
      GROUP BY container_name, from_container_name
  PACKED_IN:             {from: Serial, to: Container, sql: "SELECT serial_number AS src_key, container_name AS dst_key, eol_timestamp AS ts_from FROM {silver}.mes__serial_test_result"}
  HAS_HOUSING_FROM:      {from: Serial, to: Container, sql: "SELECT serial_number AS src_key, housing_container AS dst_key, st10_timestamp AS ts_from FROM {silver}.mes__serial_test_result"}
  HAS_BRACKET_FROM:      {from: Serial, to: Container, sql: "SELECT serial_number AS src_key, bracket_container AS dst_key, st10_timestamp AS ts_from FROM {silver}.mes__serial_test_result"}
  PROCESSED_ON:
    from: Container
    to: Resource
    desc: >
      one edge per container x step x resource; ts window = MoveIn .. MoveStd. Secondary resources that appear only in data
      collection (e.g. cure oven OVN-01 at the e-coat step) are added from DATA_COLLECTION.
    sql: |
      WITH h AS (
        SELECT container_name, resource_name, step_name,
               min(CASE WHEN txn_type = 'MoveIn' THEN txn_date END) AS ts_from,
               max(CASE WHEN txn_type = 'MoveStd' THEN txn_date END) AS ts_to,
               max(CASE WHEN txn_type = 'MoveStd' THEN try_cast(qty AS DOUBLE) END) AS qty
        FROM {silver}.mes__history_mainline
        WHERE txn_type IN ('MoveIn', 'MoveStd') AND resource_name IS NOT NULL
        GROUP BY container_name, resource_name, step_name),
      d AS (
        SELECT container_name, resource_name, step_name, min(txn_date) AS ts_from, max(txn_date) AS ts_to, CAST(NULL AS DOUBLE) AS qty
        FROM {silver}.mes__data_collection WHERE container_name IS NOT NULL
        GROUP BY container_name, resource_name, step_name)
      SELECT container_name AS src_key, resource_name AS dst_key, step_name AS step, ts_from, ts_to, qty FROM h
      UNION ALL
      SELECT d.container_name, d.resource_name, d.step_name, d.ts_from, d.ts_to, d.qty
      FROM d LEFT ANTI JOIN h ON h.container_name = d.container_name AND h.resource_name = d.resource_name AND h.step_name = d.step_name
  PROCESSED_UNDER:
    from: Container
    to: Spec
    desc: step = spec revision actually used (as-built)
    sql: |
      SELECT container_name AS src_key, step_name AS dst_key, max(spec_revision) AS step, min(txn_date) AS ts_from
      FROM {silver}.mes__history_mainline
      WHERE txn_type = 'MoveStd' AND step_name IS NOT NULL
      GROUP BY container_name, step_name
  PROCESSED_BY:
    from: Container
    to: Employee
    sql: |
      SELECT container_name AS src_key, lower(employee) AS dst_key, step_name AS step, min(txn_date) AS ts_from
      FROM {silver}.mes__history_mainline
      WHERE txn_type = 'MoveStd' AND employee IS NOT NULL
      GROUP BY container_name, lower(employee), step_name
  MACHINED_WITH:
    from: Container
    to: ToolInstance
    desc: derived - container processing window overlaps tool mount window on the same machine
    sql: |
      WITH p AS (
        SELECT container_name, resource_name, step_name,
               min(CASE WHEN txn_type = 'MoveIn' THEN txn_date END) AS t0,
               max(CASE WHEN txn_type = 'MoveStd' THEN txn_date END) AS t1
        FROM {silver}.mes__history_mainline
        WHERE txn_type IN ('MoveIn', 'MoveStd') AND resource_name IN (SELECT DISTINCT resource_name FROM {silver}.mes__tool_life)
        GROUP BY container_name, resource_name, step_name)
      SELECT p.container_name AS src_key, t.tool_instance_id AS dst_key, p.step_name AS step,
             greatest(p.t0, t.mounted_date) AS ts_from, least(p.t1, coalesce(t.removed_date, p.t1)) AS ts_to
      FROM p JOIN {silver}.mes__tool_life t
        ON t.resource_name = p.resource_name
       AND t.mounted_date < p.t1 AND coalesce(t.removed_date, TIMESTAMP '2999-12-31') > p.t0
  SHIPPED_IN:            {from: Container, to: Delivery, sql: "SELECT container_name AS src_key, shipped_delivery AS dst_key, ship_date AS ts_from FROM {silver}.mes__container WHERE shipped_delivery IS NOT NULL"}

  # ---- equipment ------------------------------------------------------------
  IN_WORKCENTER:         {from: Resource, to: WorkCenter, sql: "SELECT resource_name AS src_key, erp_work_center AS dst_key FROM {silver}.mes__resource"}
  SAME_AS:
    from: Resource
    to: Asset
    desc: entity resolution - Maximo ASSETSPEC MES_RESOURCE (normalized) UNION MES AssetTag
    sql: |
      SELECT {silver}.normalize_resource(alnvalue) AS src_key, assetnum AS dst_key
      FROM {silver}.cmms__assetspec WHERE assetattrid = 'MES_RESOURCE'
      UNION
      SELECT resource_name, asset_tag FROM {silver}.mes__resource WHERE asset_tag IS NOT NULL
  PART_OF:               {from: Asset, to: Asset, sql: "SELECT assetnum AS src_key, parent AS dst_key FROM {silver}.cmms__asset WHERE parent IS NOT NULL"}
  COOLANT_FROM:          {from: Asset, to: Asset, sql: "SELECT assetnum AS src_key, alnvalue AS dst_key FROM {silver}.cmms__assetspec WHERE assetattrid = 'COOLANT_SUPPLY' AND alnvalue RLIKE '^[0-9]+'"}
  MOUNTED_ON:            {from: ToolInstance, to: Resource, sql: "SELECT tool_instance_id AS src_key, resource_name AS dst_key, tool_pocket AS step, mounted_date AS ts_from, removed_date AS ts_to FROM {silver}.mes__tool_life"}
  CERTIFIED_FOR:         {from: Employee, to: Resource, sql: "SELECT lower(employee_name) AS src_key, resource AS dst_key, status AS step, issue_date AS ts_from, expiry_date AS ts_to FROM {silver}.mes__employee_certification"}
  USED_AT:               {from: Gauge, to: Resource, sql: "SELECT gauge_id AS src_key, assigned_resource AS dst_key FROM {silver}.qms__gauge WHERE assigned_resource IS NOT NULL"}

  # ---- maintenance ------------------------------------------------------------
  ON_ASSET:              {from: WorkOrder, to: Asset, sql: "SELECT wonum AS src_key, assetnum AS dst_key, worktype AS step, reportdate AS ts_from, actfinish AS ts_to FROM {silver}.cmms__workorder WHERE assetnum IS NOT NULL"}
  FROM_PM:               {from: WorkOrder, to: PM, sql: "SELECT wonum AS src_key, pmnum AS dst_key FROM {silver}.cmms__workorder WHERE pmnum IS NOT NULL"}
  MAINTAINS:             {from: PM, to: Asset, sql: "SELECT pmnum AS src_key, assetnum AS dst_key FROM {silver}.cmms__pm"}
  MONITORS:              {from: MeasurePoint, to: Asset, sql: "SELECT pointnum AS src_key, assetnum AS dst_key FROM {silver}.cmms__measurepoint"}

  # ---- quality ----------------------------------------------------------------
  DEFECT_ON:             {from: Defect, to: Container, sql: "SELECT defect_id AS src_key, container_name AS dst_key, step_name AS step, txn_date AS ts_from, try_cast(qty AS DOUBLE) AS qty FROM {silver}.mes__defect"}
  DEFECT_ON_SERIAL:      {from: Defect, to: Serial, sql: "SELECT defect_id AS src_key, serial_number AS dst_key, step_name AS step, txn_date AS ts_from FROM {silver}.mes__defect WHERE serial_number IS NOT NULL"}
  DETECTED_AT:           {from: Defect, to: Resource, sql: "SELECT defect_id AS src_key, resource_name AS dst_key, step_name AS step, txn_date AS ts_from FROM {silver}.mes__defect WHERE resource_name IS NOT NULL"}
  HOLDS:                 {from: Hold, to: Container, sql: "SELECT hold_id AS src_key, container_name AS dst_key, hold_date AS ts_from, release_date AS ts_to FROM {silver}.mes__hold"}
  DOCUMENTED_IN:         {from: Hold, to: NCR, sql: "SELECT hold_id AS src_key, external_ref AS dst_key FROM {silver}.mes__hold WHERE external_ref IS NOT NULL"}
  INVOLVES:
    polymorphic: true
    desc: NCR traceability (NCR_TRACE) resolved to graph keys
    sql: |
      SELECT 'NCR' AS src_label, t.ncr_id AS src_key, x.label AS dst_label, x.key AS dst_key
      FROM {silver}.qms__ncr_trace t
      JOIN (
        SELECT 'Container' AS ref_type, container_name AS ref_value, 'Container' AS label, container_name AS key FROM {silver}.mes__container
        UNION ALL SELECT 'Serial', serial_number, 'Serial', serial_number FROM {silver}.mes__serial_test_result
        UNION ALL SELECT 'Batch', charg, 'Batch', concat(matnr, '|', charg) FROM {silver}.erp__mcha
        UNION ALL SELECT 'VendorBatch', licha, 'Batch', concat(matnr, '|', charg) FROM {silver}.erp__mcha WHERE licha IS NOT NULL
        UNION ALL SELECT 'WorkOrder', wonum, 'WorkOrder', wonum FROM {silver}.cmms__workorder
        UNION ALL SELECT 'Delivery', vbeln, 'Delivery', vbeln FROM {silver}.erp__likp
        UNION ALL SELECT 'ToolInstance', tool_instance_id, 'ToolInstance', tool_instance_id FROM {silver}.mes__tool_life
        UNION ALL SELECT 'Gauge', gauge_id, 'Gauge', gauge_id FROM {silver}.qms__gauge
        UNION ALL SELECT 'Resource', resource_name, 'Resource', resource_name FROM {silver}.mes__resource
      ) x ON x.ref_type = t.ref_type AND x.ref_value = t.ref_value
  OCCURRED_ON:
    from: NCR
    to: Resource
    sql: |
      SELECT ncr_id AS src_key, trim(r) AS dst_key FROM {silver}.qms__ncr LATERAL VIEW explode(split(mes_resource, ';')) e AS r
      WHERE mes_resource IS NOT NULL AND trim(r) <> ''
  CONCERNS_MATERIAL:
    from: NCR
    to: Material
    sql: |
      SELECT ncr_id AS src_key, trim(m) AS dst_key FROM {silver}.qms__ncr LATERAL VIEW explode(split(sap_material, ';')) e AS m
      WHERE sap_material IS NOT NULL AND trim(m) <> ''
  AGAINST_SUPPLIER:      {from: NCR, to: Vendor, sql: "SELECT ncr_id AS src_key, vendor AS dst_key FROM {silver}.qms__ncr WHERE vendor IS NOT NULL"}
  INVESTIGATED_IN:
    polymorphic: true
    sql: |
      SELECT 'NCR' AS src_label, ncr_id AS src_key, 'EightD' AS dst_label, linked_8d AS dst_key FROM {silver}.qms__ncr WHERE linked_8d IS NOT NULL
      UNION ALL
      SELECT 'Complaint', complaint_id, 'EightD', eight_d_id FROM {silver}.qms__customer_complaint WHERE eight_d_id IS NOT NULL
  ESCALATED_TO:          {from: NCR, to: SCAR, sql: "SELECT ncr_id AS src_key, linked_scar AS dst_key FROM {silver}.qms__ncr WHERE linked_scar IS NOT NULL"}
  RAISED_BY:             {from: Complaint, to: Customer, sql: "SELECT complaint_id AS src_key, customer_id AS dst_key, date_received AS ts_from FROM {silver}.qms__customer_complaint"}
  REPORTS:
    polymorphic: true
    desc: complaint serial / lot references resolved to Serial or Batch
    sql: |
      WITH r AS (
        SELECT complaint_id, trim(v) AS ref FROM {silver}.qms__customer_complaint
        LATERAL VIEW explode(split(serials_or_lots_reported, ';')) e AS v WHERE serials_or_lots_reported IS NOT NULL)
      SELECT 'Complaint' AS src_label, r.complaint_id AS src_key, 'Serial' AS dst_label, s.serial_number AS dst_key
      FROM r JOIN {silver}.mes__serial_test_result s ON s.serial_number = r.ref
      UNION ALL
      SELECT 'Complaint', r.complaint_id, 'Batch', concat(b.matnr, '|', b.charg)
      FROM r JOIN {silver}.erp__mcha b ON b.charg = r.ref
  CONCERNS_DELIVERY:
    from: Complaint
    to: Delivery
    sql: |
      SELECT complaint_id AS src_key, trim(d) AS dst_key FROM {silver}.qms__customer_complaint
      LATERAL VIEW explode(split(sap_deliveries, ';')) e AS d WHERE sap_deliveries IS NOT NULL AND trim(d) <> ''
  ACTION_FOR:
    polymorphic: true
    sql: |
      SELECT 'CAPA' AS src_label, capa_id AS src_key,
             CASE WHEN source_id LIKE '8D-%' THEN 'EightD' WHEN source_id LIKE 'NCR-%' THEN 'NCR' ELSE 'SCAR' END AS dst_label,
             source_id AS dst_key
      FROM {silver}.qms__capa WHERE source_id IS NOT NULL
  ISSUED_TO:             {from: SCAR, to: Vendor, sql: "SELECT scar_id AS src_key, vendor_id AS dst_key, date_issued AS ts_from FROM {silver}.qms__scar"}
  SCAR_CONCERNS:         {from: SCAR, to: Batch, sql: "SELECT scar_id AS src_key, concat(sap_material, '|', sap_batch) AS dst_key FROM {silver}.qms__scar WHERE sap_batch IS NOT NULL"}
  DEVIATES_MATERIAL:
    from: Deviation
    to: Material
    sql: |
      SELECT deviation_id AS src_key, trim(m) AS dst_key, start_date AS ts_from, end_date AS ts_to FROM {silver}.qms__deviation
      LATERAL VIEW explode(split(sap_material, ';')) e AS m WHERE sap_material IS NOT NULL
  DEVIATION_SUPPLIER:    {from: Deviation, to: Vendor, sql: "SELECT deviation_id AS src_key, vendor_id AS dst_key, start_date AS ts_from, end_date AS ts_to FROM {silver}.qms__deviation WHERE vendor_id IS NOT NULL"}
  TESTED:
    polymorphic: true
    sql: |
      SELECT 'LabTest' AS src_label, l.lab_test_id AS src_key, 'Container' AS dst_label, l.sample_ref AS dst_key
      FROM {silver}.qms__lab_test l WHERE l.sample_source_type = 'MES Container'
      UNION ALL
      SELECT 'LabTest', l.lab_test_id, 'Serial', l.sample_ref FROM {silver}.qms__lab_test l WHERE l.sample_source_type = 'Serial'
      UNION ALL
      SELECT 'LabTest', l.lab_test_id, 'Batch', concat(b.matnr, '|', b.charg)
      FROM {silver}.qms__lab_test l JOIN {silver}.erp__mcha b ON b.charg = l.sample_ref WHERE l.sample_source_type = 'SAP Batch'
  EVIDENCE_FOR:
    polymorphic: true
    sql: |
      SELECT 'LabTest' AS src_label, lab_test_id AS src_key,
             CASE WHEN linked_record LIKE '8D-%' THEN 'EightD' ELSE 'NCR' END AS dst_label, linked_record AS dst_key
      FROM {silver}.qms__lab_test WHERE linked_record IS NOT NULL
"""

GM = yaml.safe_load(GRAPH_MODEL_YAML)
print(len(GM["nodes"]), "node labels,", len(GM["edges"]), "edge types")

# COMMAND ----------

# MAGIC %md ## 2. Graph node projection

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {FQN}.gold_graph_nodes (
  label STRING NOT NULL, key STRING NOT NULL, name STRING, category STRING, ts_from STRING, ts_to STRING, row_hash STRING)
CLUSTER BY (label, key)
TBLPROPERTIES (delta.enableChangeDataFeed = true)""")

node_frames = []
for label, spec in GM["nodes"].items():
    df = spark.sql(render(spec["sql"]))
    node_frames.append(df.select(
        F.lit(label).alias("label"),
        F.col("key").cast("string").alias("key"),
        F.col("name").cast("string").alias("name"),
        F.col("category").cast("string").alias("category"),
        F.date_format(F.col("ts_from").cast("timestamp"), TS_FMT).alias("ts_from"),
        F.date_format(F.col("ts_to").cast("timestamp"), TS_FMT).alias("ts_to")))
nodes = node_frames[0]
for f in node_frames[1:]:
    nodes = nodes.unionByName(f)
nodes = (nodes.where("key IS NOT NULL")
              .dropDuplicates(["label", "key"])
              .withColumn("row_hash", F.sha2(F.concat_ws("||", "name", "category", "ts_from", "ts_to"), 256)))
nodes.createOrReplaceTempView("staged_nodes")
spark.sql(f"""
MERGE INTO {FQN}.gold_graph_nodes t USING staged_nodes s
ON t.label = s.label AND t.key = s.key
WHEN MATCHED AND t.row_hash <> s.row_hash THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
WHEN NOT MATCHED BY SOURCE THEN DELETE""")
display(spark.table(f"{FQN}.gold_graph_nodes").groupBy("label").count().orderBy("label"))

# COMMAND ----------

# MAGIC %md ## 3. Graph edge projection (+ dangling-edge check)

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {FQN}.gold_graph_edges (
  type STRING NOT NULL, src_label STRING NOT NULL, src_key STRING NOT NULL, dst_label STRING NOT NULL, dst_key STRING NOT NULL,
  edge_id STRING NOT NULL, step STRING, ts_from STRING, ts_to STRING, qty DOUBLE, row_hash STRING)
CLUSTER BY (type, src_key)
TBLPROPERTIES (delta.enableChangeDataFeed = true)""")

edge_frames = []
for rel, spec in GM["edges"].items():
    df = spark.sql(render(spec["sql"]))
    cols = set(df.columns)
    if not spec.get("polymorphic"):
        df = df.withColumn("src_label", F.lit(spec["from"])).withColumn("dst_label", F.lit(spec["to"]))
    for c, t in (("step", "string"), ("ts_from", "timestamp"), ("ts_to", "timestamp"), ("qty", "double")):
        if c not in cols:
            df = df.withColumn(c, F.lit(None).cast(t))
    edge_frames.append(df.select(
        F.lit(rel).alias("type"), "src_label", F.col("src_key").cast("string").alias("src_key"),
        "dst_label", F.col("dst_key").cast("string").alias("dst_key"),
        F.col("step").cast("string").alias("step"),
        F.date_format(F.col("ts_from").cast("timestamp"), TS_FMT).alias("ts_from"),
        F.date_format(F.col("ts_to").cast("timestamp"), TS_FMT).alias("ts_to"),
        F.col("qty").cast("double").alias("qty")))
edges = edge_frames[0]
for f in edge_frames[1:]:
    edges = edges.unionByName(f)
edges = (edges.where("src_key IS NOT NULL AND dst_key IS NOT NULL")
              .withColumn("edge_id", F.substring(F.sha2(F.concat_ws("|", "type", "src_label", "src_key", "dst_label", "dst_key",
                                                                      F.coalesce("step", F.lit(""))), 256), 1, 32))
              .dropDuplicates(["edge_id"]))

n = spark.table(f"{FQN}.gold_graph_nodes").select("label", "key")
ok = (edges.join(n.withColumnRenamed("label", "src_label").withColumnRenamed("key", "src_key"), ["src_label", "src_key"], "left_semi")
           .join(n.withColumnRenamed("label", "dst_label").withColumnRenamed("key", "dst_key"), ["dst_label", "dst_key"], "left_semi"))
dangling = edges.join(ok.select("edge_id"), "edge_id", "left_anti")
ok = ok.withColumn("row_hash", F.sha2(F.concat_ws("||", "step", "ts_from", "ts_to", F.col("qty").cast("string")), 256))
ok.createOrReplaceTempView("staged_edges")
spark.sql(f"""
MERGE INTO {FQN}.gold_graph_edges t USING staged_edges s
ON t.edge_id = s.edge_id
WHEN MATCHED AND t.row_hash <> s.row_hash THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *
WHEN NOT MATCHED BY SOURCE THEN DELETE""")

report = (edges.groupBy("type").count().withColumnRenamed("count", "candidate_edges")
          .join(dangling.groupBy("type").count().withColumnRenamed("count", "dangling_edges"), "type", "left")
          .fillna(0, ["dangling_edges"]).withColumn("built_at", F.current_timestamp()))
report.write.mode("append").option("mergeSchema", True).saveAsTable(f"{FQN}.ops_graph_build_report")
display(report.orderBy(F.desc("dangling_edges")))

# COMMAND ----------

# MAGIC %md
# MAGIC Dangling edges are a *finding*, not an error: e.g. an NCR trace value that matches no container, a complaint
# MAGIC lot that is not an SAP batch. Inspect them before Unit 4 syncs this to Neo4j - a dangling edge there would
# MAGIC either fail the write outright or silently vanish depending on the connector mode, neither of which you want
# MAGIC to discover for the first time against Neo4j itself.

# COMMAND ----------

display(dangling.groupBy("type", "src_label", "dst_label").count().orderBy(F.desc("count")))

# COMMAND ----------

# MAGIC %md ## 4. Verify against the known-correct shape

# COMMAND ----------

node_total = spark.table(f"{FQN}.gold_graph_nodes").count()
edge_total = spark.table(f"{FQN}.gold_graph_edges").count()
dangling_total = dangling.count()
candidate_total = edges.count()
print("node labels built:", spark.table(f"{FQN}.gold_graph_nodes").select("label").distinct().count(), "/ 32 expected")
print("edge types built:", spark.table(f"{FQN}.gold_graph_edges").select("type").distinct().count(), "/ 58 expected")
print("total nodes:", node_total)
print("total candidate edges:", candidate_total, " loaded (non-dangling):", edge_total, " dangling:", dangling_total)
