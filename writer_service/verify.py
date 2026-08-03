# File: C:\streaming_emulator\writer_service\verify_step1.py
import sys
import shutil
from pathlib import Path

# Add 'src' to python path
src_path = Path(__file__).parent / "src"
sys.path.append(str(src_path))

try:
    import infrastructure
    infrastructure.setup_environment()
except ImportError as e:
    print(f"❌ CRITICAL: Infrastructure Error: {e}")
    sys.exit(1)

print("⏳ Starting Spark Session (With Network Fixes)...")
try:
    from pyspark.sql import SparkSession

    # Define a local warehouse dir to avoid permission errors in C:\tmp\hive
    warehouse_dir = Path("C:/streaming_emulator/data/spark-warehouse")
    warehouse_dir.mkdir(parents=True, exist_ok=True)

    spark = SparkSession.builder \
        .appName("InfrastructureVerification") \
        .master("local[*]") \
        .config("spark.driver.host", "127.0.0.1") \
        .config("spark.driver.bindAddress", "127.0.0.1") \
        .config("spark.sql.warehouse.dir", str(warehouse_dir.as_uri())) \
        .config("spark.ui.enabled", "false") \
        .getOrCreate()
    
    print("✅ SparkSession created successfully!")
    
    # Run the Task
    print("⏳ Running distributed task (This tests the Workers)...")
    data = [("Java", 1), ("Python", 2), ("Scala", 3)]
    df = spark.createDataFrame(data, ["Language", "ID"])
    
    # This .count() triggers the actual 'Job' on the 'Executor'
    count = df.count()
    
    print(f"✅ Task Completed Successfully! Count: {count}")
    
    spark.stop()

except Exception as e:
    print(f"\n❌ SPARK CRASHED: {e}")