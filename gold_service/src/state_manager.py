import os
import json
import pickle
from src import config

class GoldStateManager:
    def __init__(self):
        self.checkpoints = self._load_json(config.CHECKPOINT_FILE, default={m: "1970-01-01T00:00:00" for m in config.ENABLED_MODULES})
        self.vehicle_cache = self._load_pkl(config.CACHE_FILE, default={})

    def _load_json(self, path, default):
        if os.path.exists(path):
            with open(path, 'r') as f:
                try:
                    return json.load(f)
                except Exception:
                    return default
        return default

    def _load_pkl(self, path, default):
        if os.path.exists(path):
            with open(path, 'rb') as f:
                try:
                    return pickle.load(f)
                except Exception:
                    return default
        return default

    def save_state(self):
        ckpt_tmp = config.CHECKPOINT_FILE + ".tmp"
        with open(ckpt_tmp, 'w') as f:
            json.dump(self.checkpoints, f)
        os.replace(ckpt_tmp, config.CHECKPOINT_FILE)

        cache_tmp = config.CACHE_FILE + ".tmp"
        with open(cache_tmp, 'wb') as f:
            pickle.dump(self.vehicle_cache, f)
        os.replace(cache_tmp, config.CACHE_FILE)

    def get_vehicle_state(self, sim_id):
        if sim_id not in self.vehicle_cache:
            self.vehicle_cache[sim_id] = {
                mod: {"health": 100.0, "feats": "{}"} for mod in config.ENABLED_MODULES
            }
        return self.vehicle_cache[sim_id]

    def update_module_state(self, sim_id, module, health, features_json):
        if module not in config.ENABLED_MODULES:
            return

        state = self.get_vehicle_state(sim_id)
        state[module] = {"health": float(health), "feats": features_json}

        if len(self.vehicle_cache) > 100:
            keys = list(self.vehicle_cache.keys())
            for k in keys[:len(keys) - 100]:
                del self.vehicle_cache[k]
