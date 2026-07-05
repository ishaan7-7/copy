import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const AUTOMOTIVE_API = 'http://127.0.0.1:8005';
const RING_CAP = 3600;

interface HealthPoint {
  ts: string;
  health: number;
  mileage: number;
}

export interface VehicleStream {
  vehicle_id: string;
  health_score: number;
  data_source: string;
  engine_contrib: number;
  transmission_contrib: number;
  battery_contrib: number;
  body_contrib: number;
  tyre_contrib: number;
}

interface GoldStreamState {
  vehicles: VehicleStream[];
  connected: boolean;
  ringBuffer: Map<string, HealthPoint[]>;
}

const GoldStreamContext = createContext<GoldStreamState>({
  vehicles: [],
  connected: false,
  ringBuffer: new Map(),
});

export function useGoldStream() {
  return useContext(GoldStreamContext);
}

export function GoldStreamProvider({ children }: { children: React.ReactNode }) {
  const [vehicles, setVehicles] = useState<VehicleStream[]>([]);
  const [connected, setConnected] = useState(false);
  const ringBuffer = useRef<Map<string, HealthPoint[]>>(new Map());
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disconnectedAt = useRef<number | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const appendRing = (vehicleId: string, point: HealthPoint) => {
    const buf = ringBuffer.current.get(vehicleId) ?? [];
    buf.push(point);
    if (buf.length > RING_CAP) buf.splice(0, buf.length - RING_CAP);
    ringBuffer.current.set(vehicleId, buf);
  };

  const startFallbackPoll = () => {
    if (fallbackTimer.current) return;
    fallbackTimer.current = setInterval(async () => {
      try {
        const r = await axios.get(`${AUTOMOTIVE_API}/api/automotive/fleet-health-scatter`);
        if (r.data?.vehicle_streams) {
          setVehicles(r.data.vehicle_streams);
        }
        if (r.data?.scatter) {
          for (const [vid, pts] of Object.entries(r.data.scatter as Record<string, HealthPoint[]>)) {
            for (const pt of pts) appendRing(vid, pt);
          }
        }
      } catch {}
    }, 5000);
  };

  const stopFallbackPoll = () => {
    if (fallbackTimer.current) {
      clearInterval(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  };

  useEffect(() => {
    const connect = () => {
      const es = new EventSource(`${AUTOMOTIVE_API}/api/automotive/stream`);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        disconnectedAt.current = null;
        stopFallbackPoll();
      };

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.vehicles) setVehicles(payload.vehicles);
          if (payload.delta) {
            for (const [vid, pts] of Object.entries(payload.delta as Record<string, HealthPoint[]>)) {
              for (const pt of pts) appendRing(vid, pt);
            }
          }
        } catch {}
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        if (!disconnectedAt.current) {
          disconnectedAt.current = Date.now();
        } else if (Date.now() - disconnectedAt.current > 10000) {
          startFallbackPoll();
        }
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopFallbackPoll();
    };
  }, []);

  return (
    <GoldStreamContext.Provider value={{ vehicles, connected, ringBuffer: ringBuffer.current }}>
      {children}
    </GoldStreamContext.Provider>
  );
}
