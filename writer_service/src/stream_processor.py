# File: C:\streaming_emulator\writer_service\src\stream_processor.py
import time
import logging
import sys
from pyspark.sql.functions import from_json, col, current_timestamp
from infrastructure import setup_environment

# 1. Initialize Infrastructure
setup_environment()

from spark_factory import get_spark_session
from schema_loader import load_all_schemas
from metrics_listener import WriterMetricsListener

# Logging Setup
logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s: %(message)s')
logger = logging.getLogger("StreamProcessor")
logging.getLogger("py4j").setLevel(logging.ERROR)
logging.getLogger("pyspark").setLevel(logging.ERROR)

def run_writer_pipeline():
    # 0. Argument Parsing
    target_module = "engine" # Default
    if len(sys.argv) > 1:
        target_module = sys.argv[1].lower().strip()
        print(f"🎯 PROCESS LAUNCHED FOR: '{target_module}'")
    else:
        print("⚠️  Running in STANDALONE mode (Engine only).")

    # 2. Start Spark
    session_name = f"Writer_{target_module}"
    spark = get_spark_session(session_name)
    spark.sparkContext.setLogLevel("WARN")

    # 3. Attach Metrics Listener
    listener = WriterMetricsListener(module_name=target_module)
    spark.streams.addListener(listener)
    logger.info(f"Metrics Listener attached (module={target_module})")

    # 4. Load Schemas
    try:
        schemas = load_all_schemas()
    except Exception as e:
        logger.error(f"Failed to load schemas: {e}")
        return

    active_streams = []

    # 5. Launch Streams
    for module_name, schema in schemas.items():
        if target_module != "all" and module_name != target_module:
            continue
        
        topic_name = f"telemetry.{module_name}"
        logger.info(f"🚀 Initializing Stream for: {topic_name}")
        
        project_root = Path(__file__).resolve().parents[2]
        checkpoint_path = str(project_root / "data" / "checkpoints" / "writer" / module_name)
        output_path = str(project_root / "data" / "delta" / "bronze" / module_name)
        
        # A. Read
        raw_stream = (
            spark.readStream
            .format("kafka")
            .option("kafka.bootstrap.servers", "localhost:9092")
            .option("subscribe", topic_name)
            .option("startingOffsets", "earliest")
            
            # SPEED OPTIMIZATION: Allow larger chunks now that we are isolated
            .option("maxOffsetsPerTrigger", 10000) 
            
            .option("failOnDataLoss", "false")
            .load()
        )

        # B. Parse
        parsed_df = raw_stream.select(
            from_json(col("value").cast("string"), schema).alias("parsed")
        )
        
        # C. Flatten
        select_cols = [
            col("parsed.metadata.row_hash").alias("row_hash"),
            col("parsed.metadata.ingest_ts").alias("ingest_ts"),
            current_timestamp().alias("writer_ts"),
            col("parsed.metadata.vehicle_id").alias("source_id") 
        ]
        
        data_fields = schema["data"].dataType.names
        for field_name in data_fields:
            if field_name.lower() != "source_id":
                select_cols.append(col(f"parsed.data.{field_name}"))
        
        flattened = parsed_df.select(*select_cols)
        deduped_stream = (
            flattened
            .withWatermark("writer_ts", "2 minutes")
            .dropDuplicates(["row_hash"])
        )

        # D. Write
        query = (
            deduped_stream.writeStream
            .format("delta")
            .outputMode("append")
            .partitionBy("source_id")
            .queryName(module_name)
            
            .trigger(processingTime='2 seconds')
            
            .option("checkpointLocation", checkpoint_path)
            .option("mergeSchema", "true")
            .start(output_path)
        )
        
        active_streams.append(query)
        logger.info(f"✅ Stream started for {module_name}")

    try:
        spark.streams.awaitAnyTermination()
    except KeyboardInterrupt:
        logger.info("🛑 Stopping Writer Service...")
        for q in active_streams:
            q.stop()

if __name__ == "__main__":
    run_writer_pipeline()