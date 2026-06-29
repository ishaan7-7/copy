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

export { API, FLEET_API, keepPreviousData };
