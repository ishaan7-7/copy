# Databricks notebook source
# MAGIC %md
# MAGIC # Unit 4 - Neo4j AuraDB Free sync (the "thin graph" half of thin graph / thick lakehouse)
# MAGIC
# MAGIC Pushes the identity-only projection built in Unit 3 into a real AuraDB Free instance: full node set
# MAGIC (102,271, fits comfortably under Aura Free's 200,000-node cap), edge set filtered to exclude
# MAGIC `HAS_HOUSING_FROM` / `PACKED_IN` / `HAS_BRACKET_FROM` - per-unit component/packaging lineage, real and
# MAGIC useful for a one-off recall trace but not something a general RCA traversal walks across, and over half
# MAGIC the total edge volume. Without the exclusion we're 106,573 relationships over Aura Free's 400,000 cap;
# MAGIC with it we land at 251,117, with real headroom to grow. Those 3 edge types stay fully intact in
# MAGIC `gold_graph_edges` - a recall trace on one specific unit becomes a Unit 3b hydration-view lookup instead
# MAGIC of a graph walk, exactly the "thin graph, thick lakehouse" design already in place.
# MAGIC
# MAGIC Uses the plain `neo4j` Python driver (not the Spark connector) - collects to the notebook's own driver
# MAGIC process in label/type-grouped batches, since Aura Free's compute is modest and this only needs to run
# MAGIC once per full refresh, not as a distributed job. Dynamic node labels (edge endpoints, a few polymorphic
# MAGIC edge types) go through `apoc.merge.node`, confirmed present on this Aura Free instance. Relationship
# MAGIC types don't need APOC at all - each batch is grouped by a single fixed type, so a plain native `MERGE`
# MAGIC with that type as a literal is enough; `apoc.merge.relationship` isn't in Aura Free's APOC Core subset
# MAGIC and isn't needed here.
# MAGIC
# MAGIC Credentials come from the `nexus_neo4j` Databricks secret scope (`aura_uri`, `aura_user`,
# MAGIC `aura_password`) - never hardcoded in this notebook.

# COMMAND ----------

# MAGIC %pip install neo4j

# COMMAND ----------

dbutils.widgets.text("catalog", "cmegtmdev")
dbutils.widgets.text("schema", "manufacturing_coe")
CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
FQN = f"{CATALOG}.{SCHEMA}"

EXCLUDED_EDGE_TYPES = ["HAS_HOUSING_FROM", "PACKED_IN", "HAS_BRACKET_FROM"]
BATCH = 2000

from pyspark.sql import functions as F
from neo4j import GraphDatabase
import pandas as pd

# COMMAND ----------

# MAGIC %md ## 1. Connect to AuraDB Free

# COMMAND ----------

aura_uri = dbutils.secrets.get("nexus_neo4j", "aura_uri")
aura_user = dbutils.secrets.get("nexus_neo4j", "aura_user")
aura_password = dbutils.secrets.get("nexus_neo4j", "aura_password")

driver = GraphDatabase.driver(aura_uri, auth=(aura_user, aura_password))
driver.verify_connectivity()
print("connected to Aura")


def to_records(spark_df):
    pdf = spark_df.toPandas()
    pdf = pdf.astype(object).where(pdf.notnull(), None)
    return pdf.to_dict("records")

# COMMAND ----------

# MAGIC %md ## 2. Uniqueness constraints - one per real node label, derived from the data, not hand-typed

# COMMAND ----------

labels = sorted(r["label"] for r in spark.table(f"{FQN}.gold_graph_nodes").select("label").distinct().collect())
print(len(labels), "distinct node labels")

with driver.session() as session:
    for label in labels:
        session.run(f"CREATE CONSTRAINT IF NOT EXISTS FOR (n:`{label}`) REQUIRE n.key IS UNIQUE")
print("constraints ensured for", len(labels), "labels")

# COMMAND ----------

# MAGIC %md ## 3. Node sync - full set, all 32 labels

# COMMAND ----------

NODE_QUERY = """
UNWIND $rows AS row
CALL apoc.merge.node([row.label], {key: row.key}, {}, {}) YIELD node AS n
SET n.name = row.name, n.category = row.category, n.ts_from = row.ts_from, n.ts_to = row.ts_to
"""

node_records = to_records(spark.table(f"{FQN}.gold_graph_nodes"))
print(len(node_records), "nodes to sync")

with driver.session() as session:
    for i in range(0, len(node_records), BATCH):
        session.run(NODE_QUERY, rows=node_records[i:i + BATCH])
        if (i // BATCH) % 10 == 0:
            print(f"nodes: {min(i + BATCH, len(node_records))}/{len(node_records)}")
print("node sync complete")

# COMMAND ----------

# MAGIC %md ## 4. Edge sync - excludes the 3 lineage edge types, grouped per type so the relationship
# MAGIC label can be a plain literal in the query text rather than needing a dynamic-type procedure

# COMMAND ----------

EDGE_QUERY_TEMPLATE = """
UNWIND $rows AS row
CALL apoc.merge.node([row.src_label], {{key: row.src_key}}, {{}}, {{}}) YIELD node AS src
CALL apoc.merge.node([row.dst_label], {{key: row.dst_key}}, {{}}, {{}}) YIELD node AS dst
MERGE (src)-[r:`{edge_type}` {{edge_id: row.edge_id}}]->(dst)
SET r.step = row.step, r.ts_from = row.ts_from, r.ts_to = row.ts_to, r.qty = row.qty
"""

edges_df = spark.table(f"{FQN}.gold_graph_edges").where(~F.col("type").isin(EXCLUDED_EDGE_TYPES))
edge_types = sorted(r["type"] for r in edges_df.select("type").distinct().collect())
print(len(edge_types), "edge types to sync (excluded:", EXCLUDED_EDGE_TYPES, ")")

total_synced = 0
with driver.session() as session:
    for edge_type in edge_types:
        records = to_records(edges_df.where(F.col("type") == edge_type))
        query = EDGE_QUERY_TEMPLATE.format(edge_type=edge_type)
        for i in range(0, len(records), BATCH):
            session.run(query, rows=records[i:i + BATCH])
        total_synced += len(records)
        print(f"{edge_type}: {len(records)} edges synced (running total {total_synced})")
print("edge sync complete, total:", total_synced)

# COMMAND ----------

# MAGIC %md ## 5. Verify against Aura directly - real counts from the instance, not a description of the sync

# COMMAND ----------

with driver.session() as session:
    aura_node_count = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
    aura_rel_count = session.run("MATCH ()-[r]->() RETURN count(r) AS c").single()["c"]
    per_label = session.run("MATCH (n) RETURN labels(n)[0] AS label, count(*) AS c ORDER BY c DESC").data()
    per_type = session.run("MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS c ORDER BY c DESC").data()

print("Aura node count:", aura_node_count, "/ expected", len(node_records))
print("Aura relationship count:", aura_rel_count, "/ expected", total_synced)
display(spark.createDataFrame(pd.DataFrame(per_label)))
display(spark.createDataFrame(pd.DataFrame(per_type)))

driver.close()
