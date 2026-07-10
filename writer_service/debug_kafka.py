# File: C:\streaming_emulator\writer_service\debug_kafka.py
import logging
import sys
from pathlib import Path

# Setup Infrastructure
src_path = Path(__file__).parent / "src"
sys.path.append(str(src_path))
from infrastructure import setup_environment
setup_environment()
from spark_factory import get_spark_session

def debug_read():
    print("⚡ Starting Spark Console Debugger...")
    spark = get_spark_session("DebugConsole")
    spark.sparkContext.setLogLevel("WARN")

    print("⏳ Connecting to Kafka (telemetry.*)...")
    
    # Listen to the ACTUAL topic pattern
    df = (spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", "localhost:9092")
        .option("subscribePattern", "telemetry.*")  # <--- FIX: Match your live topics
        .option("startingOffsets", "earliest")
        .load())

    print("✅ Stream Initialized. Printing Topic Names & Data...")

    # Print topic name so we know what we found
    query = (df.select("topic", "value")
        .writeStream
        .format("console")
        .outputMode("append")
        .option("truncate", "false")
        .start())

    query.awaitTermination()

if __name__ == "__main__":
    debug_read()