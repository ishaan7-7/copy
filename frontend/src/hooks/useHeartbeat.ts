import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

interface HeartbeatLayer {
  seq: number;
  max_ts: string;
}

interface HeartbeatData {
  seq: number;
  layers: {
    bronze: HeartbeatLayer;
    silver: HeartbeatLayer;
    gold:   HeartbeatLayer;
    alerts: HeartbeatLayer;
  };
}

const FALLBACK: HeartbeatData = {
  seq: 0,
  layers: {
    bronze: { seq: 0, max_ts: '' },
    silver: { seq: 0, max_ts: '' },
    gold:   { seq: 0, max_ts: '' },
    alerts: { seq: 0, max_ts: '' },
  },
};

async function fetchHeartbeat(): Promise<HeartbeatData> {
  const { data } = await axios.get('http://127.0.0.1:8005/api/heartbeat');
  return data;
}

export function useHeartbeat(enabled = true, isActive = true) {
  const { data } = useQuery<HeartbeatData>({
    queryKey:       ['heartbeat'],
    queryFn:        fetchHeartbeat,
    refetchInterval: enabled && isActive ? 2000 : false,
    placeholderData: FALLBACK,
  });

  const hb = data ?? FALLBACK;

  return {
    seq:       hb.seq,
    bronzeSeq: hb.layers.bronze.seq,
    silverSeq: hb.layers.silver.seq,
    goldSeq:   hb.layers.gold.seq,
    alertsSeq: hb.layers.alerts.seq,
    layers:    hb.layers,
  };
}
