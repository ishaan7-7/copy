# File: C:\streaming_emulator\writer_service\verify_step2.py
import sys
from pathlib import Path

# Setup Path to import src modules
src_path = Path(__file__).parent / "src"
sys.path.append(str(src_path))

try:
    import infrastructure
    import schema_loader
except ImportError as e:
    print(f"❌ Import Error: {e}")
    sys.exit(1)

print("⏳ Initializing Infrastructure...")
infrastructure.setup_environment()

print("\n⏳ Testing Dynamic Schema Generation...")
try:
    # Load Schemas
    schemas = schema_loader.load_all_schemas()
    
    # CHECK 1: Module Count
    expected_modules = ["engine", "battery", "transmission", "tyre", "body"]
    missing = [m for m in expected_modules if m not in schemas]
    
    if missing:
        print(f"❌ FAILED: Missing schemas for: {missing}")
        sys.exit(1)
    print(f"✅ All {len(schemas)} modules loaded.")

    # CHECK 2: Validate 'Engine' Structure
    engine_schema = schemas['engine']
    
    # Verify Root Keys
    field_names = engine_schema.names
    if "metadata" in field_names and "data" in field_names:
        print("✅ Root structure correct (metadata + data)")
    else:
        print(f"❌ Root structure incorrect. Found: {field_names}")
        sys.exit(1)

    # CHECK 3: Metadata & Ingest Timestamp
    # This specifically checks if your latency requirement is met
    meta_fields = {f.name: f.dataType for f in engine_schema["metadata"].dataType.fields}
    
    if "ingest_ts" in meta_fields:
        ts_type = str(meta_fields["ingest_ts"])
        if "TimestampType" in ts_type:
             print("✅ 'ingest_ts' exists and is TimestampType (Latency tracking ready)")
        else:
             print(f"❌ 'ingest_ts' is wrong type: {ts_type}")
             sys.exit(1)
    else:
        print("❌ Metadata MISSING 'ingest_ts'")
        sys.exit(1)

    # CHECK 4: Data Fields
    data_struct = engine_schema["data"].dataType
    print(f"✅ Mapped {len(data_struct.names)} data fields from master.json")
    
    print("\n🚀 STEP 2 COMPLETE: Schema Engine is ready.")

except Exception as e:
    print(f"\n❌ CRITICAL FAILURE: {e}")