import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Chip,
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
import SignalCellularAltOutlinedIcon from "@mui/icons-material/SignalCellularAltOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import PlaylistAddCheckOutlinedIcon from "@mui/icons-material/PlaylistAddCheckOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
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
  LineChart,
  Line,
} from "recharts";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const CHART_FONT = '"Inter", "Segoe UI", Roboto, Arial, sans-serif';

const fetchWriterMetrics = async () => {
  const { data } = await axios.get("http://127.0.0.1:8005/api/writer/metrics");
  return data;
};

const fetchInspectorData = async (module: string) => {
  const { data } = await axios.get(
    `http://127.0.0.1:8005/api/writer/inspector/${module}`
  );
  return data.data;
};

const fetchObserverSnapshot = async () => {
  const { data } = await axios.get(
    "http://127.0.0.1:8005/api/observer/snapshot"
  );
  return data;
};

const Card = ({
  children,
  sx,
}: {
  children: React.ReactNode;
  sx?: object;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: isDark ? alpha("#0b1724", 0.9) : "#ffffff",
        border: `1px solid ${
          isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)
        }`,
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
          sx={{
            fontSize: "9px",
            color,
            fontWeight: 700,
            pl: 0.5,
            lineHeight: 1,
          }}
        >
          {delta}
        </Typography>
      )}
    </Box>
  );
};

export default function WriterOps({ isActive = true }: { isActive?: boolean }) {
  const { autoRefresh, darkMode } = useStore();
  const wasActiveRef = useRef(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const ct = useChartTheme();

  const [viewMode, setViewMode] = useState<"operations" | "inspector" | "live">(
    "operations"
  );
  const [selectedModule, setSelectedModule] = useState<string>("engine");
  const [filterModule, setFilterModule] = useState<string>("ALL");
  const [filterSim, setFilterSim] = useState<string>("ALL");
  const [inspectorVid, setInspectorVid] = useState<string>("");
  const [inspectorSource, setInspectorSource] =
    useState<string>("ALL (Latest)");

  const {
    data: metricsData,
    isLoading: metricsLoading,
    isError: metricsError,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["writerMetrics"],
    queryFn: fetchWriterMetrics,
    refetchInterval:
      isActive && viewMode === "operations" && autoRefresh ? 3000 : false,
  });

  const {
    data: inspectorData,
    isLoading: inspectorLoading,
    refetch: refetchInspector,
  } = useQuery({
    queryKey: ["writerInspector", selectedModule],
    queryFn: () => fetchInspectorData(selectedModule),
    enabled: isActive && viewMode === "inspector",
    staleTime: 60000,
  });

  const { data: observerData } = useQuery({
    queryKey: ["observerSnapshot"],
    queryFn: fetchObserverSnapshot,
    enabled: viewMode === "live",
    refetchInterval:
      isActive && viewMode === "live" && autoRefresh ? 3000 : false,
  });

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      refetchMetrics();
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  const metricsRowData = useMemo(() => {
    if (!metricsData) return [];
    try {
      let rows = Object.values(metricsData) as any[];
      if (filterModule !== "ALL") {
        rows = rows.filter(
          (r) => r.module?.toLowerCase() === filterModule.toLowerCase()
        );
      }
      return rows;
    } catch {
      return [];
    }
  }, [metricsData, filterModule]);

  const chartData = useMemo(() => {
    return metricsRowData.map((row) => ({
      name: row.module,
      throughput: parseFloat(row.throughput || 0),
      latency: parseFloat(row.latency_ms || 0),
      lag: row.true_lag || 0,
    }));
  }, [metricsRowData]);

  const summaryStats = useMemo(() => {
    if (!metricsRowData.length)
      return { active: 0, written: 0, lag: 0, latency: 0 };
    const active = metricsRowData.filter((r) => r.status === "RUNNING").length;
    const written = metricsRowData.reduce(
      (acc, r) => acc + (r.delta_total || 0),
      0
    );
    const lag = metricsRowData.reduce((acc, r) => acc + (r.true_lag || 0), 0);
    const latencySum = metricsRowData.reduce(
      (acc, r) => acc + (r.latency_ms || 0),
      0
    );
    return {
      active,
      written,
      lag,
      latency: latencySum / metricsRowData.length,
    };
  }, [metricsRowData]);

  const metricsColumnDefs = useMemo<ColDef[]>(
    () => [
      {
        field: "module",
        headerName: "SUBSYSTEM",
        sortable: true,
        filter: true,
        flex: 1,
        minWidth: 120,
      },
      {
        field: "status",
        headerName: "PROCESS STATUS",
        flex: 1,
        minWidth: 140,
        cellRenderer: (params: any) => {
          let color = "#ef4444";
          let bg = alpha("#ef4444", isDark ? 0.18 : 0.1);
          if (params.value === "RUNNING") {
            color = "#22c55e";
            bg = alpha("#22c55e", isDark ? 0.18 : 0.1);
          }
          if (params.value === "STALLED") {
            color = "#f59e0b";
            bg = alpha("#f59e0b", isDark ? 0.18 : 0.1);
          }
          return (
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                px: 0.8,
                py: "2px",
                borderRadius: 1,
                bgcolor: bg,
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
        },
      },
      {
        field: "delta_total",
        headerName: "DELTA RECORDS",
        flex: 1,
        minWidth: 130,
        type: "numericColumn",
        valueFormatter: (p) => p.value?.toLocaleString(),
      },
      {
        field: "true_lag",
        headerName: "SYSTEM LAG",
        flex: 1,
        minWidth: 130,
        type: "numericColumn",
        cellStyle: (params: any): any => {
          if (params.value > 100)
            return {
              color: theme.palette.error.main,
              fontWeight: "bold",
              backgroundColor: isDark ? "rgba(239,68,68,0.18)" : "#fee2e2",
            };
          return { color: theme.palette.success.main };
        },
        valueFormatter: (p) => p.value?.toLocaleString(),
      },
      {
        field: "throughput",
        headerName: "IN RATE (r/s)",
        flex: 1,
        minWidth: 120,
        type: "numericColumn",
      },
      {
        field: "processed",
        headerName: "OUT RATE (r/s)",
        flex: 1,
        minWidth: 120,
        type: "numericColumn",
      },
      {
        field: "latency_ms",
        headerName: "LATENCY (ms)",
        flex: 1,
        minWidth: 120,
        type: "numericColumn",
      },
    ],
    [theme, isDark]
  );

  const availableSims = useMemo<string[]>(() => {
    if (!inspectorData || inspectorData.length === 0) return [];
    const sims = new Set<string>();
    inspectorData.forEach((row: any) => {
      if (row.source_id) sims.add(row.source_id);
    });
    return Array.from(sims).sort();
  }, [inspectorData]);

  const filteredInspectorData = useMemo(() => {
    if (!inspectorData) return [];
    if (filterSim === "ALL") return inspectorData;
    return inspectorData.filter((row: any) => row.source_id === filterSim);
  }, [inspectorData, filterSim]);

  const inspectorColumnDefs = useMemo<ColDef[]>(() => {
    if (!inspectorData || inspectorData.length === 0) return [];
    return Object.keys(inspectorData[0]).map((key) => ({
      field: key,
      headerName: key.toUpperCase(),
      sortable: true,
      filter: true,
      width: key.includes("ts") || key.includes("hash") ? 220 : 130,
    }));
  }, [inspectorData]);

  const observerVehicles: any[] = observerData?.vehicles || [];
  const observerHealth = observerData?.system_health || {};
  const observerGlobal = observerData?.global_stats || {
    total_rows: 0,
    active_vehicles: 0,
    avg_latency: 0,
    dlq_backlog: 0,
  };

  useEffect(() => {
    if (observerVehicles.length > 0 && !inspectorVid) {
      setInspectorVid(observerVehicles[0].vehicle_id);
    }
  }, [observerVehicles]);

  const selectedInspectorV =
    observerVehicles.find((v: any) => v.vehicle_id === inspectorVid) ||
    observerVehicles[0];
  const availableInspectorSources = [
    "ALL (Latest)",
    ...(selectedInspectorV?.module_payloads
      ? Object.keys(selectedInspectorV.module_payloads)
      : []),
  ];

  const observerColDefs = useMemo<ColDef[]>(
    () => [
      {
        field: "vehicle_id",
        headerName: "VEHICLE ID",
        flex: 1,
        minWidth: 150,
        cellStyle: {
          fontWeight: "bold",
          color: theme.palette.primary.main,
        } as any,
      },
      {
        field: "rows_processed",
        headerName: "PROCESSED",
        flex: 1,
        type: "numericColumn",
        valueFormatter: (p: any) => p.value?.toLocaleString(),
      },
      {
        field: "rejected_rows",
        headerName: "REJECTED",
        flex: 1,
        type: "numericColumn",
        cellStyle: { color: theme.palette.error.main } as any,
      },
      {
        field: "validation_rate",
        headerName: "QUALITY SCORE",
        flex: 1,
        valueFormatter: (p: any) =>
          p.value != null ? `${p.value.toFixed(1)}%` : "",
        cellStyle: (p: any) => ({
          color:
            p.value > 95
              ? theme.palette.success.main
              : theme.palette.error.main,
          fontWeight: "bold",
        }),
      },
      {
        field: "avg_latency",
        headerName: "LATENCY (ms)",
        flex: 1,
        type: "numericColumn",
        valueFormatter: (p: any) => p.value?.toFixed(1),
      },
      {
        field: "last_seen_sec",
        headerName: "LAST SEEN",
        flex: 1,
        valueFormatter: (p: any) =>
          p.value != null ? `${p.value.toFixed(1)}s ago` : "",
      },
    ],
    [theme]
  );

  const agTheme = isDark ? "ag-theme-balham-dark" : "ag-theme-balham";

  const agGridContainerSx: object = {
    "--ag-background-color": "transparent",
    "--ag-odd-row-background-color": isDark ? alpha("#7dd3fc", 0.04) : "#f8fafc",
    "--ag-row-hover-color": isDark ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05),
    "--ag-selected-row-background-color": isDark ? alpha("#3b82f6", 0.22) : alpha("#3b82f6", 0.1),
    "--ag-foreground-color": isDark ? "#e2e8f0" : "#0f172a",
    "--ag-data-color": isDark ? "#e2e8f0" : "#1f2937",
    "--ag-secondary-foreground-color": isDark ? "#94a3b8" : "#64748b",
    "--ag-border-color": isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1),
    "--ag-row-border-color": isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.07),
    "--ag-input-focus-border-color": isDark ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5),
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
      borderColor: `${isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.08)} !important`,
    },
    "& .ag-root-wrapper": { borderRadius: "6px", border: "none !important" },
    "& .ag-root-wrapper-body": { borderRadius: "6px" },
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
    border: `1px solid ${isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.12)}`,
    color: isDark ? "#e2e8f0" : "#1f2937",
    boxShadow: isDark
      ? `0 8px 24px ${alpha("#000", 0.4)}`
      : `0 4px 16px ${alpha("#334155", 0.12)}`,
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
        border: `1px solid ${isDark ? alpha("#7dd3fc", 0.14) : alpha("#1f2937", 0.1)}`,
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

  const inputLabelSx = { fontSize: "10px" };

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
          BRONZE LAYER WRITER PIPELINE
        </Typography>

        <ToggleButtonGroup
          value={viewMode}
          exclusive
          onChange={(_e, val) => val && setViewMode(val)}
          size="small"
          sx={{
            bgcolor: isDark ? alpha("#020c16", 0.7) : alpha("#dde6ef", 0.6),
            borderRadius: "10px",
            border: `1px solid ${isDark ? alpha("#7dd3fc", 0.08) : alpha("#94a3b8", 0.2)}`,
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
                  ? `0 1px 4px ${alpha("#000", 0.45)}, 0 0 0 1px ${alpha("#7dd3fc", 0.06)}`
                  : `0 1px 3px ${alpha("#334155", 0.16)}, 0 1px 2px ${alpha("#334155", 0.1)}`,
              },
              "&:hover:not(.Mui-selected)": {
                bgcolor: isDark ? alpha("#7dd3fc", 0.05) : alpha("#94a3b8", 0.12),
                color: isDark ? "#cbd5e1" : "#374151",
              },
            },
          }}
        >
          <ToggleButton value="operations">Operations Metrics</ToggleButton>
          <ToggleButton value="inspector">Data Inspector</ToggleButton>
          <ToggleButton value="live">Live Stream Monitor</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* ── OPERATIONS TAB ── */}
      {viewMode === "operations" && (
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
              <Card sx={{ p: 1.25, height: "100%", display: "flex", flexDirection: "column" }}>
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
                    label="Active Writers"
                    value={`${summaryStats.active} / 5`}
                    color="#3b82f6"
                    icon={<StorageOutlinedIcon sx={{ fontSize: 14 }} />}
                    delta={
                      summaryStats.active === 5
                        ? "All operational"
                        : `${5 - summaryStats.active} inactive`
                    }
                  />
                  <MetricTile
                    label="Total Written"
                    value={summaryStats.written.toLocaleString()}
                    color="#8b5cf6"
                    icon={
                      <PlaylistAddCheckOutlinedIcon sx={{ fontSize: 14 }} />
                    }
                  />
                  <MetricTile
                    label="Global Lag"
                    value={summaryStats.lag.toLocaleString()}
                    color={summaryStats.lag > 500 ? "#ef4444" : "#22c55e"}
                    icon={<SignalCellularAltOutlinedIcon sx={{ fontSize: 14 }} />}
                    delta={
                      summaryStats.lag > 500 ? "High — check pipeline" : "Nominal"
                    }
                  />
                  <MetricTile
                    label="Avg Latency"
                    value={`${summaryStats.latency.toFixed(1)} ms`}
                    color="#f59e0b"
                    icon={<TimerOutlinedIcon sx={{ fontSize: 14 }} />}
                  />
                </Box>
              </Card>
            </Grid>

            {/* Table */}
            <Grid item xs={12} md={9}>
              <Card
                sx={{
                  p: 1,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <SectionTitle
                  title="Writer Subsystem Status"
                  action={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel sx={inputLabelSx}>Filter Module</InputLabel>
                        <Select
                          value={filterModule}
                          onChange={(e) => setFilterModule(e.target.value)}
                          label="Filter Module"
                          sx={selectSx}
                          MenuProps={menuPropsSx}
                        >
                          <MenuItem value="ALL">All Modules</MenuItem>
                          <MenuItem value="BATTERY">Battery</MenuItem>
                          <MenuItem value="BODY">Body</MenuItem>
                          <MenuItem value="ENGINE">Engine</MenuItem>
                          <MenuItem value="TRANSMISSION">Transmission</MenuItem>
                          <MenuItem value="TYRE">Tyre</MenuItem>
                        </Select>
                      </FormControl>
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
                    </Stack>
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
                        ? '<span class="ag-overlay-loading-center">Fetching telemetry…</span>'
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
              <Card sx={{ p: 1.25, flex: 1, display: "flex", flexDirection: "column" }}>
                <SectionTitle title="System Throughput Profile (r/s)" />
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 6, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={ct.gridColor}
                      />
                      <XAxis
                        dataKey="name"
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
                        dataKey="throughput"
                        fill={isDark ? "#3b82f6" : "#2563eb"}
                        radius={[3, 3, 0, 0]}
                        barSize={28}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Card>
            </Grid>

            <Grid item xs={12} md={6} sx={{ display: "flex" }}>
              <Card sx={{ p: 1.25, flex: 1, display: "flex", flexDirection: "column" }}>
                <SectionTitle title="Processing Latency Variance (ms)" />
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 6, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={ct.gridColor}
                      />
                      <XAxis
                        dataKey="name"
                        tick={chartAxisStyle}
                        axisLine={{ stroke: ct.tableBorder }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={chartAxisStyle}
                        axisLine={{ stroke: ct.tableBorder }}
                        tickLine={false}
                      />
                      <RechartsTooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="latency"
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={{
                          r: 3,
                          fill: "#ef4444",
                          stroke: isDark ? "#0b1724" : "#ffffff",
                          strokeWidth: 2,
                        }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* ── DATA INSPECTOR TAB ── */}
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
          <SectionTitle title="Parquet Data Inspector" />

          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel sx={inputLabelSx}>Target Parquet Module</InputLabel>
              <Select
                value={selectedModule}
                onChange={(e) => {
                  setSelectedModule(e.target.value);
                  setFilterSim("ALL");
                }}
                label="Target Parquet Module"
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
              <InputLabel sx={inputLabelSx}>Filter Vehicle</InputLabel>
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
              Fetch Latest 100 Rows
            </Button>

            <Typography
              sx={{
                ml: 0.5,
                fontSize: "10px",
                color: "text.disabled",
                fontStyle: "italic",
              }}
            >
              Reads raw parquet files directly from disk. Auto-refresh disabled.
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
              defaultColDef={{
                resizable: true,
                sortable: true,
                filter: true,
              }}
              overlayLoadingTemplate={
                inspectorLoading
                  ? '<span class="ag-overlay-loading-center">Scanning parquet…</span>'
                  : undefined
              }
              overlayNoRowsTemplate='<span class="ag-overlay-loading-center">No parquet data in Bronze layer</span>'
            />
          </Box>
        </Card>
      )}

      {/* ── LIVE STREAM MONITOR TAB ── */}
      {viewMode === "live" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Top Row */}
          <Grid container spacing={1} sx={{ flexShrink: 0 }}>
            {/* Left: system health + global KPIs */}
            <Grid item xs={12} md={3}>
              <Card sx={{ p: 1.25, height: "100%" }}>
                <SectionTitle title="System Health" />
                <Box
                  sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 1.5 }}
                >
                  {Object.entries(observerHealth).map(
                    ([name, isUp]: [string, any]) => (
                      <Tooltip
                        key={name}
                        title={isUp ? "Online" : "Offline"}
                        placement="top"
                      >
                        <Box
                          sx={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 0.5,
                            px: 0.8,
                            py: "2px",
                            borderRadius: 1,
                            bgcolor: isUp
                              ? alpha("#22c55e", isDark ? 0.15 : 0.08)
                              : alpha("#ef4444", isDark ? 0.15 : 0.08),
                            border: `1px solid ${alpha(
                              isUp ? "#22c55e" : "#ef4444",
                              0.25
                            )}`,
                          }}
                        >
                          <Box
                            sx={{
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              bgcolor: isUp ? "#22c55e" : "#ef4444",
                              flexShrink: 0,
                            }}
                          />
                          <Typography
                            sx={{
                              fontSize: "10px",
                              fontWeight: 700,
                              color: isUp ? "#22c55e" : "#ef4444",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            {name}
                          </Typography>
                        </Box>
                      </Tooltip>
                    )
                  )}
                </Box>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: 0.75,
                  }}
                >
                  <MetricTile
                    label="Total Throughput"
                    value={observerGlobal.total_rows.toLocaleString()}
                    color="#3b82f6"
                    icon={<StorageOutlinedIcon sx={{ fontSize: 13 }} />}
                  />
                  <MetricTile
                    label="Active Fleet"
                    value={observerGlobal.active_vehicles}
                    color="#22c55e"
                    icon={<DirectionsCarOutlinedIcon sx={{ fontSize: 13 }} />}
                  />
                  <MetricTile
                    label="DLQ Backlog"
                    value={observerGlobal.dlq_backlog}
                    color={
                      observerGlobal.dlq_backlog > 0 ? "#ef4444" : "#22c55e"
                    }
                    icon={<SignalCellularAltOutlinedIcon sx={{ fontSize: 13 }} />}
                    delta={
                      observerGlobal.dlq_backlog > 0
                        ? "Requires attention"
                        : "Clear"
                    }
                  />
                </Box>
              </Card>
            </Grid>

            {/* Right: live vehicle table */}
            <Grid item xs={12} md={9}>
              <Card
                sx={{
                  p: 1.25,
                  height: 280,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <SectionTitle title="Live Vehicle Status" />
                <Box className={agTheme} sx={{ flex: 1, minHeight: 0, ...agGridContainerSx }}>
                  <AgGridReact
                    rowData={observerVehicles}
                    columnDefs={observerColDefs}
                    animateRows={false}
                    rowSelection="single"
                    defaultColDef={{ resizable: true, sortable: true }}
                    overlayNoRowsTemplate='<span class="ag-overlay-loading-center">No stream data available</span>'
                  />
                </Box>
              </Card>
            </Grid>
          </Grid>

          {/* Bottom Row */}
          <Grid container spacing={1} sx={{ flex: 1, minHeight: 0 }}>
            {/* Charts */}
            <Grid item xs={12} md={6} sx={{ display: "flex" }}>
              <Card
                sx={{
                  p: 1.25,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                <SectionTitle title="Latency by Vehicle (ms)" />
                <Box sx={{ flex: 1, minHeight: 0 }}>
                  <ResponsiveContainer width="100%" height="50%">
                    <BarChart
                      data={observerVehicles}
                      margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={ct.gridColor}
                      />
                      <XAxis
                        dataKey="vehicle_id"
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
                        cursor={{ fill: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.06) }}
                        contentStyle={tooltipStyle}
                      />
                      <Bar
                        dataKey="avg_latency"
                        fill="#f59e0b"
                        radius={[3, 3, 0, 0]}
                        barSize={20}
                      />
                    </BarChart>
                  </ResponsiveContainer>

                  <Typography
                    sx={{
                      fontSize: "12px",
                      fontWeight: 800,
                      mt: 1,
                      mb: 0.5,
                    }}
                  >
                    Data Quality Distribution
                  </Typography>

                  <ResponsiveContainer width="100%" height="40%">
                    <BarChart
                      data={observerVehicles}
                      margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={ct.gridColor}
                      />
                      <XAxis
                        dataKey="vehicle_id"
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
                        cursor={{ fill: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.06) }}
                        contentStyle={tooltipStyle}
                      />
                      <Legend
                        wrapperStyle={{
                          fontSize: "10px",
                          fontFamily: CHART_FONT,
                        }}
                      />
                      <Bar
                        dataKey="rows_processed"
                        name="Processed"
                        fill="#22c55e"
                        stackId="a"
                        radius={[2, 2, 0, 0]}
                      />
                      <Bar
                        dataKey="rejected_rows"
                        name="Rejected"
                        fill="#ef4444"
                        stackId="a"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Card>
            </Grid>

            {/* Payload inspector */}
            <Grid item xs={12} md={6} sx={{ display: "flex" }}>
              <Card
                sx={{
                  p: 1.25,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <SectionTitle title="Payload Inspector" />

                <Stack direction="row" spacing={1} sx={{ mb: 1, flexShrink: 0 }}>
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel sx={inputLabelSx}>Target Vehicle</InputLabel>
                    <Select
                      value={inspectorVid}
                      onChange={(e) => {
                        setInspectorVid(e.target.value);
                        setInspectorSource("ALL (Latest)");
                      }}
                      label="Target Vehicle"
                      sx={selectSx}
                      MenuProps={menuPropsSx}
                    >
                      {observerVehicles.map((v: any) => (
                        <MenuItem key={v.vehicle_id} value={v.vehicle_id}>
                          {v.vehicle_id}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel sx={inputLabelSx}>Payload Source</InputLabel>
                    <Select
                      value={inspectorSource}
                      onChange={(e) => setInspectorSource(e.target.value)}
                      label="Payload Source"
                      sx={selectSx}
                      MenuProps={menuPropsSx}
                    >
                      {availableInspectorSources.map((src: string) => (
                        <MenuItem key={src} value={src}>
                          {src}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    borderRadius: 1,
                    bgcolor: isDark ? alpha("#000", 0.35) : alpha("#f1f5f9", 0.8),
                    border: `1px solid ${
                      isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1)
                    }`,
                    p: 1.5,
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "10px",
                      fontFamily: '"Fira Code", "Cascadia Code", "Consolas", monospace',
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      color: isDark ? "#a5f3fc" : "#0f172a",
                      lineHeight: 1.6,
                    }}
                  >
                    {(() => {
                      if (!selectedInspectorV) return "// NO DATA";
                      const payload =
                        inspectorSource === "ALL (Latest)"
                          ? selectedInspectorV.latest_payload
                          : selectedInspectorV.module_payloads?.[inspectorSource];
                      return payload
                        ? JSON.stringify(payload, null, 2)
                        : "// WAITING FOR PACKET";
                    })()}
                  </pre>
                </Box>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}
    </Box>
  );
}
