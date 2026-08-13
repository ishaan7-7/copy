import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

const FLEET_SIM_API = 'http://127.0.0.1:8009';

export interface BehaviorEventSummary {
  braking: number;
  accel: number;
  cornering: number;
  total: number;
}

export interface VehicleBehavior {
  current_score: number;
  event_summary: BehaviorEventSummary;
  risk_radar: { braking_per_100km: number; accel_per_100km: number; cornering_per_100km: number };
  trip_distance_km: number;
}

interface FleetBehaviorStreamState {
  behavior: Record<string, VehicleBehavior>;
  connected: boolean;
}

const FleetBehaviorStreamContext = createContext<FleetBehaviorStreamState>({
  behavior: {},
  connected: false,
});

export function useFleetBehaviorStream() {
  return useContext(FleetBehaviorStreamContext);
}

export function FleetBehaviorStreamProvider({ children }: { children: React.ReactNode }) {
  const [behavior, setBehavior] = useState<Record<string, VehicleBehavior>>({});
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    const connect = () => {
      const es = new EventSource(`${FLEET_SIM_API}/api/fleet/stream`);
      esRef.current = es;

      es.onopen = () => {
        setConnected(true);
        reconnectAttempts.current = 0;
      };

      es.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.behavior) {
            setBehavior((prev) => ({ ...prev, ...payload.behavior }));
          }
        } catch {}
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        const delay = Math.min(3000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current += 1;
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      esRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  return (
    <FleetBehaviorStreamContext.Provider value={{ behavior, connected }}>
      {children}
    </FleetBehaviorStreamContext.Provider>
  );
}
