import { useEffect, useRef } from 'react';
import axios from 'axios';
import { keepPreviousData as _keepPrev, type QueryFunctionContext } from '@tanstack/react-query';

const API = 'http://127.0.0.1:8005';
const FLEET_API = 'http://127.0.0.1:8009';


export function fetchApi<T = any>(path: string, base: string = API) {
  return ({ signal }: QueryFunctionContext): Promise<T> =>
    axios.get<T>(`${base}${path}`, { signal }).then((r) => r.data);
}


export function fetchFleet<T = any>(path: string) {
  return fetchApi<T>(path, FLEET_API);
}


const keepPreviousData: any = _keepPrev;


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
    
  }, [isActive]);
}

export { API, FLEET_API, keepPreviousData };
