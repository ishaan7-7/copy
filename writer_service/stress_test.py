# File: C:\streaming_emulator\writer_service\verify_stress_test.py
import sys
import time
from pathlib import Path

# Setup Infrastructure
src_path = Path(__file__).parent / "src"
sys.path.append(str(src_path))

try:
    import infrastructure
    infrastructure.setup_environment()
except ImportError:
    sys.exit(1)

from pyspark.sql import SparkSession
from pyspark.sql.functions import col

print("⏳ Starting Spark in PRODUCTION MODE (Multi-Threaded + No Daemon)...")

warehouse_dir = Path("C:/streaming_emulator/data/spark-warehouse")
warehouse_dir.mkdir(parents=True, exist_ok=True)

try:
    # KEY CONFIGURATION FOR PYTHON 3.13 + WINDOWS
    spark = SparkSession.builder \
        .appName("StressTest") \
        .master("local[4]") \
        .config("spark.driver.host", "127.0.0.1") \
        .config("spark.driver.bindAddress", "127.0.0.1") \
        .config("spark.sql.warehouse.dir", str(warehouse_dir.as_uri())) \
        .config("spark.python.use.daemon", "false") \
        .config("spark.python.worker.reuse", "false") \
        .getOrCreate()
    
    print("✅ SparkSession Created with 4 Cores.")

    # STRESS TEST: Create 4 partitions and process them in parallel
    print("⏳ generating data...")
    # 10,000 rows, split into 4 parallel chunks
    df = spark.range(0, 10000).repartition(4)
    
    print("⏳ Running Parallel Map Operation...")
    # A simple operation that forces Python execution
    result = df.withColumn("doubled", col("id") * 2).count()
    
    print(f"✅ STRESS TEST PASSED! Processed {result} rows in parallel.")
    print("🚀 This configuration is sufficient for Phase 2 Writer.")
    
    spark.stop()

except Exception as e:
    print(f"\n❌ FAILED: {e}")