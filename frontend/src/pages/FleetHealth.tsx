import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Chip,
  Divider,
  IconButton,
  Tooltip,
  TextField,
  InputAdornment,
  Button,
  CircularProgress,
  LinearProgress,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SyncIcon from "@mui/icons-material/Sync";
import SyncDisabledIcon from "@mui/icons-material/SyncDisabled";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import LocalHospitalRoundedIcon from "@mui/icons-material/LocalHospitalRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import DirectionsCarFilledRoundedIcon from "@mui/icons-material/DirectionsCarFilledRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import TrendingDownRoundedIcon from "@mui/icons-material/TrendingDownRounded";
import TrendingUpRoundedIcon from "@mui/icons-material/TrendingUpRounded";
import TrendingFlatRoundedIcon from "@mui/icons-material/TrendingFlatRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import BatteryFullRoundedIcon from "@mui/icons-material/BatteryFullRounded";
import TireRepairRoundedIcon from "@mui/icons-material/TireRepairRounded";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, ClientSideRowModelModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";
import {
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RcTooltip,
  ResponsiveContainer,
  Cell,
  Brush,
} from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useStore } from "../store";
import { liveInterval, useRefetchOnActivate } from "../hooks/useApi";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const API = "http://127.0.0.1:8005";
const ALL_MODULES = ["engine", "transmission", "battery", "body", "tyre"] as const;
type Module = typeof ALL_MODULES[number];

const MODULE_COLORS: Record<Module, string> = {
  engine: "#e57373",
  transmission: "#ffb74d",
  battery: "#81c784",
  body: "#ba68c8",
  tyre: "#4dd0e1",
};

const MODULE_ICONS: Record<Module, React.ElementType> = {
  engine: SpeedRoundedIcon,
  transmission: SettingsRoundedIcon,
  battery: BatteryFullRoundedIcon,
  body: DirectionsCarFilledRoundedIcon,
  tyre: TireRepairRoundedIcon,
};

const SEV_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  WARNING: "#f59e0b",
  NORMAL: "#22c55e",
};

interface Vehicle {
  vehicle_id: string;
  health_score: number;
  engine_contrib: number;
  transmission_contrib: number;
  battery_contrib: number;
  body_contrib: number;
  tyre_contrib: number;
  data_source?: string;
}

interface FleetStats {
  total_vehicles: number;
  avg_health: number;
  critical_count: number;
  warning_count: number;
}

interface FleetSummary {
  vehicles: Vehicle[];
  fleet_stats: FleetStats;
}

interface ModuleRanking {
  vehicle_id: string;
  avg_health: number;
  min_health: number;
  trend_slope: number;
  total_pts: number;
  alert_count: number;
}

interface ModuleRankingData {
  module: string;
  rankings: ModuleRanking[];
}

interface FleetHealthSeries {
  ts: string;
  fleet_avg?: number;
  [key: string]: string | number | undefined;
}

interface ModuleFleetHealthData {
  module: string;
  vehicles: string[];
  series: FleetHealthSeries[];
}

interface TopFeature {
  feature: string;
  total_score: number;
  avg_score: number;
  occurrence_count: number;
}

interface ModuleFeaturesData {
  module: string;
  features: TopFeature[];
}

interface DtcEntry {
  code: string;
  severity: string;
  count: number;
  vehicle_count: number;
}

interface DtcDistribution {
  distribution: DtcEntry[];
}

interface DtcTrigger {
  code: string;
  severity: string;
}

interface DtcRun {
  source_id: string;
  module: string;
  peak_ts: string;
  run_ts: string;
  triggers: DtcTrigger[];
}

interface DtcHistory {
  runs: DtcRun[];
}

interface AlertEntry {
  alert_id: string;
  module: string;
  source_id: string;
  peak_anomaly_ts: string;
  max_composite_score: number;
}

interface AlertsMetrics {
  active_alerts_count: number;
  critical_vehicles: number;
  processing_lag: number;
  open_alerts: AlertEntry[];
  closed_alerts: AlertEntry[];
}

const BATCH_CAP = 15;

interface BatchProgress {
  current: number;
  total: number;
  currentLabel: string;
  leftAfterCap: number;
}

interface BatchResult {
  analyzed: number;
  failed: number;
  leftAfterCap: number;
}

function deduplicateAlerts(alerts: AlertEntry[]): AlertEntry[] {
  const map = new Map<string, AlertEntry>();
  for (const alert of alerts) {
    const key = `${alert.source_id}|${alert.module}`;
    const existing = map.get(key);
    if (!existing || new Date(alert.peak_anomaly_ts) > new Date(existing.peak_anomaly_ts)) {
      map.set(key, alert);
    }
  }
  return Array.from(map.values());
}

function healthColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function healthBand(score: number): "healthy" | "warning" | "critical" {
  if (score >= 80) return "healthy";
  if (score >= 60) return "warning";
  return "critical";
}

function agGridSx(isDark: boolean) {
  const bg = isDark ? "#0f1117" : "#ffffff";
  const border = isDark ? "#1e2433" : "#e2e8f0";
  const txt = isDark ? "#e2e8f0" : "#1e293b";
  const header = isDark ? "#131722" : "#f1f5f9";
  const alt = isDark ? "#0d1018" : "#f8fafc";
  const sel = isDark ? "#1e2d4a" : "#dbeafe";
  const hover = isDark ? "#1a2235" : "#f0f7ff";
  return {
    "--ag-background-color": bg,
    "--ag-odd-row-background-color": alt,
    "--ag-header-background-color": header,
    "--ag-header-foreground-color": txt,
    "--ag-foreground-color": txt,
    "--ag-border-color": border,
    "--ag-row-border-color": border,
    "--ag-row-hover-color": hover,
    "--ag-selected-row-background-color": sel,
    "--ag-font-family": "inherit",
    "--ag-font-size": "11px",
    "--ag-cell-horizontal-padding": "8px",
    "--ag-header-height": "32px",
    "--ag-row-height": "28px",
  };
}

function iSx(isDark: boolean) {
  return {
    bgcolor: isDark ? "#0d1117" : "#ffffff",
    border: `1px solid ${isDark ? "#1e2433" : "#e2e8f0"}`,
    borderRadius: 2,
  };
}

const menuProps = (isDark: boolean) => ({
  PaperProps: {
    sx: {
      bgcolor: isDark ? "#131722" : "#fff",
      border: `1px solid ${isDark ? "#2d3748" : "#e2e8f0"}`,
      borderRadius: 1.5,
      boxShadow: isDark
        ? "0 8px 32px rgba(0,0,0,0.6)"
        : "0 8px 24px rgba(0,0,0,0.12)",
      "& .MuiMenuItem-root": {
        fontSize: "12px",
        fontWeight: 500,
        py: 0.75,
        px: 1.5,
        color: isDark ? "#cbd5e1" : "#374151",
        "&:hover": { bgcolor: isDark ? "#1e2433" : "#f1f5f9" },
        "&.Mui-selected": {
          bgcolor: isDark ? "#1e2d4a" : "#dbeafe",
          color: isDark ? "#93c5fd" : "#1d4ed8",
        },
      },
    },
  },
});

function SectionHeader({
  title,
  accent,
  right,
}: {
  title: string;
  accent?: string;
  right?: React.ReactNode;
}) {
  const isDark = useTheme().palette.mode === "dark";
  const color = accent ?? "#22c55e";
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        mb: 1.5,
        pb: 1,
        borderBottom: `1px solid ${isDark ? "#1e2433" : "#e2e8f0"}`,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          sx={{
            width: 3,
            height: 16,
            borderRadius: 1,
            bgcolor: color,
            flexShrink: 0,
          }}
        />
        <Typography
          sx={{
            fontSize: "10px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: isDark ? "#94a3b8" : "#64748b",
          }}
        >
          {title}
        </Typography>
      </Box>
      {right}
    </Box>
  );
}

function KpiTile({
  label,
  value,
  sub,
  color,
  icon,
  isDark,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
  isDark: boolean;
}) {
  const c = color ?? "#22c55e";
  return (
    <Box
      sx={{
        ...iSx(isDark),
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          width: 3,
          height: "100%",
          bgcolor: c,
          borderRadius: "2px 0 0 2px",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, pl: 0.5 }}>
        {icon && (
          <Box sx={{ color: c, display: "flex", opacity: 0.8, "& svg": { fontSize: 14 } }}>
            {icon}
          </Box>
        )}
        <Typography
          sx={{
            fontSize: "9px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: isDark ? "#94a3b8" : "#64748b",
          }}
        >
          {label}
        </Typography>
      </Box>
      <Typography
        sx={{
          fontSize: "20px",
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          color: c,
          lineHeight: 1,
          pl: 0.5,
        }}
      >
        {value}
      </Typography>
      {sub && (
        <Typography
          sx={{
            fontSize: "9px",
            color: isDark ? "#475569" : "#94a3b8",
            pl: 0.5,
            lineHeight: 1.3,
          }}
        >
          {sub}
        </Typography>
      )}
    </Box>
  );
}

function ModuleCard({
  mod,
  avgContrib,
  criticalCount,
  totalCount,
  isDark,
}: {
  mod: Module;
  avgContrib: number;
  criticalCount: number;
  totalCount: number;
  isDark: boolean;
}) {
  const color = MODULE_COLORS[mod];
  const pct = Math.min(100, Math.round(avgContrib));
  const ModIcon = MODULE_ICONS[mod];
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1,
        borderRadius: 1.5,
        border: `1px solid ${isDark ? "#1e2433" : "#e2e8f0"}`,
        bgcolor: isDark ? alpha(color, 0.04) : alpha(color, 0.03),
      }}
    >
      <Box
        sx={{
          width: 28,
          height: 28,
          borderRadius: 1,
          bgcolor: alpha(color, 0.15),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <ModIcon sx={{ fontSize: 16, color }} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
          <Typography
            sx={{
              fontSize: "10px",
              fontWeight: 600,
              color: isDark ? "#cbd5e1" : "#374151",
              textTransform: "capitalize",
            }}
          >
            {mod}
          </Typography>
          <Typography
            sx={{ fontSize: "11px", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}
          >
            {pct}%
          </Typography>
        </Box>
        <Box
          sx={{
            height: 3,
            borderRadius: 1,
            bgcolor: isDark ? "#1e2433" : "#e2e8f0",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              position: "absolute",
              left: 0,
              top: 0,
              height: "100%",
              width: `${pct}%`,
              bgcolor: color,
              borderRadius: 1,
              transition: "width 0.6s ease",
            }}
          />
        </Box>
        {criticalCount > 0 && (
          <Typography sx={{ fontSize: "9px", color: "#ef4444", mt: 0.5 }}>
            {criticalCount}/{totalCount} critical
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function FleetHealth({ isActive }: { isActive: boolean }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { autoRefresh, toggleAutoRefresh } = useStore();

  const [vehicleSearch, setVehicleSearch] = useState("");
  const [activeModule, setActiveModule] = useState<Module>("engine");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [ageSec, setAgeSec] = useState(0);
  const [showClosedAlerts, setShowClosedAlerts] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (location.hash !== "#alerts-feed") return;
    window.requestAnimationFrame(() => {
      document.getElementById("alerts-feed")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [location.hash]);

  const fleetQuery = useQuery<FleetSummary>({
    queryKey: ["fh-fleet-summary"],
    queryFn: () => axios.get(`${API}/api/automotive/fleet-summary`).then((r) => r.data),
    refetchInterval: liveInterval(8_000, isActive, autoRefresh),
    staleTime: 5_000,
  });

  const alertsQuery = useQuery<AlertsMetrics>({
    queryKey: ["alertsMetrics"],
    queryFn: () => axios.get(`${API}/api/alerts/metrics`).then((r) => r.data),
    refetchInterval: liveInterval(20_000, isActive, autoRefresh),
    staleTime: 8_000,
  });

  const dtcDistQuery = useQuery<DtcDistribution>({
    queryKey: ["dtcFleetDistribution"],
    queryFn: () => axios.get(`${API}/api/automotive/dtc/fleet-distribution`).then((r) => r.data),
    refetchInterval: liveInterval(120_000, isActive, autoRefresh),
    staleTime: 30_000,
  });

  const dtcHistQuery = useQuery<DtcHistory>({
    queryKey: ["dtcAllHistory"],
    queryFn: () => axios.get(`${API}/api/automotive/dtc/history`).then((r) => r.data),
    refetchInterval: liveInterval(120_000, isActive, autoRefresh),
    staleTime: 30_000,
  });

  const modRankingQuery = useQuery<ModuleRankingData>({
    queryKey: ["fh-mod-ranking", activeModule],
    queryFn: () =>
      axios.get(`${API}/api/automotive/module-fleet-ranking/${activeModule}`).then((r) => r.data),
    refetchInterval: liveInterval(30_000, isActive, autoRefresh),
    staleTime: 15_000,
    enabled: isActive,
  });

  const modHealthQuery = useQuery<ModuleFleetHealthData>({
    queryKey: ["fh-mod-health", activeModule],
    queryFn: () =>
      axios.get(`${API}/api/automotive/module-fleet-health/${activeModule}`).then((r) => r.data),
    refetchInterval: liveInterval(30_000, isActive, autoRefresh),
    staleTime: 15_000,
    enabled: isActive,
  });

  const modFeaturesQuery = useQuery<ModuleFeaturesData>({
    queryKey: ["fh-mod-features", activeModule],
    queryFn: () =>
      axios.get(`${API}/api/automotive/module-top-features/${activeModule}`).then((r) => r.data),
    staleTime: 90_000,
    enabled: isActive,
  });

  useRefetchOnActivate(isActive, [
    fleetQuery.refetch,
    alertsQuery.refetch,
  ]);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    if (fleetQuery.data || alertsQuery.data) {
      setLastUpdatedAt(Date.now());
      setAgeSec(0);
    }
  }, [fleetQuery.data, alertsQuery.data]);

  useEffect(() => {
    if (!lastUpdatedAt) return;
    const id = setInterval(
      () => setAgeSec(Math.round((Date.now() - lastUpdatedAt) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [lastUpdatedAt]);

  const fleetData = fleetQuery.data;
  const alertsData = alertsQuery.data;
  const vehicles = fleetData?.vehicles ?? [];
  const stats = fleetData?.fleet_stats;

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch.trim()) return vehicles;
    const q = vehicleSearch.trim().toLowerCase();
    return vehicles.filter((v) => v.vehicle_id.toLowerCase().includes(q));
  }, [vehicles, vehicleSearch]);

  const healthyCt = useMemo(() => vehicles.filter((v) => healthBand(v.health_score) === "healthy").length, [vehicles]);
  const warningCt = useMemo(() => vehicles.filter((v) => healthBand(v.health_score) === "warning").length, [vehicles]);
  const criticalCt = useMemo(() => vehicles.filter((v) => healthBand(v.health_score) === "critical").length, [vehicles]);

  const worstModule = useMemo(() => {
    if (!vehicles.length) return "—";
    const avgs: Record<Module, number> = {} as Record<Module, number>;
    for (const mod of ALL_MODULES) {
      const key = `${mod}_contrib` as keyof Vehicle;
      const sum = vehicles.reduce((acc, v) => acc + ((v[key] as number) ?? 0), 0);
      avgs[mod] = sum / vehicles.length;
    }
    return ALL_MODULES.reduce((a, b) => (avgs[a] < avgs[b] ? a : b));
  }, [vehicles]);

  const moduleRadarData = useMemo(() => {
    if (!vehicles.length) return [];
    return ALL_MODULES.map((mod) => {
      const key = `${mod}_contrib` as keyof Vehicle;
      const sum = vehicles.reduce((acc, v) => acc + ((v[key] as number) ?? 0), 0);
      return { module: mod.charAt(0).toUpperCase() + mod.slice(1), avg: Math.round(sum / vehicles.length) };
    });
  }, [vehicles]);

  const moduleCardData = useMemo(() => {
    if (!vehicles.length) return ALL_MODULES.map((mod) => ({ mod, avgContrib: 0, criticalCount: 0 }));
    return ALL_MODULES.map((mod) => {
      const key = `${mod}_contrib` as keyof Vehicle;
      const sum = vehicles.reduce((acc, v) => acc + ((v[key] as number) ?? 0), 0);
      const avgContrib = sum / vehicles.length;
      const criticalCount = vehicles.filter((v) => (v[key] as number) < 60).length;
      return { mod, avgContrib, criticalCount };
    });
  }, [vehicles]);

  const healthBarData = useMemo(() => {
    return [...vehicles]
      .sort((a, b) => a.health_score - b.health_score)
      .map((v) => ({ id: v.vehicle_id.replace("VIN_", ""), score: Math.round(v.health_score) }));
  }, [vehicles]);

  const dtcDist = dtcDistQuery.data?.distribution ?? [];
  const dtcRuns = dtcHistQuery.data?.runs ?? [];

  const perVehicleDtc = useMemo(() => {
    const map: Record<string, {
      vehicle_id: string; runCount: number; uniqueCodes: Set<string>;
      topCode: string; topSev: string; lastRun: string;
      latestPeakTs: string; topModule: string;
    }> = {};
    for (const run of dtcRuns) {
      const vid = run.source_id;
      if (!map[vid]) {
        map[vid] = { vehicle_id: vid, runCount: 0, uniqueCodes: new Set(), topCode: "—", topSev: "—", lastRun: run.run_ts, latestPeakTs: run.peak_ts, topModule: run.module };
      }
      map[vid].runCount += 1;
      for (const t of run.triggers) map[vid].uniqueCodes.add(t.code);
      if (run.triggers[0]) {
        map[vid].topCode = run.triggers[0].code;
        map[vid].topSev = run.triggers[0].severity;
      }
      if (run.run_ts > map[vid].lastRun) {
        map[vid].lastRun = run.run_ts;
        map[vid].latestPeakTs = run.peak_ts;
        map[vid].topModule = run.module;
      }
    }
    return Object.values(map).map((x) => ({
      vehicle_id: x.vehicle_id,
      runCount: x.runCount,
      uniqueCodes: x.uniqueCodes.size,
      topCode: x.topCode,
      topSev: x.topSev,
      lastRun: x.lastRun ? x.lastRun.slice(0, 16) : "—",
      latestPeakTs: x.latestPeakTs,
      topModule: x.topModule,
    }));
  }, [dtcRuns]);

  const openAlerts = alertsData?.open_alerts ?? [];
  const closedAlerts = alertsData?.closed_alerts ?? [];
  const displayedAlerts = showClosedAlerts ? closedAlerts : openAlerts;

  const alertCoverage = useMemo(() => {
    const deduped = deduplicateAlerts(openAlerts);
    const analyzed = deduped.filter((a: any) => a.analyzed === true).length;
    return { analyzed, total: deduped.length, remaining: deduped.length - analyzed };
  }, [openAlerts]);

  const handleLoadLatest = async () => {
    if (batchRunning) return;
    const deduped = deduplicateAlerts(openAlerts);
    const toAnalyze = deduped
      .filter((a: any) => !a.analyzed)
      .sort((a, b) => (b.max_composite_score ?? 0) - (a.max_composite_score ?? 0));

    const queued = toAnalyze.slice(0, BATCH_CAP);
    const leftAfterCap = toAnalyze.length - queued.length;

    if (queued.length === 0) {
      setBatchResult({ analyzed: 0, failed: 0, leftAfterCap: 0 });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBatchRunning(true);
    setBatchResult(null);

    let analyzed = 0;
    let failed = 0;

    for (let i = 0; i < queued.length; i++) {
      if (controller.signal.aborted) break;
      const alert = queued[i];
      setBatchProgress({
        current: i + 1,
        total: queued.length,
        currentLabel: `${alert.source_id} / ${alert.module.toUpperCase()}`,
        leftAfterCap,
      });
      try {
        await axios.get(`${API}/api/dtc/analyze`, {
          params: { source_id: alert.source_id, module: alert.module, peak_ts: alert.peak_anomaly_ts },
          timeout: 70000,
          signal: controller.signal,
        });
        analyzed++;
      } catch (_err: unknown) {
        if (!controller.signal.aborted) failed++;
      }
      queryClient.invalidateQueries({ queryKey: ["dtcFleetDistribution"] });
      queryClient.invalidateQueries({ queryKey: ["dtcAllHistory"] });
      queryClient.invalidateQueries({ queryKey: ["alertsMetrics"] });
      queryClient.invalidateQueries({ queryKey: ["autoDtcHistory"] });
    }

    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["dtcFleetDistribution"] }),
      queryClient.refetchQueries({ queryKey: ["dtcAllHistory"] }),
      queryClient.refetchQueries({ queryKey: ["alertsMetrics"] }),
    ]);

    setBatchRunning(false);
    setBatchProgress(null);
    setBatchResult({ analyzed, failed, leftAfterCap });
  };

  const rankingCols: ColDef<ModuleRanking>[] = [
    {
      field: "vehicle_id",
      headerName: "VEHICLE",
      width: 100,
      cellRenderer: (p: { value: string }) => (
        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 600 }}>{p.value}</span>
      ),
    },
    {
      field: "avg_health",
      headerName: "AVG HEALTH",
      width: 110,
      cellRenderer: (p: { value: number }) => (
        <span style={{ color: healthColor(p.value), fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {p.value?.toFixed(1)}
        </span>
      ),
    },
    {
      field: "min_health",
      headerName: "MIN HEALTH",
      width: 110,
      cellRenderer: (p: { value: number }) => (
        <span style={{ color: healthColor(p.value), fontVariantNumeric: "tabular-nums" }}>
          {p.value?.toFixed(1)}
        </span>
      ),
    },
    {
      field: "trend_slope",
      headerName: "TREND",
      width: 80,
      cellRenderer: (p: { value: number }) => {
        const v = p.value ?? 0;
        const color = v > 0.01 ? "#22c55e" : v < -0.01 ? "#ef4444" : "#94a3b8";
        const Icon = v > 0.01 ? TrendingUpRoundedIcon : v < -0.01 ? TrendingDownRoundedIcon : TrendingFlatRoundedIcon;
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, color }}>
            <Icon sx={{ fontSize: 12 }} />
            <span style={{ fontSize: 10, fontVariantNumeric: "tabular-nums" }}>{Math.abs(v).toFixed(3)}</span>
          </Box>
        );
      },
    },
    { field: "alert_count", headerName: "ALERTS", width: 70, type: "numericColumn" },
    { field: "total_pts", headerName: "PTS", width: 60, type: "numericColumn" },
  ];

  const vehicleGridCols: ColDef<Vehicle>[] = [
    {
      field: "vehicle_id",
      headerName: "VEHICLE ID",
      width: 110,
      pinned: "left",
      cellRenderer: (p: { value: string }) => (
        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700 }}>{p.value}</span>
      ),
    },
    {
      field: "health_score",
      headerName: "HEALTH",
      width: 90,
      sort: "asc",
      cellRenderer: (p: { value: number }) => {
        const c = healthColor(p.value ?? 0);
        return (
          <span style={{ color: c, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {(p.value ?? 0).toFixed(1)}
          </span>
        );
      },
    },
    ...ALL_MODULES.map((mod) => ({
      field: `${mod}_contrib` as keyof Vehicle,
      headerName: mod.toUpperCase(),
      width: 105,
      type: "numericColumn",
      cellRenderer: (p: { value: number }) => (
        <span style={{ color: MODULE_COLORS[mod], fontVariantNumeric: "tabular-nums", fontSize: 10 }}>
          {(p.value ?? 0).toFixed(1)}
        </span>
      ),
    })) as ColDef<Vehicle>[],
    {
      field: "data_source",
      headerName: "SRC",
      width: 60,
      cellRenderer: (p: { value: string }) => (
        <Chip
          label={p.value ?? "live"}
          size="small"
          sx={{
            height: 16,
            fontSize: "8px",
            fontWeight: 700,
            bgcolor: alpha("#22c55e", 0.15),
            color: "#22c55e",
            "& .MuiChip-label": { px: 0.75 },
          }}
        />
      ),
    },
    {
      headerName: "DEEP DIVE",
      width: 100,
      sortable: false,
      cellRenderer: (p: { data: Vehicle }) => (
        <Chip
          label="Deep Dive →"
          size="small"
          clickable
          onClick={() => navigate(`/automotive?vehicle=${encodeURIComponent(p.data?.vehicle_id ?? "")}`)}
          sx={{
            height: 16,
            fontSize: "8px",
            fontWeight: 700,
            bgcolor: alpha("#3b82f6", 0.12),
            color: "#3b82f6",
            "& .MuiChip-label": { px: 0.5 },
            "&:hover": { bgcolor: alpha("#3b82f6", 0.22) },
          }}
        />
      ),
    },
  ];

  type DtcVehicleRow = { vehicle_id: string; runCount: number; uniqueCodes: number; topCode: string; topSev: string; lastRun: string; latestPeakTs: string; topModule: string };

  const dtcVehicleCols: ColDef<DtcVehicleRow>[] = [
    {
      field: "vehicle_id",
      headerName: "VEHICLE",
      width: 100,
      cellRenderer: (p: { value: string }) => (
        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 600 }}>{p.value}</span>
      ),
    },
    { field: "runCount", headerName: "RUNS", width: 55, type: "numericColumn" },
    { field: "uniqueCodes", headerName: "CODES", width: 65, type: "numericColumn" },
    {
      field: "topCode",
      headerName: "TOP DTC",
      width: 85,
      cellRenderer: (p: { value: string }) => (
        <span style={{ fontFamily: "monospace", fontSize: 10 }}>{p.value}</span>
      ),
    },
    {
      field: "topSev",
      headerName: "SEV",
      width: 75,
      cellRenderer: (p: { value: string }) => {
        const c = SEV_COLORS[p.value] ?? "#94a3b8";
        return (
          <Chip
            label={p.value || "—"}
            size="small"
            sx={{
              height: 16,
              fontSize: "8px",
              fontWeight: 700,
              bgcolor: alpha(c, 0.15),
              color: c,
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
        );
      },
    },
    { field: "lastRun", headerName: "LAST RUN", width: 110 },
    {
      headerName: "INVESTIGATE",
      width: 100,
      sortable: false,
      cellRenderer: (p: { data: DtcVehicleRow }) => {
        const { vehicle_id, topModule, latestPeakTs } = p.data ?? {};
        if (!latestPeakTs) return null;
        return (
          <Chip
            label="Investigate →"
            size="small"
            clickable
            onClick={() =>
              navigate(
                `/dtc?vehicle=${encodeURIComponent(vehicle_id)}&module=${encodeURIComponent(topModule)}&peak_ts=${encodeURIComponent(latestPeakTs)}`
              )
            }
            sx={{
              height: 16,
              fontSize: "8px",
              fontWeight: 700,
              bgcolor: alpha(accentAmber, 0.12),
              color: accentAmber,
              "& .MuiChip-label": { px: 0.5 },
              "&:hover": { bgcolor: alpha(accentAmber, 0.22) },
            }}
          />
        );
      },
    },
  ];

  const alertGridCols: ColDef<AlertEntry>[] = [
    {
      field: "source_id",
      headerName: "VEHICLE",
      width: 100,
      cellRenderer: (p: { value: string }) => (
        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 600 }}>{p.value}</span>
      ),
    },
    {
      field: "module",
      headerName: "MODULE",
      width: 110,
      cellRenderer: (p: { value: string }) => {
        const mod = (p.value ?? "").toLowerCase() as Module;
        const c = MODULE_COLORS[mod] ?? "#94a3b8";
        return (
          <Chip
            label={(p.value ?? "").toUpperCase()}
            size="small"
            sx={{
              height: 16,
              fontSize: "8px",
              fontWeight: 700,
              bgcolor: alpha(c, 0.15),
              color: c,
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
        );
      },
    },
    {
      field: "max_composite_score",
      headerName: "SCORE",
      width: 85,
      type: "numericColumn",
      cellRenderer: (p: { value: number }) => {
        const v = p.value ?? 0;
        const c = v >= 0.8 ? "#ef4444" : v >= 0.5 ? "#f59e0b" : "#22c55e";
        return (
          <span style={{ color: c, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
            {v.toFixed(3)}
          </span>
        );
      },
    },
    {
      field: "peak_anomaly_ts",
      headerName: "PEAK TS",
      width: 150,
      cellRenderer: (p: { value: string }) => (
        <span style={{ fontSize: 10, fontFamily: "monospace" }}>
          {p.value ? p.value.slice(0, 19).replace("T", " ") : "—"}
        </span>
      ),
    },
    {
      headerName: "ACTION",
      width: 110,
      sortable: false,
      cellRenderer: (p: { data: AlertEntry }) => {
        const { source_id, module, peak_anomaly_ts } = p.data ?? {};
        return (
          <Chip
            label="Root Cause"
            size="small"
            icon={<OpenInNewRoundedIcon style={{ fontSize: 10 }} />}
            clickable
            onClick={() =>
              navigate(
                `/dtc?vehicle=${encodeURIComponent(source_id)}&module=${encodeURIComponent(module)}&peak_ts=${encodeURIComponent(peak_anomaly_ts)}`
              )
            }
            sx={{
              height: 16,
              fontSize: "8px",
              fontWeight: 700,
              bgcolor: alpha("#38bdf8", 0.12),
              color: "#38bdf8",
              "& .MuiChip-label": { px: 0.5 },
              "&:hover": { bgcolor: alpha("#38bdf8", 0.22) },
            }}
          />
        );
      },
    },
  ];

  const modHealthSeries = useMemo(() => {
    const raw = modHealthQuery.data?.series ?? [];
    const step = Math.max(1, Math.floor(raw.length / 60));
    return raw.filter((_, i) => i % step === 0).map((row) => ({
      ts: typeof row.ts === "string" ? row.ts.slice(11, 23) : "",
      fleet_avg: row.fleet_avg ?? null,
    }));
  }, [modHealthQuery.data]);

  const topFeatures = useMemo(() => {
    return [...(modFeaturesQuery.data?.features ?? [])]
      .sort((a, b) => (b.avg_score ?? 0) - (a.avg_score ?? 0))
      .slice(0, 10)
      .map((f) => ({
        feature: f.feature.replace(/_/g, " ").slice(0, 22),
        score: Math.round(f.avg_score * 100) / 100,
      }));
  }, [modFeaturesQuery.data]);

  const accentGreen = "#22c55e";
  const accentAmber = "#f59e0b";
  const accentRed = "#ef4444";

  const chartTextColor = isDark ? "#94a3b8" : "#64748b";
  const chartGridColor = isDark ? "#1e2433" : "#f1f5f9";

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: isDark ? "#080c12" : "#f4f6fa",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 200,
          bgcolor: isDark ? alpha("#080c12", 0.95) : alpha("#f4f6fa", 0.95),
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${isDark ? "#1e2433" : "#e2e8f0"}`,
          px: 2.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          flexWrap: "wrap",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: accentGreen,
              animation: "fh-pulse 2.4s ease-in-out infinite",
              "@keyframes fh-pulse": {
                "0%, 100%": { opacity: 1, transform: "scale(1)" },
                "50%": { opacity: 0.5, transform: "scale(1.3)" },
              },
            }}
          />
          <Typography
            sx={{
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: isDark ? "#e2e8f0" : "#0f172a",
            }}
          >
            Fleet Health
          </Typography>
        </Box>

        <Divider orientation="vertical" flexItem sx={{ borderColor: isDark ? "#1e2433" : "#e2e8f0", mx: 0.5 }} />

        {lastUpdatedAt !== null && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: ageSec > 20 ? "#ef4444" : accentGreen,
                animation: ageSec <= 20 ? "fh-pulse 2.4s ease-in-out infinite" : "none",
              }}
            />
            <Typography
              sx={{
                fontSize: "9px",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: ageSec > 20 ? (isDark ? "#f87171" : "#dc2626") : (isDark ? "#4ade80" : "#16a34a"),
              }}
            >
              {ageSec === 0 ? "just now" : `${ageSec}s ago`}
            </Typography>
          </Box>
        )}

        <Box sx={{ flex: 1 }} />

        {stats && (
          <>
            <Chip
              label={`${stats.total_vehicles} vehicles`}
              size="small"
              sx={{ height: 20, fontSize: "9px", fontWeight: 700, bgcolor: alpha(accentGreen, 0.12), color: accentGreen, "& .MuiChip-label": { px: 1 } }}
            />
            <Chip
              label={`AVG ${stats.avg_health?.toFixed(1)}`}
              size="small"
              sx={{ height: 20, fontSize: "9px", fontWeight: 700, bgcolor: alpha(healthColor(stats.avg_health), 0.12), color: healthColor(stats.avg_health), "& .MuiChip-label": { px: 1 } }}
            />
            {stats.critical_count > 0 && (
              <Chip
                label={`${stats.critical_count} critical`}
                size="small"
                sx={{ height: 20, fontSize: "9px", fontWeight: 700, bgcolor: alpha(accentRed, 0.12), color: accentRed, "& .MuiChip-label": { px: 1 } }}
              />
            )}
          </>
        )}
        {alertsData && (
          <Chip
            label={`${alertsData.active_alerts_count} alerts`}
            size="small"
            sx={{ height: 20, fontSize: "9px", fontWeight: 700, bgcolor: alpha("#f59e0b", 0.12), color: "#f59e0b", "& .MuiChip-label": { px: 1 } }}
          />
        )}

        <Divider orientation="vertical" flexItem sx={{ borderColor: isDark ? "#1e2433" : "#e2e8f0", mx: 0.5 }} />

        <Tooltip title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}>
          <IconButton
            size="small"
            onClick={toggleAutoRefresh}
            sx={{ color: autoRefresh ? accentGreen : (isDark ? "#475569" : "#94a3b8") }}
          >
            {autoRefresh ? <SyncIcon sx={{ fontSize: 16 }} /> : <SyncDisabledIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2.5 }}>

        {/* Section 1: Vital Signs */}
        <Paper id="alerts-feed" elevation={0} sx={{ ...iSx(isDark), p: 2 }}>
          <SectionHeader
            title="Fleet Vital Signs"
            accent={accentGreen}
            right={
              <Typography sx={{ fontSize: "9px", color: isDark ? "#475569" : "#94a3b8", fontVariantNumeric: "tabular-nums" }}>
                {stats ? `${stats.total_vehicles} vehicles tracked` : "loading…"}
              </Typography>
            }
          />
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 1.5 }}>
            <KpiTile
              label="Total Vehicles"
              value={stats?.total_vehicles ?? "—"}
              isDark={isDark}
              color={accentGreen}
              icon={<DirectionsCarFilledRoundedIcon />}
            />
            <KpiTile
              label="Healthy"
              value={healthyCt}
              sub="> 80 score"
              isDark={isDark}
              color="#22c55e"
              icon={<LocalHospitalRoundedIcon />}
            />
            <KpiTile
              label="Warning"
              value={warningCt}
              sub="60–80 score"
              isDark={isDark}
              color={accentAmber}
              icon={<WarningAmberRoundedIcon />}
            />
            <KpiTile
              label="Critical"
              value={criticalCt}
              sub="< 60 score"
              isDark={isDark}
              color={accentRed}
              icon={<ErrorRoundedIcon />}
            />
            <KpiTile
              label="Fleet Avg Health"
              value={stats ? `${stats.avg_health?.toFixed(1)}` : "—"}
              isDark={isDark}
              color={stats ? healthColor(stats.avg_health) : accentGreen}
            />
            <KpiTile
              label="Weakest Module"
              value={worstModule}
              isDark={isDark}
              color={MODULE_COLORS[worstModule as Module] ?? accentAmber}
              icon={<BuildRoundedIcon />}
            />
            <KpiTile
              label="Active Alerts"
              value={alertsData?.active_alerts_count ?? "—"}
              isDark={isDark}
              color={accentRed}
              icon={<NotificationsActiveRoundedIcon />}
            />
            <KpiTile
              label="DTC Codes"
              value={dtcDist.length}
              sub="unique codes fleet-wide"
              isDark={isDark}
              color={accentAmber}
            />
          </Box>
        </Paper>

        {/* Section 2: Vehicle Grid + Module Matrix */}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 2 }}>
          <Paper elevation={0} sx={{ ...iSx(isDark), p: 2 }}>
            <SectionHeader
              title="Vehicle Fleet Grid"
              accent={accentGreen}
              right={
                <TextField
                  size="small"
                  placeholder="Search vehicle…"
                  value={vehicleSearch}
                  onChange={(e) => setVehicleSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchRoundedIcon sx={{ fontSize: 14, color: isDark ? "#475569" : "#94a3b8" }} />
                      </InputAdornment>
                    ),
                    sx: {
                      fontSize: "11px",
                      height: 28,
                      bgcolor: isDark ? "#131722" : "#f8fafc",
                      "& input": { py: 0 },
                      "& fieldset": { borderColor: isDark ? "#1e2433" : "#e2e8f0" },
                    },
                  }}
                  sx={{ width: 180 }}
                />
              }
            />
            <Box
              className={isDark ? "ag-theme-balham-dark" : "ag-theme-balham"}
              sx={{ height: 340, width: "100%", ...agGridSx(isDark) }}
            >
              <AgGridReact
                rowData={filteredVehicles}
                columnDefs={vehicleGridCols}
                defaultColDef={{ resizable: true, sortable: true }}
                suppressMovableColumns
                rowHeight={28}
                headerHeight={32}
              />
            </Box>
          </Paper>

          <Paper elevation={0} sx={{ ...iSx(isDark), p: 2 }}>
            <SectionHeader title="Module Health Matrix" accent={accentGreen} />
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {moduleCardData.map(({ mod, avgContrib, criticalCount }) => (
                <ModuleCard
                  key={mod}
                  mod={mod}
                  avgContrib={avgContrib}
                  criticalCount={criticalCount}
                  totalCount={vehicles.length}
                  isDark={isDark}
                />
              ))}
            </Box>
            <Box
              sx={{
                mt: 1.5,
                p: 1,
                borderRadius: 1,
                bgcolor: isDark ? "#080c12" : "#f8fafc",
                border: `1px solid ${isDark ? "#1e2433" : "#e2e8f0"}`,
              }}
            >
              <Typography sx={{ fontSize: "9px", color: isDark ? "#94a3b8" : "#64748b", textAlign: "center" }}>
                Bars show avg weighted contribution across fleet
              </Typography>
            </Box>
          </Paper>
        </Box>

        {/* Section 3: Health Distribution + Module Radar */}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <Paper elevation={0} sx={{ ...iSx(isDark), p: 2 }}>
            <SectionHeader title="Fleet Health Distribution" accent="#38bdf8" />
            <Box sx={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={healthBarData} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                  <XAxis
                    dataKey="id"
                    tick={{ fontSize: 8, fill: chartTextColor }}
                    angle={-45}
                    textAnchor="end"
                    interval={0}
                    height={40}
                  />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: chartTextColor }} width={30} />
                  <RcTooltip
                    cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
                    contentStyle={{
                      background: isDark ? "#131722" : "#fff",
                      border: `1px solid ${isDark ? "#2d3748" : "#e2e8f0"}`,
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                    itemStyle={{ color: isDark ? "#cbd5e1" : "#374151" }}
                    labelStyle={{ color: isDark ? "#94a3b8" : "#64748b", fontWeight: 600 }}
                  />
                  <Bar dataKey="score" radius={[2, 2, 0, 0]} name="Health Score">
                    {healthBarData.map((entry, i) => (
                      <Cell key={i} fill={healthColor(entry.score)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>

          <Paper elevation={0} sx={{ ...iSx(isDark), p: 2 }}>
            <SectionHeader title="Module Coverage Radar" accent="#38bdf8" />
            <Box sx={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={moduleRadarData}>
                  <PolarGrid stroke={chartGridColor} />
                  <PolarAngleAxis
                    dataKey="module"
                    tick={{ fontSize: 10, fill: chartTextColor }}
                  />
                  <Radar
                    name="Fleet Avg"
                    dataKey="avg"
                    stroke={accentGreen}
                    fill={accentGreen}
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                  <RcTooltip
                    cursor={false}
                    contentStyle={{
                      background: isDark ? "#131722" : "#fff",
                      border: `1px solid ${isDark ? "#2d3748" : "#e2e8f0"}`,
                      borderRadius: 6,
                      fontSize: 11,
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Box>

        {/* Section 4: Module Intelligence */}
        <Paper elevation={0} sx={{ ...iSx(isDark), p: 2 }}>
          <SectionHeader
            title="Module Intelligence"
            accent={MODULE_COLORS[activeModule]}
            right={
              <Box sx={{ display: "flex", gap: 0.75 }}>
                {ALL_MODULES.map((mod) => (
                  <Chip
                    key={mod}
                    label={mod.charAt(0).toUpperCase() + mod.slice(1)}
                    size="small"
                    clickable
                    onClick={() => setActiveModule(mod)}
                    sx={{
                      height: 20,
                      fontSize: "9px",
                      fontWeight: 700,
                      cursor: "pointer",
                      bgcolor: activeModule === mod ? alpha(MODULE_COLORS[mod], 0.2) : "transparent",
                      color: activeModule === mod ? MODULE_COLORS[mod] : (isDark ? "#475569" : "#94a3b8"),
                      border: `1px solid ${activeModule === mod ? MODULE_COLORS[mod] : (isDark ? "#1e2433" : "#e2e8f0")}`,
                      "& .MuiChip-label": { px: 0.75 },
                      "&:hover": { bgcolor: alpha(MODULE_COLORS[mod], 0.12) },
                    }}
                  />
                ))}
              </Box>
            }
          />

          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Trend — full width */}
            <Box>
              <Typography sx={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: isDark ? "#94a3b8" : "#64748b", mb: 1 }}>
                Fleet Health Trend
              </Typography>
              <Box sx={{ height: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={modHealthSeries} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                    <XAxis
                      dataKey="ts"
                      tick={{ fontSize: 8, fill: chartTextColor }}
                      interval={Math.max(0, Math.floor(modHealthSeries.length / 8) - 1)}
                      height={22}
                    />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: chartTextColor }} width={28} />
                    <RcTooltip
                      cursor={{ stroke: isDark ? "#475569" : "#cbd5e1", strokeWidth: 1, strokeDasharray: "4 2" }}
                      contentStyle={{
                        background: isDark ? "#131722" : "#fff",
                        border: `1px solid ${isDark ? "#2d3748" : "#e2e8f0"}`,
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="fleet_avg"
                      stroke={MODULE_COLORS[activeModule]}
                      strokeWidth={2}
                      dot={false}
                      name="Fleet Avg"
                    />
                    <Brush
                      dataKey="ts"
                      height={18}
                      travellerWidth={6}
                      stroke={isDark ? "#64748b" : "#94a3b8"}
                      fill={isDark ? "#1e2433" : "#f1f5f9"}
                      tickFormatter={(v) => v}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>

            {/* Ranking + Features — side by side, locked to same height */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 2, alignItems: "start" }}>
              <Box>
                <Typography sx={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: isDark ? "#94a3b8" : "#64748b", mb: 1 }}>
                  Fleet Ranking — {activeModule}
                </Typography>
                <Box
                  className={isDark ? "ag-theme-balham-dark" : "ag-theme-balham"}
                  sx={{ height: (modRankingQuery.data?.rankings?.length ?? 0) * 28 + 32, width: "100%", ...agGridSx(isDark) }}
                >
                  <AgGridReact
                    rowData={modRankingQuery.data?.rankings ?? []}
                    columnDefs={rankingCols}
                    defaultColDef={{ resizable: true, sortable: true }}
                    suppressMovableColumns
                    rowHeight={28}
                    headerHeight={32}
                  />
                </Box>
              </Box>

              <Box>
                <Typography sx={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: isDark ? "#94a3b8" : "#64748b", mb: 1 }}>
                  Top Anomaly Features
                </Typography>
                <Box sx={{ height: (modRankingQuery.data?.rankings?.length ?? 0) * 28 + 32 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={topFeatures}
                      margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 8, fill: chartTextColor }} />
                      <YAxis
                        type="category"
                        dataKey="feature"
                        width={108}
                        tick={{ fontSize: 8, fill: chartTextColor }}
                      />
                      <RcTooltip
                        cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
                        contentStyle={{
                          background: isDark ? "#131722" : "#fff",
                          border: `1px solid ${isDark ? "#2d3748" : "#e2e8f0"}`,
                          borderRadius: 6,
                          fontSize: 11,
                        }}
                      />
                      <Bar dataKey="score" fill={MODULE_COLORS[activeModule]} radius={[0, 2, 2, 0]} name="Avg Importance" />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* Section 5: DTC Intelligence */}
        <Paper elevation={0} sx={{ ...iSx(isDark), p: 2 }}>
          <SectionHeader
            title="DTC Intelligence"
            accent={accentAmber}
            right={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Button
                  size="small"
                  disabled={batchRunning || alertCoverage.remaining === 0}
                  onClick={handleLoadLatest}
                  startIcon={batchRunning
                    ? <CircularProgress size={10} color="inherit" />
                    : alertCoverage.remaining === 0 && alertCoverage.total > 0
                    ? <CheckCircleRoundedIcon sx={{ fontSize: 12 }} />
                    : <PlayArrowRoundedIcon sx={{ fontSize: 12 }} />}
                  sx={{
                    height: 22,
                    fontSize: "9px",
                    fontWeight: 700,
                    py: 0,
                    px: 1,
                    minWidth: 0,
                    bgcolor: alertCoverage.remaining === 0 && alertCoverage.total > 0
                      ? alpha("#22c55e", 0.12)
                      : alpha(accentAmber, 0.15),
                    color: alertCoverage.remaining === 0 && alertCoverage.total > 0
                      ? "#22c55e"
                      : accentAmber,
                    border: `1px solid ${alertCoverage.remaining === 0 && alertCoverage.total > 0
                      ? alpha("#22c55e", 0.35)
                      : alpha(accentAmber, 0.4)}`,
                    "&:hover": { bgcolor: alpha(accentAmber, 0.25), borderColor: accentAmber },
                    "&.Mui-disabled": {
                      bgcolor: alertCoverage.remaining === 0 && alertCoverage.total > 0
                        ? alpha("#22c55e", 0.1)
                        : alpha(accentAmber, 0.1),
                      color: alertCoverage.remaining === 0 && alertCoverage.total > 0
                        ? alpha("#22c55e", 0.7)
                        : alpha(accentAmber, 0.6),
                      borderColor: alertCoverage.remaining === 0 && alertCoverage.total > 0
                        ? alpha("#22c55e", 0.25)
                        : alpha(accentAmber, 0.25),
                    },
                  }}
                >
                  {batchRunning
                    ? `${batchProgress?.current ?? 0} / ${batchProgress?.total ?? 0}`
                    : alertsQuery.isLoading
                    ? "Loading…"
                    : alertCoverage.remaining > 0
                    ? `Analyze ${Math.min(alertCoverage.remaining, BATCH_CAP)} Alerts`
                    : alertCoverage.total > 0
                    ? `${alertCoverage.analyzed} / ${alertCoverage.total} Analyzed`
                    : "No Open Alerts"}
                </Button>
              </Box>
            }
          />
          {batchRunning && batchProgress && (
            <Box sx={{ mb: 1.5 }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                <Typography sx={{ fontSize: "9px", color: isDark ? "#94a3b8" : "#64748b" }}>
                  {batchProgress.currentLabel}
                </Typography>
                <Typography sx={{ fontSize: "9px", fontVariantNumeric: "tabular-nums", color: accentAmber }}>
                  {batchProgress.current} / {batchProgress.total}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={(batchProgress.current / batchProgress.total) * 100}
                sx={{
                  height: 3,
                  borderRadius: 1,
                  bgcolor: isDark ? "#1e2433" : "#e2e8f0",
                  "& .MuiLinearProgress-bar": { bgcolor: accentAmber, borderRadius: 1 },
                }}
              />
            </Box>
          )}
          {!batchRunning && batchResult && (
            <Box sx={{ mb: 1.5, display: "flex", gap: 1 }}>
              <Chip
                label={`${batchResult.analyzed} analyzed`}
                size="small"
                sx={{ height: 18, fontSize: "9px", bgcolor: alpha("#22c55e", 0.12), color: "#22c55e", "& .MuiChip-label": { px: 0.75 } }}
              />
              {batchResult.failed > 0 && (
                <Chip
                  label={`${batchResult.failed} failed`}
                  size="small"
                  sx={{ height: 18, fontSize: "9px", bgcolor: alpha(accentRed, 0.12), color: accentRed, "& .MuiChip-label": { px: 0.75 } }}
                />
              )}
              {batchResult.leftAfterCap > 0 && (
                <Chip
                  label={`${batchResult.leftAfterCap} more remaining`}
                  size="small"
                  sx={{ height: 18, fontSize: "9px", bgcolor: alpha(accentAmber, 0.12), color: accentAmber, "& .MuiChip-label": { px: 0.75 } }}
                />
              )}
            </Box>
          )}
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: isDark ? "#94a3b8" : "#64748b", mb: 1 }}>
                Top DTC Codes Fleet-Wide
              </Typography>
              <Box sx={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={dtcDist.slice(0, 10).map((d) => ({ code: d.code, count: d.count, vehicles: d.vehicle_count, sev: d.severity }))}
                    margin={{ top: 0, right: 30, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9, fill: chartTextColor }} />
                    <YAxis
                      type="category"
                      dataKey="code"
                      width={70}
                      tick={{ fontSize: 9, fill: chartTextColor, fontFamily: "monospace" }}
                    />
                    <RcTooltip
                      cursor={{ fill: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
                      contentStyle={{
                        background: isDark ? "#131722" : "#fff",
                        border: `1px solid ${isDark ? "#2d3748" : "#e2e8f0"}`,
                        borderRadius: 6,
                        fontSize: 11,
                      }}
                      formatter={(value: number, name: string) => [value, name]}
                    />
                    <Bar dataKey="count" radius={[0, 2, 2, 0]} name="Occurrences">
                      {dtcDist.slice(0, 10).map((d, i) => (
                        <Cell key={i} fill={SEV_COLORS[d.severity] ?? accentAmber} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Box>

            <Box>
              <Typography sx={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: isDark ? "#94a3b8" : "#64748b", mb: 1 }}>
                Per-Vehicle DTC Summary
              </Typography>
              <Box
                className={isDark ? "ag-theme-balham-dark" : "ag-theme-balham"}
                sx={{ height: 240, width: "100%", ...agGridSx(isDark) }}
              >
                <AgGridReact
                  rowData={perVehicleDtc}
                  columnDefs={dtcVehicleCols}
                  defaultColDef={{ resizable: true, sortable: true }}
                  suppressMovableColumns
                  rowHeight={28}
                  headerHeight={32}
                />
              </Box>
            </Box>
          </Box>
        </Paper>

        {/* Section 6: Live Alerts Feed */}
        <Paper elevation={0} sx={{ ...iSx(isDark), p: 2 }}>
          <SectionHeader
            title="Alerts Feed"
            accent={accentRed}
            right={
              <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                <Chip
                  label={`${openAlerts.length} open`}
                  size="small"
                  clickable
                  onClick={() => setShowClosedAlerts(false)}
                  sx={{
                    height: 18, fontSize: "9px", fontWeight: 700,
                    bgcolor: !showClosedAlerts ? alpha(accentRed, 0.2) : alpha(accentRed, 0.08),
                    color: accentRed,
                    border: `1px solid ${!showClosedAlerts ? accentRed : "transparent"}`,
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
                <Chip
                  label={`${closedAlerts.length} resolved`}
                  size="small"
                  clickable
                  onClick={() => setShowClosedAlerts(true)}
                  sx={{
                    height: 18, fontSize: "9px", fontWeight: 700,
                    bgcolor: showClosedAlerts ? alpha("#22c55e", 0.2) : alpha("#22c55e", 0.08),
                    color: "#22c55e",
                    border: `1px solid ${showClosedAlerts ? "#22c55e" : "transparent"}`,
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
                {alertsData?.critical_vehicles != null && alertsData.critical_vehicles > 0 && (
                  <Chip
                    label={`${alertsData.critical_vehicles} critical veh`}
                    size="small"
                    sx={{ height: 18, fontSize: "9px", fontWeight: 700, bgcolor: alpha(accentRed, 0.12), color: accentRed, "& .MuiChip-label": { px: 0.75 } }}
                  />
                )}
                {alertsData?.processing_lag != null && alertsData.processing_lag > 0 && (
                  <Chip
                    label={`lag ${alertsData.processing_lag}`}
                    size="small"
                    sx={{ height: 18, fontSize: "9px", fontWeight: 700, bgcolor: alpha(accentAmber, 0.12), color: accentAmber, "& .MuiChip-label": { px: 0.75 } }}
                  />
                )}
              </Box>
            }
          />
          <Box
            className={isDark ? "ag-theme-balham-dark" : "ag-theme-balham"}
            sx={{ height: 280, width: "100%", ...agGridSx(isDark) }}
          >
            <AgGridReact
              rowData={displayedAlerts}
              columnDefs={alertGridCols}
              defaultColDef={{ resizable: true, sortable: true }}
              suppressMovableColumns
              rowHeight={28}
              headerHeight={32}
            />
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
