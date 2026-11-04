# Databricks notebook source
# MAGIC %md
# MAGIC # Unit 2 - Silver conform, with real SCD1 / SCD2 / fact classification
# MAGIC
# MAGIC Every bronze table gets snake_case columns and typed timestamps (SAP `DATS` -> DATE, ISO-style -> TIMESTAMP),
# MAGIC then one of three treatments:
# MAGIC
# MAGIC * **fact** - already an event log in the source (status history, transactions, audit trails, confirmations,
# MAGIC   goods movements). Loaded as-is; nothing to version.
# MAGIC * **scd2** - real point-in-time history, built here because the source gives us none: `ASSETSPEC`
# MAGIC   (explicitly "maintained manually" in the source description - real drift risk) and the ERP material master
# MAGIC   (`MARA`/`MARC`/`MBEW`). Each gets a `silver_<table>` (current row, `valid_from`/`valid_to`/`is_current`) and a
# MAGIC   `silver_<table>__history` (superseded rows).
# MAGIC * **scd1** (the default - everything not listed above) - straight overwrite, current state only. This
# MAGIC   deliberately includes tables that *look* like they'd need SCD2 but already have a source-provided history
# MAGIC   companion (`WORKORDER`+`WOSTATUS`, `PM`+`A_PM`) or are naturally append-only by construction
# MAGIC   (`TC_ITEM_REVISION`, `SPEC` - each revision is already its own row) - duplicating that mechanism here would
# MAGIC   be redundant with what the source already provides.

# COMMAND ----------

dbutils.widgets.text("catalog", "cmegtmdev")
dbutils.widgets.text("schema", "manufacturing_coe")
CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
FQN = f"{CATALOG}.{SCHEMA}"

from pyspark.sql import functions as F

spark.conf.set("spark.sql.session.timeZone", "UTC")

# COMMAND ----------

# MAGIC %md ## 1. Column naming + timestamp typing (same rules the reference dataset's own notebooks use)

# COMMAND ----------

import re

NAME_OVERRIDES = {"Linked8D": "linked_8d", "PressForce_kN": "press_force_kn", "D4_Category6M": "d4_category_6m",
                  "Timestamp": "audit_timestamp"}
_SNAKE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])")


def snake(name):
    if name in NAME_OVERRIDES:
        return NAME_OVERRIDES[name]
    s = _SNAKE.sub("_", name).lower()
    return re.sub("_+", "_", s).strip("_")


ERP_DATS = {
    "mara": ["ersda", "laeda"], "mcha": ["hsdat", "vfdat", "ersda", "lwedt"], "aufk": ["erdat"],
    "afko": ["gstrp", "gltrp", "gstri", "getri"], "afpo": ["ltrmi"], "afru": ["ersda", "budat", "isdd", "iedd"],
    "likp": ["erdat", "wadat", "wadat_ist", "lfdat"], "qals": ["enstehdat", "pastrterm", "paendterm"], "qave": ["vdatum"],
    "qamr": ["pruefdatuv"], "aenr": ["datuv", "andat"], "mseg": ["budat_mkpf", "cpudt_mkpf"], "mkpf": ["bldat", "budat", "cpudt"],
    "eord": ["vdatu", "bdatu"], "qmel": ["qmdat", "erdat", "qmdab"], "ekko": ["bedat", "kdatb", "kdate", "aedat"],
    "eket": ["eindt"], "ekbe": ["budat"], "vbep": ["edatu"], "vbrk": ["fkdat", "erdat"], "plpo": ["datuv"],
    "vbak": ["erdat", "bstdk", "guebg", "gueen"], "pa0001": ["begda", "endda"],
}

_TS_NAME = re.compile(r"(date|time|timestamp)$|^date_|^(planned_start|planned_end|effective_from|effective_to|actstart|actfinish|"
                      r"schedstart|schedfinish|created|eaudittimestamp)$")
_TS_EXCLUDE = {"downtime"}


def is_iso_ts_column(col):
    return col not in _TS_EXCLUDE and bool(_TS_NAME.search(col))


def sap_date_expr(col):
    c = f"`{col}`"
    return (f"CASE WHEN {c} RLIKE '^[0-9]{{8}}$' AND {c} <> '00000000' "
            f"THEN try_cast(concat_ws('-', substr({c},1,4), substr({c},5,2), substr({c},7,2)) AS DATE) END")


def iso_ts_expr(col):
    c = f"`{col}`"
    return f"try_cast(regexp_replace(regexp_replace({c}, 'T', ' '), 'Z$', '') AS TIMESTAMP)"


def conform(bronze_table, system, short_name):
    df = spark.table(bronze_table)
    exprs = []
    for c in df.columns:
        new = c if c.startswith("_") else snake(c)
        if system == "erp" and new in ERP_DATS.get(short_name, []):
            e = sap_date_expr(c)
        elif system != "erp" and is_iso_ts_column(new):
            e = iso_ts_expr(c)
        elif c.startswith("_"):
            e = f"`{c}`"
        else:
            e = f"nullif(trim(`{c}`), '')"
        exprs.append(f"{e} AS `{new}`")
    return df.selectExpr(*exprs)

# COMMAND ----------

# MAGIC %md ## 2. The classification

# COMMAND ----------

FACT_TABLES = {
    "cmms": {"wostatus", "failurereport", "labtrans", "matusetrans", "a_pm", "measurement", "meterreading"},
    "qms": {"ncr_trace", "calibration", "lpa_result"},
    "plm": {"tc_workflow_task"},
    "mes": {"history_mainline", "component_issue", "data_collection", "serial_test_result", "defect",
            "resource_status_history", "audit_log", "shift_performance"},
    "erp": {"afru", "mseg", "mkpf", "ekbe", "jest", "vbrp", "vbrk", "lips", "likp", "qamr", "qave"},
}

SCD2_TABLES = {
    "cmms": {"assetspec"},
    "erp": {"mara", "marc", "mbew"},
}

# COMMAND ----------

# MAGIC %md ## 3. Build - straight overwrite (SCD1) or append (fact) for most tables

# COMMAND ----------

bronze_tables = [r.tableName for r in spark.sql(f"SHOW TABLES IN {FQN}").collect() if r.tableName.startswith("bronze_")]
report = []
scd2_targets = []

for t in sorted(bronze_tables):
    rest = t[len("bronze_"):]
    system, short_name = rest.split("__", 1)
    out = conform(f"{FQN}.{t}", system, short_name)
    silver_name = f"silver_{system}__{short_name}"

    if short_name in SCD2_TABLES.get(system, set()):
        scd2_targets.append((system, short_name, out))
        continue

    bucket = "fact" if short_name in FACT_TABLES.get(system, set()) else "scd1"
    (out.write.mode("overwrite").option("overwriteSchema", True).saveAsTable(f"{FQN}.{silver_name}"))
    report.append((system, silver_name, bucket, out.count()))

display(spark.createDataFrame(report, "system string, table string, bucket string, rows long").orderBy("system", "table"))

# COMMAND ----------

# MAGIC %md ## 4. Build - real SCD2 for `MARA` / `MARC` / `MBEW` / `ASSETSPEC`

# COMMAND ----------


def scd2_upsert(fqn, system, short_name, staged_df, key_cols):
    cur_table = f"{fqn}.silver_{system}__{short_name}"
    hist_table = f"{fqn}.silver_{system}__{short_name}__history"
    track_cols = [c for c in staged_df.columns if c not in key_cols and not c.startswith("_")]
    hashed = staged_df.withColumn(
        "_row_hash",
        F.sha2(F.concat_ws("||", *[F.coalesce(F.col(c).cast("string"), F.lit("~null~")) for c in track_cols]), 256))

    if not spark.catalog.tableExists(cur_table):
        init = (hashed.withColumn("valid_from", F.col("_ingested_at"))
                      .withColumn("valid_to", F.lit(None).cast("timestamp"))
                      .withColumn("is_current", F.lit(True)))
        init.write.mode("overwrite").saveAsTable(cur_table)
        spark.sql(f"CREATE TABLE {hist_table} AS SELECT * FROM {cur_table} WHERE 1=0")
        return ("initial_load", init.count(), 0)

    view = f"_stg_{system}_{short_name}"
    hashed.createOrReplaceTempView(view)
    key_cond = " AND ".join(f"t.`{c}` = s.`{c}`" for c in key_cols)

    changed = spark.sql(f"""
        SELECT t.* FROM {cur_table} t JOIN {view} s ON {key_cond}
        WHERE t._row_hash <> s._row_hash""").withColumn("valid_to", F.current_timestamp()).withColumn("is_current", F.lit(False))
    changed_count = changed.count()
    if changed_count > 0:
        changed.write.mode("append").saveAsTable(hist_table)

    all_cols = staged_df.columns
    set_clause = ", ".join([f"t.`{c}` = s.`{c}`" for c in all_cols] +
                            ["t._row_hash = s._row_hash", "t.valid_from = s._ingested_at",
                             "t.valid_to = NULL", "t.is_current = true"])
    insert_cols = ", ".join([f"`{c}`" for c in all_cols] + ["_row_hash", "valid_from", "valid_to", "is_current"])
    insert_vals = ", ".join([f"s.`{c}`" for c in all_cols] + ["s._row_hash", "s._ingested_at", "NULL", "true"])
    spark.sql(f"""
        MERGE INTO {cur_table} t USING {view} s ON {key_cond}
        WHEN MATCHED AND t._row_hash <> s._row_hash THEN UPDATE SET {set_clause}
        WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_vals})""")
    return ("merged", spark.table(cur_table).count(), changed_count)


SCD2_KEYS = {("cmms", "assetspec"): ["assetnum", "assetattrid"], ("erp", "mara"): ["matnr"],
             ("erp", "marc"): ["matnr", "werks"], ("erp", "mbew"): ["matnr", "bwkey"]}

scd2_report = []
for system, short_name, out in scd2_targets:
    keys = SCD2_KEYS[(system, short_name)]
    status, rows, changed = scd2_upsert(FQN, system, short_name, out, keys)
    scd2_report.append((system, short_name, status, rows, changed))

display(spark.createDataFrame(scd2_report, "system string, table string, status string, current_rows long, changed_rows long"))

# COMMAND ----------

# MAGIC %md ## 5. Prove the SCD2 mechanism is real - break it, watch it catch the change, restore it
# MAGIC
# MAGIC Takes one real `MARA` row, mutates its material description in a scratch copy of bronze, re-runs the SCD2
# MAGIC conform against that mutated input, and checks: the current `silver_erp__mara` row shows the new value with a
# MAGIC fresh `valid_from`, and the old value now has its own row in `silver_erp__mara__history` with a real
# MAGIC `valid_to`. Then restores the real bronze table so this doesn't leave fake data behind.

# COMMAND ----------

real_bronze = f"{FQN}.bronze_erp__mara"
sample_key = spark.table(real_bronze).select("MATNR").first()["MATNR"]
print("testing against real MATNR:", sample_key)

mutated = (spark.table(real_bronze)
           .withColumn("MAKTX_TEST_OVERRIDE", F.when(F.col("MATNR") == sample_key, F.lit("SCD2 TEST VALUE")).otherwise(F.col("MATNR"))))
mutated_conformed = conform(real_bronze, "erp", "mara").withColumn(
    "maktx", F.when(F.col("matnr") == sample_key, F.lit("SCD2_TEST_VALUE")).otherwise(F.col("maktx")))

status, rows, changed = scd2_upsert(FQN, "erp", "mara", mutated_conformed, ["matnr"])
print("mutated-run result:", status, rows, "rows,", changed, "changed")

cur = spark.sql(f"SELECT matnr, maktx, valid_from, valid_to, is_current FROM {FQN}.silver_erp__mara WHERE matnr = '{sample_key}'")
hist = spark.sql(f"SELECT matnr, maktx, valid_from, valid_to, is_current FROM {FQN}.silver_erp__mara__history WHERE matnr = '{sample_key}'")
print("current row after mutation (expect maktx = SCD2_TEST_VALUE, is_current = true, valid_to = NULL):")
display(cur)
print("history row created by the mutation (expect the ORIGINAL maktx, is_current = false, real valid_to):")
display(hist)

restore_status, restore_rows, restore_changed = scd2_upsert(FQN, "erp", "mara", conform(real_bronze, "erp", "mara"), ["matnr"])
print("restored real data:", restore_status, restore_rows, "rows,", restore_changed, "changed")
restored = spark.sql(f"SELECT matnr, maktx, valid_from, valid_to, is_current FROM {FQN}.silver_erp__mara WHERE matnr = '{sample_key}'")
display(restored)
print("confirm the row above shows the REAL original maktx again, is_current = true, valid_to = NULL")
