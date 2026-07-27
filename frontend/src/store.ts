import { create } from 'zustand';

const DTC_CACHE_TTL_MS = 5 * 60 * 1000;

export interface DtcTrigger {
  message?: string;
  code?: string;
  severity?: string;
}

interface DtcCacheEntry {
  triggers: DtcTrigger[];
  cachedAt: number;
}

export interface AlertCandidate {
  source_id: string;
  module: string;
  peak_anomaly_ts: string;
  last_updated_ts?: string;
  severity?: string;
}

export interface AlertPoolItem {
  source_id: string;
  module: string;
  msg: string;
  severity: string;
  peak_anomaly_ts: string;
  last_updated_ts?: string;
}

function buildPool(candidates: AlertCandidate[], cache: Record<string, DtcCacheEntry>): AlertPoolItem[] {
  const now = Date.now();
  const pool: AlertPoolItem[] = [];
  for (const c of candidates) {
    const key = `${c.source_id}|${c.module}|${c.peak_anomaly_ts}`;
    const entry = cache[key];
    if (!entry || now - entry.cachedAt > DTC_CACHE_TTL_MS) continue;
    for (const t of entry.triggers) {
      if (t.message) {
        pool.push({
          source_id: c.source_id,
          module: c.module.toLowerCase(),
          msg: t.message,
          severity: (c.severity ?? 'warning').toLowerCase(),
          peak_anomaly_ts: c.peak_anomaly_ts,
          last_updated_ts: c.last_updated_ts,
        });
      }
    }
  }
  return pool;
}

interface AppState {
  activeTab: number;
  autoRefresh: boolean;
  darkMode: boolean;
  selectedModule: string;
  selectedVehicle: string | null;
  setActiveTab: (tab: number) => void;
  toggleAutoRefresh: () => void;
  toggleDarkMode: () => void;
  setSelectedModule: (module: string) => void;
  setSelectedVehicle: (vehicleId: string | null) => void;

  dtcCache: Record<string, DtcCacheEntry>;
  alertCandidates: AlertCandidate[];
  alertPool: AlertPoolItem[];
  alertTotal: number;

  setDtcResult: (source_id: string, module: string, peak_ts: string, triggers: DtcTrigger[]) => void;
  setAlertCandidates: (candidates: AlertCandidate[], total: number) => void;
  clearDtcCache: () => void;
}

export const useStore = create<AppState>((set) => ({
  activeTab: 0,
  autoRefresh: true,
  darkMode: false,
  selectedModule: 'engine',
  selectedVehicle: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleAutoRefresh: () => set((state) => ({ autoRefresh: !state.autoRefresh })),
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),
  setSelectedModule: (module) => set({ selectedModule: module }),
  setSelectedVehicle: (vehicleId) => set({ selectedVehicle: vehicleId }),

  dtcCache: {},
  alertCandidates: [],
  alertPool: [],
  alertTotal: 0,

  setDtcResult: (source_id, module, peak_ts, triggers) =>
    set((state) => {
      const key = `${source_id}|${module}|${peak_ts}`;
      const newCache = { ...state.dtcCache, [key]: { triggers, cachedAt: Date.now() } };
      return { dtcCache: newCache, alertPool: buildPool(state.alertCandidates, newCache) };
    }),

  setAlertCandidates: (candidates, total) =>
    set((state) => ({
      alertCandidates: candidates,
      alertTotal: total,
      alertPool: buildPool(candidates, state.dtcCache),
    })),

  clearDtcCache: () => set({ dtcCache: {}, alertPool: [] }),
}));
