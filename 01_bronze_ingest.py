# Databricks notebook source
# MAGIC %md
# MAGIC # Unit 1 - Bronze ingest: NBS_Manufacturing_KG_Dataset -> cmegtmdev.manufacturing_coe
# MAGIC
# MAGIC Lands all 132 source tables (5 systems: ERP, MES, PLM, QMS, CMMS) as Delta tables inside the one schema
# MAGIC `cmegtmdev.manufacturing_coe`, with the medallion layer encoded in the table name (`bronze_<system>__<table>`)
# MAGIC since no separate `bronze`/`silver`/`gold` schemas are available here - only prefixes, no renaming later.
# MAGIC
# MAGIC Everything is read as **STRING** (SAP keys, batch numbers and inspection-lot numbers have leading zeros that
# MAGIC would be silently stripped by type inference) with lineage columns `_source_file` / `_ingested_at`.
# MAGIC
# MAGIC **Before running:** upload `NBS_Manufacturing_KG_Dataset.zip` into the volume this notebook creates
# MAGIC (`/Volumes/cmegtmdev/manufacturing_coe/landing/`) via Catalog Explorer - see the instructions after this notebook.

# COMMAND ----------

dbutils.widgets.text("catalog", "cmegtmdev")
dbutils.widgets.text("schema", "manufacturing_coe")
CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
FQN = f"{CATALOG}.{SCHEMA}"
LANDING = f"/Volumes/{CATALOG}/{SCHEMA}/landing"

# COMMAND ----------

# MAGIC %md ## 1. Create the landing volume (the schema itself already exists with your privileges)

# COMMAND ----------

spark.sql(f"CREATE VOLUME IF NOT EXISTS {FQN}.landing COMMENT 'Raw NBS_Manufacturing_KG_Dataset extract, as uploaded'")
print(f"volume ready: {LANDING}")
print("upload NBS_Manufacturing_KG_Dataset.zip here now (Catalog Explorer -> this volume -> Upload), then run the next cell")

# COMMAND ----------

# MAGIC %md ## 2. Unzip (run once, after the upload above)

# COMMAND ----------

import os
import zipfile

zip_path = f"{LANDING}/NBS_Manufacturing_KG_Dataset.zip"
extract_root = f"{LANDING}/NBS_Manufacturing_KG_Dataset"
if os.path.exists(extract_root):
    print("already extracted:", extract_root)
elif os.path.exists(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(LANDING)
    print("extracted:", extract_root)
else:
    print("upload the zip first, to:", zip_path)

# COMMAND ----------

# MAGIC %md ## 3. Bronze ingest - one Delta table per source CSV

# COMMAND ----------

from pyspark.sql import functions as F

SOURCE_FOLDERS = {
    "01_ERP_SAP_S4HANA": "erp",
    "02_MES_Opcenter_Execution": "mes",
    "03_PLM_Teamcenter": "plm",
    "04_QMS_eQMS": "qms",
    "05_CMMS_Maximo": "cmms",
}

loaded = []
for folder, system in SOURCE_FOLDERS.items():
    src_dir = f"{extract_root}/{folder}"
    for f in dbutils.fs.ls(src_dir):
        if not f.name.lower().endswith(".csv"):
            continue
        table_name = f"bronze_{system}__{f.name[:-4].lower()}"
        full_table = f"{FQN}.{table_name}"
        df = (spark.read
              .option("header", True)
              .option("inferSchema", False)
              .option("multiLine", True)
              .option("escape", '"')
              .csv(f.path)
              .withColumn("_source_file", F.lit(f.path))
              .withColumn("_ingested_at", F.current_timestamp()))
        (df.write.mode("overwrite").option("overwriteSchema", True).saveAsTable(full_table))
        loaded.append((system, table_name, df.count()))

result = spark.createDataFrame(loaded, "system string, table string, rows long")
display(result)

# COMMAND ----------

# MAGIC %md ## 4. Verify against the known-correct shape

# COMMAND ----------

summary = result.groupBy("system").agg(F.count("*").alias("tables_loaded"), F.sum("rows").alias("rows_loaded")).orderBy("system")
display(summary)

EXPECTED = {"cmms": (22, 12270), "erp": (62, 87738), "mes": (19, 341705), "plm": (15, 601), "qms": (14, 3577)}
print("Expected: cmms=22/12270  erp=62/87738  mes=19/341705  plm=15/601  qms=14/3577  (132 tables / 445,891 rows total)")

mismatches = []
for row in summary.collect():
    exp_tables, exp_rows = EXPECTED.get(row["system"], (None, None))
    if row["tables_loaded"] != exp_tables or row["rows_loaded"] != exp_rows:
        mismatches.append((row["system"], row["tables_loaded"], exp_tables, row["rows_loaded"], exp_rows))

if mismatches:
    print("MISMATCHES FOUND - do not proceed to Unit 2 until these are understood:")
    for m in mismatches:
        print(f"  {m[0]}: got {m[1]} tables / {m[3]} rows, expected {m[2]} tables / {m[4]} rows")
else:
    print("All 5 systems match the expected table/row counts exactly. Unit 1 complete.")
