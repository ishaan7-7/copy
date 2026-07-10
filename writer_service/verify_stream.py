# File: C:\streaming_emulator\writer_service\verify_step3.py
import sys
import time
from pathlib import Path
from pyspark.sql.functions import col, expr

# Setup path
src_path = Path(__file__).parent / "src"
sys.path.append(str(src_path))

from infrastructure import setup_environment
setup_environment()
from spark_factory import get_spark_session

def verify_delta_table(module_name="engine"):
    print(f"\n🔍 Verifying Delta Table: {module_name}")
    spark = get_spark_session("Verifier")
    
    delta_path = f"C:/streaming_emulator/data/delta/bronze/{module_name}"
    
    # 1. Check if Table Exists
    if not Path(delta_path).exists():
        print(f"❌ Delta Table not found at {delta_path}")
        print("   (Did you run the Replay Service and Stream Processor?)")
        return False

    try:
        # 2. Read Delta Table
        df = spark.read.format("delta").load(delta_path)
        count = df.count()
        print(f"✅ Table Loaded. Row Count: {count}")
        
        if count == 0:
            print("⚠️ Table is empty. Waiting for streams to process...")
            return False

        # 3. Check Latency Columns
        columns = df.columns
        print(f"   Columns found: {columns[:5]}...")
        
        if "ingest_ts" in columns and "writer_ts" in columns:
            print("✅ Latency Metadata Present (ingest_ts, writer_ts)")
            
            # Calculate Avg Latency
            latency_df = df.withColumn("latency_sec", 
                col("writer_ts").cast("long") - col("ingest_ts").cast("long")
            )
            stats = latency_df.selectExpr("avg(latency_sec) as avg_lat").collect()[0]
            print(f"   📊 Avg Writer Latency: {stats['avg_lat']:.4f} seconds")
            
        else:
            print("❌ Missing Timestamp Columns!")
            return False

        # 4. Check Partitioning (Source ID)
        if "source_id" in columns:
             print("✅ Partition Column 'source_id' exists.")
        
        return True

    except Exception as e:
        print(f"❌ Error reading Delta table: {e}")
        return False

if __name__ == "__main__":
    # Check 'engine' as the default test case
    verify_delta_table("engine")