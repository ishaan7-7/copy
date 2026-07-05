import { useEffect, useRef } from 'react';
import axios from 'axios';
import { keepPreviousData as _keepPrev, type QueryFunctionContext } from '@tanstack/react-query';

const API = 'http://127.0.0.1:8005';
const FLEET_API = 'http://127.0.0.1:8009';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fetchApi<T = any>(path: string, base: string = API) {
  return ({ signal }: QueryFunctionContext): Promise<T> =>
    axios.get<T>(`${base}${path}`, { signal }).then((r) => r.data);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fetchFleet<T = any>(path: string) {
  return fetchApi<T>(path, FLEET_API);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const keepPreviousData: any = _keepPrev;

// Pages stay permanently mounted (Layout.tsx keep-alive routing) so their
// refetchInterval should only run while actually visible — otherwise every
// visited page polls forever in the background, growing CPU/network load
// linearly with session length. Gate refetchInterval with liveInterval(),
// then call this once per page to catch up immediately the moment a paused
// page becomes visible again, instead of waiting out a full interval.
export function liveInterval(ms: number, isActive: boolean, autoRefresh: boolean): number | false {
  return (isActive && autoRefresh) ? ms : false;
}

export function useRefetchOnActivate(isActive: boolean, refetchers: Array<() => unknown>) {
  const prevActive = useRef(isActive);
  useEffect(() => {
    if (isActive && !prevActive.current) {
      refetchers.forEach((fn) => {
        try { fn(); } catch { /* ignore */ }
      });
    }
    prevActive.current = isActive;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);
}

export { API, FLEET_API, keepPreviousData };
