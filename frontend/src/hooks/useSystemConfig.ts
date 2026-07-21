import { useQuery } from "@tanstack/react-query";
import axios from "axios";

const API = "http://127.0.0.1:8005";

interface SystemConfig {
  active_sims: string[];
  historical_sims: string[];
  enabled_modules: string[];
}

const _FALLBACK: SystemConfig = {
  active_sims: [],
  historical_sims: [
    "sim006", "sim011", "sim017", "sim022", "sim026", "sim031",
    "sim032", "sim033", "sim034", "sim035", "sim036", "sim037",
    "sim038", "sim039", "sim040",
  ],
  enabled_modules: ["engine", "transmission", "battery", "body", "tyre"],
};

export function useSystemConfig(): SystemConfig {
  const { data } = useQuery<SystemConfig>({
    queryKey: ["systemConfig"],
    queryFn: () =>
      axios.get<SystemConfig>(`${API}/api/config/manifest`).then((r) => r.data),
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? _FALLBACK;
}
