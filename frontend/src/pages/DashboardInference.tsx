import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Button,
  Grid,
  Stack,
  Tooltip,
  IconButton,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, ClientSideRowModelModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useStore } from "../store";
import { useChartTheme } from "../hooks/useChartTheme";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const CHART_FONT = '"Inter", "Segoe UI", Roboto, Arial, sans-serif';

const fetchInferenceMetrics = async () => {
  const { data } = await axios.get("http://127.0.0.1:8005/api/inference/metrics");
  return data;
};

const fetchInferenceTail = async (module: string) => {
  const { data } = await axios.get(`http://127.0.0.1:8005/api/inference/tail/${module}`);
  return data.data;
};

// ── Inline design-system components ──────────────────────────────────────────

const Card = ({ children, sx }: { children: React.ReactNode; sx?: object }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: isDark ? alpha("#0b1724", 0.9) : "#ffffff",
        border: `1px solid ${isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)}`,
        boxShadow: isDark
          ? `0 18px 42px ${alpha("#000", 0.22)}`
          : `0 12px 30px ${alpha("#334155", 0.08)}`,
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
};

const SectionTitle = ({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 1,
      mb: 1,
    }}
  >
    <Typography sx={{ fontSize: "12px", fontWeight: 800 }}>{title}</Typography>
    {action}
  </Box>
);

const MetricTile = ({
  label,
  value,
  icon,
  color,
  delta,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  delta?: string;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 1.5,
        border: `1px solid ${alpha(color, isDark ? 0.22 : 0.18)}`,
        bgcolor: alpha(color, isDark ? 0.07 : 0.05),
        display: "flex",
        flexDirection: "column",
        gap: 0.35,
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          width: "3px",
          height: "100%",
          bgcolor: color,
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <Typography
          sx={{
            fontSize: "16px",
            fontWeight: 800,
            lineHeight: 1,
            pl: 0.5,
            color: isDark ? "#f1f5f9" : "#0f172a",
          }}
        >
          {value}
        </Typography>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: "6px",
            bgcolor: alpha(color, isDark ? 0.2 : 0.12),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      </Box>
      <Typography
        sx={{
          fontSize: "10px",
          fontWeight: 600,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          pl: 0.5,
          lineHeight: 1,
        }}
      >
        {label}
      </Typography>
      {delta && (
        <Typography
          sx={{ fontSize: "9px", color, fontWeight: 700, pl: 0.5, lineHeight: 1 }}
        >
          {delta}
        </Typography>
      )}
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardInference({
  isActive = true,
}: {
  isActive?: boolean;
}) {
  const { autoRefresh } = useStore();
  const wasActiveRef = useRef(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const ct = useChartTheme();

  const [viewMode, setViewMode] = useState<"metrics" | "inspector">("metrics");
  const [selectedModule, setSelectedModule] = useState<string>("engine");
  const [filterSim, setFilterSim] = useState<string>("ALL");

  const {
    data: metricsData,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["inferenceMetrics"],
    queryFn: fetchInferenceMetrics,
    refetchInterval:
      isActive && viewMode === "metrics" && autoRefresh ? 3000 : false,
  });

  useEffect(() => {
    if (isActive && !wasActiveRef.current) refetchMetrics();
    wasActiveRef.current = isActive;
  }, [isActive]);

  const {
    data: inspectorData,
    isLoading: inspectorLoading,
    refetch: refetchInspector,
  } = useQuery({
    queryKey: ["inferenceTail", selectedModule],
    queryFn: () => fetchInferenceTail(selectedModule),
    enabled: isActive && viewMode === "inspector",
    staleTime: 60000,
  });

  const metricsRowData = useMemo(() => {
    if (!metricsData?.module_stats) return [];
    return Object.entries(metricsData.module_stats).map(
      ([moduleName, stats]: [string, any]) => ({
        module: moduleName,
        e2e_latency: stats.e2e_latency,
        inf_latency: stats.inf_latency,
        rows_5m: stats.rows_5m,
      })
    );
  }, [metricsData]);

  const metricsColumnDefs = useMemo<ColDef[]>(
    () => [
      {
        field: "module",
        headerName: "ML SUBSYSTEM",
        sortable: true,
        filter: true,
        flex: 1,
        minWidth: 150,
      },
      {
        field: "e2e_latency",
        headerName: "E2E LATENCY (ms)",
        flex: 1,
        minWidth: 160,
        type: "numericColumn",
        cellStyle: (params: any): any =>
          params.value > 50000
            ? {
                color: theme.palette.error.main,
                fontWeight: "bold",
                backgroundColor: isDark ? "rgba(239,68,68,0.18)" : "#fee2e2",
              }
            : { color: theme.palette.success.main },
        valueFormatter: (p) => p.value?.toLocaleString(),
      },
      {
        field: "inf_latency",
        headerName: "INFERENCE LATENCY (ms)",
        flex: 1,
        minWidth: 180,
        type: "numericColumn",
        valueFormatter: (p) => p.value?.toLocaleString(),
      },
      {
        field: "rows_5m",
        headerName: "INFERENCES (LAST 5M)",
        flex: 1,
        minWidth: 180,
        type: "numericColumn",
        valueFormatter: (p) => p.value?.toLocaleString(),
      },
    ],
    [theme, isDark]
  );

  const availableSims = useMemo<string[]>(() => {
    if (!inspectorData?.length) return [];
    const sims = new Set<string>();
    inspectorData.forEach((row: any) => {
      if (row.source_id) sims.add(row.source_id);
    });
    return Array.from(sims).sort();
  }, [inspectorData]);

  const filteredInspectorData = useMemo(() => {
    if (!inspectorData) return [];
    return filterSim === "ALL"
      ? inspectorData
      : inspectorData.filter((r: any) => r.source_id === filterSim);
  }, [inspectorData, filterSim]);

  const inspectorColumnDefs = useMemo<ColDef[]>(() => {
    if (!inspectorData?.length) return [];
    return Object.keys(inspectorData[0]).map((key) => {
      const colDef: ColDef = {
        field: key,
        headerName: key.toUpperCase(),
        sortable: true,
        filter: true,
        width:
          key.includes("ts") || key.includes("hash") || key === "top_features"
            ? 240
            : 130,
      };

      if (key === "severity") {
        colDef.cellRenderer = (params: any) => {
          const color =
            params.value === "NORMAL"
              ? "#22c55e"
              : params.value === "WARNING"
              ? "#f59e0b"
              : "#ef4444";
          return (
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 0.8,
                py: "2px",
                borderRadius: 1,
                bgcolor: alpha(color, isDark ? 0.18 : 0.1),
                border: `1px solid ${alpha(color, 0.25)}`,
              }}
            >
              <Box
                sx={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  bgcolor: color,
                  flexShrink: 0,
                }}
              />
              <Typography
                sx={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                {params.value || "UNKNOWN"}
              </Typography>
            </Box>
          );
        };
      }

      if (key === "top_features") {
        colDef.valueFormatter = (params: any) => {
          if (!params.value) return "";
          try {
            return Object.keys(JSON.parse(params.value)).join(", ");
          } catch {
            return params.value;
          }
        };
      }

      if (key === "health_score") {
        colDef.valueFormatter = (params: any) =>
          params.value ? parseFloat(params.value).toFixed(2) + "%" : "";
      }

      return colDef;
    });
  }, [inspectorData, isDark]);

  const throughputChartData = useMemo(() => {
    if (!metricsData?.module_stats) return [];
    return Object.entries(metricsData.module_stats).map(
      ([mod, stats]: [string, any]) => ({
        module: mod,
        rows: stats.rows_5m ?? 0,
        e2e: stats.e2e_latency ?? 0,
        inf: stats.inf_latency ?? 0,
      })
    );
  }, [metricsData]);

  const agTheme = isDark ? "ag-theme-balham-dark" : "ag-theme-balham";

  const agGridContainerSx: object = {
    "--ag-background-color": "transparent",
    "--ag-odd-row-background-color": isDark ? alpha("#7dd3fc", 0.04) : "#f8fafc",
    "--ag-row-hover-color": isDark ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05),
    "--ag-selected-row-background-color": isDark
      ? alpha("#3b82f6", 0.22)
      : alpha("#3b82f6", 0.1),
    "--ag-foreground-color": isDark ? "#e2e8f0" : "#0f172a",
    "--ag-data-color": isDark ? "#e2e8f0" : "#1f2937",
    "--ag-secondary-foreground-color": isDark ? "#94a3b8" : "#64748b",
    "--ag-border-color": isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1),
    "--ag-row-border-color": isDark
      ? alpha("#7dd3fc", 0.07)
      : alpha("#1f2937", 0.07),
    "--ag-input-focus-border-color": isDark
      ? alpha("#7dd3fc", 0.5)
      : alpha("#3b82f6", 0.5),
    "& .ag-header": {
      backgroundColor: `${isDark ? "#0d2137" : "#1e3a5f"} !important`,
    },
    "& .ag-header-cell": {
      backgroundColor: `${isDark ? "#0d2137" : "#1e3a5f"} !important`,
      color: "#fff !important",
      fontSize: "11px !important",
      fontWeight: "700 !important",
      letterSpacing: "0.04em !important",
    },
    "& .ag-header-cell-label": { color: "#fff !important" },
    "& .ag-icon": { color: "#fff !important" },
    "& .ag-header-icon": { color: "#fff !important" },
    "& .ag-sort-ascending-icon": { color: "#fff !important" },
    "& .ag-sort-descending-icon": { color: "#fff !important" },
    "& .ag-sort-none-icon": { color: "#fff !important" },
    "& .ag-cell": { fontSize: "10px !important" },
    "& .ag-row": {
      fontSize: "10px !important",
      borderColor: `${
        isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.08)
      } !important`,
    },
    "& .ag-root-wrapper": { borderRadius: "6px", border: "none !important" },
    "& .ag-root-wrapper-body": { borderRadius: "6px" },
  };

  const selectSx = {
    borderRadius: 1,
    fontSize: "10px",
    height: 28,
    bgcolor: isDark ? alpha("#0b1724", 0.6) : "#ffffff",
    "& .MuiSelect-select": { fontSize: "10px", py: 0.5 },
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.18),
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: isDark ? alpha("#7dd3fc", 0.4) : alpha("#1f2937", 0.35),
    },
  };

  const menuPropsSx = {
    PaperProps: {
      sx: {
        borderRadius: 1.5,
        bgcolor: isDark ? "#0f1e2e" : "#ffffff",
        border: `1px solid ${
          isDark ? alpha("#7dd3fc", 0.14) : alpha("#1f2937", 0.1)
        }`,
        "& .MuiMenuItem-root": {
          fontSize: "10px",
          minHeight: 28,
          "&:hover": {
            bgcolor: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.08),
          },
        },
      },
    },
  };

  const chartAxisStyle = {
    fontSize: "10px",
    fill: ct.axisColor,
    fontFamily: CHART_FONT,
  };

  const tooltipStyle = {
    borderRadius: 4,
    fontSize: "11px",
    padding: "6px 10px",
    backgroundColor: isDark ? "#0f1e2e" : "#ffffff",
    border: `1px solid ${
      isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.12)
    }`,
    color: isDark ? "#e2e8f0" : "#1f2937",
    boxShadow: isDark
      ? `0 8px 24px ${alpha("#000", 0.4)}`
      : `0 4px 16px ${alpha("#334155", 0.12)}`,
  };

  const e2eDelay = metricsData?.global_e2e_ms || 0;
  const isHighLatency = e2eDelay > 50000;

  return (
    <Box
      sx={{
        height: "calc(100vh - 64px)",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 1,
        background: isDark
          ? "linear-gradient(145deg, #06111d 0%, #0b1724 52%, #0d1b2a 100%)"
          : "linear-gradient(145deg, #f8fafc 0%, #eef6ff 52%, #f7fbff 100%)",
      }}
    >
      {/* Page Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
          borderBottom: `1px solid ${
            isDark ? alpha("#7dd3fc", 0.12) : alpha("#1f2937", 0.1)
          }`,
        }}
      >
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: "16px",
            letterSpacing: "-0.3px",
            background: isDark
              ? "linear-gradient(135deg, #e2e8f0, #7dd3fc)"
              : "linear-gradient(135deg, #0f172a, #1e40af)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          ML ENGINE & SILVER LAYER PIPELINE
        </Typography>

        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_e, val) => val && setViewMode(val)}
          size="small"
          sx={{
            bgcolor: isDark ? alpha("#020c16", 0.7) : alpha("#dde6ef", 0.6),
            borderRadius: "10px",
            border: `1px solid ${
              isDark ? alpha("#7dd3fc", 0.08) : alpha("#94a3b8", 0.2)
            }`,
            p: "3px",
            "& .MuiToggleButtonGroup-grouped": {
              border: "none !important",
              borderRadius: "7px !important",
            },
            "& .MuiToggleButton-root": {
              py: "5px",
              px: "14px",
              fontSize: "10px",
              fontWeight: 600,
              lineHeight: 1,
              textTransform: "none",
              letterSpacing: "0.015em",
              whiteSpace: "nowrap",
              color: isDark ? alpha("#94a3b8", 0.8) : "#64748b",
              transition: "background-color 0.15s, color 0.15s, box-shadow 0.15s",
              "&.Mui-selected": {
                color: isDark ? "#f1f5f9" : "#0f172a",
                fontWeight: 700,
                bgcolor: isDark ? "#0d2137" : "#ffffff",
                boxShadow: isDark
                  ? `0 1px 4px ${alpha("#000", 0.45)}, 0 0 0 1px ${alpha(
                      "#7dd3fc",
                      0.06
                    )}`
                  : `0 1px 3px ${alpha("#334155", 0.16)}, 0 1px 2px ${alpha(
                      "#334155",
                      0.1
                    )}`,
              },
              "&:hover:not(.Mui-selected)": {
                bgcolor: isDark
                  ? alpha("#7dd3fc", 0.05)
                  : alpha("#94a3b8", 0.12),
                color: isDark ? "#cbd5e1" : "#374151",
              },
            },
          }}
        >
          <ToggleButton value="metrics">System Latency Metrics</ToggleButton>
          <ToggleButton value="inspector">Silver Data Inspector</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* ── METRICS TAB ── */}
      {viewMode === "metrics" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            gap: 1,
          }}
        >
          <Grid container spacing={1} sx={{ flexShrink: 0 }}>
            {/* KPI Tiles */}
            <Grid item xs={12} md={3}>
              <Card
                sx={{
                  p: 1.25,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <SectionTitle title="Pipeline Overview" />
                <Box
                  sx={{
                    flex: 1,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gridTemplateRows: "1fr 1fr",
                    gap: 1,
                  }}
                >
                  <MetricTile
                    label="Active Simulations"
                    value={metricsData?.active_sims || 0}
                    color="#3b82f6"
                    icon={<DirectionsCarOutlinedIcon sx={{ fontSize: 14 }} />}
                  />
                  <MetricTile
                    label="Active ML Modules"
                    value={`${metricsData?.active_modules || 0} / 5`}
                    color="#8b5cf6"
                    icon={<StorageOutlinedIcon sx={{ fontSize: 14 }} />}
                    delta={
                      (metricsData?.active_modules || 0) === 5
                        ? "All operational"
                        : `${5 - (metricsData?.active_modules || 0)} inactive`
                    }
                  />
                  <MetricTile
                    label="Global E2E Delay"
                    value={`${e2eDelay.toLocaleString()} ms`}
                    color={isHighLatency ? "#ef4444" : "#22c55e"}
                    icon={<TimerOutlinedIcon sx={{ fontSize: 14 }} />}
                    delta={isHighLatency ? "High — check pipeline" : "Nominal"}
                  />
                  <MetricTile
                    label="Global Inference Delay"
                    value={`${(
                      metricsData?.global_inf_ms || 0
                    ).toLocaleString()} ms`}
                    color="#f59e0b"
                    icon={<SpeedOutlinedIcon sx={{ fontSize: 14 }} />}
                  />
                </Box>
              </Card>
            </Grid>

            {/* Subsystem Latency Table */}
            <Grid item xs={12} md={9}>
              <Card sx={{ p: 1, display: "flex", flexDirection: "column" }}>
                <SectionTitle
                  title="Subsystem Latency Profile"
                  action={
                    <Tooltip title="Refresh metrics">
                      <IconButton
                        size="small"
                        onClick={() => refetchMetrics()}
                        disabled={metricsLoading}
                        sx={{ p: 0.4 }}
                      >
                        <RestartAltOutlinedIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  }
                />
                <Box className={agTheme} sx={agGridContainerSx}>
                  <AgGridReact
                    rowData={metricsRowData}
                    columnDefs={metricsColumnDefs}
                    domLayout="autoHeight"
                    animateRows={false}
                    rowSelection="single"
                    defaultColDef={{ resizable: true, sortable: true }}
                    overlayLoadingTemplate={
                      metricsLoading
                        ? '<span class="ag-overlay-loading-center">Fetching ML Telemetry…</span>'
                        : undefined
                    }
                    overlayNoRowsTemplate={
                      metricsError
                        ? '<span class="ag-overlay-loading-center">Backend unreachable</span>'
                        : '<span class="ag-overlay-loading-center">No data</span>'
                    }
                  />
                </Box>
              </Card>
            </Grid>
          </Grid>

          {/* Charts Row */}
          <Grid container spacing={1} sx={{ flex: 1, minHeight: 0 }}>
            <Grid item xs={12} md={6} sx={{ display: "flex" }}>
              <Card
                sx={{
                  p: 1.25,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <SectionTitle title="E2E vs Inference Latency (ms)" />
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={metricsRowData}
                      margin={{ top: 6, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={ct.gridColor}
                      />
                      <XAxis
                        dataKey="module"
                        tick={chartAxisStyle}
                        axisLine={{ stroke: ct.tableBorder }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={chartAxisStyle}
                        axisLine={{ stroke: ct.tableBorder }}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        cursor={{
                          fill: isDark
                            ? alpha("#7dd3fc", 0.08)
                            : alpha("#3b82f6", 0.06),
                        }}
                        contentStyle={tooltipStyle}
                      />
                      <Legend
                        wrapperStyle={{
                          fontSize: "10px",
                          fontFamily: CHART_FONT,
                        }}
                      />
                      <Bar
                        dataKey="e2e_latency"
                        name="Total E2E"
                        fill="#ef4444"
                        radius={[3, 3, 0, 0]}
                        barSize={22}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="inf_latency"
                        name="Inference Compute"
                        fill={isDark ? "#3b82f6" : "#2563eb"}
                        radius={[3, 3, 0, 0]}
                        barSize={22}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} sx={{ display: "flex" }}>
              <Card
                sx={{
                  p: 1.25,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <SectionTitle title="Module Throughput — Rows Processed (Last 5m)" />
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={throughputChartData}
                      margin={{ top: 6, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={ct.gridColor}
                      />
                      <XAxis
                        dataKey="module"
                        tick={chartAxisStyle}
                        axisLine={{ stroke: ct.tableBorder }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={chartAxisStyle}
                        axisLine={{ stroke: ct.tableBorder }}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        cursor={{
                          fill: isDark
                            ? alpha("#7dd3fc", 0.08)
                            : alpha("#3b82f6", 0.06),
                        }}
                        contentStyle={tooltipStyle}
                      />
                      <Bar
                        dataKey="rows"
                        name="Rows Processed"
                        fill={isDark ? "#22c55e" : "#16a34a"}
                        radius={[3, 3, 0, 0]}
                        barSize={28}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* ── INSPECTOR TAB ── */}
      {viewMode === "inspector" && (
        <Card
          sx={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            p: 1.25,
          }}
        >
          <SectionTitle title="Silver Layer Data Inspector" />

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel sx={{ fontSize: "10px" }}>Target ML Module</InputLabel>
              <Select
                value={selectedModule}
                onChange={(e) => {
                  setSelectedModule(e.target.value);
                  setFilterSim("ALL");
                }}
                label="Target ML Module"
                sx={selectSx}
                MenuProps={menuPropsSx}
              >
                <MenuItem value="battery">Battery</MenuItem>
                <MenuItem value="body">Body</MenuItem>
                <MenuItem value="engine">Engine</MenuItem>
                <MenuItem value="transmission">Transmission</MenuItem>
                <MenuItem value="tyre">Tyre</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel sx={{ fontSize: "10px" }}>Filter Vehicle</InputLabel>
              <Select
                value={filterSim}
                onChange={(e) => setFilterSim(e.target.value)}
                label="Filter Vehicle"
                sx={selectSx}
                MenuProps={menuPropsSx}
              >
                <MenuItem value="ALL">All Vehicles</MenuItem>
                {availableSims.map((sim) => (
                  <MenuItem key={sim} value={sim}>
                    {sim}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              onClick={() => refetchInspector()}
              disabled={inspectorLoading}
              startIcon={<RefreshIcon sx={{ fontSize: "12px !important" }} />}
              sx={{
                height: 28,
                borderRadius: 1,
                fontSize: "10px",
                fontWeight: 700,
                boxShadow: "none",
                whiteSpace: "nowrap",
                textTransform: "none",
                bgcolor: isDark ? alpha("#3b82f6", 0.85) : "#1e40af",
                "&:hover": {
                  bgcolor: isDark ? "#3b82f6" : "#1e3a8a",
                  boxShadow: `0 4px 14px ${alpha("#3b82f6", 0.35)}`,
                },
              }}
            >
              Fetch Latest 100 Inferences
            </Button>

            <Typography
              sx={{
                ml: 0.5,
                fontSize: "10px",
                color: "text.disabled",
                fontStyle: "italic",
              }}
            >
              Reads Silver Parquet directly from disk. Auto-refresh disabled.
            </Typography>
          </Stack>

          <Divider
            sx={{
              mb: 1,
              borderColor: isDark
                ? alpha("#7dd3fc", 0.1)
                : alpha("#1f2937", 0.1),
            }}
          />

          <Box
            className={agTheme}
            sx={{ flex: 1, minHeight: 0, width: "100%", ...agGridContainerSx }}
          >
            <AgGridReact
              rowData={filteredInspectorData}
              columnDefs={inspectorColumnDefs}
              defaultColDef={{ resizable: true, sortable: true, filter: true }}
              overlayLoadingTemplate={
                inspectorLoading
                  ? '<span class="ag-overlay-loading-center">Scanning Silver Parquet…</span>'
                  : undefined
              }
              overlayNoRowsTemplate='<span class="ag-overlay-loading-center">No inferences in Silver Layer</span>'
            />
          </Box>
        </Card>
      )}
    </Box>
  );
}
