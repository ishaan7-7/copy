# Databricks notebook source
# MAGIC %md
# MAGIC # Unit 3b - Gold build: hydration views (the "thick lakehouse" half of thin graph / thick lakehouse)
# MAGIC
# MAGIC Ported directly from the reference design's `config/hydration.yaml` `views:` section (same source dataset,
# MAGIC so every table/column reference resolves against our own `silver_<system>__<table>` tables unchanged).
# MAGIC Each view exposes the real properties of one graph node label, keyed by the same `key` value used in
# MAGIC `gold_graph_nodes` - this is what a query/agent reads *after* finding a node in Neo4j, and it is also why
# MAGIC Unit 4 can safely exclude `HAS_HOUSING_FROM`/`PACKED_IN`/`HAS_BRACKET_FROM` from the Neo4j sync: a one-off
# MAGIC recall trace on a specific unit becomes a hydration-view lookup here instead of a graph walk there.
# MAGIC
# MAGIC **Scope of this unit:** the 44 `gold_v_*` views only - live SQL views, not materialized tables, so they
# MAGIC always read current silver data with zero duplication.
# MAGIC
# MAGIC **Deliberately deferred, not part of this unit** (same reasoning as Unit 3's own deferral note): the
# MAGIC `profiles:` app-facing view-selection config, the `change_events` unified timeline, and the `facts`
# MAGIC parameterized query catalog - all three back an agent/API layer nobody has asked for yet on this replica.

# COMMAND ----------

dbutils.widgets.text("catalog", "cmegtmdev")
dbutils.widgets.text("schema", "manufacturing_coe")
CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
FQN = f"{CATALOG}.{SCHEMA}"

import yaml


def render(sql):
    return sql.replace("{silver}.", f"{FQN}.silver_")

# COMMAND ----------

# MAGIC %md ## 1. The 44 hydration views - ported verbatim from the reference's `config/hydration.yaml` `views:` section
# MAGIC (only the `{silver}.` placeholder addressing changed, same as Unit 3 - the view SQL itself is untouched)

# COMMAND ----------

VIEWS_YAML = r"""
v_material: |
  SELECT m.matnr AS key, t.maktx AS description, m.mtart AS material_type, m.matkl AS material_group, m.meins AS base_uom,
         m.zeinr AS plm_item_id, m.zeivr AS plm_revision_current, c.dispo AS mrp_controller, c.beskz AS procurement_type,
         c.plifz AS planned_delivery_days, b.stprs AS standard_price_usd, b.vprsv AS price_control
  FROM {silver}.erp__mara m
  LEFT JOIN {silver}.erp__makt t ON t.matnr = m.matnr
  LEFT JOIN {silver}.erp__marc c ON c.matnr = m.matnr
  LEFT JOIN {silver}.erp__mbew b ON b.matnr = m.matnr
v_vendor: SELECT lifnr AS key, * FROM {silver}.erp__lfa1
v_customer: SELECT kunnr AS key, * FROM {silver}.erp__kna1
v_batch: |
  SELECT concat(b.matnr, '|', b.charg) AS key, b.matnr AS material, b.charg AS batch, b.lifnr AS vendor, v.name1 AS vendor_name,
         b.licha AS vendor_batch, b.hsdat AS manufactured_on, b.lwedt AS goods_receipt_date, b.zustd AS restricted, b.zz_source AS origin,
         q.prueflos AS inspection_lot, q.losmenge AS lot_qty, d.vcode AS usage_decision, d.vdatum AS usage_decision_date, d.versionam AS ud_remark
  FROM {silver}.erp__mcha b
  LEFT JOIN {silver}.erp__lfa1 v ON v.lifnr = b.lifnr
  LEFT JOIN {silver}.erp__qals q ON q.matnr = b.matnr AND q.charg = b.charg AND q.art = '01'
  LEFT JOIN {silver}.erp__qave d ON d.prueflos = q.prueflos
v_batch_inspection: |
  SELECT concat(q.matnr, '|', q.charg) AS key, q.prueflos AS inspection_lot, v.verwmerkm AS characteristic, v.kurztext AS characteristic_text,
         v.toleranzun AS lsl, v.toleranzob AS usl, v.masseinhsw AS unit, r.mittelwert AS mean, r.anzwertg AS n_inspected,
         r.mbewertg AS valuation, r.pruefer AS inspector, r.pruefdatuv AS inspected_on
  FROM {silver}.erp__qals q
  JOIN {silver}.erp__qamv v ON v.prueflos = q.prueflos
  LEFT JOIN {silver}.erp__qamr r ON r.prueflos = v.prueflos AND r.merknr = v.merknr
  WHERE q.art = '01'
v_batch_movements: |
  SELECT concat(matnr, '|', charg) AS key, mblnr, zeile, bwart AS movement_type, budat_mkpf AS posting_date, menge AS qty, meins AS uom,
         lgort AS storage_location, aufnr AS production_order, ebeln AS purchase_doc, vbeln_im AS delivery, kunnr AS customer,
         lifnr AS vendor, grund AS reason, sgtxt AS item_text
  FROM {silver}.erp__mseg WHERE charg IS NOT NULL
v_production_order: |
  SELECT a.aufnr AS key, k.auart AS order_type, k.ktext AS description, a.plnbez AS material, a.gamng AS order_qty, p.wemng AS received_qty,
         p.psamg AS scrap_qty, p.charg AS output_batch, a.gstrp AS basic_start, a.gltrp AS basic_finish, a.gstri AS actual_start,
         a.getri AS actual_finish, a.plnnr AS routing, a.stlnr AS bom
  FROM {silver}.erp__afko a JOIN {silver}.erp__aufk k ON k.aufnr = a.aufnr LEFT JOIN {silver}.erp__afpo p ON p.aufnr = a.aufnr
v_order_confirmations: |
  SELECT aufnr AS key, rueck, rmzhl, vornr AS operation, budat AS posting_date, lmnga AS yield, xmnga AS scrap, rmnga AS rework,
         ism02 AS machine_min, ism03 AS labor_min, pernr AS personnel_number, aueru AS final_confirmation
  FROM {silver}.erp__afru
v_work_center: |
  SELECT h.arbpl AS key, t.ktext AS description, h.objid, c.kostl AS cost_center, h.zz_num_machines AS machines
  FROM {silver}.erp__crhd h LEFT JOIN {silver}.erp__crtx t ON t.objid = h.objid LEFT JOIN {silver}.erp__crco c ON c.objid = h.objid
v_resource: |
  SELECT r.resource_name AS key, r.*, w.ktext AS work_center_text
  FROM {silver}.mes__resource r
  LEFT JOIN {silver}.erp__crhd h ON h.arbpl = r.erp_work_center
  LEFT JOIN {silver}.erp__crtx w ON w.objid = h.objid
v_asset: |
  SELECT a.assetnum AS key, a.*, l.description AS location_description
  FROM {silver}.cmms__asset a LEFT JOIN {silver}.cmms__locations l ON l.location = a.location
v_asset_specs: SELECT assetnum AS key, assetattrid AS attribute, alnvalue AS value_text, numvalue AS value_num FROM {silver}.cmms__assetspec
v_spec_revisions: SELECT spec_name AS key, * FROM {silver}.mes__spec
v_spec_parameters: SELECT spec_name AS key, * FROM {silver}.mes__spec_parameter
v_container: |
  SELECT c.container_name AS key, c.product, p.description AS product_description, c.level, c.status, c.start_qty, c.completed_qty,
         c.current_qty, c.start_date, c.completed_date, c.mfg_order_name, c.erp_batch, c.shipped_delivery, c.ship_date,
         coalesce(d.defect_qty, 0) AS defect_qty, coalesce(h.hold_count, 0) AS hold_count
  FROM {silver}.mes__container c
  LEFT JOIN {silver}.mes__product p ON p.product_name = c.product
  LEFT JOIN (SELECT container_name, sum(try_cast(qty AS INT)) AS defect_qty FROM {silver}.mes__defect GROUP BY container_name) d
         ON d.container_name = c.container_name
  LEFT JOIN (SELECT container_name, count(*) AS hold_count FROM {silver}.mes__hold GROUP BY container_name) h
         ON h.container_name = c.container_name
v_container_history: SELECT container_name AS key, txn_date, txn_type, step_name, spec_revision, resource_name, employee, qty, qty_change, reason_code, comments FROM {silver}.mes__history_mainline
v_container_process_data: SELECT container_name AS key, txn_date, step_name, spec_revision, resource_name, data_point_name, sample_no, value, unit, lower_limit, upper_limit, is_out_of_spec FROM {silver}.mes__data_collection WHERE container_name IS NOT NULL
v_serial: SELECT serial_number AS key, * FROM {silver}.mes__serial_test_result
v_tool_instance: |
  WITH std AS (
    SELECT resource_name, tool_pocket, life_limit_qty AS standard_life_qty
    FROM (SELECT resource_name, tool_pocket, life_limit_qty,
                 row_number() OVER (PARTITION BY resource_name, tool_pocket ORDER BY count(*) DESC) AS rn
          FROM {silver}.mes__tool_life GROUP BY resource_name, tool_pocket, life_limit_qty)
    WHERE rn = 1)
  SELECT t.tool_instance_id AS key, t.*, s.standard_life_qty,
         (t.life_limit_qty <> s.standard_life_qty) AS life_limit_deviates_from_standard,
         try_cast(t.parts_produced AS INT) > try_cast(s.standard_life_qty AS INT) AS ran_beyond_standard_life
  FROM {silver}.mes__tool_life t LEFT JOIN std s ON s.resource_name = t.resource_name AND s.tool_pocket = t.tool_pocket
v_employee: |
  SELECT lower(e.employee_name) AS key, e.*, (e.employee_number IS NULL) AS not_in_sap_hr,
         c.certified_resources, c.in_training_resources
  FROM {silver}.mes__employee e
  LEFT JOIN (SELECT lower(employee_name) AS k,
                    concat_ws(', ', collect_list(CASE WHEN status = 'Certified' THEN resource END)) AS certified_resources,
                    concat_ws(', ', collect_list(CASE WHEN status <> 'Certified' THEN resource END)) AS in_training_resources
             FROM {silver}.mes__employee_certification GROUP BY lower(employee_name)) c ON c.k = lower(e.employee_name)
v_employee_certifications: SELECT lower(employee_name) AS key, * FROM {silver}.mes__employee_certification
v_delivery: |
  SELECT l.vbeln AS key, l.kunnr AS customer, k.name1 AS customer_name, l.wadat AS planned_goods_issue, l.wadat_ist AS actual_goods_issue,
         datediff(l.wadat_ist, l.wadat) AS days_late, i.total_qty, i.batches
  FROM {silver}.erp__likp l
  LEFT JOIN {silver}.erp__kna1 k ON k.kunnr = l.kunnr
  LEFT JOIN (SELECT vbeln, sum(try_cast(lfimg AS DOUBLE)) AS total_qty, concat_ws(', ', collect_set(charg)) AS batches
             FROM {silver}.erp__lips GROUP BY vbeln) i ON i.vbeln = l.vbeln
v_defect: SELECT defect_id AS key, * FROM {silver}.mes__defect
v_hold: SELECT hold_id AS key, * FROM {silver}.mes__hold
v_ncr: SELECT ncr_id AS key, * FROM {silver}.qms__ncr
v_complaint: SELECT complaint_id AS key, * FROM {silver}.qms__customer_complaint
v_eight_d: SELECT eight_d_id AS key, * FROM {silver}.qms__eight_d
v_capa: SELECT capa_id AS key, * FROM {silver}.qms__capa
v_scar: SELECT scar_id AS key, * FROM {silver}.qms__scar
v_deviation: SELECT deviation_id AS key, * FROM {silver}.qms__deviation
v_lab_test: SELECT lab_test_id AS key, * FROM {silver}.qms__lab_test
v_gauge: |
  SELECT g.gauge_id AS key, g.*, c.last_as_found_result, c.last_as_found_error_pct, c.max_days_overdue
  FROM {silver}.qms__gauge g
  LEFT JOIN (SELECT gauge_id,
                    max_by(as_found_result, cal_date) AS last_as_found_result,
                    max_by(as_found_error_pct, cal_date) AS last_as_found_error_pct,
                    max(try_cast(days_overdue AS INT)) AS max_days_overdue
             FROM {silver}.qms__calibration GROUP BY gauge_id) c ON c.gauge_id = g.gauge_id
v_gauge_calibrations: SELECT gauge_id AS key, * FROM {silver}.qms__calibration
v_work_order: |
  SELECT w.wonum AS key, w.*, f.problem, f.cause, f.remedy
  FROM {silver}.cmms__workorder w
  LEFT JOIN (SELECT wonum,
                    max(CASE WHEN type = 'PROBLEM' THEN failurecode END) AS problem,
                    max(CASE WHEN type = 'CAUSE' THEN failurecode END) AS cause,
                    max(CASE WHEN type = 'REMEDY' THEN failurecode END) AS remedy
             FROM {silver}.cmms__failurereport GROUP BY wonum) f ON f.wonum = w.wonum
v_work_order_status: SELECT wonum AS key, status, changedate, changeby, memo FROM {silver}.cmms__wostatus
v_pm: SELECT pmnum AS key, * FROM {silver}.cmms__pm
v_pm_audit: SELECT pmnum AS key, * FROM {silver}.cmms__a_pm
v_measure_point: SELECT pointnum AS key, * FROM {silver}.cmms__measurepoint
v_item_revision: |
  SELECT concat(r.item_id, '/', r.item_revision_id) AS key, r.*, i.object_type, i.erp_material_no, i.project_id
  FROM {silver}.plm__tc_item_revision r LEFT JOIN {silver}.plm__tc_item i ON i.item_id = r.item_id
v_characteristic: SELECT char_id AS key, * FROM {silver}.plm__tc_characteristic
v_change_notice: SELECT item_id AS key, * FROM {silver}.plm__tc_change_notice
v_change_notice_tasks: SELECT change_object AS key, * FROM {silver}.plm__tc_workflow_task
v_change_request: SELECT item_id AS key, * FROM {silver}.plm__tc_change_request
v_problem_report: SELECT item_id AS key, * FROM {silver}.plm__tc_problem_report

"""

VIEWS = yaml.safe_load(VIEWS_YAML)
print(len(VIEWS), "hydration views")

# COMMAND ----------

# MAGIC %md ## 2. Create each view and smoke-test it (catches a broken join immediately, not later against Neo4j)

# COMMAND ----------

results = []
for name, sql in sorted(VIEWS.items()):
    view_name = f"{FQN}.gold_v_{name[2:]}"
    spark.sql(f"CREATE OR REPLACE VIEW {view_name} AS {render(sql)}")
    row_count = spark.table(view_name).count()
    distinct_keys = spark.table(view_name).select("key").distinct().count()
    results.append((name, view_name, row_count, distinct_keys))
    print(f"{view_name}: {row_count} rows, {distinct_keys} distinct keys")

# COMMAND ----------

# MAGIC %md ## 3. Verify - any view with zero rows is a real finding (broken join or empty source), not noise

# COMMAND ----------

report_df = spark.createDataFrame(results, ["view", "full_name", "row_count", "distinct_keys"])
display(report_df.orderBy("row_count"))
zero_row_views = [r for r in results if r[2] == 0]
print(len(results), "/ 44 views created")
print(len(zero_row_views), "views returned zero rows:", [r[0] for r in zero_row_views])

# COMMAND ----------

# MAGIC %md ## 4. Spot-check hydration against real graph node keys for a few labels

# COMMAND ----------

spot_checks = [
    ("Material", "gold_v_material"),
    ("Asset", "gold_v_asset"),
    ("Container", "gold_v_container"),
    ("Employee", "gold_v_employee"),
    ("WorkOrder", "gold_v_work_order"),
]
for label, view in spot_checks:
    node_keys = spark.table(f"{FQN}.gold_graph_nodes").where(f"label = '{label}'").select("key")
    matched = node_keys.join(spark.table(f"{FQN}.{view}").select("key"), "key", "left_semi").count()
    total = node_keys.count()
    print(f"{label}: {matched} / {total} graph nodes have a matching {view} row")
