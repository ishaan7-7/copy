import time
import os
import sys
from src.state_manager import StateManager
from src.ml_engine import MLEngine
from src.reader import BronzeReader
from src.writer import SilverWriter
from src import config


def run_module(module, state, ml, reader, writer):
    df_new = reader.get_new_data(module)
    if df_new.empty:
        return False

    if 'source_id' not in df_new.columns or 'ingest_ts' not in df_new.columns:
        return False

    processed_any = False
    active_sims = df_new['source_id'].unique()

    for sim_id in active_sims:
        sim_df = df_new[df_new['source_id'] == sim_id]
        last_ts = state.get_last_timestamp(sim_id)
        sim_df = sim_df[sim_df['ingest_ts'].astype(str) > str(last_ts)]

        if sim_df.empty:
            continue
        sim_df = sim_df.head(config.BATCH_SIZE)

        try:
            out_df = ml.process_batch(sim_df.copy(), sim_id)
            if not out_df.empty:
                writer.write(out_df, module)
                max_ingest_ts = str(sim_df['ingest_ts'].max())
                state.update_checkpoint(sim_id, max_ingest_ts)
                processed_any = True
                print(f"[{module.upper():<12}] {sim_id}: Inferred {len(out_df)} rows")
        except Exception as e:
            print(f"Warning: Skipped {sim_id} {module}: {e}")

    return processed_any


def main():
    if len(sys.argv) < 2:
        print("Usage: python app.py <module_name|all>")
        sys.exit(1)

    target = sys.argv[1].lower()

    if target == "all":
        modules = config.MODULES
    elif target in config.MODULES:
        modules = [target]
    else:
        print(f"Invalid module. Choose from {config.MODULES} or 'all'")
        sys.exit(1)

    print("=====================================================")
    print(f"STARTING INFERENCE: {[m.upper() for m in modules]}")
    print("=====================================================")

    engines = {}
    for mod in modules:
        state = StateManager(mod)
        ml = MLEngine(state, mod)
        reader = BronzeReader(state)
        engines[mod] = {"state": state, "ml": ml, "reader": reader}
        print(f"Loaded artifacts for {mod.upper()}")

    writer = SilverWriter()
    print(f"Polling Bronze every {config.POLL_INTERVAL}s...")

    while True:
        processed_any = False
        for mod in modules:
            e = engines[mod]
            try:
                if run_module(mod, e["state"], e["ml"], e["reader"], writer):
                    processed_any = True
            except Exception as ex:
                print(f"Error in {mod}: {ex}")

        time.sleep(config.POLL_INTERVAL)


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()
