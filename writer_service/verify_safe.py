# File: C:\streaming_emulator\writer_service\verify_safe_mode.py
import sys
import os
from pathlib import Path

# Setup Infrastructure
src_path = Path(__file__).parent / "src"
sys.path.append(str(src_path))

try:
    import infrastructure
    infrastructure.setup_environment()
except ImportError:
    print("❌ Critical: Infrastructure module missing.")
    sys.exit(1)

from pyspark.sql import SparkSession

print("⏳ Starting Spark in SAFE MODE (Single Thread + No Daemon)...")

# 1. Define Local Warehouse to avoid C:\tmp permission issues
warehouse_dir = Path("C:/streaming_emulator/data/spark-warehouse")
warehouse_dir.mkdir(parents=True, exist_ok=True)

try:
    spark = SparkSession.builder \
        .appName("SafeModeVerification") \
        .master("local[1]") \
        .config("spark.driver.host", "127.0.0.1") \
        .config("spark.driver.bindAddress", "127.0.0.1") \
        .config("spark.sql.warehouse.dir", str(warehouse_dir.as_uri())) \
        .config("spark.python.use.daemon", "false") \
        .config("spark.python.worker.reuse", "false") \
        .config("spark.sql.execution.arrow.pyspark.enabled", "false") \
        .getOrCreate()
    
    print("✅ SparkSession Created.")
    print(f"   Python Version: {sys.version.split()[0]}")
    print(f"   Spark Version: {spark.version}")

    # 2. Run a Simple Calculation
    print("⏳ Running Test Task...")
    # Using range() is simpler than createDataFrame for connectivity testing
    count = spark.range(5).count()
    
    print(f"✅ SUCCESS! Task Completed. Count: {count}")
    
    spark.stop()

except Exception as e:
    print(f"\n❌ FAILED: {e}")
    # Check for common Python 3.13 incompatibility signature
    if "Connection reset" in str(e):
        print("\n⚠️ DIAGNOSIS: Python Worker Crashed.")
        print("This is likely due to Python 3.13 incompatibility.")
        print("PySpark 3.5.x is most stable with Python 3.10 or 3.11.")