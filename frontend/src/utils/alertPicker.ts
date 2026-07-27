import type { AlertPoolItem } from '../store';

export interface DisplayAlert {
  source_id: string;
  module: string;
  peak_anomaly_ts: string;
  severity: string;
  dtcMessage: string;
  relativeTime: string;
}

function relTime(ts: string): string {
  if (!ts) return '—';
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function pickFour(pool: AlertPoolItem[], n = 4): DisplayAlert[] {
  const toDisplay = (item: AlertPoolItem): DisplayAlert => ({
    source_id: item.source_id,
    module: item.module,
    peak_anomaly_ts: item.peak_anomaly_ts,
    severity: item.severity,
    dtcMessage: item.msg,
    relativeTime: relTime(item.last_updated_ts ?? item.peak_anomaly_ts),
  });

  const out: DisplayAlert[] = [];
  const usedSims = new Set<string>();
  const usedMods = new Set<string>();
  const usedMsgs = new Set<string>();

  const add = (item: AlertPoolItem) => {
    out.push(toDisplay(item));
    usedSims.add(item.source_id);
    usedMods.add(item.module);
    usedMsgs.add(item.msg);
  };

  // P1: source_id, module, message all distinct
  for (const item of pool) {
    if (out.length >= n) break;
    if (!usedSims.has(item.source_id) && !usedMods.has(item.module) && !usedMsgs.has(item.msg)) add(item);
  }

  // P2: source_id+module combo new, message can repeat
  if (out.length < n) {
    for (const item of pool) {
      if (out.length >= n) break;
      if (!usedSims.has(item.source_id) && !usedMods.has(item.module)) add(item);
    }
  }

  // P3: source_id new, module can repeat
  if (out.length < n) {
    for (const item of pool) {
      if (out.length >= n) break;
      if (!usedSims.has(item.source_id)) add(item);
    }
  }

  // P4: not exact duplicate (source_id + module + message)
  if (out.length < n) {
    const exact = new Set(out.map((r) => `${r.source_id}|${r.module}|${r.dtcMessage}`));
    for (const item of pool) {
      if (out.length >= n) break;
      const key = `${item.source_id}|${item.module}|${item.msg}`;
      if (!exact.has(key)) {
        out.push(toDisplay(item));
        exact.add(key);
      }
    }
  }

  return out;
}
