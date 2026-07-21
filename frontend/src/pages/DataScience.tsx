import React, { useMemo, useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  IconButton,
  Divider,
  Dialog,
  Chip,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  Checkbox,
  TextField,
  Alert,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import SyncIcon from "@mui/icons-material/Sync";
import SyncDisabledIcon from "@mui/icons-material/SyncDisabled";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
import MonitorHeartRoundedIcon from "@mui/icons-material/MonitorHeartRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import BarChartRoundedIcon from "@mui/icons-material/BarChartRounded";
import DirectionsCarRoundedIcon from "@mui/icons-material/DirectionsCarRounded";
import ScienceRoundedIcon from "@mui/icons-material/ScienceRounded";
import HealthAndSafetyRoundedIcon from "@mui/icons-material/HealthAndSafetyRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, ClientSideRowModelModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RcTooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useStore } from "../store";
import { liveInterval, useRefetchOnActivate } from "../hooks/useApi";
import { useSystemConfig } from "../hooks/useSystemConfig";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const API_BASE = "http://127.0.0.1:8005";

const MODULE_COLORS: Record<string, string> = {
  engine:       "#f59e0b",
  transmission: "#38bdf8",
  battery:      "#22c55e",
  body:         "#a855f7",
  tyre:         "#ef4444",
};

const ALL_MODULES = Object.keys(MODULE_COLORS);

const fetchWriterMetrics = () =>
  axios.get(`${API_BASE}/api/writer/metrics`).then((r) => r.data);
const fetchInferenceMetrics = () =>
  axios.get(`${API_BASE}/api/inference/metrics`).then((r) => r.data);
const fetchGoldMetrics = () =>
  axios.get(`${API_BASE}/api/gold/metrics`).then((r) => r.data);
const fetchObserverSnapshot = () =>
  axios.get(`${API_BASE}/api/observer/snapshot`).then((r) => r.data);
const fetchBronzeInspector = (module: string) =>
  axios.get(`${API_BASE}/api/writer/inspector/${module}`).then((r) => r.data.data);
const fetchSilverTail = (module: string) =>
  axios.get(`${API_BASE}/api/inference/tail/${module}`).then((r) => r.data.data);
const fetchGoldHistory = (simId: string) =>
  axios.get(`${API_BASE}/api/gold/history/${simId}`).then((r) => r.data.data);
const fetchGoldConfig = () =>
  axios.get(`${API_BASE}/api/gold/config`).then((r) => r.data);

const BUILTIN_PRESETS: Record<string, Record<string, number>> = {
  "Safety-First":     { engine: 0.4, transmission: 0.2, battery: 0.25, body: 0.05, tyre: 0.1 },
  "Drivetrain-Heavy": { engine: 0.45, transmission: 0.35, battery: 0.1, body: 0.05, tyre: 0.05 },
  "Equal-Weight":     { engine: 0.2, transmission: 0.2, battery: 0.2, body: 0.2, tyre: 0.2 },
};

const fetchAllModuleLatest = () =>
  Promise.all(
    ALL_MODULES.map((mod) =>
      axios
        .get(`${API_BASE}/api/writer/inspector/${mod}`)
        .then((r) => {
          const rows: any[] = r.data.data ?? [];
          return { mod, record: rows.slice(-1)[0] ?? null };
        })
        .catch(() => ({ mod, record: null }))
    )
  );

type HealthState = "ok" | "warn" | "crit" | "idle";

function pillColors(h: HealthState, isDark: boolean) {
  const map = {
    ok:   { dot: "#22c55e", text: isDark ? "#4ade80" : "#16a34a" },
    warn: { dot: "#eab308", text: isDark ? "#fbbf24" : "#d97706" },
    crit: { dot: "#ef4444", text: isDark ? "#f87171" : "#dc2626" },
    idle: { dot: "#64748b", text: "#64748b" },
  };
  return map[h];
}

function healthDotColor(h: HealthState): string {
  if (h === "ok") return "#22c55e";
  if (h === "warn") return "#eab308";
  if (h === "crit") return "#ef4444";
  return "#64748b";
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(Math.round(n));
}

function agGridSx(isDark: boolean) {
  return {
    "--ag-background-color": "transparent",
    "--ag-odd-row-background-color": isDark ? alpha("#7dd3fc", 0.04) : "#f8fafc",
    "--ag-row-hover-color": isDark ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05),
    "--ag-foreground-color": isDark ? "#e2e8f0" : "#0f172a",
    "--ag-data-color": isDark ? "#e2e8f0" : "#1f2937",
    "--ag-secondary-foreground-color": isDark ? "#94a3b8" : "#64748b",
    "--ag-border-color": isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1),
    "--ag-row-border-color": isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.07),
    "& .ag-header": { backgroundColor: `${isDark ? "#0d1117" : "#005071"} !important` },
    "& .ag-header-cell": {
      backgroundColor: `${isDark ? "#0d1117" : "#005071"} !important`,
      color: "#fff !important",
      fontSize: "10px !important",
      fontWeight: "700 !important",
    },
    "& .ag-header-cell-label": { color: "#fff !important" },
    "& .ag-icon": { color: "#fff !important" },
    "& .ag-header-icon": { color: "#fff !important" },
    "& .ag-cell": { fontSize: "10px !important" },
    "& .ag-row": { fontSize: "10px !important" },
    "& .ag-root-wrapper": { border: "none !important" },
  };
}

function iSx(isDark: boolean) {
  return {
    "& .MuiOutlinedInput-root": {
      bgcolor: isDark ? "#0d1117" : "#fff",
      borderRadius: "6px", fontSize: "11px", height: 30,
      "& fieldset": { borderColor: isDark ? alpha("#7dd3fc", 0.18) : alpha("#94a3b8", 0.3) },
      "&:hover fieldset": { borderColor: isDark ? alpha("#7dd3fc", 0.38) : alpha("#94a3b8", 0.55) },
      "&.Mui-focused fieldset": { borderColor: isDark ? "#38bdf8" : "#005071", borderWidth: "1px" },
    },
    "& .MuiInputLabel-root": {
      fontSize: "11px", color: isDark ? "#64748b" : "#94a3b8",
      "&.Mui-focused": { color: isDark ? "#38bdf8" : "#005071" },
    },
    "& .MuiSelect-select": { fontSize: "11px", py: "4px" },
  };
}

function menuProps(isDark: boolean) {
  return {
    PaperProps: {
      sx: {
        bgcolor: isDark ? "#080c12" : "#ffffff",
        backgroundImage: "none",
        border: `1px solid ${isDark ? alpha("#7dd3fc", 0.14) : alpha("#94a3b8", 0.2)}`,
        borderRadius: "6px",
        boxShadow: isDark
          ? "0 12px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(125,211,252,0.05)"
          : "0 6px 20px rgba(0,0,0,0.09), 0 2px 6px rgba(0,0,0,0.05)",
        mt: 0.5,
        "& .MuiList-root": { py: "4px" },
        "& .MuiMenuItem-root": {
          fontSize: "11px",
          fontWeight: 500,
          minHeight: 0,
          py: "5px",
          px: "12px",
          letterSpacing: "0.2px",
          color: isDark ? "#cbd5e1" : "#374151",
          borderRadius: "3px",
          mx: "3px",
          "&:hover": {
            bgcolor: isDark ? alpha("#7dd3fc", 0.07) : alpha("#005071", 0.05),
            color: isDark ? "#e2e8f0" : "#005071",
          },
          "&.Mui-selected": {
            bgcolor: isDark ? alpha("#38bdf8", 0.12) : alpha("#005071", 0.07),
            color: isDark ? "#7dd3fc" : "#005071",
            fontWeight: 700,
            "&:hover": {
              bgcolor: isDark ? alpha("#38bdf8", 0.18) : alpha("#005071", 0.12),
            },
          },
          "&.Mui-disabled": { opacity: 0.4 },
        },
        "& .MuiDivider-root": {
          borderColor: isDark ? alpha("#7dd3fc", 0.08) : alpha("#94a3b8", 0.15),
          my: "3px",
        },
      },
    },
  };
}

function buildColDefs(data: any[]): ColDef[] {
  if (!data?.length) return [];
  return Object.keys(data[0]).map((key) => {
    const isNum = typeof data[0][key] === "number";
    const col: ColDef = {
      field: key,
      headerName: key.replace(/_/g, " ").toUpperCase(),
      flex: 1,
      minWidth: key.includes("ts") || key.includes("hash") || key === "top_features" ? 200 : 100,
      sortable: true,
      filter: true,
    };
    if (isNum) {
      col.type = "numericColumn";
      col.valueFormatter = (p) => p.value?.toLocaleString() ?? "—";
    }
    if (key === "severity") {
      col.cellRenderer = (p: any) => {
        const v: string = p.value ?? "NORMAL";
        const c = v === "CRITICAL" ? "#ef4444" : v === "WARNING" ? "#eab308" : "#22c55e";
        return (
          <Chip label={v} size="small" sx={{
            bgcolor: alpha(c, 0.15), color: c,
            borderRadius: "2px", height: 20, fontSize: "10px", fontWeight: 700,
          }} />
        );
      };
    }
    if (key === "top_features") {
      col.valueFormatter = (p) => {
        if (!p.value) return "";
        try { return Object.keys(JSON.parse(p.value)).join(", "); } catch { return p.value; }
      };
    }
    if (key === "health_score") {
      col.valueFormatter = (p) =>
        p.value != null ? `${parseFloat(p.value).toFixed(2)}%` : "—";
    }
    if (key === "validation_rate") {
      col.valueFormatter = (p) =>
        p.value != null ? `${p.value.toFixed(1)}%` : "—";
    }
    if (key === "last_seen_sec") {
      col.valueFormatter = (p) =>
        p.value != null ? `${p.value.toFixed(1)}s ago` : "—";
    }
    return col;
  });
}

function fetchBtn(isDark: boolean) {
  return {
    height: 30, fontSize: "10px", fontWeight: 700, px: 1.5,
    borderColor: isDark ? alpha("#7dd3fc", 0.3) : alpha("#005071", 0.35),
    color: isDark ? "#38bdf8" : "#005071",
    "&:hover": {
      borderColor: isDark ? alpha("#7dd3fc", 0.5) : "#005071",
      bgcolor: isDark ? alpha("#7dd3fc", 0.06) : alpha("#005071", 0.04),
    },
  };
}

function rowChip(label: string, color: string, isDark: boolean) {
  return (
    <Chip size="small" label={label} sx={{
      borderRadius: "4px", height: 24, fontSize: "10px", fontWeight: 700,
      bgcolor: alpha(color, isDark ? 0.12 : 0.08),
      color,
      border: `1px solid ${alpha(color, 0.25)}`,
    }} />
  );
}

// ── RAW JSON PANEL ──────────────────────────────────────────────────────────

function RawJsonPanel({ isDark, data, label = "RAW JSON" }: { isDark: boolean; data: any; label?: string }) {
  const [open, setOpen] = useState(false);
  const text = useMemo(() => {
    try { return JSON.stringify(data ?? null, null, 2) ?? "null"; } catch { return "// could not serialize"; }
  }, [data]);

  return (
    <Box sx={{ mt: 1.5, flexShrink: 0 }}>
      <Box
        onClick={() => setOpen((v) => !v)}
        sx={{
          display: "flex", alignItems: "center", gap: 0.75, cursor: "pointer",
          px: 1.25, py: 0.6,
          border: `1px solid ${isDark ? alpha("#7dd3fc", 0.12) : alpha("#1f2937", 0.1)}`,
          borderRadius: open ? "4px 4px 0 0" : "4px",
          bgcolor: isDark ? alpha("#7dd3fc", 0.04) : alpha("#1f2937", 0.02),
          userSelect: "none",
        }}
      >
        <Typography sx={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1px", color: isDark ? "#38bdf8" : "#005071", flex: 1 }}>
          {open ? "▼" : "▶"} {label}
        </Typography>
        <Typography sx={{ fontSize: "9px", color: isDark ? "#64748b" : "#94a3b8" }}>
          {open ? "collapse" : `${text.length.toLocaleString()} chars`}
        </Typography>
      </Box>
      {open && (
        <Box sx={{
          border: `1px solid ${isDark ? alpha("#7dd3fc", 0.12) : alpha("#1f2937", 0.1)}`,
          borderTop: "none",
          borderRadius: "0 0 4px 4px",
          bgcolor: isDark ? "#040d17" : "#f8fafc",
          maxHeight: 260,
          overflowY: "auto",
          overflowX: "auto",
        }}>
          <Box component="pre" sx={{
            m: 0, p: 1.25,
            fontSize: "10px", fontFamily: "monospace", lineHeight: 1.6,
            color: isDark ? "#94a3b8" : "#374151",
            whiteSpace: "pre",
          }}>
            {text}
          </Box>
        </Box>
      )}
    </Box>
  );
}

// ── SHARED INSPECTOR PRIMITIVES ────────────────────────────────────────────

function InspectorToolbar({ isDark, children }: { isDark: boolean; children: React.ReactNode }) {
  return (
    <Box sx={{
      px: 2, py: 1,
      bgcolor: isDark ? "#060f1a" : "#f1f5f9",
      borderBottom: `1px solid ${isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.08)}`,
      display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0, flexWrap: "wrap",
    }}>
      {children}
    </Box>
  );
}

function InspectorEmpty({ accent, isDark, title, hint }: {
  accent: string; isDark: boolean; title: string; hint: string;
}) {
  return (
    <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, p: 4 }}>
      <Box sx={{
        width: 56, height: 56, borderRadius: "14px",
        bgcolor: alpha(accent, isDark ? 0.1 : 0.07),
        border: `1px solid ${alpha(accent, 0.2)}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <RefreshRoundedIcon sx={{ fontSize: 26, color: alpha(accent, 0.5) }} />
      </Box>
      <Box sx={{ textAlign: "center" }}>
        <Typography sx={{ fontSize: "13px", fontWeight: 600, color: isDark ? "#94a3b8" : "#64748b", mb: 0.5 }}>
          {title}
        </Typography>
        <Typography sx={{ fontSize: "11px", color: isDark ? "#64748b" : "#94a3b8" }}>
          {hint}
        </Typography>
      </Box>
    </Box>
  );
}

function InspectorGrid({ isDark, rowData, colDefs }: { isDark: boolean; rowData: any[]; colDefs: ColDef[] }) {
  const agTheme = isDark ? "ag-theme-balham-dark" : "ag-theme-balham";
  return (
    <Box className={agTheme} sx={{ height: "100%", width: "100%", ...agGridSx(isDark) }}>
      <AgGridReact rowData={rowData} columnDefs={colDefs} rowHeight={32} headerHeight={32} suppressMovableColumns />
    </Box>
  );
}

// ── MODULE JSON VIEWER ──────────────────────────────────────────────────────

function ModuleJsonViewer({ isDark }: { isDark: boolean }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ds_allModuleLatest"],
    queryFn: fetchAllModuleLatest,
    enabled: false,
    staleTime: 30_000,
  });

  const loaded = !!data && !isLoading;

  return (
    <Box sx={{
      flexShrink: 0,
      borderTop: `1px solid ${isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.07)}`,
    }}>
      {/* Section header */}
      <Box sx={{
        px: 2, py: 1,
        bgcolor: isDark ? "#060f1a" : "#f1f5f9",
        borderBottom: `1px solid ${isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.07)}`,
        display: "flex", alignItems: "center", gap: 1.5,
      }}>
        <Typography sx={{
          fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px",
          color: isDark ? "#64748b" : "#94a3b8",
        }}>
          MODULE RAW JSON — LATEST RECORD PER MODULE
        </Typography>
        <Box sx={{ flex: 1 }} />
        {loaded && data.map(({ mod }) => (
          <Box key={mod} sx={{
            width: 8, height: 8, borderRadius: "50%",
            bgcolor: MODULE_COLORS[mod],
          }} />
        ))}
        <Button
          size="small"
          variant={loaded ? "outlined" : "contained"}
          startIcon={<RefreshRoundedIcon sx={{ fontSize: 13 }} />}
          onClick={() => refetch()}
          disabled={isLoading}
          sx={loaded ? {
            ...fetchBtn(isDark),
            height: 26, fontSize: "9px",
          } : {
            height: 26, fontSize: "9px", fontWeight: 700, px: 1.25,
            bgcolor: isDark ? "#1e3a5f" : "#005071",
            color: "#fff",
            "&:hover": { bgcolor: isDark ? "#254d7a" : "#00698a" },
          }}
        >
          {isLoading ? "LOADING…" : loaded ? "REFRESH ALL" : "LOAD ALL MODULES"}
        </Button>
      </Box>

      {/* Cards */}
      {!data && !isLoading && (
        <Box sx={{ px: 2, py: 2 }}>
          <Typography sx={{ fontSize: "11px", color: isDark ? "#64748b" : "#94a3b8" }}>
            Click LOAD ALL MODULES to fetch the latest raw JSON record for each module side by side.
          </Typography>
        </Box>
      )}

      {data && (
        <Box sx={{
          display: "flex",
          gap: 0,
          overflowX: "auto",
          "& > *": { flexShrink: 0 },
        }}>
          {data.map(({ mod, record }, idx) => {
            const color = MODULE_COLORS[mod] ?? "#7dd3fc";
            const text = record
              ? JSON.stringify(record, null, 2)
              : "// no data returned";
            return (
              <Box key={mod} sx={{
                width: 260,
                display: "flex",
                flexDirection: "column",
                borderRight: idx < data.length - 1
                  ? `1px solid ${isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.07)}`
                  : "none",
              }}>
                {/* Card header */}
                <Box sx={{
                  px: 1.5, py: 0.75, flexShrink: 0,
                  bgcolor: isDark ? alpha(color, 0.09) : alpha(color, 0.06),
                  borderBottom: `2px solid ${color}`,
                  display: "flex", alignItems: "center", gap: 0.75,
                }}>
                  <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: color }} />
                  <Typography sx={{
                    fontSize: "10px", fontWeight: 700, letterSpacing: "0.8px", color,
                  }}>
                    {mod.toUpperCase()}
                  </Typography>
                  {record && (
                    <Typography sx={{
                      fontSize: "8.5px", color: isDark ? "#64748b" : "#94a3b8",
                      ml: "auto",
                    }}>
                      1 record
                    </Typography>
                  )}
                </Box>

                {/* JSON body — scrolls internally */}
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    px: 1.5, py: 1.25,
                    flex: 1,
                    fontSize: "9.5px",
                    fontFamily: "monospace",
                    lineHeight: 1.65,
                    color: isDark ? "#94a3b8" : "#374151",
                    bgcolor: isDark ? alpha(color, 0.02) : alpha(color, 0.015),
                    whiteSpace: "pre",
                    overflowY: "auto",
                    overflowX: "auto",
                    maxHeight: 340,
                  }}
                >
                  {text}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

// ── INSPECTOR CONTENTS ──────────────────────────────────────────────────────

function highlightJson(json: string, isDark: boolean): string {
  const safe = json.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return safe.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      if (/^"/.test(m)) {
        if (/:$/.test(m)) return `<span style="color:${isDark ? "#f59e0b" : "#b45309"}">${m}</span>`;
        return `<span style="color:${isDark ? "#4ade80" : "#15803d"}">${m}</span>`;
      }
      if (/true|false/.test(m)) return `<span style="color:${isDark ? "#a78bfa" : "#7c3aed"}">${m}</span>`;
      if (/null/.test(m)) return `<span style="color:#ef4444">${m}</span>`;
      return `<span style="color:${isDark ? "#38bdf8" : "#0369a1"}">${m}</span>`;
    }
  );
}

function VehiclesInspector({ isDark, observerData }: { isDark: boolean; observerData: any }) {
  const vehicles: any[] = observerData?.vehicles ?? [];
  const gs = observerData?.global_stats ?? {};
  const sh = observerData?.system_health ?? {};

  const sortedVehicles = useMemo(
    () => [...vehicles].sort((a: any, b: any) => (a.last_seen_sec ?? 999) - (b.last_seen_sec ?? 999)),
    [vehicles]
  );
  const simIds = useMemo(() => vehicles.map((v: any) => v.vehicle_id), [vehicles]);

  const [selectedSim, setSelectedSim] = useState<string>("");
  const [selectedModule, setSelectedModule] = useState<string>("");

  useEffect(() => {
    const best = sortedVehicles[0]?.vehicle_id ?? "";
    if (best && !simIds.includes(selectedSim)) setSelectedSim(best);
  }, [sortedVehicles]);

  const modulePayloads: Record<string, any> = useMemo(() => {
    const v = vehicles.find((v: any) => v.vehicle_id === selectedSim);
    return v?.module_payloads ?? {};
  }, [vehicles, selectedSim]);

  const availableModules = useMemo(() => Object.keys(modulePayloads), [modulePayloads]);

  useEffect(() => {
    if (availableModules.length > 0 && !availableModules.includes(selectedModule)) {
      setSelectedModule(availableModules[0]);
    }
  }, [availableModules]);

  const displayPayload = useMemo(() => {
    if (selectedModule && modulePayloads[selectedModule]) return modulePayloads[selectedModule];
    return sortedVehicles[0]?.latest_payload ?? null;
  }, [modulePayloads, selectedModule, sortedVehicles]);

  const jsonHtml = useMemo(
    () => (displayPayload ? highlightJson(JSON.stringify(displayPayload, null, 2), isDark) : null),
    [displayPayload, isDark]
  );

  const colDefs = useMemo<ColDef[]>(() => [
    { field: "vehicle_id", headerName: "VEHICLE", flex: 1, minWidth: 80,
      cellStyle: { fontWeight: "bold", fontSize: "10px" } as any },
    { field: "rows_processed", headerName: "ROWS", width: 62,
      valueFormatter: (p) => p.value != null ? (p.value >= 1000 ? `${(p.value / 1000).toFixed(1)}k` : p.value) : "—" },
    { field: "rejected_rows", headerName: "REJ", width: 50,
      cellStyle: (p: any) => ({ color: p.value > 0 ? "#ef4444" : undefined }) as any },
    { field: "validation_rate", headerName: "QUAL%", width: 62,
      valueFormatter: (p) => p.value != null ? `${p.value.toFixed(0)}%` : "—",
      cellStyle: (p: any) => ({
        color: p.value > 95 ? "#22c55e" : p.value > 80 ? "#eab308" : "#ef4444",
        fontWeight: "bold",
      }) as any },
    { field: "avg_latency", headerName: "LAT", width: 52,
      valueFormatter: (p) => p.value != null ? `${p.value.toFixed(0)}` : "—" },
    { field: "last_seen_sec", headerName: "AGO", width: 50,
      valueFormatter: (p) => p.value != null ? `${Math.round(p.value)}s` : "—" },
  ], []);

  const bd = isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.08);

  const chartData = useMemo(
    () => vehicles.map((v: any) => ({
      ...v,
      label: v.vehicle_id?.replace(/^(SIM|V|VEH)[_-]?/i, "").slice(0, 8) ?? v.vehicle_id,
    })),
    [vehicles]
  );

  const axisClr = isDark ? "#475569" : "#94a3b8";
  const gridClr = isDark ? alpha("#ffffff", 0.04) : alpha("#000000", 0.05);
  const tipBg   = isDark ? "#0f172a" : "#ffffff";
  const tipBdr  = isDark ? "#1e293b" : "#e2e8f0";
  const tipTxt  = isDark ? "#94a3b8" : "#475569";
  const tipSx   = { background: tipBg, border: `1px solid ${tipBdr}`, borderRadius: 4, fontSize: 10, color: tipTxt, padding: "4px 8px" };

  const chartEmpty = (
    <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Typography sx={{ fontSize: "9px", color: isDark ? "#334155" : "#cbd5e1" }}>awaiting data</Typography>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", height: "100%", minHeight: 0 }}>

      {/* ── LEFT: stats + health + grid (top) + two charts (bottom) ── */}
      <Box sx={{ flex: "0 0 58%", display: "flex", flexDirection: "column", borderRight: `1px solid ${bd}`, minWidth: 0 }}>

        {/* Stat tiles */}
        <Box sx={{
          px: 1.25, py: 0.875, flexShrink: 0,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0.75,
          borderBottom: `1px solid ${bd}`,
          bgcolor: isDark ? alpha("#0d1117", 0.6) : "#f8fafc",
        }}>
          {[
            { label: "ACTIVE", value: gs.active_vehicles ?? 0, color: "#22c55e" },
            { label: "ROWS", value: (gs.total_rows ?? 0) >= 1000 ? `${((gs.total_rows ?? 0) / 1000).toFixed(1)}k` : (gs.total_rows ?? 0), color: "#38bdf8" },
            { label: "DLQ", value: gs.dlq_backlog ?? 0, color: (gs.dlq_backlog ?? 0) > 0 ? "#ef4444" : "#22c55e" },
          ].map((tile) => (
            <Box key={tile.label} sx={{
              px: 0.75, py: 0.6, borderRadius: "5px", textAlign: "center",
              bgcolor: isDark ? alpha(tile.color, 0.08) : alpha(tile.color, 0.06),
              border: `1px solid ${alpha(tile.color, 0.2)}`,
            }}>
              <Typography sx={{ fontSize: "16px", fontWeight: 800, color: tile.color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
                {tile.value}
              </Typography>
              <Typography sx={{ fontSize: "7px", fontWeight: 700, letterSpacing: "0.8px", color: isDark ? "#64748b" : "#94a3b8", mt: 0.2 }}>
                {tile.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Service health — single row of 4 cards */}
        <Box sx={{
          px: 1.25, py: 0.75, flexShrink: 0,
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 0.6,
          borderBottom: `1px solid ${bd}`,
          bgcolor: isDark ? alpha("#060f1a", 0.5) : "#f1f5f9",
        }}>
          {Object.entries(sh).map(([svc, status]: [string, any]) => {
            const up = status === true || status === "UP";
            const c = up ? "#22c55e" : "#ef4444";
            const label = svc === "Zookeeper" ? "ZK" : svc.toUpperCase();
            return (
              <Box key={svc} sx={{
                px: 0.6, py: 0.5, borderRadius: "5px", textAlign: "center",
                bgcolor: isDark ? alpha(c, 0.07) : alpha(c, 0.05),
                border: `1px solid ${alpha(c, 0.22)}`,
              }}>
                <Typography sx={{ fontSize: "7px", fontWeight: 700, letterSpacing: "0.5px", color: isDark ? "#64748b" : "#94a3b8" }}>
                  {label}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.4, mt: 0.25 }}>
                  <Box sx={{
                    width: 5, height: 5, borderRadius: "50%", bgcolor: c, flexShrink: 0,
                    boxShadow: up ? `0 0 4px ${alpha(c, 0.6)}` : "none",
                  }} />
                  <Typography sx={{ fontSize: "10px", fontWeight: 800, color: c, lineHeight: 1 }}>
                    {up ? "UP" : "DN"}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* Per-vehicle grid — takes remaining upper space */}
        <Box sx={{ flex: "1 1 0", minHeight: 0 }}>
          {vehicles.length === 0 ? (
            <InspectorEmpty accent="#22c55e" isDark={isDark}
              title="No live vehicle feeds"
              hint="Vehicles appear here once the observer receives Kafka telemetry" />
          ) : (
            <InspectorGrid isDark={isDark} rowData={vehicles} colDefs={colDefs} />
          )}
        </Box>

        {/* Two charts side-by-side at the bottom */}
        <Box sx={{
          flex: "0 0 40%", minHeight: 0,
          display: "flex", borderTop: `1px solid ${bd}`,
          bgcolor: isDark ? alpha("#060e18", 0.35) : "#fafafa",
        }}>
          {/* Chart 1: Latency */}
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", px: 1.5, pt: 1, pb: 0.75, borderRight: `1px solid ${bd}` }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5, flexShrink: 0 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: "2px", bgcolor: isDark ? "#f59e0b" : "#d97706", flexShrink: 0 }} />
              <Typography sx={{ fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.9px", color: isDark ? "#64748b" : "#94a3b8" }}>
                LATENCY BY VEHICLE (ms)
              </Typography>
            </Box>
            {vehicles.length === 0 ? chartEmpty : (
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 2, right: 4, left: -26, bottom: 2 }} barCategoryGap="22%">
                    <CartesianGrid strokeDasharray="2 4" vertical={false} stroke={gridClr} />
                    <XAxis dataKey="label" tick={{ fontSize: 7.5, fill: axisClr }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 7.5, fill: axisClr }} axisLine={false} tickLine={false} />
                    <RcTooltip
                      cursor={{ fill: isDark ? alpha("#ffffff", 0.04) : alpha("#000000", 0.04) }}
                      contentStyle={tipSx}
                      formatter={(v: any) => [`${Number(v).toFixed(1)} ms`, "Avg Latency"]}
                      labelFormatter={(l: string) => vehicles.find((v: any) => v.label === l)?.vehicle_id ?? l}
                    />
                    <Bar dataKey="avg_latency" fill={isDark ? "#f59e0b" : "#d97706"} radius={[2, 2, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Box>

          {/* Chart 2: Quality */}
          <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", px: 1.5, pt: 1, pb: 0.75 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.25, flexShrink: 0 }}>
              <Box sx={{ width: 7, height: 7, borderRadius: "2px", bgcolor: "#22c55e", flexShrink: 0 }} />
              <Typography sx={{ fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.9px", color: isDark ? "#64748b" : "#94a3b8" }}>
                DATA QUALITY DISTRIBUTION
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1.25, mb: 0.25, flexShrink: 0 }}>
              {[["#22c55e", "Accepted"], ["#ef4444", "Rejected"]].map(([c, lbl]) => (
                <Box key={lbl} sx={{ display: "flex", alignItems: "center", gap: 0.35 }}>
                  <Box sx={{ width: 6, height: 6, bgcolor: c, borderRadius: "1px" }} />
                  <Typography sx={{ fontSize: "7px", color: isDark ? "#64748b" : "#94a3b8" }}>{lbl}</Typography>
                </Box>
              ))}
            </Box>
            {vehicles.length === 0 ? chartEmpty : (
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 2, right: 4, left: -26, bottom: 2 }} barCategoryGap="22%">
                    <CartesianGrid strokeDasharray="2 4" vertical={false} stroke={gridClr} />
                    <XAxis dataKey="label" tick={{ fontSize: 7.5, fill: axisClr }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 7.5, fill: axisClr }} axisLine={false} tickLine={false} />
                    <RcTooltip
                      cursor={{ fill: isDark ? alpha("#ffffff", 0.04) : alpha("#000000", 0.04) }}
                      contentStyle={tipSx}
                      labelFormatter={(l: string) => vehicles.find((v: any) => v.label === l)?.vehicle_id ?? l}
                    />
                    <Bar dataKey="rows_processed" name="Accepted" stackId="q" fill="#22c55e" radius={[0, 0, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="rejected_rows" name="Rejected" stackId="q" fill="#ef4444" radius={[2, 2, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      {/* ── RIGHT: JSON viewer (narrower) ── */}
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Toolbar */}
        <Box sx={{
          px: 1.5, py: 0.75, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 1,
          bgcolor: isDark ? alpha("#0d1117", 0.6) : "#f8fafc",
          borderBottom: `1px solid ${bd}`,
        }}>
          <Typography sx={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1.2px", color: isDark ? "#64748b" : "#94a3b8", whiteSpace: "nowrap" }}>
            PAYLOAD
          </Typography>
          <FormControl size="small" sx={{ minWidth: 100, ...iSx(isDark) }}>
            <InputLabel sx={{ fontSize: "10px" }}>Sim</InputLabel>
            <Select value={selectedSim} label="Sim"
              onChange={(e) => setSelectedSim(e.target.value)}
              MenuProps={menuProps(isDark)} sx={{ height: 26, fontSize: "10px" }}>
              {simIds.map((id: string) => (
                <MenuItem key={id} value={id} sx={{ fontSize: "10px" }}>{id}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 100, ...iSx(isDark) }}>
            <InputLabel sx={{ fontSize: "10px" }}>Module</InputLabel>
            <Select value={selectedModule} label="Module"
              onChange={(e) => setSelectedModule(e.target.value)}
              MenuProps={menuProps(isDark)} sx={{ height: 26, fontSize: "10px" }}>
              {availableModules.map((m: string) => (
                <MenuItem key={m} value={m} sx={{ fontSize: "10px" }}>{m.toUpperCase()}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ flex: 1 }} />
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: "#22c55e", animation: "ds-pulse 2s ease-in-out infinite" }} />
            <Typography sx={{ fontSize: "8px", fontWeight: 600, color: isDark ? "#4ade80" : "#16a34a" }}>LIVE</Typography>
          </Box>
        </Box>

        {/* JSON body */}
        {!jsonHtml ? (
          <InspectorEmpty accent="#22c55e" isDark={isDark}
            title="Awaiting telemetry"
            hint="JSON payloads appear here once the observer receives live Kafka messages" />
        ) : (
          <Box
            component="pre"
            sx={{
              flex: 1, m: 0, px: 2, py: 1.5,
              fontSize: "10px",
              fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
              lineHeight: 1.7,
              bgcolor: isDark ? "#060e18" : "#ffffff",
              color: isDark ? "#8899aa" : "#64748b",
              overflowY: "auto", overflowX: "auto",
              minHeight: 0,
              "& span": { transition: "color 0.15s" },
            }}
            dangerouslySetInnerHTML={{ __html: jsonHtml }}
          />
        )}
      </Box>
    </Box>
  );
}

function BronzeInspector({ isDark }: { isDark: boolean }) {
  const [mod, setMod] = useState("engine");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ds_bronzeInspector", mod],
    queryFn: () => fetchBronzeInspector(mod),
    enabled: false,
    staleTime: 60_000,
  });

  const colDefs = useMemo<ColDef[]>(() => buildColDefs(data ?? []), [data]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <InspectorToolbar isDark={isDark}>
        <FormControl size="small" sx={{ minWidth: 150, ...iSx(isDark) }}>
          <InputLabel>Module</InputLabel>
          <Select value={mod} label="Module" onChange={(e) => setMod(e.target.value)} MenuProps={menuProps(isDark)}>
            {ALL_MODULES.map((m) => <MenuItem key={m} value={m}>{m.toUpperCase()}</MenuItem>)}
          </Select>
        </FormControl>
        <Button size="small" variant="contained" startIcon={<RefreshRoundedIcon sx={{ fontSize: 14 }} />}
          onClick={() => refetch()} sx={{
            height: 30, fontSize: "10px", fontWeight: 700, px: 1.5,
            bgcolor: "#f59e0b", color: "#0f172a",
            "&:hover": { bgcolor: "#d97706" },
          }}>
          FETCH DATA
        </Button>
        {data && rowChip(`${data.length} rows loaded`, "#f59e0b", isDark)}
      </InspectorToolbar>
      {!data && !isLoading
        ? <InspectorEmpty accent="#f59e0b" isDark={isDark} title="No data loaded" hint="Select a module and click FETCH DATA to load raw Bronze rows" />
        : isLoading
          ? <InspectorEmpty accent="#f59e0b" isDark={isDark} title="Fetching…" hint="Loading Bronze parquet rows from the API" />
          : <InspectorGrid isDark={isDark} rowData={data ?? []} colDefs={colDefs} />
      }
    </Box>
  );
}

function DlqInspector({
  isDark, dlqCount, observerData,
}: { isDark: boolean; dlqCount: number; observerData: any }) {
  const sh = observerData?.system_health ?? {};
  const active = dlqCount > 0;
  const c = active ? "#ef4444" : "#22c55e";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      <Box sx={{ p: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        {/* Count card */}
        <Box sx={{
          p: 2.5, borderRadius: 2, flex: "0 0 auto",
          bgcolor: isDark ? alpha(c, 0.07) : alpha(c, 0.04),
          border: `1px solid ${alpha(c, 0.2)}`,
          borderLeft: `4px solid ${c}`,
          minWidth: 180,
        }}>
          <Typography sx={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px", color: alpha(c, 0.7), mb: 1 }}>
            DEAD LETTER QUEUE
          </Typography>
          <Typography sx={{ fontSize: "52px", fontWeight: 900, color: c, lineHeight: 1 }}>
            {dlqCount}
          </Typography>
          <Typography sx={{ fontSize: "11px", color: isDark ? "#64748b" : "#94a3b8", mt: 0.75 }}>
            {active ? "stalled events" : "queue is clear"}
          </Typography>
        </Box>

        {/* Status banner */}
        <Box sx={{
          p: 2, borderRadius: 2, flex: 1, minWidth: 200,
          bgcolor: isDark ? alpha(c, 0.05) : alpha(c, 0.03),
          border: `1px solid ${alpha(c, 0.15)}`,
          display: "flex", flexDirection: "column", justifyContent: "center",
        }}>
          <Typography sx={{ fontSize: "13px", fontWeight: 700, color: isDark ? "#e2e8f0" : "#0f172a", mb: 0.5 }}>
            {active ? "Data pipeline has stalled events" : "Pipeline flowing normally"}
          </Typography>
          <Typography sx={{ fontSize: "11px", color: isDark ? "#64748b" : "#94a3b8", lineHeight: 1.5 }}>
            {active
              ? "Events were rejected or timed out before reaching the Silver layer. Check module health below."
              : "All events are being processed and reaching the Silver ML layer without issues."}
          </Typography>
        </Box>
      </Box>

      <Divider sx={{ mx: 2, borderColor: isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.08) }} />

      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px", color: isDark ? "#64748b" : "#94a3b8", mb: 1.5 }}>
          MODULE HEALTH STATUS
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
          {Object.entries(sh).length === 0 && (
            <Typography sx={{ fontSize: "12px", color: isDark ? "#64748b" : "#94a3b8" }}>
              No module health data available
            </Typography>
          )}
          {Object.entries(sh).map(([mod, status]: [string, any]) => {
            const up = status === true || status === "UP";
            const mc = up ? "#22c55e" : "#ef4444";
            return (
              <Box key={mod} sx={{
                px: 2, py: 1.5, borderRadius: 1.5,
                bgcolor: isDark ? alpha(mc, 0.08) : alpha(mc, 0.05),
                border: `1px solid ${alpha(mc, 0.25)}`,
                borderTop: `3px solid ${mc}`,
                minWidth: 90, textAlign: "center",
              }}>
                <Typography sx={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.8px", color: alpha(mc, 0.7) }}>
                  {mod.toUpperCase()}
                </Typography>
                <Typography sx={{ fontSize: "18px", fontWeight: 800, color: mc, lineHeight: 1.3 }}>
                  {up ? "UP" : "DOWN"}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

function SilverInspector({ isDark }: { isDark: boolean }) {
  const [mod, setMod] = useState("engine");
  const [filterSim, setFilterSim] = useState("ALL");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ds_silverTail", mod],
    queryFn: () => fetchSilverTail(mod),
    enabled: false,
    staleTime: 60_000,
  });

  const sims = useMemo<string[]>(() => {
    if (!data?.length) return [];
    return [...new Set(data.map((r: any) => r.source_id).filter(Boolean))].sort() as string[];
  }, [data]);

  const filtered = useMemo(
    () => !data ? [] : filterSim === "ALL" ? data : data.filter((r: any) => r.source_id === filterSim),
    [data, filterSim]
  );

  const colDefs = useMemo<ColDef[]>(() => buildColDefs(data ?? []), [data]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <InspectorToolbar isDark={isDark}>
        <FormControl size="small" sx={{ minWidth: 150, ...iSx(isDark) }}>
          <InputLabel>Module</InputLabel>
          <Select value={mod} label="Module"
            onChange={(e) => { setMod(e.target.value); setFilterSim("ALL"); }}
            MenuProps={menuProps(isDark)}>
            {ALL_MODULES.map((m) => <MenuItem key={m} value={m}>{m.toUpperCase()}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150, ...iSx(isDark) }} disabled={!data?.length}>
          <InputLabel>Vehicle</InputLabel>
          <Select value={filterSim} label="Vehicle" onChange={(e) => setFilterSim(e.target.value)} MenuProps={menuProps(isDark)}>
            <MenuItem value="ALL"><em>All vehicles</em></MenuItem>
            {sims.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <Button size="small" variant="contained" startIcon={<RefreshRoundedIcon sx={{ fontSize: 14 }} />}
          onClick={() => refetch()} sx={{
            height: 30, fontSize: "10px", fontWeight: 700, px: 1.5,
            bgcolor: "#38bdf8", color: "#0f172a",
            "&:hover": { bgcolor: "#0ea5e9" },
          }}>
          FETCH DATA
        </Button>
        {data && rowChip(`${filtered.length} / ${data.length} rows`, "#38bdf8", isDark)}
      </InspectorToolbar>
      {!data && !isLoading
        ? <InspectorEmpty accent="#38bdf8" isDark={isDark} title="No inference data loaded" hint="Select a module and click FETCH DATA to load Silver ML inference rows" />
        : isLoading
          ? <InspectorEmpty accent="#38bdf8" isDark={isDark} title="Fetching…" hint="Loading Silver inference tail from the ML engine" />
          : <InspectorGrid isDark={isDark} rowData={filtered} colDefs={colDefs} />
      }
    </Box>
  );
}

function GoldInspector({ isDark, vehicleList, isActive }: { isDark: boolean; vehicleList: string[]; isActive: boolean }) {
  const [vehicle, setVehicle] = useState(() => vehicleList[0] ?? "");
  const { autoRefresh } = useStore();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ds_goldHistory", vehicle],
    queryFn: () => fetchGoldHistory(vehicle),
    enabled: !!vehicle,
    refetchInterval: isActive && autoRefresh ? 8_000 : false,
  });

  const colDefs = useMemo<ColDef[]>(() => buildColDefs(data ?? []), [data]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <InspectorToolbar isDark={isDark}>
        <FormControl size="small" sx={{ minWidth: 200, ...iSx(isDark) }} disabled={!vehicleList.length}>
          <InputLabel>Vehicle</InputLabel>
          <Select value={vehicle} label="Vehicle" onChange={(e) => setVehicle(e.target.value)} MenuProps={menuProps(isDark)}>
            {vehicleList.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </Select>
        </FormControl>
        <Button size="small" variant="outlined" startIcon={<RefreshRoundedIcon sx={{ fontSize: 14 }} />}
          onClick={() => refetch()} sx={fetchBtn(isDark)}>
          REFRESH
        </Button>
        {data && rowChip(`${data.length} rows`, "#fbbf24", isDark)}
        <Box sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: "9px", color: isDark ? "#64748b" : "#94a3b8" }}>
          Auto-refreshes every 8s
        </Typography>
      </InspectorToolbar>
      {vehicleList.length === 0
        ? <InspectorEmpty accent="#fbbf24" isDark={isDark} title="No active vehicles" hint="Gold history will appear here once vehicles are active in the simulation" />
        : isLoading
          ? <InspectorEmpty accent="#fbbf24" isDark={isDark} title="Loading history…" hint={`Fetching Gold fusion history for ${vehicle}`} />
          : <InspectorGrid isDark={isDark} rowData={data ?? []} colDefs={colDefs} />
      }
    </Box>
  );
}

function FleetInspector({
  isDark, goldData, vehicleList,
}: { isDark: boolean; goldData: any; vehicleList: string[] }) {
  const fh: number | null = goldData?.fleet_vehicle_health_pct ?? null;
  const totalRows: number = goldData?.total_gold_rows ?? 0;
  const lag: number = goldData?.global_max_lag ?? 0;
  const hc = fh === null ? "#64748b" : fh >= 75 ? "#22c55e" : fh >= 50 ? "#eab308" : "#ef4444";

  const kpis = [
    { label: "FLEET HEALTH", value: fh !== null ? `${fh.toFixed(1)}%` : "—", color: hc },
    { label: "ACTIVE VEHICLES", value: `${vehicleList.length}`, color: "#38bdf8" },
    { label: "TOTAL GOLD ROWS", value: totalRows.toLocaleString(), color: "#fbbf24" },
    { label: "MAX LAG", value: goldData != null ? (lag > 0 ? `${fmt(lag)}ms` : "0ms") : "—", color: lag > 1_000 ? "#ef4444" : "#22c55e" },
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
      <Box sx={{ p: 2, display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        {kpis.map((k) => (
          <Box key={k.label} sx={{
            p: 2, borderRadius: 2, flex: "1 1 140px",
            bgcolor: isDark ? alpha(k.color, 0.07) : alpha(k.color, 0.05),
            border: `1px solid ${alpha(k.color, 0.2)}`,
            borderTop: `3px solid ${k.color}`,
          }}>
            <Typography sx={{ fontSize: "8px", fontWeight: 700, letterSpacing: "1.2px", color: alpha(k.color, 0.7), mb: 0.75 }}>
              {k.label}
            </Typography>
            <Typography sx={{ fontSize: "28px", fontWeight: 800, color: k.color, lineHeight: 1 }}>
              {k.value}
            </Typography>
          </Box>
        ))}
      </Box>

      <Divider sx={{ mx: 2, borderColor: isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.08) }} />

      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px", color: isDark ? "#64748b" : "#94a3b8", mb: 1.5 }}>
          ACTIVE SIMULATION VEHICLES
        </Typography>
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {vehicleList.length === 0
            ? <Typography sx={{ fontSize: "12px", color: isDark ? "#64748b" : "#94a3b8" }}>No active vehicles</Typography>
            : vehicleList.map((v) => (
                <Box key={v} sx={{
                  px: 1.5, py: 0.6, borderRadius: 1,
                  bgcolor: isDark ? alpha("#fbbf24", 0.08) : alpha("#fbbf24", 0.06),
                  border: `1px solid ${alpha("#fbbf24", 0.22)}`,
                }}>
                  <Typography sx={{ fontSize: "11px", fontWeight: 600, color: isDark ? "#fbbf24" : "#d97706", fontFamily: "monospace" }}>
                    {v}
                  </Typography>
                </Box>
              ))
          }
        </Box>
      </Box>
    </Box>
  );
}

// ── NODE CARD ───────────────────────────────────────────────────────────────

interface NodeCardProps {
  id: string;
  name: string;
  icon: React.ReactNode;
  accent: string;
  healthPct: number;
  health: HealthState;
  primaryValue: string;
  primaryLabel: string;
  metrics: { label: string; value: string; color?: string }[];
  tag?: { label: string; color: string };
  isDark: boolean;
  onClick: (id: string) => void;
}

function NodeCard({
  id, name, icon, accent, healthPct, health,
  primaryValue, primaryLabel, metrics, tag, isDark, onClick,
}: NodeCardProps) {
  const dot = healthDotColor(health);
  const r = 18;
  const circ = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, healthPct)) * 0.01 * circ;

  return (
    <Paper elevation={isDark ? 0 : 2} onClick={() => onClick(id)} sx={{
      p: 1.5, borderRadius: 0, cursor: "pointer", position: "relative", overflow: "hidden",
      border: `1px solid ${isDark ? alpha(accent, 0.18) : alpha(accent, 0.14)}`,
      borderTop: `3px solid ${accent}`,
      transition: "all 0.2s ease",
      "&:hover": {
        transform: "translateY(-3px)",
        boxShadow: `0 8px 24px ${alpha(accent, isDark ? 0.28 : 0.2)}`,
        borderColor: alpha(accent, isDark ? 0.4 : 0.3),
        borderTopColor: accent,
      },
    }}>
      {health === "crit" && (
        <Box sx={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `radial-gradient(ellipse at 50% 0%, ${alpha("#ef4444", 0.08)} 0%, transparent 65%)`,
        }} />
      )}

      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1 }}>
        <Box sx={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
          <svg width="44" height="44" viewBox="0 0 44 44" style={{ position: "absolute", top: 0, left: 0 }}>
            <circle cx="22" cy="22" r={r} fill="none"
              stroke={alpha(accent, isDark ? 0.12 : 0.08)} strokeWidth="3" />
            <circle cx="22" cy="22" r={r} fill="none"
              stroke={accent} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${filled} ${circ}`}
              transform="rotate(-90 22 22)"
              style={{ transition: "stroke-dasharray 1s ease" }}
            />
          </svg>
          <Box sx={{
            position: "absolute", top: "50%", left: "50%",
            transform: "translate(-50%,-50%)",
            color: accent, display: "flex", alignItems: "center",
            "& svg": { fontSize: 18 },
          }}>
            {icon}
          </Box>
        </Box>
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0.5 }}>
          <Box sx={{
            width: 8, height: 8, borderRadius: "50%", bgcolor: dot,
            animation: health === "ok" ? "ds-pulse 2.4s ease-in-out infinite" : "none",
          }} />
          {tag && (
            <Box sx={{
              px: 0.6, py: 0.2, borderRadius: "3px",
              bgcolor: alpha(tag.color, isDark ? 0.15 : 0.1),
              border: `1px solid ${alpha(tag.color, 0.28)}`,
            }}>
              <Typography sx={{ fontSize: "7px", fontWeight: 700, letterSpacing: "0.4px", color: tag.color, lineHeight: 1 }}>
                {tag.label}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Typography sx={{ fontSize: "8px", fontWeight: 700, letterSpacing: "1px", color: isDark ? "#64748b" : "#94a3b8", mb: 0.25, lineHeight: 1 }}>
        {name}
      </Typography>
      <Typography sx={{ fontSize: "22px", fontWeight: 800, lineHeight: 1.1, mb: 0.1, color: isDark ? "#e2e8f0" : "#0f172a" }}>
        {primaryValue}
      </Typography>
      <Typography sx={{ fontSize: "8px", color: isDark ? "#64748b" : "#94a3b8", mb: 0.75, lineHeight: 1 }}>
        {primaryLabel}
      </Typography>

      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        {metrics.map((m) => (
          <Box key={m.label}>
            <Typography sx={{ fontSize: "7px", color: isDark ? "#64748b" : "#d1d5db", lineHeight: 1 }}>
              {m.label}
            </Typography>
            <Typography sx={{ fontSize: "9px", fontWeight: 600, color: m.color ?? (isDark ? "#94a3b8" : "#64748b") }}>
              {m.value}
            </Typography>
          </Box>
        ))}
      </Box>

      <Typography sx={{ fontSize: "7.5px", fontWeight: 700, letterSpacing: "0.5px", color: alpha(accent, 0.45), mt: 1, textAlign: "right" }}>
        INSPECT ▶
      </Typography>
    </Paper>
  );
}

// ── CONNECTORS ──────────────────────────────────────────────────────────────

function HConnector({ topLabel, btmLabel, isDark }: { topLabel?: string; btmLabel?: string; isDark: boolean }) {
  const stroke = isDark ? alpha("#7dd3fc", 0.38) : alpha("#005071", 0.32);
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <Typography sx={{ fontSize: "7px", fontWeight: 600, lineHeight: 1.2, textAlign: "center", color: isDark ? "#64748b" : "#d1d5db", mb: 0.3, minHeight: 14 }}>
        {topLabel ?? ""}
      </Typography>
      <svg width="56" height="20" viewBox="0 0 56 20" style={{ overflow: "visible" }}>
        <line x1="1" y1="10" x2="44" y2="10" stroke={stroke} strokeWidth="1.5"
          strokeDasharray="5 3" style={{ animation: "ds-flow-h 1.5s linear infinite" }} />
        <polygon points="43,6.5 53,10 43,13.5" fill={stroke} />
      </svg>
      <Typography sx={{ fontSize: "7px", fontWeight: 600, lineHeight: 1.2, textAlign: "center", color: isDark ? "#64748b" : "#d1d5db", mt: 0.3, minHeight: 14 }}>
        {btmLabel ?? ""}
      </Typography>
    </Box>
  );
}

function DlqBranch({
  dlqCount, isDark, onInspect,
}: { dlqCount: number; isDark: boolean; onInspect: () => void }) {
  const active = dlqCount > 0;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width="28" height="44" viewBox="0 0 28 44" style={{ display: "block" }}>
        <line x1="14" y1="0" x2="14" y2="33" stroke="#ef4444" strokeWidth="1.5"
          strokeDasharray="5 3" style={{ animation: "ds-flow-dlq 0.65s linear infinite" }} />
        <polygon points="10,31 14,42 18,31" fill="#ef4444" />
      </svg>
      <Paper elevation={0} onClick={onInspect} sx={{
        px: 1.5, py: 1, borderRadius: 0, cursor: "pointer", textAlign: "center",
        border: `1px solid ${alpha("#ef4444", active ? 0.45 : 0.2)}`,
        borderTop: `2px solid #ef4444`,
        bgcolor: isDark ? alpha("#ef4444", active ? 0.09 : 0.03) : alpha("#ef4444", active ? 0.05 : 0.02),
        minWidth: 110,
        animation: active ? "ds-pulse-card 2.2s ease-in-out infinite" : "none",
        transition: "all 0.2s",
        "&:hover": { transform: "translateY(-2px)", boxShadow: `0 4px 12px ${alpha("#ef4444", 0.2)}` },
      }}>
        <WarningAmberRoundedIcon sx={{ fontSize: 16, color: "#ef4444", mb: 0.25, display: "block", mx: "auto" }} />
        <Typography sx={{ fontSize: "8px", fontWeight: 700, letterSpacing: "0.8px", color: "#ef4444", lineHeight: 1, mb: 0.25 }}>
          DLQ BACKLOG
        </Typography>
        <Typography sx={{ fontSize: "20px", fontWeight: 800, color: "#ef4444", lineHeight: 1.1 }}>
          {dlqCount}
        </Typography>
        <Typography sx={{ fontSize: "7px", color: isDark ? "#64748b" : "#94a3b8" }}>dead events</Typography>
        <Typography sx={{ fontSize: "7.5px", fontWeight: 700, color: alpha("#ef4444", 0.45), mt: 0.75 }}>
          INSPECT ▶
        </Typography>
      </Paper>
    </Box>
  );
}

// ── INSPECTOR DRAWER ────────────────────────────────────────────────────────

const NODE_LABELS: Record<string, string> = {
  vehicles: "Vehicle Fleet",
  bronze:   "Bronze Writers",
  dlq:      "DLQ Backlog",
  silver:   "Silver ML Engine",
  gold:     "Gold Fusion",
  fleet:    "Fleet Health",
};

const NODE_SUBTITLES: Record<string, string> = {
  vehicles: "Live observer snapshot · per-vehicle row counts and latency",
  bronze:   "Raw parquet rows written by module · select module and fetch",
  dlq:      "Dead-letter queue depth · stalled events and module health",
  silver:   "ML inference tail · severity scores and feature weights",
  gold:     "Gold fusion history · per-vehicle health trajectory",
  fleet:    "Aggregated fleet KPIs · health percentages and active vehicles",
};

const NODE_ACCENT: Record<string, string> = {
  vehicles: "#22c55e",
  bronze:   "#f59e0b",
  dlq:      "#ef4444",
  silver:   "#38bdf8",
  gold:     "#fbbf24",
  fleet:    "#a855f7",
};

const NODE_ICONS: Record<string, React.ReactNode> = {
  vehicles: <DirectionsCarRoundedIcon />,
  bronze:   <StorageRoundedIcon />,
  dlq:      <WarningAmberRoundedIcon />,
  silver:   <PsychologyRoundedIcon />,
  gold:     <MonitorHeartRoundedIcon />,
  fleet:    <HealthAndSafetyRoundedIcon />,
};

function InspectorDrawer({
  open, nodeId, isDark, onClose, isActive,
  observerData, goldData, vehicleList, dlqBacklog,
}: {
  open: boolean; nodeId: string; isDark: boolean; onClose: () => void; isActive: boolean;
  observerData: any; goldData: any; vehicleList: string[]; dlqBacklog: number;
}) {
  const label  = NODE_LABELS[nodeId]   ?? nodeId.toUpperCase();
  const sub    = NODE_SUBTITLES[nodeId] ?? "";
  const accent = NODE_ACCENT[nodeId]   ?? "#7dd3fc";
  const icon   = NODE_ICONS[nodeId]    ?? <StorageRoundedIcon />;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: isDark ? "#0b1724" : "#ffffff",
          borderRadius: "14px",
          overflow: "hidden",
          height: "82vh",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${isDark ? alpha(accent, 0.2) : alpha(accent, 0.15)}`,
          boxShadow: isDark
            ? `0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px ${alpha(accent, 0.12)}`
            : `0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px ${alpha(accent, 0.1)}`,
        },
      }}
      slotProps={{
        backdrop: {
          sx: { backdropFilter: "blur(4px)", bgcolor: alpha("#000", isDark ? 0.6 : 0.35) },
        },
      }}
    >
      {/* HEADER */}
      <Box sx={{
        flexShrink: 0,
        px: 2.5, py: 1.75,
        background: isDark
          ? `linear-gradient(90deg, ${alpha(accent, 0.16)} 0%, ${alpha(accent, 0.05)} 40%, transparent 70%)`
          : `linear-gradient(90deg, ${alpha(accent, 0.1)} 0%, ${alpha(accent, 0.03)} 40%, transparent 70%)`,
        borderBottom: `1px solid ${isDark ? alpha(accent, 0.15) : alpha(accent, 0.12)}`,
        display: "flex", alignItems: "center", gap: 2,
      }}>
        <Box sx={{ width: 4, height: 44, borderRadius: 2, bgcolor: accent, flexShrink: 0 }} />

        <Box sx={{
          width: 44, height: 44, borderRadius: "12px", flexShrink: 0,
          bgcolor: alpha(accent, isDark ? 0.14 : 0.1),
          border: `1px solid ${alpha(accent, 0.25)}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: accent,
          "& svg": { fontSize: 22 },
        }}>
          {icon}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.3 }}>
            <Typography sx={{
              fontSize: "17px", fontWeight: 800, letterSpacing: "-0.3px",
              color: isDark ? "#f1f5f9" : "#0f172a", lineHeight: 1,
            }}>
              {label}
            </Typography>
            <Box sx={{
              px: 0.75, py: 0.25, borderRadius: "4px",
              bgcolor: alpha(accent, isDark ? 0.15 : 0.1),
              border: `1px solid ${alpha(accent, 0.25)}`,
            }}>
              <Typography sx={{ fontSize: "8px", fontWeight: 700, letterSpacing: "1px", color: accent }}>
                DATA INSPECTOR
              </Typography>
            </Box>
          </Box>
          <Typography sx={{
            fontSize: "11px", color: isDark ? "#64748b" : "#94a3b8",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {sub}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexShrink: 0 }}>
          <Box sx={{
            width: 7, height: 7, borderRadius: "50%", bgcolor: "#22c55e",
            animation: "ds-pulse 2s ease-in-out infinite",
          }} />
          <Typography sx={{ fontSize: "10px", fontWeight: 600, color: isDark ? "#4ade80" : "#16a34a" }}>
            LIVE
          </Typography>
        </Box>

        <IconButton size="small" onClick={onClose} sx={{
          ml: 0.5, color: isDark ? "#64748b" : "#94a3b8",
          "&:hover": {
            bgcolor: isDark ? alpha("#fff", 0.06) : alpha("#000", 0.04),
            color: isDark ? "#94a3b8" : "#64748b",
          },
        }}>
          <CloseRoundedIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* BODY */}
      <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {nodeId === "vehicles" && <VehiclesInspector isDark={isDark} observerData={observerData} />}
        {nodeId === "bronze"   && <BronzeInspector isDark={isDark} />}
        {nodeId === "dlq"      && <DlqInspector isDark={isDark} dlqCount={dlqBacklog} observerData={observerData} />}
        {nodeId === "silver"   && <SilverInspector isDark={isDark} />}
        {nodeId === "gold"     && <GoldInspector isDark={isDark} vehicleList={vehicleList} isActive={isActive} />}
        {nodeId === "fleet"    && <FleetInspector isDark={isDark} goldData={goldData} vehicleList={vehicleList} />}
      </Box>
    </Dialog>
  );
}

// ── FLEET INTELLIGENCE SECTION ──────────────────────────────────────────────

function SectionHeader({ isDark, title, accent }: {
  isDark: boolean; title: string; accent: string;
}) {
  return (
    <Box sx={{
      px: 2, py: 1,
      display: "flex", alignItems: "center", gap: 1.5,
      borderBottom: `1px solid ${isDark ? alpha(accent, 0.1) : alpha(accent, 0.1)}`,
    }}>
      <Box sx={{ width: 3, height: 14, borderRadius: "2px", bgcolor: accent, flexShrink: 0 }} />
      <Typography sx={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1.5px", color: isDark ? "#e2e8f0" : "#0f172a" }}>
        {title}
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Box sx={{
        width: 6, height: 6, borderRadius: "50%", bgcolor: accent,
        animation: "ds-pulse 2.4s ease-in-out infinite",
      }} />
    </Box>
  );
}

function KpiTile({ label, value, sub, color, isDark }: {
  label: string; value: string; sub: string; color: string; isDark: boolean;
}) {
  return (
    <Box sx={{
      flex: "1 1 0", minWidth: 110, p: 1.75,
      bgcolor: isDark ? alpha(color, 0.06) : alpha(color, 0.04),
      border: `1px solid ${alpha(color, isDark ? 0.18 : 0.14)}`,
      borderTop: `3px solid ${color}`,
      borderRadius: 1,
      transition: "background 0.15s",
      "&:hover": { bgcolor: isDark ? alpha(color, 0.1) : alpha(color, 0.07) },
    }}>
      <Typography sx={{
        fontSize: "7.5px", fontWeight: 700, letterSpacing: "1.2px",
        color: alpha(color, isDark ? 0.6 : 0.55), mb: 0.75, lineHeight: 1,
      }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: "26px", fontWeight: 800, lineHeight: 1, color, mb: 0.3 }}>
        {value}
      </Typography>
      <Typography sx={{ fontSize: "9px", color: isDark ? "#64748b" : "#94a3b8", lineHeight: 1 }}>
        {sub}
      </Typography>
    </Box>
  );
}

function FleetIntelligenceSection({ isDark, writerData, inferenceData, goldData, observerData }: {
  isDark: boolean; writerData: any; inferenceData: any; goldData: any; observerData: any;
}) {
  const agTheme = isDark ? "ag-theme-balham-dark" : "ag-theme-balham";

  const writerRows = useMemo(
    () => (writerData ? (Object.values(writerData) as any[]) : []),
    [writerData]
  );
  const activeWriters = writerRows.filter((r) => r.status === "RUNNING").length;
  const totalWriters = writerRows.length;
  const totalThroughput = writerRows.reduce((a, r) => a + (parseFloat(r.throughput) || 0), 0);
  const avgLatencyMs =
    totalWriters > 0
      ? writerRows.reduce((a, r) => a + (r.latency_ms || 0), 0) / totalWriters
      : 0;

  const activeModules: number = inferenceData?.active_modules ?? 0;
  const globalE2E: number = inferenceData?.global_e2e_ms ?? 0;
  const moduleStats: Record<string, any> = inferenceData?.module_stats ?? {};
  const totalInferences = useMemo(() => {
    if (!inferenceData?.module_stats) return 0;
    return (Object.values(inferenceData.module_stats) as any[]).reduce((a, s) => a + (s.rows_5m ?? 0), 0);
  }, [inferenceData]);
  const maxRows5m = useMemo(
    () => Math.max(1, ...ALL_MODULES.map((m) => moduleStats[m]?.rows_5m ?? 0)),
    [moduleStats]
  );

  const fleetHealth: number | null = goldData?.fleet_vehicle_health_pct ?? null;
  const totalGoldRows: number = goldData?.total_gold_rows ?? 0;
  const globalLag: number = goldData?.global_max_lag ?? 0;
  const vehicleCount: number = (goldData?.active_sims ?? []).length;

  const vehicles: any[] = observerData?.vehicles ?? [];

  const fhColor =
    fleetHealth === null ? "#64748b"
    : fleetHealth >= 75  ? "#22c55e"
    : fleetHealth >= 50  ? "#eab308"
    : "#ef4444";
  const lagColor = globalLag > 2000 ? "#ef4444" : globalLag > 500 ? "#eab308" : "#22c55e";

  const kpis = [
    { label: "ACTIVE VEHICLES",    value: vehicleCount > 0 ? String(vehicleCount) : "—",                        sub: "simulation feeds",                                       color: "#22c55e" },
    { label: "FLEET HEALTH",       value: fleetHealth !== null ? `${fleetHealth.toFixed(0)}%` : "—",             sub: fleetHealth !== null ? (fleetHealth >= 75 ? "nominal" : fleetHealth >= 50 ? "degraded" : "critical") : "no data", color: fhColor },
    { label: "GOLD ROWS",          value: totalGoldRows > 0 ? fmt(totalGoldRows) : "—",                         sub: "fused records total",                                    color: "#fbbf24" },
    { label: "MAX LAG",            value: goldData != null ? (globalLag > 0 ? `${fmt(globalLag)}ms` : "0ms") : "—",   sub: goldData != null ? (globalLag > 2000 ? "high latency" : globalLag > 0 ? "acceptable" : "caught up") : "no data", color: lagColor },
    { label: "ACTIVE WRITERS",     value: totalWriters > 0 ? `${activeWriters}/${totalWriters}` : "—",           sub: "bronze writers running",                                 color: "#f59e0b" },
    { label: "BRONZE THROUGHPUT",  value: totalWriters > 0 ? (totalThroughput > 0 ? `${fmt(totalThroughput)}/m` : "0/m") : "—", sub: avgLatencyMs > 0 ? `avg ${avgLatencyMs.toFixed(0)}ms lat` : "pipeline idle", color: "#f59e0b" },
    { label: "ML MODULES",         value: activeModules > 0 ? `${activeModules}/5` : "—",                       sub: totalInferences > 0 ? `${fmt(totalInferences)} inf/5m` : "no inferences", color: "#38bdf8" },
    { label: "PIPELINE E2E",       value: globalE2E > 0 ? `${fmt(globalE2E)}ms` : "—",                          sub: "sensor → gold latency",                                  color: "#38bdf8" },
  ];

  const vehicleColDefs = useMemo<ColDef[]>(() => [
    { field: "vehicle_id", headerName: "VEHICLE", flex: 1, minWidth: 110,
      cellStyle: { fontWeight: "bold", fontFamily: "monospace" } as any },
    { field: "rows_processed", headerName: "PROCESSED", flex: 1, minWidth: 100,
      valueFormatter: (p) => p.value?.toLocaleString() ?? "—" },
    { field: "rejected_rows", headerName: "REJECTED", flex: 1, minWidth: 90,
      cellStyle: (p: any) => ({ color: p.value > 0 ? "#ef4444" : undefined }) as any },
    { field: "validation_rate", headerName: "QUALITY", flex: 1, minWidth: 90,
      valueFormatter: (p) => p.value != null ? `${p.value.toFixed(1)}%` : "—",
      cellStyle: (p: any) => ({
        color: p.value > 95 ? "#22c55e" : p.value > 80 ? "#eab308" : "#ef4444",
        fontWeight: "bold",
      }) as any },
    { field: "avg_latency", headerName: "LAT (ms)", flex: 1, minWidth: 80,
      valueFormatter: (p) => p.value?.toFixed(1) ?? "—" },
    {
      headerName: "STATUS", colId: "status", flex: 1, minWidth: 100,
      valueGetter: (p: any) => p.data?.validation_rate ?? 0,
      cellRenderer: (p: any) => {
        const v: number = p.data?.validation_rate ?? 0;
        const s = v > 95 ? "NOMINAL" : v > 80 ? "DEGRADED" : "CRITICAL";
        const c = v > 95 ? "#22c55e" : v > 80 ? "#eab308" : "#ef4444";
        return (
          <Chip size="small" label={s} sx={{
            height: 18, fontSize: "9px", fontWeight: 700, borderRadius: "3px",
            bgcolor: alpha(c, 0.13), color: c, border: `1px solid ${alpha(c, 0.25)}`,
          }} />
        );
      },
    },
  ], []);

  const subHeaderSx = {
    px: 2, py: 0.75, flexShrink: 0,
    borderBottom: `1px solid ${isDark ? alpha("#7dd3fc", 0.06) : alpha("#1f2937", 0.06)}`,
  };

  return (
    <Paper elevation={0} sx={{
      borderRadius: 0, overflow: "hidden",
      border: `1px solid ${isDark ? alpha("#22c55e", 0.12) : alpha("#22c55e", 0.1)}`,
    }}>
      <SectionHeader isDark={isDark} title="FLEET INTELLIGENCE" accent="#22c55e" />

      {/* 8-tile KPI row */}
      <Box sx={{ p: 2, display: "flex", gap: 1.5, flexWrap: "wrap" }}>
        {kpis.map((k) => <KpiTile key={k.label} {...k} isDark={isDark} />)}
      </Box>

      <Divider sx={{ borderColor: isDark ? alpha("#7dd3fc", 0.06) : alpha("#1f2937", 0.06) }} />

      {/* Bottom: vehicle grid + module bars */}
      <Box sx={{ display: "flex", minHeight: 270 }}>
        {/* Vehicle Status */}
        <Box sx={{
          flex: 3, minWidth: 0, display: "flex", flexDirection: "column",
          borderRight: `1px solid ${isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.07)}`,
        }}>
          <Box sx={subHeaderSx}>
            <Typography sx={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px", color: isDark ? "#64748b" : "#94a3b8" }}>
              VEHICLE STATUS
            </Typography>
          </Box>
          <Box className={agTheme} sx={{ flex: 1, minHeight: 0, ...agGridSx(isDark) }}>
            <AgGridReact
              rowData={vehicles}
              columnDefs={vehicleColDefs}
              rowHeight={32}
              headerHeight={32}
              suppressMovableColumns
            />
          </Box>
        </Box>

        {/* Module Pipeline Activity */}
        <Box sx={{ flex: 2, minWidth: 200, display: "flex", flexDirection: "column" }}>
          <Box sx={subHeaderSx}>
            <Typography sx={{ fontSize: "9px", fontWeight: 700, letterSpacing: "1.5px", color: isDark ? "#64748b" : "#94a3b8" }}>
              MODULE PIPELINE ACTIVITY
            </Typography>
          </Box>
          <Box sx={{ flex: 1, px: 2.5, py: 2, display: "flex", flexDirection: "column", gap: 2, justifyContent: "space-between" }}>
            {ALL_MODULES.map((mod) => {
              const stats = moduleStats[mod] ?? {};
              const rows5m: number = stats.rows_5m ?? 0;
              const e2e: number = stats.e2e_latency ?? 0;
              const color = MODULE_COLORS[mod] ?? "#7dd3fc";
              const isUp = inferenceData != null ? rows5m > 0 : true;
              const barPct = Math.max(2, (rows5m / maxRows5m) * 100);

              return (
                <Box key={mod}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.6 }}>
                    <Box sx={{
                      width: 7, height: 7, borderRadius: "50%",
                      bgcolor: isUp ? color : "#ef4444",
                      animation: isUp && rows5m > 0 ? "ds-pulse 2.4s ease-in-out infinite" : "none",
                      flexShrink: 0,
                    }} />
                    <Typography sx={{ fontSize: "10px", fontWeight: 700, color, flex: 1, letterSpacing: "0.4px" }}>
                      {mod.toUpperCase()}
                    </Typography>
                    {rows5m > 0 && (
                      <Typography sx={{ fontSize: "9px", fontWeight: 600, color: isDark ? "#94a3b8" : "#64748b" }}>
                        {fmt(rows5m)}/5m
                      </Typography>
                    )}
                    {e2e > 0 && (
                      <Typography sx={{ fontSize: "9px", color: isDark ? "#64748b" : "#94a3b8", ml: 0.5 }}>
                        {fmt(e2e)}ms
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{
                    height: 5, borderRadius: 3,
                    bgcolor: isDark ? alpha(color, 0.1) : alpha(color, 0.08),
                  }}>
                    <Box sx={{
                      height: "100%", borderRadius: 3,
                      bgcolor: isUp ? color : "#ef4444",
                      width: rows5m > 0 ? `${barPct}%` : "2%",
                      opacity: rows5m > 0 ? 1 : 0.2,
                      transition: "width 1s ease",
                    }} />
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

// ── PIPELINE OBSERVABILITY SECTION ─────────────────────────────────────────

function PipelineColumn({
  accent, badge, isDark, borderRight, children, empty,
}: {
  accent: string; badge: string; isDark: boolean;
  borderRight?: boolean; children: React.ReactNode; empty?: boolean;
}) {
  return (
    <Box sx={{
      flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
      borderRight: borderRight
        ? `1px solid ${isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.07)}`
        : "none",
    }}>
      <Box sx={{ height: 4, bgcolor: accent, flexShrink: 0 }} />
      <Box sx={{
        px: 2, py: 0.85, flexShrink: 0,
        bgcolor: isDark ? alpha(accent, 0.07) : alpha(accent, 0.05),
        borderBottom: `1px solid ${alpha(accent, isDark ? 0.14 : 0.12)}`,
        display: "flex", alignItems: "center", gap: 1,
      }}>
        <Box sx={{
          px: 0.75, py: 0.25, borderRadius: "4px",
          bgcolor: alpha(accent, isDark ? 0.18 : 0.12),
          border: `1px solid ${alpha(accent, 0.3)}`,
        }}>
          <Typography sx={{ fontSize: "8px", fontWeight: 700, letterSpacing: "1.2px", color: accent }}>
            {badge}
          </Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        <Box sx={{
          width: 6, height: 6, borderRadius: "50%", bgcolor: accent,
          animation: "ds-pulse 2.4s ease-in-out infinite",
        }} />
      </Box>
      <Box sx={{
        flex: 1, overflowY: "auto", px: 1.5, py: 1.25,
        display: "flex", flexDirection: "column", gap: 1,
      }}>
        {empty
          ? <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1 }}>
              <Typography sx={{ fontSize: "11px", color: isDark ? "#64748b" : "#94a3b8" }}>
                No data
              </Typography>
            </Box>
          : children
        }
      </Box>
    </Box>
  );
}

function MetricPair({ label, value, color, isDark }: {
  label: string; value: string; color?: string; isDark: boolean;
}) {
  return (
    <Box>
      <Typography sx={{ fontSize: "7px", fontWeight: 600, letterSpacing: "0.5px",
        color: isDark ? "#64748b" : "#cbd5e1", lineHeight: 1, mb: 0.3 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: "13px", fontWeight: 700, lineHeight: 1,
        color: color ?? (isDark ? "#e2e8f0" : "#0f172a") }}>
        {value}
      </Typography>
    </Box>
  );
}

function WriterCard({ id, m, isDark }: { id: string; m: any; isDark: boolean }) {
  const running = m.status === "RUNNING";
  const c = running ? "#f59e0b" : "#ef4444";
  const name = id.replace(/_writer$|_Writer$/i, "").replace(/_/g, " ").toUpperCase();

  return (
    <Box sx={{
      p: 1.25, borderRadius: 1,
      bgcolor: isDark ? alpha(c, 0.06) : alpha(c, 0.04),
      border: `1px solid ${alpha(c, running ? 0.18 : 0.3)}`,
      borderLeft: `3px solid ${c}`,
    }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.85 }}>
        <Typography sx={{ fontSize: "10px", fontWeight: 700, color: c, flex: 1, letterSpacing: "0.4px" }}>
          {name}
        </Typography>
        <Box sx={{
          display: "flex", alignItems: "center", gap: 0.5,
          px: 0.6, py: 0.2, borderRadius: "3px",
          bgcolor: alpha(c, 0.14),
        }}>
          <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: c,
            animation: running ? "ds-pulse 2s ease-in-out infinite" : "none" }} />
          <Typography sx={{ fontSize: "8px", fontWeight: 700, color: c }}>
            {m.status ?? "—"}
          </Typography>
        </Box>
      </Box>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <MetricPair label="THROUGHPUT" value={m.throughput > 0 ? `${fmt(m.throughput)}/m` : "0/m"} isDark={isDark} />
        <MetricPair label="LATENCY" value={m.latency_ms > 0 ? `${m.latency_ms.toFixed(1)}ms` : "—"} isDark={isDark} />
        <MetricPair label="LAG" value={m.true_lag > 0 ? `${fmt(m.true_lag)}ms` : "0ms"}
          color={m.true_lag > 1000 ? "#ef4444" : undefined} isDark={isDark} />
      </Box>
    </Box>
  );
}

function InferenceCard({ mod, stats, isDark }: { mod: string; stats: any; isDark: boolean }) {
  const color = MODULE_COLORS[mod] ?? "#38bdf8";
  const rows5m: number = stats.rows_5m ?? 0;
  const e2e: number = stats.e2e_latency ?? 0;
  const inf: number = stats.inf_latency ?? 0;
  const active = rows5m > 0;

  return (
    <Box sx={{
      p: 1.25, borderRadius: 1,
      bgcolor: isDark ? alpha(color, 0.06) : alpha(color, 0.04),
      border: `1px solid ${alpha(color, active ? 0.2 : 0.1)}`,
      borderLeft: `3px solid ${active ? color : alpha(color, 0.3)}`,
    }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.85 }}>
        <Typography sx={{ fontSize: "10px", fontWeight: 700, color, flex: 1, letterSpacing: "0.4px" }}>
          {mod.toUpperCase()}
        </Typography>
        {active && (
          <Typography sx={{ fontSize: "9px", fontWeight: 600, color: isDark ? "#94a3b8" : "#64748b" }}>
            {fmt(rows5m)}/5m
          </Typography>
        )}
      </Box>
      <Box sx={{ display: "flex", gap: 2 }}>
        <MetricPair label="E2E" value={e2e > 0 ? `${fmt(e2e)}ms` : "—"} isDark={isDark} />
        <MetricPair label="INFERENCE" value={inf > 0 ? `${fmt(inf)}ms` : "—"} isDark={isDark} />
        {!active && <MetricPair label="STATUS" value="IDLE" color="#64748b" isDark={isDark} />}
      </Box>
    </Box>
  );
}

function StreamCard({ v, isDark, offset = 0 }: { v: any; isDark: boolean; offset?: number }) {
  const vr: number = v.validation_rate ?? 0;
  const c = vr > 95 ? "#22c55e" : vr > 80 ? "#eab308" : "#ef4444";
  const sec: number = (v.last_seen_sec ?? 999) + offset;
  const fresh = sec < 5;

  return (
    <Box sx={{
      p: 1.25, borderRadius: 1,
      bgcolor: isDark ? alpha(c, 0.05) : alpha(c, 0.04),
      border: `1px solid ${alpha(c, 0.18)}`,
      borderLeft: `3px solid ${c}`,
    }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.85 }}>
        <Box sx={{
          width: 6, height: 6, borderRadius: "50%", bgcolor: c, flexShrink: 0,
          animation: fresh ? "ds-pulse 1.6s ease-in-out infinite" : "none",
        }} />
        <Typography sx={{ fontSize: "10px", fontWeight: 700, fontFamily: "monospace",
          color: isDark ? "#e2e8f0" : "#0f172a", flex: 1, letterSpacing: "0.2px" }}>
          {v.vehicle_id}
        </Typography>
        <Typography sx={{ fontSize: "9px", color: isDark ? "#64748b" : "#94a3b8" }}>
          {sec.toFixed(1)}s ago
        </Typography>
      </Box>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        <MetricPair label="QUALITY" value={vr > 0 ? `${vr.toFixed(1)}%` : "—"} color={c} isDark={isDark} />
        <MetricPair label="PROCESSED" value={v.rows_processed > 0 ? fmt(v.rows_processed) : "—"} isDark={isDark} />
        {v.rejected_rows > 0 && (
          <MetricPair label="REJECTED" value={String(v.rejected_rows)} color="#ef4444" isDark={isDark} />
        )}
      </Box>
    </Box>
  );
}

function LiveStreamColumn({ isDark, observerData }: { isDark: boolean; observerData: any }) {
  const [tick, setTick] = useState(0);

  useEffect(() => { setTick(0); }, [observerData]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const vehicles: any[] = observerData?.vehicles ?? [];

  return (
    <PipelineColumn accent="#22c55e" badge="LIVE STREAM" isDark={isDark}
      empty={vehicles.length === 0}>
      {vehicles.map((v) => (
        <StreamCard key={v.vehicle_id} v={v} isDark={isDark} offset={tick} />
      ))}
    </PipelineColumn>
  );
}

function PipelineObservabilitySection({ isDark, writerData, inferenceData, observerData }: {
  isDark: boolean; writerData: any; inferenceData: any; observerData: any;
}) {
  const writerEntries = useMemo<[string, any][]>(
    () => (writerData ? Object.entries(writerData) : []),
    [writerData]
  );

  const moduleEntries = useMemo<[string, any][]>(
    () =>
      inferenceData?.module_stats
        ? Object.entries(inferenceData.module_stats)
        : ALL_MODULES.map((m) => [m, {}]),
    [inferenceData]
  );

  return (
    <Paper elevation={0} sx={{
      borderRadius: 0, overflow: "hidden",
      border: `1px solid ${isDark ? alpha("#f59e0b", 0.12) : alpha("#f59e0b", 0.1)}`,
    }}>
      <SectionHeader isDark={isDark} title="PIPELINE OBSERVABILITY" accent="#f59e0b" />

      <Box sx={{ display: "flex", minHeight: 360 }}>
        <PipelineColumn accent="#f59e0b" badge="BRONZE LAYER" isDark={isDark}
          borderRight empty={writerEntries.length === 0}>
          {writerEntries.map(([id, m]) => (
            <WriterCard key={id} id={id} m={m} isDark={isDark} />
          ))}
        </PipelineColumn>

        <PipelineColumn accent="#38bdf8" badge="SILVER ML" isDark={isDark}
          borderRight empty={moduleEntries.length === 0}>
          {moduleEntries.map(([mod, stats]) => (
            <InferenceCard key={mod} mod={mod} stats={stats} isDark={isDark} />
          ))}
        </PipelineColumn>

        <LiveStreamColumn isDark={isDark} observerData={observerData} />
      </Box>
    </Paper>
  );
}

// ── WEIGHT LAB ───────────────────────────────────────────────────────────────

interface WeightPanelProps {
  isDark: boolean;
  label: string;
  accentColor: string;
  weights: Record<string, number>;
  activeMods: string[];
  allPresets: Record<string, Record<string, number>>;
  savedPresets: Record<string, Record<string, number>>;
  isAb: boolean;
  saveName: string;
  imbal: boolean;
  weightSum: number;
  onWeightsChange: (w: Record<string, number>) => void;
  onActiveModsChange: (mods: string[]) => void;
  onSaveNameChange: (n: string) => void;
  onApplyPreset: (name: string) => void;
  onAutoBalance: () => void;
  onSavePreset: () => void;
  onDeletePreset: (name: string) => void;
}

function WeightPanel({
  isDark, label, accentColor, weights, activeMods, allPresets, savedPresets,
  isAb, saveName, imbal, weightSum,
  onWeightsChange, onActiveModsChange, onSaveNameChange,
  onApplyPreset, onAutoBalance, onSavePreset, onDeletePreset,
}: WeightPanelProps) {
  const inputSx = iSx(isDark);
  return (
    <Box sx={{
      width: isAb ? 232 : 256,
      flexShrink: 0,
      bgcolor: isDark ? alpha("#0d2137", 0.5) : alpha("#f1f5f9", 0.6),
      border: `1px solid ${isDark ? alpha(accentColor, 0.15) : alpha(accentColor, 0.12)}`,
      borderTop: `3px solid ${accentColor}`,
      display: "flex",
      flexDirection: "column",
    }}>
      <Box sx={{
        px: 1.5, py: 0.75,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${isDark ? alpha(accentColor, 0.1) : alpha(accentColor, 0.08)}`,
      }}>
        <Typography sx={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: isDark ? alpha(accentColor, 0.9) : alpha(accentColor, 0.75) }}>
          {label}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography sx={{
            fontSize: "10px", fontWeight: 500, fontVariantNumeric: "tabular-nums",
            color: imbal ? (isDark ? "#fbbf24" : "#d97706") : (isDark ? "#4ade80" : "#16a34a"),
          }}>
            Σ {weightSum.toFixed(3)}
          </Typography>
          <Tooltip title="Auto-balance to sum 1.0">
            <IconButton size="small" sx={{ p: 0.25 }} onClick={onAutoBalance}>
              <AutoFixHighRoundedIcon sx={{ fontSize: 13, color: isDark ? "#7dd3fc" : "#005071" }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ px: 1.5, pt: 0.75, pb: 0.25 }}>
        <FormControl size="small" fullWidth sx={inputSx}>
          <InputLabel sx={{ fontSize: "10px" }}>Apply preset</InputLabel>
          <Select
            label="Apply preset"
            value=""
            onChange={(e) => { if (e.target.value) onApplyPreset(e.target.value as string); }}
            sx={{ fontSize: "11px" }}
            MenuProps={menuProps(isDark)}
          >
            <MenuItem value="" disabled><em>Choose preset…</em></MenuItem>
            {Object.keys(allPresets).map((p) => (
              <MenuItem key={p} value={p} sx={{ fontSize: "11px", display: "flex", justifyContent: "space-between", pr: 0.5 }}>
                <span style={{ flex: 1 }}>{p}</span>
                {savedPresets[p] && (
                  <IconButton
                    size="small"
                    sx={{ p: 0.25, ml: 0.5 }}
                    onMouseDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); }}
                    onClick={(ev) => { ev.stopPropagation(); onDeletePreset(p); }}
                  >
                    <DeleteRoundedIcon sx={{ fontSize: 11 }} />
                  </IconButton>
                )}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {imbal && (
        <Box sx={{ px: 1.5, py: 0.25 }}>
          <Alert severity="warning" sx={{ py: 0, px: 0.75, fontSize: "9px", "& .MuiAlert-icon": { fontSize: 12, mr: 0.5 } }}>
            Sum {weightSum.toFixed(3)} — click ↑ to balance
          </Alert>
        </Box>
      )}

      <Box sx={{ px: 1, pb: 0.75, flex: 1 }}>
        {ALL_MODULES.map((mod) => {
          const isOn = activeMods.includes(mod);
          const color = MODULE_COLORS[mod];
          return (
            <Box key={mod}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mb: -0.75 }}>
                <Checkbox
                  size="small"
                  checked={isOn}
                  onChange={(e) =>
                    onActiveModsChange(
                      e.target.checked ? [...activeMods, mod] : activeMods.filter((x) => x !== mod)
                    )
                  }
                  sx={{ p: 0.25, color: isDark ? "#64748b" : "#cbd5e1", "&.Mui-checked": { color } }}
                />
                <Typography sx={{
                  fontSize: "10px", fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.5px", minWidth: 76,
                  color: isOn ? color : (isDark ? "#64748b" : "#94a3b8"),
                }}>
                  {mod}
                </Typography>
                <Typography sx={{ fontSize: "10px", ml: "auto", fontVariantNumeric: "tabular-nums", color: isDark ? "#64748b" : "#94a3b8" }}>
                  {((weights[mod] ?? 0) * 100).toFixed(1)}%
                </Typography>
              </Box>
              <Slider
                size="small"
                disabled={!isOn}
                min={0} max={1} step={0.005}
                value={weights[mod] ?? 0}
                onChange={(_, v) => onWeightsChange({ ...weights, [mod]: v as number })}
                sx={{
                  color: isOn ? color : (isDark ? "#1e3a5f" : "#e2e8f0"),
                  mx: 1,
                  width: "calc(100% - 16px)",
                  py: 0.5,
                  "& .MuiSlider-thumb": { width: 10, height: 10 },
                  "& .MuiSlider-rail": { opacity: 0.2 },
                }}
              />
            </Box>
          );
        })}
      </Box>

      <Box sx={{
        px: 1.5, pt: 0.75, pb: 1,
        borderTop: `1px solid ${isDark ? alpha(accentColor, 0.08) : alpha(accentColor, 0.06)}`,
        display: "flex", gap: 0.5,
      }}>
        <TextField
          size="small"
          placeholder="Save as…"
          value={saveName}
          onChange={(e) => onSaveNameChange(e.target.value)}
          sx={{ flex: 1, "& .MuiInputBase-root": { fontSize: "11px", height: 28 }, ...inputSx }}
        />
        <Button
          size="small"
          variant="outlined"
          disabled={!saveName.trim()}
          onClick={onSavePreset}
          sx={{
            fontSize: "10px", px: 1, minWidth: 0, height: 28,
            borderColor: alpha(accentColor, 0.35), color: accentColor,
            "&:hover": { borderColor: accentColor, bgcolor: alpha(accentColor, 0.08) },
          }}
        >
          SAVE
        </Button>
      </Box>
    </Box>
  );
}

function DegradationDriversSection({ isDark, vehicleList, isActive }: {
  isDark: boolean; vehicleList: string[]; isActive: boolean;
}) {
  const { autoRefresh } = useStore();
  const [vehicle, setVehicle] = useState(() => vehicleList[0] ?? "");

  useEffect(() => {
    if (!vehicle && vehicleList.length > 0) setVehicle(vehicleList[0]);
  }, [vehicleList]);

  const { data: histRaw, isLoading } = useQuery({
    queryKey: ["ds_goldHistory", vehicle],
    queryFn: () => fetchGoldHistory(vehicle),
    enabled: !!vehicle && isActive,
    refetchInterval: isActive && autoRefresh ? 8_000 : false,
    staleTime: 5_000,
  });

  const drivers = useMemo(() => {
    const rows: any[] = histRaw ?? [];
    if (!rows.length) return [];
    const latest = rows[rows.length - 1];
    try {
      const raw = latest?.top_5_features;
      if (!raw) return [];
      const parsed: Record<string, number> = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Object.entries(parsed)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([feature, score]) => ({ feature: feature.replace(/_/g, " "), score }));
    } catch { return []; }
  }, [histRaw]);

  const maxScore = drivers[0]?.score ?? 1;

  const accent = "#f59e0b";

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        border: `1px solid ${isDark ? alpha(accent, 0.18) : alpha(accent, 0.25)}`,
        bgcolor: isDark ? alpha(accent, 0.04) : alpha(accent, 0.03),
        overflow: "hidden",
      }}
    >
      <Box sx={{
        px: 2, py: 1.25,
        display: "flex", alignItems: "center", gap: 1.5,
        borderBottom: `1px solid ${isDark ? alpha(accent, 0.14) : alpha(accent, 0.18)}`,
      }}>
        <Box sx={{ width: 3, height: 14, borderRadius: 1, bgcolor: accent, flexShrink: 0 }} />
        <Typography sx={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: isDark ? "#94a3b8" : "#64748b" }}>
          Degradation Drivers
        </Typography>
        <FormControl size="small" sx={{ minWidth: 160, ...iSx(isDark) }} disabled={!vehicleList.length}>
          <Select value={vehicle} onChange={(e) => setVehicle(e.target.value)} displayEmpty MenuProps={menuProps(isDark)}
            sx={{ height: 24, fontSize: "10px" }}>
            {vehicleList.map((v) => <MenuItem key={v} value={v} sx={{ fontSize: "10px" }}>{v}</MenuItem>)}
          </Select>
        </FormControl>
        <Typography sx={{ fontSize: "9px", color: isDark ? "#64748b" : "#94a3b8" }}>
          Top 5 anomaly features from latest Gold fusion
        </Typography>
      </Box>
      <Box sx={{ p: 2 }}>
        {isLoading ? (
          <Typography sx={{ fontSize: "11px", color: isDark ? "#64748b" : "#94a3b8" }}>Loading…</Typography>
        ) : drivers.length === 0 ? (
          <Typography sx={{ fontSize: "11px", color: isDark ? "#64748b" : "#94a3b8" }}>
            {vehicle ? "No top_5_features in latest gold row for this vehicle." : "Select a vehicle."}
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            {drivers.map(({ feature, score }) => (
              <Box key={feature} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                <Typography sx={{
                  fontSize: "10px", fontFamily: "monospace", color: isDark ? "#cbd5e1" : "#374151",
                  width: 200, flexShrink: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  textTransform: "uppercase",
                }}>
                  {feature}
                </Typography>
                <Box sx={{ flex: 1, height: 6, borderRadius: 1, bgcolor: isDark ? "#1e2433" : "#e2e8f0", position: "relative", overflow: "hidden" }}>
                  <Box sx={{
                    position: "absolute", left: 0, top: 0, height: "100%",
                    width: `${(score / maxScore) * 100}%`,
                    bgcolor: accent, borderRadius: 1, transition: "width 0.5s ease",
                  }} />
                </Box>
                <Chip
                  label={score.toFixed(4)}
                  size="small"
                  sx={{
                    height: 18, fontSize: "9px", fontWeight: 700, fontVariantNumeric: "tabular-nums",
                    bgcolor: alpha(accent, 0.14), color: accent,
                    "& .MuiChip-label": { px: 0.75 },
                  }}
                />
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Paper>
  );
}

function WeightLabSection({ isDark, vehicleList, isActive }: {
  isDark: boolean; vehicleList: string[]; isActive: boolean;
}) {
  const { autoRefresh } = useStore();
  const [profileMode, setProfileMode] = useState<"single" | "ab">("single");
  const [filterSim, setFilterSim] = useState("ALL");

  const [activeModsA, setActiveModsA] = useState<string[]>([...ALL_MODULES]);
  const [weightsA, setWeightsA] = useState<Record<string, number>>({
    engine: 0.4, transmission: 0.2, battery: 0.25, body: 0.05, tyre: 0.1,
  });
  const [saveNameA, setSaveNameA] = useState("");

  const [activeModsB, setActiveModsB] = useState<string[]>([...ALL_MODULES]);
  const [weightsB, setWeightsB] = useState<Record<string, number>>({
    engine: 0.2, transmission: 0.2, battery: 0.2, body: 0.2, tyre: 0.2,
  });
  const [saveNameB, setSaveNameB] = useState("");

  const [savedPresets, setSavedPresets] = useState<Record<string, Record<string, number>>>(() => {
    try {
      const existing = JSON.parse(localStorage.getItem("ds_weight_presets") ?? "{}");
      if (Object.keys(existing).length === 0) {
        const legacy = localStorage.getItem("gold_weight_presets");
        if (legacy) {
          const parsed = JSON.parse(legacy);
          localStorage.setItem("ds_weight_presets", JSON.stringify(parsed));
          localStorage.removeItem("gold_weight_presets");
          return parsed;
        }
      }
      return existing;
    }
    catch { return {}; }
  });

  const allPresets = useMemo(() => ({ ...BUILTIN_PRESETS, ...savedPresets }), [savedPresets]);

  const { data: config } = useQuery({
    queryKey: ["ds_goldConfig"],
    queryFn: fetchGoldConfig,
    staleTime: Infinity,
  });

  const histSim = filterSim !== "ALL" ? filterSim : (vehicleList[0] ?? "");
  const { data: historyRaw } = useQuery({
    queryKey: ["ds_labHistory", histSim],
    queryFn: () => fetchGoldHistory(histSim),
    enabled: !!histSim,
    refetchInterval: isActive && autoRefresh ? 5_000 : false,
  });

  useEffect(() => {
    if (config?.default_weights && config?.enabled_modules) {
      setWeightsA(config.default_weights as Record<string, number>);
      setActiveModsA(config.enabled_modules as string[]);
    }
  }, [config]);

  const history: any[] = useMemo(() => historyRaw ?? [], [historyRaw]);

  const computeSim = useCallback(
    (row: any, weights: Record<string, number>, mods: string[]) =>
      parseFloat(
        mods
          .reduce(
            (acc, mod) =>
              acc +
              parseFloat(
                row[`${mod}_contrib`] ??
                  row[`${mod}_contribution`] ??
                  row[`${mod}_health_score`] ??
                  "0"
              ) * (weights[mod] ?? 0),
            0
          )
          .toFixed(2)
      ),
    []
  );

  const simulatedA = useMemo(
    () =>
      history.map((row: any) => ({
        ...row,
        ts_short: row.gold_window_ts ?? row.ts ?? "",
        experimental_health: computeSim(row, weightsA, activeModsA),
        actual_gold: parseFloat((row.vehicle_health_score ?? 0).toFixed(2)),
      })),
    [history, weightsA, activeModsA, computeSim]
  );

  const simulatedB = useMemo(
    () =>
      history.map((row: any) => ({
        ts_short: row.gold_window_ts ?? row.ts ?? "",
        profile_b_health: computeSim(row, weightsB, activeModsB),
      })),
    [history, weightsB, activeModsB, computeSim]
  );

  const chartData = useMemo(() => {
    if (profileMode === "single") return simulatedA;
    const bMap: Record<string, number> = {};
    simulatedB.forEach((r: any) => { bMap[r.ts_short] = r.profile_b_health; });
    return simulatedA.map((r: any) => ({ ...r, profile_b_health: bMap[r.ts_short] ?? null }));
  }, [profileMode, simulatedA, simulatedB]);

  const sumA = activeModsA.reduce((s, m) => s + (weightsA[m] ?? 0), 0);
  const sumB = activeModsB.reduce((s, m) => s + (weightsB[m] ?? 0), 0);
  const imbalA = Math.abs(sumA - 1) > 0.005;
  const imbalB = Math.abs(sumB - 1) > 0.005;

  const applyPreset = (name: string, setW: typeof setWeightsA, setM: typeof setActiveModsA) => {
    const w = allPresets[name];
    if (!w) return;
    setW({ ...w });
    setM(ALL_MODULES.filter((m) => (w[m] ?? 0) > 0));
  };

  const autoBalance = (weights: Record<string, number>, mods: string[], setW: typeof setWeightsA) => {
    const s = mods.reduce((acc, m) => acc + (weights[m] ?? 0), 0);
    if (s === 0) return;
    const out = { ...weights };
    mods.forEach((m) => { out[m] = parseFloat(((weights[m] ?? 0) / s).toFixed(3)); });
    setW(out);
  };

  const savePreset = (name: string, weights: Record<string, number>, mods: string[]) => {
    if (!name.trim()) return;
    const next = {
      ...savedPresets,
      [name.trim()]: Object.fromEntries(mods.map((m) => [m, weights[m] ?? 0])),
    };
    setSavedPresets(next);
    localStorage.setItem("ds_weight_presets", JSON.stringify(next));
  };

  const deletePreset = (name: string) => {
    const next = { ...savedPresets };
    delete next[name];
    setSavedPresets(next);
    localStorage.setItem("ds_weight_presets", JSON.stringify(next));
  };

  const inputSx = iSx(isDark);
  const gridStroke = isDark ? alpha("#94a3b8", 0.08) : alpha("#94a3b8", 0.2);
  const axisColor = isDark ? "#64748b" : "#94a3b8";
  const tipStyle = {
    backgroundColor: isDark ? "#0d1b2a" : "#fff",
    border: `1px solid ${isDark ? "#1e3a5f" : "#e2e8f0"}`,
    borderRadius: 6,
    fontSize: 11,
    color: isDark ? "#cbd5e1" : "#1f2937",
  };

  return (
    <Paper elevation={0} sx={{
      borderRadius: 0, overflow: "hidden",
      border: `1px solid ${isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.08)}`,
    }}>
      <SectionHeader isDark={isDark} title="WEIGHT LAB" accent="#a855f7" />

      <Box sx={{
        px: 2, py: 0.75,
        borderBottom: `1px solid ${isDark ? alpha("#a855f7", 0.1) : alpha("#a855f7", 0.08)}`,
        display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap",
      }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={profileMode}
          onChange={(_, v) => { if (v) setProfileMode(v); }}
          sx={{
            "& .MuiToggleButton-root": {
              fontSize: "10px", fontWeight: 700, letterSpacing: "0.8px",
              px: 1.5, py: 0.4,
              border: `1px solid ${isDark ? alpha("#a855f7", 0.25) : alpha("#a855f7", 0.2)}`,
              color: isDark ? "#64748b" : "#94a3b8",
              "&.Mui-selected": {
                bgcolor: alpha("#a855f7", isDark ? 0.2 : 0.1),
                color: isDark ? "#c084fc" : "#7c3aed",
                borderColor: alpha("#a855f7", 0.4),
              },
            },
          }}
        >
          <ToggleButton value="single">SINGLE</ToggleButton>
          <ToggleButton value="ab">
            <CompareArrowsRoundedIcon sx={{ fontSize: 13, mr: 0.5 }} />A/B
          </ToggleButton>
        </ToggleButtonGroup>

        <FormControl size="small" sx={{ minWidth: 180, ...inputSx }}>
          <InputLabel>Vehicle</InputLabel>
          <Select value={filterSim} label="Vehicle" onChange={(e) => setFilterSim(e.target.value)} MenuProps={menuProps(isDark)}>
            <MenuItem value="ALL"><em>First available</em></MenuItem>
            {vehicleList.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </Select>
        </FormControl>

      </Box>

      <Box sx={{ p: 2, display: "flex", gap: 2, alignItems: "flex-start" }}>
        <Box sx={{ display: "flex", gap: 1.5, flexShrink: 0 }}>
          <WeightPanel
            isDark={isDark}
            label="PROFILE A"
            accentColor="#a855f7"
            weights={weightsA}
            activeMods={activeModsA}
            allPresets={allPresets}
            savedPresets={savedPresets}
            isAb={profileMode === "ab"}
            saveName={saveNameA}
            imbal={imbalA}
            weightSum={sumA}
            onWeightsChange={setWeightsA}
            onActiveModsChange={setActiveModsA}
            onSaveNameChange={setSaveNameA}
            onApplyPreset={(name) => applyPreset(name, setWeightsA, setActiveModsA)}
            onAutoBalance={() => autoBalance(weightsA, activeModsA, setWeightsA)}
            onSavePreset={() => { savePreset(saveNameA, weightsA, activeModsA); setSaveNameA(""); }}
            onDeletePreset={deletePreset}
          />
          {profileMode === "ab" && (
            <WeightPanel
              isDark={isDark}
              label="PROFILE B"
              accentColor="#22c55e"
              weights={weightsB}
              activeMods={activeModsB}
              allPresets={allPresets}
              savedPresets={savedPresets}
              isAb
              saveName={saveNameB}
              imbal={imbalB}
              weightSum={sumB}
              onWeightsChange={setWeightsB}
              onActiveModsChange={setActiveModsB}
              onSaveNameChange={setSaveNameB}
              onApplyPreset={(name) => applyPreset(name, setWeightsB, setActiveModsB)}
              onAutoBalance={() => autoBalance(weightsB, activeModsB, setWeightsB)}
              onSavePreset={() => { savePreset(saveNameB, weightsB, activeModsB); setSaveNameB(""); }}
              onDeletePreset={deletePreset}
            />
          )}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1.5 }}>
            <Typography sx={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1px", color: isDark ? "#64748b" : "#94a3b8" }}>
              HEALTH TRAJECTORY
            </Typography>
            <Typography sx={{ fontSize: "10px", color: isDark ? "#64748b" : "#cbd5e1" }}>
              {histSim || "no vehicle"}{history.length > 0 ? ` · ${history.length} windows` : ""}
            </Typography>
          </Box>
          <Box sx={{ height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                <XAxis
                  dataKey="ts_short"
                  tick={{ fontSize: 9, fill: axisColor }}
                  tickLine={false}
                  axisLine={{ stroke: gridStroke }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 9, fill: axisColor }}
                  tickLine={false}
                  axisLine={false}
                />
                <RcTooltip contentStyle={tipStyle} labelStyle={{ fontWeight: 700, marginBottom: 4 }} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                <Line
                  type="monotone"
                  dataKey="experimental_health"
                  name="Profile A"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                {profileMode === "ab" && (
                  <Line
                    type="monotone"
                    dataKey="profile_b_health"
                    name="Profile B"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="actual_gold"
                  name="Actual Gold"
                  stroke="#fbbf24"
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                  dot={false}
                  activeDot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}

// ── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function DataScience({ isActive = true }: { isActive?: boolean }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const { autoRefresh, toggleAutoRefresh } = useStore();
  const { enabled_modules: ALL_MODULES } = useSystemConfig();

  const [filterModule, setFilterModule] = useState<string>("ALL");
  const [filterVehicle, setFilterVehicle] = useState<string>("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerNode, setDrawerNode] = useState<string>("");

  const { data: writerData, refetch: refetchWriter } = useQuery({
    queryKey: ["ds_writerMetrics"],
    queryFn: fetchWriterMetrics,
    refetchInterval: liveInterval(3000, isActive, autoRefresh),
  });
  const { data: inferenceData, refetch: refetchInference } = useQuery({
    queryKey: ["ds_inferenceMetrics"],
    queryFn: fetchInferenceMetrics,
    refetchInterval: liveInterval(3000, isActive, autoRefresh),
  });
  const { data: goldData, refetch: refetchGold } = useQuery({
    queryKey: ["ds_goldMetrics"],
    queryFn: fetchGoldMetrics,
    refetchInterval: liveInterval(5000, isActive, autoRefresh),
  });
  const { data: observerData, refetch: refetchObserver } = useQuery({
    queryKey: ["ds_observerSnapshot"],
    queryFn: fetchObserverSnapshot,
    refetchInterval: liveInterval(3000, isActive, autoRefresh),
  });

  useRefetchOnActivate(isActive, [refetchWriter, refetchInference, refetchGold, refetchObserver]);

  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [ageSec, setAgeSec] = useState(0);

  useEffect(() => {
    if (writerData || inferenceData || goldData || observerData) {
      setLastUpdatedAt(Date.now());
      setAgeSec(0);
    }
  }, [writerData, inferenceData, goldData, observerData]);

  useEffect(() => {
    if (!lastUpdatedAt) return;
    const id = setInterval(() => setAgeSec(Math.round((Date.now() - lastUpdatedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [lastUpdatedAt]);

  const writerRows = useMemo(
    () => (writerData ? (Object.values(writerData) as any[]) : []),
    [writerData]
  );
  const activeWriters = writerRows.filter((r) => r.status === "RUNNING").length;
  const totalWriters = writerRows.length;
  const totalThroughput = writerRows.reduce((acc, r) => acc + (parseFloat(r.throughput) || 0), 0);
  const avgLatencyMs =
    totalWriters > 0
      ? writerRows.reduce((acc, r) => acc + (r.latency_ms || 0), 0) / totalWriters
      : 0;

  const activeModules: number = inferenceData?.active_modules ?? 0;
  const totalInferences = useMemo(() => {
    if (!inferenceData?.module_stats) return 0;
    return (Object.values(inferenceData.module_stats) as any[]).reduce(
      (acc, s) => acc + (s.rows_5m ?? 0), 0
    );
  }, [inferenceData]);
  const globalE2E: number = inferenceData?.global_e2e_ms ?? 0;

  const fleetHealth: number | null = goldData?.fleet_vehicle_health_pct ?? null;
  const totalGoldRows: number = goldData?.total_gold_rows ?? 0;
  const globalLag: number = goldData?.global_max_lag ?? 0;
  const vehicleList: string[] = useMemo(() => goldData?.active_sims ?? [], [goldData]);

  const dlqBacklog: number = observerData?.global_stats?.dlq_backlog ?? 0;
  const activeVehicles: number = observerData?.global_stats?.active_vehicles ?? vehicleList.length;

  const bronzeHealth: HealthState =
    totalWriters === 0 ? "idle"
    : activeWriters === totalWriters ? "ok"
    : activeWriters > totalWriters / 2 ? "warn" : "crit";

  const silverHealth: HealthState =
    activeModules >= 5 ? "ok" : activeModules >= 3 ? "warn" : activeModules > 0 ? "crit" : "idle";

  const goldHealth: HealthState =
    fleetHealth === null ? "idle"
    : fleetHealth >= 75 ? "ok" : fleetHealth >= 50 ? "warn" : "crit";

  const vehiclesHealth: HealthState = activeVehicles > 0 ? "ok" : "idle";

  const vehicleRows: any[] = observerData?.vehicles ?? [];
  const nominalVehicles = vehicleRows.filter((v: any) => (v.validation_rate ?? 0) > 95).length;
  const degradedVehicles = vehicleRows.filter((v: any) => { const vr = v.validation_rate ?? 0; return vr >= 80 && vr <= 95; }).length;
  const criticalVehicles = vehicleRows.filter((v: any) => (v.validation_rate ?? 0) < 80).length;
  const totalRowsProcessed: number = vehicleRows.reduce((s: number, v: any) => s + (v.rows_processed ?? 0), 0);
  const avgQualityPct: number | null = vehicleRows.length > 0
    ? vehicleRows.reduce((s: number, v: any) => s + (v.validation_rate ?? 0), 0) / vehicleRows.length
    : null;

  const writerKafkaTotal: number = writerRows.reduce((s: number, r: any) => s + (r.kafka_total ?? 0), 0);
  const writerDeltaTotal: number = writerRows.reduce((s: number, r: any) => s + (r.delta_total ?? 0), 0);
  const writerQualityPct: number | null = writerKafkaTotal > 0
    ? Math.min(100, (writerDeltaTotal / writerKafkaTotal) * 100)
    : null;
  const effectiveRowsIn: number = totalRowsProcessed > 0 ? totalRowsProcessed : writerKafkaTotal;
  const effectiveQuality: number | null = avgQualityPct ?? writerQualityPct;
  const effectiveFleetSize: number = vehicleList.length || (observerData?.global_stats?.active_vehicles ?? 0);

  const maxWriterLag = writerRows.length > 0
    ? Math.max(0, ...writerRows.map((w: any) => w.true_lag ?? 0))
    : 0;
  const stalledWriters = totalWriters - activeWriters;

  const moduleStatsAll: Record<string, any> = inferenceData?.module_stats ?? {};
  const activeModuleKeys = ALL_MODULES.filter((m) => (moduleStatsAll[m]?.rows_5m ?? 0) > 0);
  const avgInfLatency = activeModuleKeys.length > 0
    ? activeModuleKeys.reduce((s, m) => s + (moduleStatsAll[m]?.inf_latency ?? 0), 0) / activeModuleKeys.length
    : 0;

  const openDrawer = (id: string) => { setDrawerNode(id); setDrawerOpen(true); };

  const pageBg = isDark
    ? "linear-gradient(145deg, #06111d 0%, #0b1724 52%, #0d1b2a 100%)"
    : "linear-gradient(145deg, #f8fafc 0%, #eef6ff 52%, #f7fbff 100%)";

  const inputSx = iSx(isDark);

  const pills = [
    { label: "BRONZE", value: totalWriters === 0 ? "—" : `${activeWriters}/${totalWriters} writers`, health: bronzeHealth, icon: <StorageRoundedIcon sx={{ fontSize: 12 }} /> },
    { label: "SILVER", value: `${activeModules} modules`, health: silverHealth, icon: <PsychologyRoundedIcon sx={{ fontSize: 12 }} /> },
    { label: "GOLD", value: fleetHealth !== null ? `${fleetHealth.toFixed(0)}% health` : "—", health: goldHealth, icon: <MonitorHeartRoundedIcon sx={{ fontSize: 12 }} /> },
  ];

  return (
    <Box sx={{ minHeight: "100vh", background: pageBg }}>
      <style>{`
        @keyframes ds-pulse {
          0%,100% { opacity:1; } 50% { opacity:0.35; }
        }
        @keyframes ds-pulse-card {
          0%,100% { box-shadow:0 0 0 0 rgba(239,68,68,0); }
          50%      { box-shadow:0 0 0 5px rgba(239,68,68,0.12); }
        }
        @keyframes ds-flow-h {
          from { stroke-dashoffset:16; } to { stroke-dashoffset:0; }
        }
        @keyframes ds-flow-dlq {
          from { stroke-dashoffset:16; } to { stroke-dashoffset:0; }
        }
      `}</style>

      {/* ── CONTEXT BAR ── */}
      <Box sx={{
        position: "sticky", top: 0, zIndex: 100,
        borderBottom: `1px solid ${isDark ? alpha("#7dd3fc", 0.1) : theme.palette.divider}`,
        bgcolor: isDark ? alpha("#06111d", 0.96) : alpha("#f8fafc", 0.97),
        backdropFilter: "blur(10px)",
        px: 2, py: 0.75,
        display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap",
      }}>
        <Typography sx={{ fontWeight: 800, fontSize: "11px", letterSpacing: "2px", color: isDark ? "#7dd3fc" : "#005071", whiteSpace: "nowrap" }}>
          DS PIPELINE
        </Typography>
        <Divider orientation="vertical" flexItem sx={{ borderColor: isDark ? alpha("#7dd3fc", 0.15) : alpha("#94a3b8", 0.3) }} />
        <FormControl size="small" sx={{ minWidth: 150, ...inputSx }}>
          <InputLabel>Module</InputLabel>
          <Select value={filterModule} label="Module" onChange={(e) => setFilterModule(e.target.value)} MenuProps={menuProps(isDark)}>
            <MenuItem value="ALL"><em>ALL</em></MenuItem>
            {ALL_MODULES.map((m) => <MenuItem key={m} value={m}>{m.toUpperCase()}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160, ...inputSx }}>
          <InputLabel>Vehicle</InputLabel>
          <Select value={filterVehicle} label="Vehicle" onChange={(e) => setFilterVehicle(e.target.value)} MenuProps={menuProps(isDark)}>
            <MenuItem value="ALL"><em>ALL</em></MenuItem>
            {vehicleList.map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </Select>
        </FormControl>
        <Tooltip title={autoRefresh ? "Pause live refresh" : "Resume live refresh"}>
          <IconButton size="small" onClick={toggleAutoRefresh} sx={{
            color: autoRefresh ? (isDark ? "#4ade80" : "#16a34a") : (isDark ? "#64748b" : "#94a3b8"),
            bgcolor: autoRefresh ? alpha("#22c55e", 0.1) : "transparent",
            borderRadius: 1, p: 0.5,
            border: `1px solid ${autoRefresh ? alpha("#22c55e", 0.25) : isDark ? alpha("#64748b", 0.2) : alpha("#94a3b8", 0.2)}`,
          }}>
            {autoRefresh ? <SyncIcon sx={{ fontSize: 16 }} /> : <SyncDisabledIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        {lastUpdatedAt !== null && (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{
              width: 6, height: 6, borderRadius: "50%",
              bgcolor: ageSec > 10 ? "#ef4444" : "#22c55e",
              animation: ageSec <= 10 ? "ds-pulse 2.4s ease-in-out infinite" : "none",
            }} />
            <Typography sx={{
              fontSize: "9px", fontWeight: 600, fontVariantNumeric: "tabular-nums",
              color: ageSec > 10 ? (isDark ? "#f87171" : "#dc2626") : (isDark ? "#4ade80" : "#16a34a"),
            }}>
              {ageSec === 0 ? "just now" : `${ageSec}s ago`}
            </Typography>
          </Box>
        )}
        <Divider orientation="vertical" flexItem sx={{ borderColor: isDark ? alpha("#7dd3fc", 0.1) : alpha("#94a3b8", 0.2) }} />
        {pills.map((pill) => {
          const c = pillColors(pill.health, isDark);
          return (
            <Box key={pill.label} sx={{
              display: "flex", alignItems: "center", gap: 0.75,
              px: 1.25, py: 0.5, borderRadius: "6px",
              border: `1px solid ${alpha(c.dot, 0.3)}`,
              bgcolor: alpha(c.dot, isDark ? 0.1 : 0.06),
            }}>
              <Box sx={{ color: c.dot, display: "flex", alignItems: "center" }}>{pill.icon}</Box>
              <Typography sx={{ fontSize: "10px", fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", letterSpacing: "0.6px" }}>
                {pill.label}
              </Typography>
              <Box sx={{
                width: 7, height: 7, borderRadius: "50%", bgcolor: c.dot, flexShrink: 0,
                animation: pill.health === "ok" ? "ds-pulse 2.4s ease-in-out infinite" : "none",
              }} />
              <Typography sx={{ fontSize: "10px", fontWeight: 600, color: c.text }}>
                {pill.value}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* ── PAGE BODY ── */}
      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>

        {/* SECTION 1: PIPELINE FLOW */}
        <Paper elevation={0} sx={{
          borderRadius: 0, overflow: "hidden",
          border: `1px solid ${isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.08)}`,
        }}>
          <Box sx={{
            px: 2, py: 1,
            borderBottom: `1px solid ${isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.06)}`,
            display: "flex", alignItems: "center", gap: 1,
          }}>
            <AccountTreeRoundedIcon sx={{ fontSize: 14, color: isDark ? "#7dd3fc" : "#005071" }} />
            <Typography sx={{ fontSize: "10px", fontWeight: 700, letterSpacing: "1.5px", color: isDark ? "text.primary" : "#005071" }}>
              PIPELINE FLOW
            </Typography>
            <Typography sx={{ fontSize: "9px", color: isDark ? "#64748b" : "#94a3b8", ml: 0.5 }}>
              — click any node to inspect layer data
            </Typography>
          </Box>

          <Box sx={{ p: 2 }}>
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 56px 1fr 56px 1fr 56px 1fr 56px 1fr" }}>
              {/* ROW 1 */}
              <NodeCard id="vehicles" name="VEHICLES" icon={<DirectionsCarRoundedIcon />}
                accent="#22c55e"
                healthPct={avgQualityPct ?? (activeVehicles > 0 ? 100 : 0)}
                health={vehiclesHealth}
                primaryValue={String(activeVehicles || vehicleList.length || "—")}
                primaryLabel="active feeds"
                tag={
                  vehicleRows.length === 0 ? undefined
                  : criticalVehicles > 0 ? { label: `${criticalVehicles} CRITICAL`, color: "#ef4444" }
                  : degradedVehicles > 0 ? { label: `${degradedVehicles} WARN`, color: "#eab308" }
                  : { label: "ALL OK", color: "#22c55e" }
                }
                metrics={[
                  { label: "AVG QUALITY",
                    value: effectiveQuality !== null ? `${effectiveQuality.toFixed(1)}%` : "—",
                    color: effectiveQuality !== null ? (effectiveQuality > 95 ? "#22c55e" : effectiveQuality > 80 ? "#eab308" : "#ef4444") : undefined },
                  { label: "ROWS IN", value: effectiveRowsIn > 0 ? fmt(effectiveRowsIn) : "—" },
                  { label: "FLEET SIZE", value: `${effectiveFleetSize}` },
                ]}
                isDark={isDark} onClick={openDrawer} />

              <HConnector topLabel="raw telemetry" btmLabel={activeVehicles > 0 ? `${activeVehicles} streams` : "no feeds"} isDark={isDark} />

              <NodeCard id="bronze" name="BRONZE WRITERS" icon={<StorageRoundedIcon />}
                accent="#f59e0b"
                healthPct={totalWriters > 0 ? (activeWriters / totalWriters) * 100 : 0}
                health={bronzeHealth}
                primaryValue={totalWriters > 0 ? `${activeWriters}/${totalWriters}` : "—"}
                primaryLabel="writers active"
                tag={
                  totalWriters === 0 ? undefined
                  : stalledWriters > 0 ? { label: `${stalledWriters} STALLED`, color: "#ef4444" }
                  : { label: "ALL RUNNING", color: "#22c55e" }
                }
                metrics={[
                  { label: "THROUGHPUT", value: totalWriters > 0 ? (totalThroughput > 0 ? `${fmt(totalThroughput)}/m` : "0/m") : "—" },
                  { label: "AVG LAT", value: avgLatencyMs > 0 ? `${avgLatencyMs.toFixed(0)}ms` : "—" },
                  { label: "PEAK LAG",
                    value: totalWriters > 0 ? (maxWriterLag > 0 ? `${fmt(maxWriterLag)}ms` : "0ms") : "—",
                    color: maxWriterLag > 1000 ? "#ef4444" : maxWriterLag > 300 ? "#eab308" : undefined },
                ]}
                isDark={isDark} onClick={openDrawer} />

              <HConnector
                topLabel="bronze rows"
                btmLabel={totalWriters > 0 ? (totalThroughput > 0 ? `${fmt(totalThroughput)}/m` : "0/m") : "—"}
                isDark={isDark} />

              <NodeCard id="silver" name="SILVER ML" icon={<PsychologyRoundedIcon />}
                accent="#38bdf8"
                healthPct={(activeModules / 5) * 100}
                health={silverHealth}
                primaryValue={totalWriters > 0 || activeModules > 0 ? `${activeModules}/5` : "—"}
                primaryLabel="modules active"
                tag={
                  activeModules === 5 ? { label: "FULL CAPACITY", color: "#22c55e" }
                  : activeModules > 0 ? { label: `${5 - activeModules} IDLE`, color: "#eab308" }
                  : activeModules === 0 && totalWriters > 0 ? { label: "OFFLINE", color: "#ef4444" }
                  : undefined
                }
                metrics={[
                  { label: "INF/5M", value: totalInferences > 0 ? fmt(totalInferences) : "—" },
                  { label: "INF LAT", value: avgInfLatency > 0 ? `${avgInfLatency.toFixed(0)}ms` : "—" },
                  { label: "E2E LAT", value: globalE2E > 0 ? `${fmt(globalE2E)}ms` : "—" },
                ]}
                isDark={isDark} onClick={openDrawer} />

              <HConnector
                topLabel="inferences"
                btmLabel={totalInferences > 0 ? `${fmt(totalInferences)}/5m` : "—"}
                isDark={isDark} />

              <NodeCard id="gold" name="GOLD FUSION" icon={<MonitorHeartRoundedIcon />}
                accent="#fbbf24"
                healthPct={fleetHealth ?? 0}
                health={goldHealth}
                primaryValue={totalGoldRows > 0 ? fmt(totalGoldRows) : "—"}
                primaryLabel="gold rows fused"
                metrics={[
                  { label: "FLEET HEALTH",
                    value: fleetHealth !== null ? `${fleetHealth.toFixed(0)}%` : "—",
                    color: fleetHealth !== null ? (fleetHealth >= 75 ? "#22c55e" : fleetHealth >= 50 ? "#eab308" : "#ef4444") : undefined },
                  { label: "PIPELINE LAG",
                    value: goldData != null ? (globalLag > 0 ? `${fmt(globalLag)}ms` : "0ms") : "—",
                    color: globalLag > 2000 ? "#ef4444" : globalLag > 500 ? "#eab308" : undefined },
                  { label: "VEHICLES", value: `${vehicleList.length}` },
                ]}
                isDark={isDark} onClick={openDrawer} />

              <HConnector
                topLabel="health scores"
                btmLabel={fleetHealth !== null ? `${fleetHealth.toFixed(0)}% avg` : "—"}
                isDark={isDark} />

              <NodeCard id="fleet" name="FLEET HEALTH" icon={<HealthAndSafetyRoundedIcon />}
                accent="#a855f7"
                healthPct={fleetHealth ?? 0}
                health={goldHealth}
                primaryValue={fleetHealth !== null ? `${fleetHealth.toFixed(0)}%` : "—"}
                primaryLabel="fleet avg health"
                metrics={[
                  { label: "NOMINAL", value: vehicleRows.length > 0 ? String(nominalVehicles) : "—", color: nominalVehicles > 0 ? "#22c55e" : undefined },
                  { label: "DEGRADED", value: vehicleRows.length > 0 ? String(degradedVehicles) : "—", color: degradedVehicles > 0 ? "#eab308" : undefined },
                  { label: "CRITICAL", value: vehicleRows.length > 0 ? String(criticalVehicles) : "—", color: criticalVehicles > 0 ? "#ef4444" : undefined },
                ]}
                isDark={isDark} onClick={openDrawer} />

              {/* ROW 2: DLQ branch aligned under Bronze (col 3) */}
              <Box /><Box />
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <DlqBranch dlqCount={dlqBacklog} isDark={isDark} onInspect={() => openDrawer("dlq")} />
              </Box>
              <Box /><Box /><Box /><Box /><Box /><Box />
            </Box>
          </Box>
        </Paper>

        {/* FLEET INTELLIGENCE */}
        <FleetIntelligenceSection
          isDark={isDark}
          writerData={writerData}
          inferenceData={inferenceData}
          goldData={goldData}
          observerData={observerData}
        />

        {/* PIPELINE OBSERVABILITY */}
        <PipelineObservabilitySection
          isDark={isDark}
          writerData={writerData}
          inferenceData={inferenceData}
          observerData={observerData}
        />

        {/* DEGRADATION DRIVERS */}
        <DegradationDriversSection isDark={isDark} vehicleList={vehicleList} isActive={isActive} />

        {/* PHASE 6: WEIGHT LAB */}
        <WeightLabSection isDark={isDark} vehicleList={vehicleList} isActive={isActive} />
      </Box>

      <InspectorDrawer
        open={drawerOpen}
        nodeId={drawerNode}
        isDark={isDark}
        onClose={() => setDrawerOpen(false)}
        isActive={isActive}
        observerData={observerData}
        goldData={goldData}
        vehicleList={vehicleList}
        dlqBacklog={dlqBacklog}
      />
    </Box>
  );
}
