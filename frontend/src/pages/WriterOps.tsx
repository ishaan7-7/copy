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
} from "@mui/material";
import { alpha } from "@mui/material/styles";

import { useTheme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, ClientSideRowModelModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useStore } from "../store";
import { useChartTheme } from "../hooks/useChartTheme";
import HubRoundedIcon from "@mui/icons-material/HubRounded";
import StorageRoundedIcon from "@mui/icons-material/StorageRounded";
import SyncProblemRoundedIcon from "@mui/icons-material/SyncProblemRounded";
import TimerRoundedIcon from "@mui/icons-material/TimerRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import CommuteRoundedIcon from "@mui/icons-material/CommuteRounded";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

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

export default function WriterOps({ isActive = true }: { isActive?: boolean }) {
  const { autoRefresh } = useStore();
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

  const { data: observerData, refetch: refetchObserver } = useQuery({
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
    } catch (e) {
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
        minWidth: 115,
      },
      {
        field: "status",
        headerName: "PROCESS STATUS",
        flex: 1,
        minWidth: 130,
        cellRenderer: (params: any) => {
          let color: "success" | "error" | "warning" = "error";
          if (params.value === "RUNNING") color = "success";
          if (params.value === "STALLED") color = "warning";
          return (
            <Chip
              label={params.value || "UNKNOWN"}
              color={color}
              size="small"
              sx={{
                borderRadius: "2px",
                height: "20px",
                fontSize: "10px",
                fontWeight: "bold",
              }}
            />
          );
        },
      },
      {
        field: "delta_total",
        headerName: "DELTA RECORDS",
        flex: 1,
        minWidth: 120,
        type: "numericColumn",
        valueFormatter: (p) => p.value?.toLocaleString(),
      },
      {
        field: "true_lag",
        headerName: "SYSTEM LAG",
        flex: 1,
        minWidth: 110,
        type: "numericColumn",
        cellStyle: (params: any): any => {
          if (params.value > 100)
            return {
              color: theme.palette.error.main,
              fontWeight: "bold",
              backgroundColor: isDark ? alpha("#ef4444", 0.18) : "#ffebee",
            };
          return { color: theme.palette.success.main };
        },
        valueFormatter: (p) => p.value?.toLocaleString(),
      },
      {
        field: "throughput",
        headerName: "IN RATE (r/s)",
        flex: 1,
        minWidth: 110,
        type: "numericColumn",
      },
      {
        field: "processed",
        headerName: "OUT RATE (r/s)",
        flex: 1,
        minWidth: 115,
        type: "numericColumn",
      },
      {
        field: "latency_ms",
        headerName: "LATENCY (ms)",
        flex: 1,
        minWidth: 110,
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
        // type: "numericColumn",
        valueFormatter: (p: any) => p.value?.toLocaleString(),
      },
      {
        field: "rejected_rows",
        headerName: "REJECTED",
        flex: 1,
        // type: "numericColumn",
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
        // type: "numericColumn",
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
  const gridStroke = isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.06);
  const axisStroke = isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1);
  const chartAxisStyle = {
    fontSize: "11px",
    fill: isDark ? "#94a3b8" : "#64748b",
    fontWeight: 600,
  };
  const tooltipStyle = {
    borderRadius: 8,
    fontSize: "11px",
    padding: "10px 14px",
    backgroundColor: isDark ? alpha("#0b1724", 0.97) : "#ffffff",
    border: `1px solid ${isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.15)}`,
    color: isDark ? "#e2e8f0" : "#0f172a",
    boxShadow: isDark ? `0 8px 24px ${alpha("#000", 0.4)}` : `0 4px 16px ${alpha("#334155", 0.12)}`,
  };
  const agGridContainerSx = {
    "--ag-background-color": "transparent",
    "--ag-odd-row-background-color": isDark ? alpha("#7dd3fc", 0.04) : "#f8fafc",
    "--ag-row-hover-color": isDark ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05),
    "--ag-selected-row-background-color": isDark ? alpha("#3b82f6", 0.22) : alpha("#3b82f6", 0.1),
    "--ag-foreground-color": isDark ? "#e2e8f0" : "#0f172a",
    "--ag-data-color": isDark ? "#e2e8f0" : "#1f2937",
    "--ag-secondary-foreground-color": isDark ? "#94a3b8" : "#64748b",
    "--ag-border-color": isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1),
    "--ag-row-border-color": isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.07),
    "& .ag-header": { backgroundColor: `${isDark ? "#0d2137" : "#005071"} !important` },
    "& .ag-header-cell": {
      backgroundColor: `${isDark ? "#0d2137" : "#005071"} !important`,
      color: "#fff !important", fontSize: "10px !important", fontWeight: "700 !important",
    },
    "& .ag-header-cell-label": { color: "#fff !important" },
    "& .ag-icon": { color: "#fff !important" },
    "& .ag-header-icon": { color: "#fff !important" },
    "& .ag-sort-ascending-icon": { color: "#fff !important" },
    "& .ag-sort-descending-icon": { color: "#fff !important" },
    "& .ag-sort-none-icon": { color: "#fff !important" },
    "& .ag-cell": { fontSize: "10px !important" },
    "& .ag-row": { fontSize: "10px !important" },
    "& .ag-root-wrapper": { border: "none !important" },
  };

  const getCardGradient = (bg: string) => {
    if (!isDark) {
      return `linear-gradient(180deg, #FFFFFF 0%, ${bg} 100%)`;
    }

    switch (bg) {
      case "#EEF6FF":
        return "linear-gradient(180deg, #1B2735 0%, #22384D 100%)";

      case "#F4F1FF":
        return "linear-gradient(180deg, #241F36 0%, #30274B 100%)";

      case "#EEFCEF":
        return "linear-gradient(180deg, #1B3022 0%, #24412D 100%)";

      case "#FFF6E8":
        return "linear-gradient(180deg, #352A1A 0%, #483820 100%)";

      case "#FFE7DD":
        return "linear-gradient(180deg, #3A251B 0%, #4B3023 100%)";

      default:
        return "linear-gradient(180deg,#1F2937,#273548)";
    }
  };

  return (
    <Box
      sx={{
        height: "calc(100vh - 80px)", // slightly more available space
        minHeight: 0, // prevents flex children from shrinking
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: "0 8px",
        bgcolor: "background.default",
        // pb: 10,
        // overflow: "hidden", // avoids nested overflow issues
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center", // changed from flex-end
          borderBottom: `2px solid ${theme.palette.divider}`,
          pb: 1,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontWeight: 700,
            color: isDark ? "text.primary" : "#005071",
            letterSpacing: "-0.3px",
            fontSize: "14px !important",
            whiteSpace: "nowrap",
          }}
        >
          BRONZE LAYER WRITER PIPELINE
        </Typography>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
          }}
        >
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_e, val) => val && setViewMode(val)}
            size="small"
            sx={{
              height: 34,
              bgcolor: "transparent",

              "& .MuiToggleButtonGroup-grouped": {
                border: `1px solid ${isDark ? alpha("#7dd3fc", 0.15) : "#D0D7DE"} !important`,
                borderRadius: "8px !important",
                marginRight: "8px !important",
                padding: "0 16px",
                minHeight: 34,
                textTransform: "none",
                fontSize: "10px",
                fontWeight: 700,
                color: isDark ? alpha("#94a3b8", 0.8) : "#64748B",
                transition: "all .2s ease",

                "&:last-of-type": {
                  marginRight: 0,
                },

                "&:hover": {
                  backgroundColor: isDark ? alpha("#7dd3fc", 0.05) : "#005071cc",
                  borderColor: isDark ? alpha("#7dd3fc", 0.3) : "#ffffff",
                  color: isDark ? "#cbd5e1" : "#ffffff",
                },

                "&.Mui-selected": {
                  backgroundColor: isDark ? "#0d2137" : "#005071",
                  color: isDark ? "#f1f5f9" : "#ffffff",
                  border: `1px solid ${isDark ? alpha("#7dd3fc", 0.2) : "#005071"} !important`,
                  boxShadow: isDark
                    ? `0 1px 4px ${alpha("#000", 0.45)}, 0 0 0 1px ${alpha("#7dd3fc", 0.06)}`
                    : "0 2px 8px rgba(0,80,113,0.18)",
                },

                "&.Mui-selected:hover": {
                  backgroundColor: isDark ? "#0d2137" : "#005071",
                },
              },
            }}
          >
            <ToggleButton value="operations">OPERATIONS METRICS</ToggleButton>

            <ToggleButton value="inspector">DATA INSPECTOR</ToggleButton>

            <ToggleButton value="live">LIVE STREAM MONITOR</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {viewMode === "operations" && (
        <>
          <Grid container spacing={1} alignItems="stretch">
            <Grid item xs={12} sm={4}>
              <Paper
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  p: 1,
                  borderRadius: 2,
                  mb: 1,
                }}
              >
                {/* Header */}
                <Box
                  sx={{
                    p: 0,
                    // bgcolor: "#005071",
                    // borderBottom: `1px solid ${theme.palette.divider}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "12px",
                      lineHeight: 2,
                      fontWeight: 700,
                      color: isDark ? "text.primary" : "#005071",
                      // mb: 1,
                    }}
                  >
                    FILTER CONTEXT:
                  </Typography>

                  <FormControl
                    size="small"
                    sx={{
                      minWidth: 200,
                      bgcolor: isDark ? "#1e293b" : "#fff",
                    }}
                  >
                    <Select
                      value={filterModule}
                      onChange={(e) => setFilterModule(e.target.value)}
                      sx={{
                        borderRadius: 0,
                        height: 25,
                        fontSize: "10px",

                        "& .MuiSelect-select": {
                          fontSize: "10px",
                          py: 0.5,
                        },
                      }}
                      MenuProps={{
                        PaperProps: {
                          sx: {
                            "& .MuiMenuItem-root": {
                              fontSize: "10px",
                              minHeight: 20,
                            },
                          },
                        },
                      }}
                    >
                      <MenuItem value="ALL">ALL MODULES</MenuItem>
                      <MenuItem value="BATTERY">BATTERY</MenuItem>
                      <MenuItem value="BODY">BODY</MenuItem>
                      <MenuItem value="ENGINE">ENGINE</MenuItem>
                      <MenuItem value="TRANSMISSION">TRANSMISSION</MenuItem>
                      <MenuItem value="TYRE">TYRE</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
              </Paper>
              <Paper
                sx={{
                  height: 204,
                  flex: 1,
                  p: 1,
                  borderRadius: 0,
                  display: "flex",
                  flexDirection: "column",
                  mb: 1,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: "12px",
                    lineHeight: 2,
                    fontWeight: 700,
                    color: isDark ? "text.primary" : "#005071",
                    mb: 1,
                  }}
                >
                  SYSTEM THROUGHPUT PROFILE (R/S)
                </Typography>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={gridStroke}
                    />
                    <XAxis
                      dataKey="name"
                      tick={chartAxisStyle}
                      axisLine={{ stroke: axisStroke }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={chartAxisStyle}
                      axisLine={{ stroke: axisStroke }}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.06) }}
                      contentStyle={tooltipStyle}
                    />
                    <Bar dataKey="throughput" fill="#3b82f6" barSize={30} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
              <Paper
                sx={{
                  height: 204,
                  flex: 1,
                  p: 1,
                  borderRadius: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: "12px",
                    lineHeight: 2,
                    fontWeight: 700,
                    color: isDark ? "text.primary" : "#005071",
                    mb: 1,
                  }}
                >
                  PROCESSING LATENCY VARIANCE (MS)
                </Typography>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={gridStroke}
                    />
                    <XAxis
                      dataKey="name"
                      tick={chartAxisStyle}
                      axisLine={{ stroke: axisStroke }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={chartAxisStyle}
                      axisLine={{ stroke: axisStroke }}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ stroke: isDark ? alpha("#7dd3fc", 0.3) : alpha("#3b82f6", 0.2), strokeWidth: 1 }}
                      contentStyle={tooltipStyle}
                    />
                    <Line
                      type="monotone"
                      dataKey="latency"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ r: 4, strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={8} sx={{ display: "flex" }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  gap: 1,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    width: "100%",

                    // mb: 1.5,
                  }}
                >
                  {[
                    {
                      label: "ACTIVE WRITERS",
                      value: `${summaryStats.active} / 5`,
                      subtitle: "Streaming Writers",
                      color: "#1976D2",
                      border: "#1976D2",
                      bg: "#EEF6FF",
                      icon: <HubRoundedIcon />,
                    },
                    {
                      label: "TOTAL WRITTEN",
                      value: summaryStats.written.toLocaleString(),
                      subtitle: "Messages Produced",
                      color: "#7B61FF",
                      border: "#7B61FF",
                      bg: "#F4F1FF",
                      icon: <StorageRoundedIcon />,
                    },
                    {
                      label: "GLOBAL LAG",
                      value: summaryStats.lag.toLocaleString(),
                      subtitle: "Kafka Consumer Lag",
                      color: summaryStats.lag > 500 ? "#D32F2F" : "#2E7D32",
                      border: summaryStats.lag > 500 ? "#D32F2F" : "#2E7D32",
                      bg: summaryStats.lag > 500 ? "#FFF1F1" : "#EEFCEF",
                      icon: <SyncProblemRoundedIcon />,
                    },
                    {
                      label: "AVG LATENCY",
                      value: `${summaryStats.latency.toFixed(1)} ms`,
                      subtitle: "Average Processing",
                      color: "#F57C00",
                      border: "#F57C00",
                      bg: "#FFF7EC",
                      icon: <TimerRoundedIcon />,
                    },
                  ].map((kpi, i) => (
                    <Paper
                      key={i}
                      elevation={3}
                      sx={{
                        flex: 1,
                        p: 2,
                        borderRadius: 3,
                        borderLeft: `5px solid ${kpi.border}`,
                        // borderColor: "divider",
                        transition: "all .25s ease",
                        background: getCardGradient(kpi.bg),
                        // border: `1px solid ${
                        //   isDark
                        //     ? "rgba(255,255,255,0.08)"
                        //     : theme.palette.divider
                        // }`,

                        boxShadow: isDark
                          ? "0 4px 20px rgba(0,0,0,.35)"
                          : "0 2px 10px rgba(0,0,0,.08)",

                        // "&:hover": {
                        //   transform: "translateY(-2px)",
                        //   boxShadow: isDark
                        //     ? "0 10px 28px rgba(0,0,0,.45)"
                        //     : "0 8px 24px rgba(0,0,0,.12)",
                        // },
                        // cursor: "pointer",

                        // "&:hover": {
                        //   transform: "translateY(-4px)",
                        //   boxShadow: 8,
                        // },
                      }}
                    >
                      {/* Icon */}
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <Box
                          sx={{
                            width: 38,
                            height: 38,
                            borderRadius: "50%",
                            bgcolor: kpi.bg,
                            color: kpi.color,

                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",

                            mr: 2,

                            "& svg": {
                              fontSize: 30,
                            },
                          }}
                        >
                          {kpi.icon}
                        </Box>

                        {/* Text */}
                        <Box sx={{ flex: 1, overflow: "hidden" }}>
                          <Typography
                            sx={{
                              fontSize: "14px",
                              fontWeight: 700,
                              color: isDark ? "#ffffff" : "#1f2937",
                              lineHeight: 1,
                            }}
                          >
                            {kpi.value}
                          </Typography>

                          <Typography
                            sx={{
                              mt: 0.7,
                              fontSize: "10px",
                              fontWeight: 500,
                              color: isDark ? "#94a3b8" : "#475569",
                            }}
                          >
                            {kpi.label}
                          </Typography>

                          <Typography
                            sx={{
                              mt: 1,
                              fontSize: "8px",
                              fontWeight: 600,
                              color: kpi.color,
                            }}
                          >
                            {kpi.subtitle}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>

                <Paper
                  sx={{
                    p: 0.5,
                    bgcolor: "background.paper",
                    borderRadius: 0,
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Box
                    className={agTheme}
                    sx={{
                      ...agGridContainerSx,
                      flex: 1,
                      minHeight: 0,
                      mt: 1,
                    }}
                  >
                    <AgGridReact
                      rowData={metricsRowData}
                      columnDefs={metricsColumnDefs}
                      animateRows={false}
                      rowSelection="single"
                      defaultColDef={{
                        sortable: true,
                        filter: true,
                        resizable: true,

                        cellStyle: {
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-start",
                          fontSize: 10,
                        },

                        headerClass: "fleet-header",
                      }}
                      overlayLoadingTemplate={
                        metricsLoading
                          ? '<span class="ag-overlay-loading-center">Fetching Telemetry...</span>'
                          : undefined
                      }
                      overlayNoRowsTemplate={
                        metricsError
                          ? '<span class="ag-overlay-loading-center">ERROR: Backend Unreachable</span>'
                          : undefined
                      }
                    />
                  </Box>
                </Paper>
              </Box>
            </Grid>
          </Grid>
        </>
      )}

      {viewMode === "inspector" && (
        <Paper
          sx={{
            flexGrow: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            borderRadius: 0,
            p: 1,
          }}
        >
          {/* Filter Header */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 1,
              p: 1,
              bgcolor: "transparent",
            }}
          >
            {/* Module */}
            <FormControl
              size="small"
              sx={{
                minWidth: 220,
                bgcolor: isDark ? "#1e293b" : "#f8fafc",
              }}
            >
              <InputLabel
                sx={{
                  fontSize: "10px",
                }}
              >
                Target Parquet Module
              </InputLabel>

              <Select
                value={selectedModule}
                onChange={(e) => {
                  setSelectedModule(e.target.value);
                  setFilterSim("ALL");
                }}
                label="Target Parquet Module"
                sx={{
                  borderRadius: 0,
                  height: 28,
                  fontSize: "10px",

                  "& .MuiSelect-select": {
                    fontSize: "10px",
                    py: 0.5,
                  },
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      "& .MuiMenuItem-root": {
                        fontSize: "10px",
                        minHeight: 28,
                      },
                    },
                  },
                }}
              >
                <MenuItem value="battery">BATTERY</MenuItem>
                <MenuItem value="body">BODY</MenuItem>
                <MenuItem value="engine">ENGINE</MenuItem>
                <MenuItem value="transmission">TRANSMISSION</MenuItem>
                <MenuItem value="tyre">TYRE</MenuItem>
              </Select>
            </FormControl>

            {/* Vehicle */}
            <FormControl
              size="small"
              sx={{
                minWidth: 180,
                bgcolor: isDark ? "#1e293b" : "#f8fafc",
              }}
            >
              <InputLabel
                sx={{
                  fontSize: "10px",
                }}
              >
                Filter Vehicle
              </InputLabel>

              <Select
                value={filterSim}
                onChange={(e) => setFilterSim(e.target.value)}
                label="Filter Vehicle"
                sx={{
                  borderRadius: 0,
                  height: 28,
                  fontSize: "10px",

                  "& .MuiSelect-select": {
                    fontSize: "10px",
                    py: 0.5,
                  },
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      "& .MuiMenuItem-root": {
                        fontSize: "10px",
                        minHeight: 28,
                      },
                    },
                  },
                }}
              >
                <MenuItem value="ALL">ALL VEHICLES</MenuItem>

                {availableSims.map((sim) => (
                  <MenuItem key={sim} value={sim}>
                    {sim}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Button */}
            <Button
              variant="contained"
              onClick={() => refetchInspector()}
              disabled={inspectorLoading}
              startIcon={<RefreshIcon sx={{ fontSize: "12px" }} />}
              sx={{
                height: 28,
                borderRadius: 0,
                fontSize: "10px",
                fontWeight: 700,
                boxShadow: "none",
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                bgcolor: "#0A6D94",

                "&:hover": {
                  bgcolor: "#095B7A",
                  boxShadow: "none",
                },
              }}
            >
              FETCH LATEST 100 ROWS
            </Button>

            {/* Info */}
            <Typography
              sx={{
                ml: 1,
                color: isDark ? "#94a3b8" : "#475569",
                fontSize: "10px",
              }}
            >
              *Inspector reads raw parquet files directly from disk.
              Auto-refresh disabled.
            </Typography>
          </Box>

          <Divider sx={{ mb: 1 }} />

          <Box
            className={agTheme}
            sx={{
              ...agGridContainerSx,
              flexGrow: 1,
              minHeight: 0,
              width: "100%",
            }}
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
                  ? '<span class="ag-overlay-loading-center">Scanning Parquet...</span>'
                  : undefined
              }
              overlayNoRowsTemplate='<span class="ag-overlay-loading-center">No Parquet Data Available in Bronze Layer</span>'
            />
          </Box>
        </Paper>
      )}

      {viewMode === "live" && (
        <>
          <Grid container spacing={1} alignItems="stretch">
            <Grid item xs={12} sm={4} sx={{ display: "flex", flexDirection: "column" }}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 0.75,
                  width: "100%",
                }}
              >
                {Object.entries(observerHealth).map(
                  ([name, isUp]: [string, any]) => (
                    <Chip
                      key={name}
                      label={name.toUpperCase()}
                      size="small"
                      color={isUp ? "success" : "error"}
                      sx={{
                        width: "100%",
                        height: 24,
                        fontSize: "10px",
                        fontWeight: 600,
                        borderRadius: 1,

                        "& .MuiChip-label": {
                          px: 0.5,
                          width: "100%",
                          textAlign: "center",
                          fontSize: "10px",
                          fontWeight: 600,
                        },
                      }}
                    />
                  )
                )}
              </Box>

              <Box
                sx={{
                  display: "flex",
                  gap: 0.5,
                  width: "100%",
                  mt: 1,
                }}
              >
                {[
                  {
                    label: "TOTAL THROUGHPUT",
                    value: observerGlobal.total_rows.toLocaleString(),
                    color: "#1976D2",
                    bg: "#EEF6FF",
                    border: "#1976D2",
                    icon: <InsightsRoundedIcon />,
                  },
                  {
                    label: "ACTIVE FLEET",
                    value: observerGlobal.active_vehicles,
                    color: "#2E7D32",
                    bg: "#EEFCEF",
                    border: "#2E7D32",
                    icon: <CommuteRoundedIcon />,
                  },
                  {
                    label: "DLQ BACKLOG",
                    value: observerGlobal.dlq_backlog,
                    color:
                      observerGlobal.dlq_backlog > 0 ? "#D32F2F" : "#FB8C00",
                    bg: observerGlobal.dlq_backlog > 0 ? "#FFECEC" : "#FFF6E8",
                    border:
                      observerGlobal.dlq_backlog > 0 ? "#D32F2F" : "#FB8C00",
                    icon: <ReportProblemRoundedIcon />,
                  },
                ].map((kpi, idx) => (
                  <Paper
                    elevation={0}
                    sx={{
                      flex: 1, // <-- Equal width
                      minWidth: 0, // <-- Allows shrinking
                      height: 42,
                      p: 0.5,
                      borderRadius: 2,

                      background: getCardGradient(kpi.bg),
                      borderLeft: `5px solid ${kpi.border}`,

                      display: "flex",
                      alignItems: "center",

                      transition: ".2s",
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      {/* Icon */}
                      <Box
                        sx={{
                          width: 22,
                          height: 22,
                          borderRadius: "50%",
                          bgcolor: isDark ? alpha(kpi.color, 0.18) : kpi.bg,
                          color: kpi.color,

                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",

                          flexShrink: 0,

                          "& svg": {
                            fontSize: 14,
                          },
                        }}
                      >
                        {kpi.icon}
                      </Box>

                      {/* Content */}
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          flex: 1,
                          minWidth: 0,
                          marginLeft: "5px",
                        }}
                      >
                        <Typography
                          noWrap
                          sx={{
                            fontSize: "8px",
                            fontWeight: 700,
                            color: isDark ? "#94A3B8" : "#64748B",
                            textTransform: "uppercase",
                            letterSpacing: "0.4px",
                            lineHeight: 1.2,
                          }}
                        >
                          {kpi.label}
                        </Typography>

                        <Typography
                          noWrap
                          sx={{
                            mt: 0.4,
                            fontSize: "14px",
                            fontWeight: 700,
                            color: isDark ? "#F8FAFC" : "#1F2937",
                            lineHeight: 1.2,
                          }}
                        >
                          {kpi.value}
                        </Typography>
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Box>

              <Paper
                sx={{
                  p: 1,
                  borderRadius: 2,
                  mt: 1,
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    mb: 1,
                    width: "100%",
                  }}
                >
                  <FormControl
                    size="small"
                    sx={{
                      flex: 1,

                      "& .MuiInputLabel-root": {
                        fontSize: "10px",
                        top: "-2px",
                      },

                      "& .MuiInputLabel-shrink": {
                        top: 0,
                      },

                      "& .MuiOutlinedInput-root": {
                        height: 30,
                        fontSize: "10px",
                      },

                      "& .MuiOutlinedInput-input": {
                        fontSize: "10px",
                        py: 0.5,
                        px: 1,
                      },

                      "& .MuiSelect-select": {
                        fontSize: "10px",
                        display: "flex",
                        alignItems: "center",
                      },
                    }}
                  >
                    <InputLabel>Target Vehicle</InputLabel>

                    <Select
                      value={inspectorVid}
                      onChange={(e) => {
                        setInspectorVid(e.target.value);
                        setInspectorSource("ALL (Latest)");
                      }}
                      MenuProps={{
                        PaperProps: {
                          sx: {
                            "& .MuiMenuItem-root": {
                              fontSize: "10px",
                              minHeight: 28,
                            },
                          },
                        },
                      }}
                    >
                      {observerVehicles.map((v: any) => (
                        <MenuItem
                          key={v.vehicle_id}
                          value={v.vehicle_id}
                          sx={{ fontSize: "10px" }}
                        >
                          {v.vehicle_id}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl
                    size="small"
                    sx={{
                      flex: 1,

                      "& .MuiInputLabel-root": {
                        fontSize: "10px",
                        top: "-2px",
                      },

                      "& .MuiInputLabel-shrink": {
                        top: 0,
                      },

                      "& .MuiOutlinedInput-root": {
                        height: 30,
                        fontSize: "10px",
                      },

                      "& .MuiOutlinedInput-input": {
                        fontSize: "10px",
                        py: 0.5,
                        px: 1,
                      },

                      "& .MuiSelect-select": {
                        fontSize: "10px",
                        display: "flex",
                        alignItems: "center",
                      },
                    }}
                  >
                    <InputLabel>Payload Source</InputLabel>

                    <Select
                      value={inspectorSource}
                      onChange={(e) => setInspectorSource(e.target.value)}
                      MenuProps={{
                        PaperProps: {
                          sx: {
                            "& .MuiMenuItem-root": {
                              fontSize: "10px",
                              minHeight: 28,
                            },
                          },
                        },
                      }}
                    >
                      {availableInspectorSources.map((src: string) => (
                        <MenuItem
                          key={src}
                          value={src}
                          sx={{ fontSize: "10px" }}
                        >
                          {src}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>

                <Box
                  sx={{
                    bgcolor: "background.default",
                    border: `1px solid ${theme.palette.divider}`,
                    p: 1,
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "8px",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {(() => {
                      if (!selectedInspectorV) return "// NO DATA";

                      const payload =
                        inspectorSource === "ALL (Latest)"
                          ? selectedInspectorV.latest_payload
                          : selectedInspectorV.module_payloads?.[
                              inspectorSource
                            ];

                      return payload
                        ? JSON.stringify(payload, null, 2)
                        : "// WAITING FOR PACKET";
                    })()}
                  </pre>
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={12} sm={8}>
              <Paper
                sx={{
                  height: 240,
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: 2,
                  overflow: "hidden",
                  p: 1,
                }}
              >
                <Box
                  sx={{
                    p: 0,
                    borderBottom: `1px solid ${theme.palette.divider}`,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 0,
                      py: 0,
                      borderBottom: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    <Typography
                      variant="subtitle2"
                      sx={{
                        fontSize: "12px",
                        lineHeight: 2,
                        fontWeight: 700,
                        color: isDark ? "text.primary" : "#005071",
                      }}
                    >
                      LIVE VEHICLE STATUS:
                    </Typography>
                  </Box>
                </Box>

                <Box
                  className={agTheme}
                  sx={{
                    ...agGridContainerSx,
                    flexGrow: 0,
                    flex: 1,
                    minHeight: 0,
                    height: 180,
                    "& .ag-root-wrapper": { border: "none" },
                    "& .ag-header-cell-label": { justifyContent: "flex-start", overflow: "hidden" },
                    "& .ag-header-cell-text": { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
                    "& .ag-cell": { fontSize: "10px !important", display: "flex", alignItems: "center" },
                    "& .ag-row:nth-of-type(even)": {
                      background: isDark ? alpha("#7dd3fc", 0.04) : "#fafafa",
                    },
                    "& .fleet-header .ag-header-cell-label": { justifyContent: "flex-end" },
                  }}
                >
                  <AgGridReact
                    rowData={observerVehicles}
                    columnDefs={observerColDefs}
                    animateRows={false}
                    rowSelection="single"
                    defaultColDef={{
                      resizable: true,
                      sortable: true,
                    }}
                    overlayNoRowsTemplate="<span>No Stream Data Available</span>"
                  />
                </Box>
              </Paper>

              <Box
                sx={{
                  display: "flex",
                  gap: 1,
                  mt: 1.5,
                  width: "100%",
                }}
              >
                {/* Latency Chart */}
                <Paper
                  sx={{
                    flex: 1,
                    p: 1,
                    borderRadius: 2,
                    height: 220,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "12px",
                      lineHeight: 2,
                      fontWeight: 700,
                      color: isDark ? "text.primary" : "#005071",
                      mb: 1,
                    }}
                  >
                    LATENCY BY VEHICLE (ms)
                  </Typography>

                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={observerVehicles}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                      <XAxis dataKey="vehicle_id" tick={chartAxisStyle} axisLine={{ stroke: axisStroke }} tickLine={false} />
                      <YAxis tick={chartAxisStyle} axisLine={{ stroke: axisStroke }} tickLine={false} />
                      <Tooltip cursor={{ fill: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.06) }} contentStyle={tooltipStyle} />
                      <Bar dataKey="avg_latency" fill="#eab308" barSize={30} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>

                {/* Data Quality */}
                <Paper
                  sx={{
                    flex: 1,
                    p: 1,
                    borderRadius: 2,
                    height: 220,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "12px",
                      lineHeight: 2,
                      fontWeight: 700,
                      color: isDark ? "text.primary" : "#005071",
                      mb: 1,
                    }}
                  >
                    DATA QUALITY DISTRIBUTION
                  </Typography>

                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={observerVehicles}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                      <XAxis dataKey="vehicle_id" tick={chartAxisStyle} axisLine={{ stroke: axisStroke }} tickLine={false} />
                      <YAxis tick={chartAxisStyle} axisLine={{ stroke: axisStroke }} tickLine={false} />
                      <Tooltip cursor={{ fill: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.06) }} contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: "10px", color: isDark ? "#94a3b8" : "#64748b" }} />
                      <Bar dataKey="rows_processed" fill="#22c55e" stackId="a" isAnimationActive={false} />
                      <Bar dataKey="rejected_rows" fill="#ef4444" stackId="a" isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </Paper>
              </Box>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
