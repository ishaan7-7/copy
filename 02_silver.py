# Databricks notebook source
# MAGIC %md
# MAGIC # V2 Unit S1 - Silver: typed, documented, keyed copy of every bronze table
# MAGIC
# MAGIC **Fresh v2 build, side by side with v1.** Reads the existing `bronze_<system>__<table>` tables (132) and writes only
# MAGIC tables whose names start with `v2_`. Nothing from v1 (`silver_*`, `gold_*`, `ops_*`) is read, changed or dropped.
# MAGIC
# MAGIC | Output | What it holds |
# MAGIC |---|---|
# MAGIC | `v2_silver_<system>__<table>` (132) | Every bronze row (exact duplicates removed), real column types, one comment per column, NOT NULL primary-key columns, an informational `PRIMARY KEY`, Change Data Feed on |
# MAGIC | `v2_meta_tables` | One row per source table: description, source system, primary key, row counts |
# MAGIC | `v2_meta_columns` | One row per silver column: source column, type, typing rule, description, key flag |
# MAGIC | `v2_meta_kg_relationships` | The dataset's own 169 join keys / suggested edges, mapped to silver table and column names |
# MAGIC | `v2_ops_silver_dq` | Data-quality result per table per run (appended) |
# MAGIC
# MAGIC **Decisions, each verified against the real data before this notebook was written:**
# MAGIC * **Types come from an explicit contract** (below), not from inference at run time. 391 columns get a non-string type
# MAGIC   (DOUBLE, BIGINT, DATE, TIMESTAMP_NTZ, BOOLEAN). Identifiers stay STRING even when they look numeric (leading zeros in
# MAGIC   `CHARG`, 8-digit `PLNNR`/`STLNR`/`VBELN` that look like dates, 6-digit `LIFNR`/`KUNNR`/`KOSTL` that look like times).
# MAGIC * **Every typed column is checked lossless:** a non-empty source value that becomes NULL fails the table.
# MAGIC * **Times are plant-local wall clock (`TIMESTAMP_NTZ`).** The dataset README states all plant times are US Eastern
# MAGIC   local, including Teamcenter values with a `Z` suffix (an export quirk). No time zone conversion is applied.
# MAGIC * **SAP date + time pairs** (e.g. `AFRU.ISDD` + `ISDZ`) also get a combined `<date>_ts` column.
# MAGIC * **Primary keys:** the 60 keys declared in the data dictionary plus 72 semantic keys (SAP standard keys, MES TxnId, ...),
# MAGIC   all verified unique. `cmms.PM` uses (`PMNUM`, `JPNUM`) because `PM10083-M` exists twice in Maximo with two job plans.
# MAGIC * **Exact duplicate rows are removed** (only `qms.NCR_TRACE` has them: 48) and counted in `v2_ops_silver_dq`.
# MAGIC * **Placeholder text becomes NULL** only where it means "no value": `LAB_TEST.ResultValue = 'None'`,
# MAGIC   `PRODUCT.ProductRevision = '-'`, `TC_CONTROL_PLAN.sample_size = '-'`. Category values such as LPA `N/A` are kept.
# MAGIC * **Multi-value cells** (`'PNT-01; WSH-02'`) keep the original text plus a `<column>_list` array.
# MAGIC * **Loads are idempotent.** First run (or a changed contract) builds each table from DDL; later runs MERGE on the
# MAGIC   primary key, update only changed rows and delete rows that left bronze, so the Change Data Feed carries real changes.
# MAGIC * SCD2 history tables are not built here on purpose: the extract is a single snapshot and the sources already carry their
# MAGIC   own effective-dated history (audit logs, spec revisions, ECN effectivity, HR BEGDA/ENDDA). CDF is on, so history capture
# MAGIC   can be added later without reprocessing.
# MAGIC * `_ground_truth` (the RCA answer key) is never read.

# COMMAND ----------

dbutils.widgets.text("catalog", "cmegtmdev")
dbutils.widgets.text("schema", "manufacturing_coe")
CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
FQN = f"{CATALOG}.{SCHEMA}"
META_DIR = f"/Volumes/{CATALOG}/{SCHEMA}/landing/NBS_Manufacturing_KG_Dataset/_metadata"
PREFIX = "v2_"

if tuple(int(x) for x in spark.version.split(".")[:2]) < (3, 4):
    raise RuntimeError(f"Spark {spark.version}: TIMESTAMP_NTZ and MERGE ... NOT MATCHED BY SOURCE need Databricks Runtime 13.3 LTS or newer")

# COMMAND ----------

# MAGIC %md ## 1. The silver contract (generated from the column profile of all 1,487 source columns, then audited)

# COMMAND ----------

SILVER_CONTRACT_YAML = r"""
types:
  cmms__a_pm: {frequency: DOUBLE, leadtime: DOUBLE, eaudittimestamp: TIMESTAMP_NTZ}
  cmms__asset: {installdate: DATE, priority: BIGINT, purchaseprice: DOUBLE, isrunning: BOOLEAN, changedate: TIMESTAMP_NTZ}
  cmms__assetmeter: {lastreading: DOUBLE, lastreadingdate: TIMESTAMP_NTZ, average: DOUBLE}
  cmms__assetspec: {numvalue: DOUBLE}
  cmms__inventory: {curbal: DOUBLE, minlevel: DOUBLE, orderqty: DOUBLE, avgcost: DOUBLE, issueytd: DOUBLE}
  cmms__item: {rotating: BOOLEAN}
  cmms__jobplan: {jpduration: DOUBLE, priority: BIGINT}
  cmms__labor: {payrate: DOUBLE}
  cmms__labtrans: {startdate: TIMESTAMP_NTZ, finishdate: TIMESTAMP_NTZ, regularhrs: DOUBLE, payrate: DOUBLE, linecost: DOUBLE}
  cmms__matusetrans: {transdate: TIMESTAMP_NTZ, actualdate: TIMESTAMP_NTZ, quantity: DOUBLE, unitcost: DOUBLE, linecost: DOUBLE}
  cmms__measurement: {measuredate: TIMESTAMP_NTZ, measurementvalue: DOUBLE}
  cmms__measurepoint: {loweractionlimit: DOUBLE, lowerwarnlimit: DOUBLE, upperwarnlimit: DOUBLE, upperactionlimit: DOUBLE}
  cmms__meterreading: {reading: DOUBLE, delta: DOUBLE, readingdate: TIMESTAMP_NTZ}
  cmms__pm: {frequency: DOUBLE, leadtime: DOUBLE, estdur: DOUBLE, lastcompdate: TIMESTAMP_NTZ, nextdate: DATE, usetargetdate: BOOLEAN, changedate: TIMESTAMP_NTZ}
  cmms__sr: {reportdate: TIMESTAMP_NTZ, internalpriority: BIGINT}
  cmms__workorder: {statusdate: TIMESTAMP_NTZ, wopriority: BIGINT, reportdate: TIMESTAMP_NTZ, targstartdate: TIMESTAMP_NTZ, targcompdate: TIMESTAMP_NTZ, schedstart: TIMESTAMP_NTZ, schedfinish: TIMESTAMP_NTZ, actstart: TIMESTAMP_NTZ, actfinish: TIMESTAMP_NTZ, estdur: DOUBLE, actlabhrs: DOUBLE, actlabcost: DOUBLE, actmatcost: DOUBLE, downtime: DOUBLE}
  cmms__wostatus: {changedate: TIMESTAMP_NTZ}
  erp__aenr: {datuv: DATE, andat: DATE}
  erp__afko: {gstrp: DATE, gltrp: DATE, gstri: DATE, getri: DATE, gamng: DOUBLE}
  erp__afpo: {psmng: DOUBLE, wemng: DOUBLE, psamg: DOUBLE, ltrmi: DATE, elikz: BOOLEAN_SAP}
  erp__afru: {ersda: DATE, budat: DATE, lmnga: DOUBLE, xmnga: DOUBLE, rmnga: DOUBLE, ism01: DOUBLE, ism02: DOUBLE, ism03: DOUBLE, isdd: DATE, iedd: DATE, aueru: BOOLEAN_SAP}
  erp__afvv: {mgvrg: DOUBLE, lmnga: DOUBLE, xmnga: DOUBLE, rmnga: DOUBLE, vgw01: DOUBLE, vgw02: DOUBLE, vgw03: DOUBLE, ism01: DOUBLE, ism02: DOUBLE, ism03: DOUBLE, isdd: DATE, iedd: DATE}
  erp__aufk: {erdat: DATE}
  erp__crco: {begda: DATE, endda: DATE}
  erp__crhd: {begda: DATE, endda: DATE, zz_num_machines: BIGINT}
  erp__csks: {datbi: DATE, datab: DATE}
  erp__eina: {erdat: DATE}
  erp__eine: {netpr: DOUBLE, peinh: DOUBLE, aplfz: DOUBLE, norbm: DOUBLE}
  erp__ekbe: {budat: DATE, menge: DOUBLE, dmbtr: DOUBLE}
  erp__eket: {eindt: DATE, menge: DOUBLE, wemng: DOUBLE}
  erp__ekko: {bedat: DATE, kdatb: DATE, kdate: DATE, aedat: DATE}
  erp__ekpo: {menge: DOUBLE, netpr: DOUBLE, peinh: DOUBLE, elikz: BOOLEAN_SAP}
  erp__eord: {vdatu: DATE, bdatu: DATE, flifn: BOOLEAN_SAP}
  erp__jest: {inact: BOOLEAN_SAP}
  erp__kna1: {erdat: DATE}
  erp__lfa1: {erdat: DATE}
  erp__likp: {erdat: DATE, wadat: DATE, wadat_ist: DATE, lfdat: DATE, btgew: DOUBLE, anzpk: BIGINT}
  erp__lips: {lfimg: DOUBLE}
  erp__mapl: {datuv: DATE}
  erp__mara: {brgew: DOUBLE, ntgew: DOUBLE, ersda: DATE, laeda: DATE, xchpf: BOOLEAN_SAP}
  erp__marc: {plifz: DOUBLE, dzeit: DOUBLE, webaz: DOUBLE, eisbe: DOUBLE, minbe: DOUBLE, bstrf: DOUBLE, xchpf: BOOLEAN_SAP, qmatv: BOOLEAN_SAP, insmk: BOOLEAN_SAP, rgekz: BOOLEAN_SAP}
  erp__mard: {labst: DOUBLE, insme: DOUBLE, speme: DOUBLE}
  erp__mbew: {stprs: DOUBLE, verpr: DOUBLE, peinh: DOUBLE}
  erp__mcha: {hsdat: DATE, vfdat: DATE, ersda: DATE, zustd: BOOLEAN_SAP, lwedt: DATE}
  erp__mkpf: {bldat: DATE, budat: DATE, cpudt: DATE}
  erp__mseg: {dmbtr: DOUBLE, menge: DOUBLE, budat_mkpf: DATE, cpudt_mkpf: DATE}
  erp__pa0001: {begda: DATE, endda: DATE}
  erp__pa0002: {begda: DATE, endda: DATE}
  erp__pa0105: {begda: DATE, endda: DATE}
  erp__plko: {datuv: DATE, andat: DATE, losvn: DOUBLE, losbs: DOUBLE}
  erp__plpo: {vgw01: DOUBLE, vgw02: DOUBLE, vgw03: DOUBLE, bmsch: DOUBLE, datuv: DATE}
  erp__qals: {losmenge: DOUBLE, enstehdat: DATE, pastrterm: DATE, paendterm: DATE, lmenge01: DOUBLE, lmenge04: DOUBLE}
  erp__qamr: {mittelwert: DOUBLE, minwert: DOUBLE, maxwert: DOUBLE, anzwertg: BIGINT, attribut: BIGINT, pruefdatuv: DATE}
  erp__qamv: {sollwert: DOUBLE, toleranzun: DOUBLE, toleranzob: DOUBLE, sollstpumf: DOUBLE, quantitat: BOOLEAN_SAP}
  erp__qave: {vdatum: DATE}
  erp__qmel: {rkmng: DOUBLE, qmdat: DATE, erdat: DATE, priok: BIGINT, qmdab: DATE}
  erp__qmfe: {anzfehler: BIGINT}
  erp__qmsm: {pster: DATE, peter: DATE, erldat: DATE}
  erp__resb: {bdmng: DOUBLE, enmng: DOUBLE, bdter: DATE, rgekz: BOOLEAN_SAP, kzear: BOOLEAN_SAP}
  erp__stko: {datuv: DATE, bmeng: DOUBLE, andat: DATE}
  erp__stpo: {datuv: DATE, menge: DOUBLE, sanka: BOOLEAN_SAP, rgekz: BOOLEAN_SAP, ausch: DOUBLE}
  erp__vbak: {erdat: DATE, bstdk: DATE, guebg: DATE, gueen: DATE}
  erp__vbap: {kwmeng: DOUBLE, netpr: DOUBLE}
  erp__vbep: {edatu: DATE, wmeng: DOUBLE, bmeng: DOUBLE}
  erp__vbrk: {fkdat: DATE, netwr: DOUBLE, erdat: DATE}
  erp__vbrp: {fkimg: DOUBLE, netwr: DOUBLE}
  mes__audit_log: {audit_timestamp: TIMESTAMP_NTZ}
  mes__component_issue: {txn_date: TIMESTAMP_NTZ, issue_qty: DOUBLE}
  mes__container: {start_qty: DOUBLE, completed_qty: DOUBLE, current_qty: DOUBLE, start_date: TIMESTAMP_NTZ, completed_date: TIMESTAMP_NTZ, ship_date: TIMESTAMP_NTZ}
  mes__data_collection: {txn_date: TIMESTAMP_NTZ, sample_no: BIGINT, value: DOUBLE, lower_limit: DOUBLE, upper_limit: DOUBLE, is_out_of_spec: BOOLEAN}
  mes__defect: {txn_date: TIMESTAMP_NTZ, qty: DOUBLE}
  mes__employee: {hire_date: DATE}
  mes__employee_certification: {issue_date: DATE, expiry_date: DATE, training_start: DATE}
  mes__history_mainline: {txn_date: TIMESTAMP_NTZ, qty: DOUBLE, qty_change: DOUBLE}
  mes__hold: {hold_date: TIMESTAMP_NTZ, release_date: TIMESTAMP_NTZ, qty_on_hold: DOUBLE}
  mes__mfg_order: {qty: DOUBLE, planned_start: TIMESTAMP_NTZ, planned_end: TIMESTAMP_NTZ, released_date: TIMESTAMP_NTZ, container_count: BIGINT}
  mes__product: {std_start_qty: DOUBLE, is_serialized: BOOLEAN}
  mes__resource: {enforce_certification: BOOLEAN}
  mes__resource_status_history: {start_time: TIMESTAMP_NTZ, end_time: TIMESTAMP_NTZ, duration_min: DOUBLE}
  mes__serial_test_result: {st10_timestamp: TIMESTAMP_NTZ, eol_timestamp: TIMESTAMP_NTZ, press_force_kn: DOUBLE, piston_depth_mm: DOUBLE, bleeder_torque_nm: DOUBLE, guide_bolt_torque1_nm: DOUBLE, guide_bolt_torque2_nm: DOUBLE, eol_hp_drop_bar: DOUBLE, eol_lp_leak_sccm: DOUBLE, drag_torque_nm: DOUBLE, piston_rollback_mm: DOUBLE}
  mes__shift_performance: {production_date: DATE, planned_time_min: DOUBLE, unscheduled_down_min: DOUBLE, scheduled_down_min: DOUBLE, run_time_min: DOUBLE, total_qty: DOUBLE, good_qty: DOUBLE, scrap_qty: DOUBLE, availability: DOUBLE, performance: DOUBLE, quality: DOUBLE, oee: DOUBLE}
  mes__spec: {effective_from: TIMESTAMP_NTZ, effective_to: TIMESTAMP_NTZ}
  mes__spec_parameter: {lower_limit: DOUBLE, target: DOUBLE, upper_limit: DOUBLE}
  mes__tool_life: {mounted_date: TIMESTAMP_NTZ, removed_date: TIMESTAMP_NTZ, parts_produced: DOUBLE, life_limit_qty: DOUBLE}
  mes__workflow_step: {step_sequence: BIGINT, rework_step: BOOLEAN}
  plm__tc_bom_line: {quantity: DOUBLE}
  plm__tc_bop_operation: {std_time_min_per_pc: DOUBLE}
  plm__tc_change_notice: {creation_date: TIMESTAMP_NTZ, release_date: TIMESTAMP_NTZ, effectivity_date: DATE}
  plm__tc_change_request: {creation_date: TIMESTAMP_NTZ, decision_date: TIMESTAMP_NTZ, cost_estimate_usd: DOUBLE, customer_approval_req: BOOLEAN}
  plm__tc_characteristic: {nominal: DOUBLE, lsl: DOUBLE, usl: DOUBLE}
  plm__tc_dataset: {created: TIMESTAMP_NTZ}
  plm__tc_dfmea: {severity: BIGINT, occurrence: BIGINT, detection: BIGINT}
  plm__tc_item: {creation_date: TIMESTAMP_NTZ}
  plm__tc_item_revision: {date_released: TIMESTAMP_NTZ, effectivity_date: DATE, weight_kg: DOUBLE}
  plm__tc_pfmea: {severity: BIGINT, occurrence: BIGINT, detection: BIGINT, revised_s: BIGINT, revised_o: BIGINT, revised_d: BIGINT, action_completed: DATE}
  plm__tc_problem_report: {creation_date: TIMESTAMP_NTZ}
  plm__tc_workflow_task: {start_date: TIMESTAMP_NTZ, completion_date: TIMESTAMP_NTZ}
  qms__audit_finding: {due_date: DATE}
  qms__calibration: {cal_date: DATE, due_date: DATE, as_found_error_pct: DOUBLE, adjusted: BOOLEAN, next_due_date: DATE, days_overdue: BIGINT}
  qms__capa: {date_opened: DATE, due_date: DATE, date_completed: DATE}
  qms__customer_complaint: {date_received: TIMESTAMP_NTZ, qty_reported: DOUBLE, qty_returned: DOUBLE, date_closed: TIMESTAMP_NTZ, ppm_impact: BIGINT}
  qms__deviation: {start_date: DATE, end_date: DATE, qty_limit: DOUBLE, customer_approval_required: BOOLEAN}
  qms__eight_d: {date_opened: TIMESTAMP_NTZ, d3_date: TIMESTAMP_NTZ, d4_verified_date: TIMESTAMP_NTZ, d6_date: TIMESTAMP_NTZ, date_closed: TIMESTAMP_NTZ}
  qms__gauge: {cal_frequency_days: DOUBLE, last_cal_date: DATE, next_due_date: DATE, grr_pct_tolerance: DOUBLE, last_msa_date: DATE}
  qms__internal_audit: {audit_date: DATE}
  qms__lab_test: {request_date: TIMESTAMP_NTZ, completed_date: TIMESTAMP_NTZ}
  qms__lpa_result: {audit_date: TIMESTAMP_NTZ, immediate_action_taken: BOOLEAN}
  qms__ncr: {date_opened: TIMESTAMP_NTZ, qty_suspect: DOUBLE, qty_nonconforming: DOUBLE, cost_of_nonconformance_usd: DOUBLE, date_closed: TIMESTAMP_NTZ}
  qms__ppap: {submission_level: BIGINT, submit_date: DATE, decision_date: DATE}
  qms__scar: {date_issued: DATE, qty_affected: DOUBLE, response_due_date: DATE, supplier_response_date: DATE, date_closed: DATE}
keys:
  cmms__a_pm: [pmnum, eaudittimestamp]
  cmms__asset: [assetnum]
  cmms__assetmeter: [assetnum, metername]
  cmms__assetspec: [assetnum, assetattrid]
  cmms__failurecode: [failurecode]
  cmms__failurelist: [failurelist]
  cmms__failurereport: [failurereportid]
  cmms__inventory: [itemnum, location]
  cmms__item: [itemnum]
  cmms__jobplan: [jpnum]
  cmms__labor: [laborcode]
  cmms__labtrans: [labtransid]
  cmms__locations: [location]
  cmms__matusetrans: [matusetransid]
  cmms__measurement: [pointnum, measuredate]
  cmms__measurepoint: [pointnum]
  cmms__meterreading: [assetnum, metername, readingdate]
  cmms__person: [personid]
  cmms__pm: [pmnum, jpnum]
  cmms__sr: [ticketid]
  cmms__workorder: [wonum]
  cmms__wostatus: [wonum, status, changedate]
  erp__aenr: [aennr]
  erp__afko: [aufnr]
  erp__afpo: [aufnr, posnr]
  erp__afru: [rueck, rmzhl]
  erp__afvc: [aufpl, aplzl]
  erp__afvv: [aufpl, aplzl]
  erp__aufk: [aufnr]
  erp__crco: [objty, objid, kokrs, begda]
  erp__crhd: [objid]
  erp__crtx: [objty, objid, spras]
  erp__csks: [kostl]
  erp__eina: [infnr]
  erp__eine: [infnr, ekorg, werks]
  erp__ekbe: [ebeln, ebelp, zekkn, vgabe, gjahr, belnr, buzei]
  erp__eket: [ebeln, ebelp, etenr]
  erp__ekko: [ebeln]
  erp__ekpo: [ebeln, ebelp]
  erp__eord: [matnr, werks, zeord]
  erp__jest: [objnr, stat]
  erp__kna1: [kunnr]
  erp__knmt: [vkorg, vtweg, kunnr, matnr]
  erp__lfa1: [lifnr]
  erp__likp: [vbeln]
  erp__lips: [vbeln, posnr]
  erp__makt: [matnr, spras]
  erp__mapl: [matnr, werks, plnty, plnnr, plnal]
  erp__mara: [matnr]
  erp__marc: [matnr, werks]
  erp__mard: [matnr, werks, lgort]
  erp__mast: [matnr, werks, stlan, stlnr, stlal]
  erp__mbew: [matnr, bwkey]
  erp__mcha: [matnr, werks, charg]
  erp__mkpf: [mblnr]
  erp__mseg: [mblnr, mjahr, zeile]
  erp__pa0001: [pernr, endda, begda]
  erp__pa0002: [pernr, endda, begda]
  erp__pa0105: [pernr, subty, endda, begda]
  erp__plko: [plnty, plnnr, plnal, zaehl]
  erp__plpo: [plnty, plnnr, plnkn, zaehl]
  erp__qals: [prueflos]
  erp__qamr: [prueflos, vorglfnr, merknr]
  erp__qamv: [prueflos, vorglfnr, merknr]
  erp__qave: [prueflos, kzart, zaehler]
  erp__qmel: [qmnum]
  erp__qmfe: [qmnum, fenum]
  erp__qmsm: [qmnum, manum]
  erp__qmur: [qmnum, fenum, urnum]
  erp__qpct: [katalogart, codegruppe, code]
  erp__resb: [rsnum, rspos]
  erp__stko: [stlty, stlnr, stlal]
  erp__stpo: [stlty, stlnr, stlkn]
  erp__t001: [bukrs]
  erp__t001l: [werks, lgort]
  erp__t001w: [werks]
  erp__t024: [ekgrp]
  erp__t024d: [werks, dispo]
  erp__tj02t: [istat, spras]
  erp__vbak: [vbeln]
  erp__vbap: [vbeln, posnr]
  erp__vbep: [vbeln, posnr, etenr]
  erp__vbrk: [vbeln]
  erp__vbrp: [vbeln, posnr]
  mes__audit_log: [audit_id]
  mes__component_issue: [txn_id]
  mes__container: [container_name]
  mes__data_collection: [txn_id]
  mes__defect: [defect_id]
  mes__employee: [employee_name]
  mes__employee_certification: [employee_name, certification_name, resource]
  mes__history_mainline: [txn_id]
  mes__hold: [hold_id]
  mes__mfg_order: [mfg_order_name]
  mes__product: [product_name]
  mes__resource: [resource_name]
  mes__resource_status_history: [resource_name, start_time]
  mes__serial_test_result: [serial_number]
  mes__shift_performance: [resource_name, production_date, shift]
  mes__spec: [spec_name, spec_revision]
  mes__spec_parameter: [spec_name, spec_revision, data_point_name]
  mes__tool_life: [tool_instance_id]
  mes__workflow_step: [workflow_name, workflow_revision, step_sequence]
  plm__tc_bom_line: [bom_view, parent_item_id, parent_revision, find_no]
  plm__tc_bop_operation: [process_plan_id, operation_id]
  plm__tc_change_notice: [item_id]
  plm__tc_change_relation: [primary_object, relation_type, secondary_object]
  plm__tc_change_request: [item_id]
  plm__tc_characteristic: [char_id]
  plm__tc_control_plan: [cp_id, cp_revision, process_step, characteristic]
  plm__tc_dataset: [item_id, item_revision_id, dataset_name]
  plm__tc_dfmea: [fmea_id, fmea_revision, failure_mode, failure_cause]
  plm__tc_item: [item_id]
  plm__tc_item_revision: [item_id, item_revision_id]
  plm__tc_pfmea: [fmea_id, fmea_revision, process_step, failure_mode, failure_cause]
  plm__tc_problem_report: [item_id]
  plm__tc_user: [user_id]
  plm__tc_workflow_task: [task_uid]
  qms__audit_finding: [finding_id]
  qms__calibration: [calibration_id]
  qms__capa: [capa_id]
  qms__customer_complaint: [complaint_id]
  qms__deviation: [deviation_id]
  qms__eight_d: [eight_d_id]
  qms__gauge: [gauge_id]
  qms__internal_audit: [audit_id]
  qms__lab_test: [lab_test_id]
  qms__lpa_result: [lpa_id, question_id]
  qms__ncr: [ncr_id]
  qms__ncr_trace: [ncr_id, ref_system, ref_type, ref_value]
  qms__ppap: [ppap_id]
  qms__scar: [scar_id]
lists:
  mes__workflow_step: [resource_group]
  plm__tc_bop_operation: [resources]
  plm__tc_control_plan: [machine]
  qms__customer_complaint: [serials_or_lots_reported, sap_deliveries]
  qms__deviation: [sap_material]
  qms__eight_d: [d1_team, linked_cap_as]
  qms__ncr: [mes_resource, process_step, sap_material, plm_part_number, linked_capa]
  qms__ppap: [part_number, sap_material]
null_tokens:
  mes__product: {product_revision: ['-']}
  plm__tc_control_plan: {sample_size: ['-']}
  qms__lab_test: {result_value: ['None']}
sap_timestamps:
  erp__afru: {ersda_ts: [ersda, erzet], isdd_ts: [isdd, isdz], iedd_ts: [iedd, iedz]}
  erp__likp: {erdat_ts: [erdat, erzet]}
  erp__mkpf: {cpudt_ts: [cpudt, cputm]}
  erp__mseg: {cpudt_mkpf_ts: [cpudt_mkpf, cputm_mkpf]}
  erp__qals: {enstehdat_ts: [enstehdat, entstezeit]}
  erp__qamr: {pruefdatuv_ts: [pruefdatuv, pruefzeitv]}
  erp__qave: {vdatum_ts: [vdatum, vezeiterf]}
  erp__qmel: {qmdat_ts: [qmdat, mzeit]}
derived_numeric:
  qms__lab_test: {result_value_num: result_value}
"""

# COMMAND ----------

import hashlib
import json
import re
import uuid
from datetime import datetime, timezone

import yaml
from pyspark.sql import functions as F

CONTRACT = yaml.safe_load(SILVER_CONTRACT_YAML)
TYPES, KEYS, LISTS = CONTRACT["types"], CONTRACT["keys"], CONTRACT["lists"]
NULL_TOKENS, SAP_TS, DERIVED_NUM = CONTRACT["null_tokens"], CONTRACT["sap_timestamps"], CONTRACT["derived_numeric"]
ALLOWED_TYPES = {"STRING", "DOUBLE", "BIGINT", "DATE", "TIMESTAMP_NTZ", "BOOLEAN", "BOOLEAN_SAP"}
bad_types = sorted({t for cols in TYPES.values() for t in cols.values()} - ALLOWED_TYPES)
if bad_types:
    raise ValueError(f"unknown types in contract: {bad_types}")
print(f"contract: {sum(len(v) for v in TYPES.values())} typed columns in {len(TYPES)} tables, {len(KEYS)} primary keys")

NAME_OVERRIDES = {"Linked8D": "linked_8d", "PressForce_kN": "press_force_kn", "D4_Category6M": "d4_category_6m",
                  "Timestamp": "audit_timestamp"}
_SNAKE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")


def snake(name):
    if name in NAME_OVERRIDES:
        return NAME_OVERRIDES[name]
    s = _SNAKE.sub("_", name).lower()
    return re.sub("_+", "_", s).strip("_")


def q(name):
    return "`" + name.replace("`", "``") + "`"


def sql_str(text):
    return "'" + str(text).replace("\\", "\\\\").replace("'", "\\'") + "'"


def clean_expr(src, tokens):
    base = f"nullif(trim({q(src)}), '')"
    if tokens:
        return f"CASE WHEN trim({q(src)}) IN ({', '.join(sql_str(t) for t in tokens)}) THEN NULL ELSE {base} END"
    return base


def typed_expr(clean, data_type):
    if data_type == "STRING":
        return clean
    if data_type in ("DOUBLE", "BIGINT"):
        return f"try_cast({clean} AS {data_type})"
    if data_type == "DATE":
        return (f"CASE WHEN {clean} RLIKE '^[0-9]{{8}}$' THEN CASE WHEN {clean} = '00000000' THEN NULL ELSE "
                f"try_cast(concat_ws('-', substr({clean}, 1, 4), substr({clean}, 5, 2), substr({clean}, 7, 2)) AS DATE) END "
                f"ELSE try_cast({clean} AS DATE) END")
    if data_type == "TIMESTAMP_NTZ":
        return f"try_cast(regexp_replace(regexp_replace({clean}, 'T', ' '), 'Z$', '') AS TIMESTAMP_NTZ)"
    if data_type == "BOOLEAN":
        return (f"CASE WHEN upper({clean}) IN ('X', 'Y', 'YES', '1', 'TRUE') THEN true "
                f"WHEN upper({clean}) IN ('N', 'NO', '0', 'FALSE') THEN false END")
    if data_type == "BOOLEAN_SAP":
        return f"CASE WHEN {clean} IS NULL THEN false WHEN upper({clean}) IN ('X', '1') THEN true END"
    raise ValueError(data_type)

# COMMAND ----------

# MAGIC %md ## 2. Metadata from the landing volume (descriptions for every table and column)

# COMMAND ----------


def read_meta(name):
    return (spark.read.option("header", True).option("inferSchema", False).option("multiLine", True)
            .option("escape", '"').csv(f"{META_DIR}/{name}"))


dictionary = read_meta("data_dictionary.csv").collect()
inventory = read_meta("table_inventory.csv").collect()
kg = read_meta("kg_relationships.csv").collect()

table_info = {f"{r['system'].lower()}__{r['table'].lower()}": r for r in inventory}
col_desc = {}
for r in dictionary:
    col_desc[(f"{r['system'].lower()}__{r['table'].lower()}", snake(r["column"]))] = r["description"] or ""
print(f"metadata: {len(inventory)} tables, {len(dictionary)} columns, {len(kg)} relationship rows")

# COMMAND ----------

# MAGIC %md ## 3. Contract-to-bronze check (fails before anything is written if the contract and the data disagree)

# COMMAND ----------

bronze = sorted(r.tableName for r in spark.sql(f"SHOW TABLES IN {FQN}").collect()
                if r.tableName.startswith("bronze_") and not r.isTemporary)
bronze_short = [t[len("bronze_"):] for t in bronze]
bronze_cols = {s: [c for c in spark.table(f"{FQN}.bronze_{s}").columns if not c.startswith("_")] for s in bronze_short}

problems = []
problems += [f"bronze table without inventory entry: {s}" for s in bronze_short if s not in table_info]
problems += [f"inventory table missing in bronze: {s}" for s in table_info if s not in bronze_cols]
problems += [f"bronze table without primary key: {s}" for s in bronze_short if s not in KEYS]
for s, cols in bronze_cols.items():
    names = [snake(c) for c in cols]
    problems += [f"{s}: two source columns map to {n}" for n in set(names) if names.count(n) > 1]
    problems += [f"{s}: column without dictionary description: {n}" for n in names if (s, n) not in col_desc]
    for section, entries in (("types", TYPES.get(s, {})), ("keys", KEYS.get(s, [])), ("lists", LISTS.get(s, [])),
                             ("null_tokens", NULL_TOKENS.get(s, {})), ("derived_numeric", DERIVED_NUM.get(s, {}).values())):
        problems += [f"{s}: {section} names unknown column {n}" for n in entries if n not in names]
    for derived, (d, t) in SAP_TS.get(s, {}).items():
        if TYPES.get(s, {}).get(d) != "DATE":
            problems.append(f"{s}: sap_timestamps {derived} needs DATE {d}")
        if t not in names:
            problems.append(f"{s}: sap_timestamps {derived} unknown time column {t}")
if problems:
    raise ValueError("contract does not match bronze:\n  " + "\n  ".join(problems))
print(f"contract matches bronze: {len(bronze)} tables, {sum(len(c) for c in bronze_cols.values())} source columns")

# COMMAND ----------

# MAGIC %md ## 4. Build one silver table (stage -> checks -> DDL create or MERGE)

# COMMAND ----------


def stage(short):
    src = spark.table(f"{FQN}.bronze_{short}")
    business = [c for c in src.columns if not c.startswith("_")]
    bronze_rows = src.count()
    deduped = src.dropDuplicates(business)
    types = TYPES.get(short, {})
    tokens = NULL_TOKENS.get(short, {})

    select, checks, columns_meta = [], [], []
    for c in business:
        name = snake(c)
        data_type = types.get(name, "STRING")
        clean = clean_expr(c, tokens.get(name))
        select.append(f"{typed_expr(clean, data_type)} AS {q(name)}")
        if data_type != "STRING":
            checks.append(f"count_if({clean} IS NOT NULL AND ({typed_expr(clean, data_type)}) IS NULL) AS {q('cast__' + name)}")
        columns_meta.append((name, c, data_type, "contract" if name in types else "string-default",
                             col_desc.get((short, name), "")))
    token_hits = [f"count_if(trim({q(c)}) IN ({', '.join(sql_str(t) for t in tokens[snake(c)])})) AS {q('token__' + snake(c))}"
                  for c in business if snake(c) in tokens]

    typed = deduped.selectExpr(*select, "_source_file", "_ingested_at")
    extra = []
    for derived, (d, t) in SAP_TS.get(short, {}).items():
        extra.append(f"CASE WHEN {q(d)} IS NOT NULL AND {q(t)} RLIKE '^[0-9]{{6}}$' THEN try_cast(concat(cast({q(d)} AS STRING), ' ', "
                     f"substr({q(t)}, 1, 2), ':', substr({q(t)}, 3, 2), ':', substr({q(t)}, 5, 2)) AS TIMESTAMP_NTZ) END AS {q(derived)}")
        columns_meta.append((derived, f"{d}+{t}", "TIMESTAMP_NTZ", "derived:sap-date-time",
                             f"{col_desc.get((short, d), d)} + {col_desc.get((short, t), t)}, combined (plant-local wall clock)"))
    for lst in LISTS.get(short, []):
        extra.append(f"CASE WHEN {q(lst)} IS NULL THEN NULL ELSE filter(transform(split({q(lst)}, ';'), x -> trim(x)), x -> x <> '') END "
                     f"AS {q(lst + '_list')}")
        columns_meta.append((lst + "_list", lst, "ARRAY<STRING>", "derived:list",
                             f"{col_desc.get((short, lst), lst)} - parsed list (split on ';')"))
    for derived, base in DERIVED_NUM.get(short, {}).items():
        extra.append(f"try_cast({q(base)} AS DOUBLE) AS {q(derived)}")
        columns_meta.append((derived, base, "DOUBLE", "derived:numeric-part",
                             f"{col_desc.get((short, base), base)} - numeric value when the text is a number, else NULL"))
    if extra:
        typed = typed.selectExpr("*", *extra)

    data_cols = [m[0] for m in columns_meta]
    staged = (typed.withColumn("_row_hash", F.sha2(F.to_json(F.struct(*[F.col(q(c)) for c in data_cols])), 256))
                   .withColumn("_silver_loaded_at", F.current_timestamp()))
    columns_meta += [("_source_file", "_source_file", "STRING", "lineage", "Bronze lineage: source CSV path in the landing volume"),
                     ("_ingested_at", "_ingested_at", "TIMESTAMP", "lineage", "Bronze lineage: when the CSV was loaded to bronze"),
                     ("_row_hash", "", "STRING", "lineage", "SHA-256 of all business columns, used to detect changed rows on MERGE"),
                     ("_silver_loaded_at", "", "TIMESTAMP", "lineage", "When this row was last written to silver")]

    raw_row = deduped.selectExpr("count(*) AS rows__", *checks, *token_hits).first().asDict()
    silver_rows = raw_row.pop("rows__")
    cast_failures = {k[len("cast__"):]: v for k, v in raw_row.items() if k.startswith("cast__") and v}
    tokens_replaced = sum(v for k, v in raw_row.items() if k.startswith("token__"))

    keys = KEYS[short]
    staged_checks = [f"count_if({' OR '.join(f'{q(k)} IS NULL' for k in keys)}) AS key_nulls__"]
    staged_checks += [f"count_if({q(d)} IS NOT NULL AND {q(t)} IS NOT NULL AND {q(derived)} IS NULL) AS {q('cast__' + derived)}"
                      for derived, (d, t) in SAP_TS.get(short, {}).items()]
    staged_row = staged.selectExpr(*staged_checks).first().asDict()
    key_nulls = staged_row.pop("key_nulls__")
    cast_failures.update({k[len("cast__"):]: v for k, v in staged_row.items() if v})
    key_dups = staged.groupBy(*[q(k) for k in keys]).count().where("count > 1").count()
    return dict(staged=staged, columns_meta=columns_meta, bronze_rows=bronze_rows, silver_rows=silver_rows,
                exact_duplicates_removed=bronze_rows - silver_rows, cast_failures=cast_failures,
                tokens_replaced=tokens_replaced, key_nulls=key_nulls, key_dups=key_dups, keys=keys)


def contract_hash(short, columns_meta):
    payload = json.dumps({"contract": SILVER_CONTRACT_YAML, "table": short, "columns": columns_meta,
                          "table_comment": table_comment(short)}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def table_comment(short):
    info = table_info[short]
    return (f"{info['table_description']} [{info['system']} {info['table']} - {info['modeled_after']}]. "
            f"Primary key: ({', '.join(KEYS[short])}). Plant times are US Eastern local wall clock (TIMESTAMP_NTZ). "
            f"Built by v2 Unit S1 from bronze_{short}.")


def write(short, st):
    target = f"{FQN}.{PREFIX}silver_{short}"
    if not target.split(".")[-1].startswith(f"{PREFIX}silver_"):
        raise RuntimeError(f"refusing to write a non-v2 table: {target}")
    h = contract_hash(short, st["columns_meta"])
    staged = st["staged"]
    exists = spark.catalog.tableExists(target)
    old_hash = None
    if exists:
        old_hash = (spark.sql(f"DESCRIBE DETAIL {target}").select("properties").first()[0] or {}).get("nx.contract_hash")
    if exists and old_hash == h:
        staged.createOrReplaceTempView("v2_silver_stage")
        on = " AND ".join(f"t.{q(k)} = s.{q(k)}" for k in st["keys"])
        spark.sql(f"MERGE INTO {target} t USING v2_silver_stage s ON {on} "
                  f"WHEN MATCHED AND t._row_hash <> s._row_hash THEN UPDATE SET * "
                  f"WHEN NOT MATCHED THEN INSERT * WHEN NOT MATCHED BY SOURCE THEN DELETE")
        return "merge"
    spark.sql(f"DROP TABLE IF EXISTS {target}")
    comments = {m[0]: m[4] for m in st["columns_meta"]}
    ddl_cols = ", ".join(f"{q(f.name)} {f.dataType.simpleString()}{' NOT NULL' if f.name in st['keys'] else ''} "
                         f"COMMENT {sql_str(comments.get(f.name, ''))}" for f in staged.schema.fields)
    spark.sql(f"CREATE TABLE {target} ({ddl_cols}) USING DELTA COMMENT {sql_str(table_comment(short))} "
              f"TBLPROPERTIES (delta.enableChangeDataFeed = true, 'nx.contract_hash' = '{h}', 'nx.layer' = 'silver', "
              f"'nx.primary_key' = '{','.join(st['keys'])}')")
    staged.select(*[q(f.name) for f in spark.table(target).schema.fields]).write.insertInto(target)
    spark.sql(f"ALTER TABLE {target} ADD CONSTRAINT {PREFIX}pk_{short} PRIMARY KEY ({', '.join(q(k) for k in st['keys'])})")
    return "rebuild"

# COMMAND ----------

# MAGIC %md ## 5. Run all 132 tables (checks first; a table that fails a check is not written)

# COMMAND ----------

RUN_ID = str(uuid.uuid4())
RUN_AT = datetime.now(timezone.utc)
dq_rows, column_rows, table_rows = [], [], []
for short in bronze_short:
    st = stage(short)
    failed = []
    if st["cast_failures"]:
        failed.append("cast failures: " + json.dumps(st["cast_failures"]))
    if st["key_nulls"]:
        failed.append(f"{st['key_nulls']} rows with a NULL primary key")
    if st["key_dups"]:
        failed.append(f"{st['key_dups']} duplicated primary keys")
    mode = "skipped" if failed else write(short, st)
    typed_count = sum(1 for m in st["columns_meta"] if m[3] in ("contract",) and m[2] != "STRING")
    dq_rows.append((RUN_ID, RUN_AT, f"{PREFIX}silver_{short}", f"bronze_{short}", st["bronze_rows"],
                    st["exact_duplicates_removed"], st["silver_rows"], ",".join(st["keys"]), st["key_dups"], st["key_nulls"],
                    typed_count, sum(st["cast_failures"].values()), json.dumps(st["cast_failures"]), st["tokens_replaced"],
                    mode, "FAIL" if failed else "PASS", "; ".join(failed)))
    for name, source, data_type, rule, desc in st["columns_meta"]:
        column_rows.append((f"{PREFIX}silver_{short}", name, source, data_type, rule, name in st["keys"], desc))
    info = table_info[short]
    table_rows.append((f"{PREFIX}silver_{short}", f"bronze_{short}", info["system"], info["table"], info["table_description"],
                       info["modeled_after"], ",".join(st["keys"]), int(info["rows"]), st["bronze_rows"], st["silver_rows"],
                       table_comment(short)))
    print(f"{mode:8} {'FAIL' if failed else 'PASS'}  {PREFIX}silver_{short:34} rows={st['silver_rows']}"
          + (f"  <-- {'; '.join(failed)}" if failed else ""))

# COMMAND ----------

# MAGIC %md ## 6. Metadata and data-quality tables

# COMMAND ----------

dq_schema = ("run_id string, run_at timestamp, silver_table string, bronze_table string, bronze_rows long, "
             "exact_duplicates_removed long, silver_rows long, primary_key string, pk_duplicates long, pk_nulls long, "
             "typed_columns long, cast_failures long, cast_failure_detail string, null_tokens_replaced long, load_mode string, "
             "status string, failure_reason string")
spark.createDataFrame(dq_rows, dq_schema).write.mode("append").saveAsTable(f"{FQN}.{PREFIX}ops_silver_dq")

(spark.createDataFrame(column_rows, "silver_table string, silver_column string, source_column string, data_type string, "
                       "typing_rule string, is_primary_key boolean, description string")
      .write.mode("overwrite").option("overwriteSchema", True).saveAsTable(f"{FQN}.{PREFIX}meta_columns"))
(spark.createDataFrame(table_rows, "silver_table string, bronze_table string, system string, source_table string, "
                       "description string, modeled_after string, primary_key string, inventory_rows long, bronze_rows long, "
                       "silver_rows long, table_comment string")
      .write.mode("overwrite").option("overwriteSchema", True).saveAsTable(f"{FQN}.{PREFIX}meta_tables"))


def silver_ref(system, table, column):
    short = f"{(system or '').lower()}__{(table or '').lower()}"
    if short not in bronze_cols or snake(column or "") not in {snake(c) for c in bronze_cols[short]}:
        return None, None
    return f"{PREFIX}silver_{short}", snake(column)


kg_rows = []
for r in kg:
    ft, fc = silver_ref(r["from_system"], r["from_table"], r["from_column"])
    tt, tc = silver_ref(r["to_system"], r["to_table"], r["to_column"])
    kg_rows.append((r["from_system"], r["from_table"], r["from_column"], r["to_system"], r["to_table"], r["to_column"],
                    r["suggested_edge"], r["cardinality"], r["note"], ft, fc, tt, tc))
(spark.createDataFrame(kg_rows, "from_system string, from_table string, from_column string, to_system string, to_table string, "
                       "to_column string, suggested_edge string, cardinality string, note string, from_silver_table string, "
                       "from_silver_column string, to_silver_table string, to_silver_column string")
      .write.mode("overwrite").option("overwriteSchema", True).saveAsTable(f"{FQN}.{PREFIX}meta_kg_relationships"))

# COMMAND ----------

# MAGIC %md ## 7. Verify

# COMMAND ----------

dq = spark.table(f"{FQN}.{PREFIX}ops_silver_dq").where(F.col("run_id") == RUN_ID)
summary = dq.agg(F.count("*").alias("tables"), F.sum(F.when(F.col("status") == "PASS", 1).otherwise(0)).alias("passed"),
                 F.sum("bronze_rows").alias("bronze_rows"), F.sum("exact_duplicates_removed").alias("duplicates_removed"),
                 F.sum("silver_rows").alias("silver_rows"), F.sum("typed_columns").alias("typed_columns"),
                 F.sum("cast_failures").alias("cast_failures"), F.sum("null_tokens_replaced").alias("null_tokens_replaced")).first()
print(summary.asDict())
display(dq.groupBy("load_mode", "status").count())

expected = {"tables": 132, "passed": 132, "bronze_rows": 445891, "duplicates_removed": 48, "silver_rows": 445843,
            "typed_columns": 391, "cast_failures": 0, "null_tokens_replaced": 28}
mismatch = {k: (summary[k], v) for k, v in expected.items() if summary[k] != v}
failed = dq.where("status = 'FAIL'").select("silver_table", "failure_reason").collect()
if failed or mismatch:
    raise RuntimeError(f"Silver v2 NOT complete. mismatches (got, expected): {mismatch}; failed tables: {failed}")
print("Silver v2 complete: 132/132 tables PASS, 445,843 rows, 391 typed columns, 0 cast failures, all primary keys unique.")

# COMMAND ----------

# MAGIC %md ## 8. Spot checks a reviewer can read

# COMMAND ----------

display(spark.sql(f"""
SELECT 'mes serial press force (DOUBLE)' AS check, CAST(round(avg(press_force_kn), 3) AS STRING) AS value FROM {FQN}.{PREFIX}silver_mes__serial_test_result
UNION ALL SELECT 'mes history first/last txn (TIMESTAMP_NTZ)', concat(min(txn_date), ' .. ', max(txn_date)) FROM {FQN}.{PREFIX}silver_mes__history_mainline
UNION ALL SELECT 'sap afru exec start (DATE + TIME -> isdd_ts)', CAST(min(isdd_ts) AS STRING) FROM {FQN}.{PREFIX}silver_erp__afru
UNION ALL SELECT 'sap batch keeps leading zeros (STRING)', min(charg) FROM {FQN}.{PREFIX}silver_erp__mcha
UNION ALL SELECT 'ncr resources parsed (ARRAY)', CAST(max(size(mes_resource_list)) AS STRING) FROM {FQN}.{PREFIX}silver_qms__ncr
UNION ALL SELECT 'out-of-spec samples (BOOLEAN)', CAST(count_if(is_out_of_spec) AS STRING) FROM {FQN}.{PREFIX}silver_mes__data_collection
UNION ALL SELECT 'ncr_trace rows after dedupe', CAST(count(*) AS STRING) FROM {FQN}.{PREFIX}silver_qms__ncr_trace
"""))
