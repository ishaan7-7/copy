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
  alpha,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import PlayCircleRoundedIcon from "@mui/icons-material/PlayCircleRounded";
import MemoryRoundedIcon from "@mui/icons-material/MemoryRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import PsychologyRoundedIcon from "@mui/icons-material/PsychologyRounded";
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
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const fetchInferenceMetrics = async () => {
  const { data } = await axios.get(
    "http://127.0.0.1:8005/api/inference/metrics"
  );
  return data;
};

const fetchInferenceTail = async (module: string) => {
  const { data } = await axios.get(
    `http://127.0.0.1:8005/api/inference/tail/${module}`
  );
  return data.data;
};

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
    if (isActive && !wasActiveRef.current) {
      refetchMetrics();
    }
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
    if (!metricsData || !metricsData.module_stats) return [];
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
        minWidth: 150,
        type: "numericColumn",
        cellStyle: (params: any) =>
          params.value > 50000
            ? { color: theme.palette.error.main, fontWeight: "bold" }
            : { color: theme.palette.success.main, fontWeight: "normal" },
        valueFormatter: (p) => p.value?.toLocaleString(),
      },
      {
        field: "inf_latency",
        headerName: "PURE INFERENCE LATENCY (ms)",
        flex: 1,
        minWidth: 200,
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
    [theme]
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
          let color: "success" | "error" | "warning" | "info" = "info";
          if (params.value === "NORMAL") color = "success";
          if (params.value === "WARNING") color = "warning";
          if (params.value === "CRITICAL") color = "error";
          return (
            <Chip
              label={params.value || "UNKNOWN"}
              color={color}
              size="small"
              sx={{
                borderRadius: "2px",
                height: "20px",
                fontSize: "0.75rem",
                fontWeight: "bold",
              }}
            />
          );
        };
      }

      if (key === "top_features") {
        colDef.valueFormatter = (params: any) => {
          if (!params.value) return "";
          try {
            const parsed = JSON.parse(params.value);
            return Object.keys(parsed).join(", ");
          } catch (e) {
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
  }, [inspectorData]);

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

  const getCardGradient = (bg: string, color: string, isDark: boolean) => {
    if (isDark) {
      return `linear-gradient(
        145deg,
        ${alpha(color, 0.22)} 0%,
        ${alpha("#111827", 0.95)} 55%,
        ${alpha("#0F172A", 0.98)} 100%
      )`;
    }

    return `linear-gradient(
        145deg,
        ${bg} 0%,
        #ffffff 58%,
        ${alpha(color, 0.08)} 100%
      )`;
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
          ML ENGINE & SILVER LAYER PIPELINE
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
            <ToggleButton
              value="metrics"
              sx={{ fontWeight: "bold", px: 3, borderRadius: 0 }}
            >
              SYSTEM LATENCY METRICS
            </ToggleButton>
            <ToggleButton
              value="inspector"
              sx={{ fontWeight: "bold", px: 3, borderRadius: 0 }}
            >
              SILVER DATA INSPECTOR
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {viewMode === "metrics" && (
        <>
          <Grid container spacing={1} alignItems="stretch">
            <Grid item xs={12} sm={4}>
              <Paper
                sx={{
                  flex: 1,
                  height: 232,
                  display: "flex",
                  flexDirection: "column",
                  p: 1,
                  borderRadius: 2,
                  mb: 1,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.5,
                  }}
                >
                  {/* <SpeedRoundedIcon
                    sx={{
                      color: isDark ? "text.primary" : "#1976d2",
                      fontSize: 18,
                    }}
                  /> */}

                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontSize: "12px",
                      lineHeight: 2,
                      fontWeight: 700,
                      color: isDark ? "text.primary" : "#005071",
                    }}
                  >
                    E2E VS PURE INFERENCE LATENCY (MS)
                  </Typography>
                </Box>

                <Box
                  sx={{
                    flex: 1,
                    minHeight: 200,
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={metricsRowData}
                      margin={{
                        top: 0,
                        right: 8,
                        left: 0,
                        bottom: 8,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={gridStroke}
                      />

                      <XAxis
                        dataKey="module"
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
                        contentStyle={{ ...tooltipStyle, fontSize: "10px" }}
                      />

                      <Legend
                        verticalAlign="top"
                        align="center"
                        height={22}
                        wrapperStyle={{
                          fontSize: "10px",
                          paddingBottom: 4,
                        }}
                      />

                      <Bar
                        dataKey="e2e_latency"
                        name="Total E2E Latency"
                        fill={isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.15)}
                        barSize={30}
                        isAnimationActive={false}
                      />

                      <Bar
                        dataKey="inf_latency"
                        name="PyTorch Compute Latency"
                        fill="#1976d2"
                        barSize={30}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>

              <Paper
                sx={{
                  flex: 1,
                  height: 232,
                  display: "flex",
                  flexDirection: "column",
                  p: 1,
                  borderRadius: 2,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 0.5,
                  }}
                >
                  {/* <SpeedRoundedIcon
                    sx={{
                      color: isDark ? "text.primary" : "#1976d2",
                      fontSize: 18,
                    }}
                  /> */}

                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontSize: "12px",
                      lineHeight: 2,
                      fontWeight: 700,
                      color: isDark ? "text.primary" : "#005071",
                    }}
                  >
                    MODULE THROUGHPUT — ROWS PROCESSED (LAST 5M)
                  </Typography>
                </Box>
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 195,
                  }}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={throughputChartData}
                      margin={{ top: 18, right: 10, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={gridStroke}
                      />

                      <XAxis
                        dataKey="module"
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
                        contentStyle={{ ...tooltipStyle, fontSize: "10px" }}
                      />

                      <Bar
                        dataKey="rows"
                        name="Rows Processed"
                        fill="#1976d2"
                        barSize={30}
                        isAnimationActive={false}
                        label={{
                          position: "top",
                          fontSize: 10,
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={12} sm={8} sx={{ display: "flex" }}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  flex: 1,
                  gap: 1,
                  // height: "100%",
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
                      label: "ACTIVE SIMULATIONS",
                      value: metricsData?.active_sims || 0,
                      bg: "#EAF4FF",
                      color: "#1976D2",
                      icon: <PlayCircleRoundedIcon />,
                    },
                    {
                      label: "ACTIVE ML MODULES",
                      value: `${metricsData?.active_modules || 0} / 5`,
                      bg: "#F4EEFF",
                      color: "#7B1FA2",
                      icon: <MemoryRoundedIcon />,
                    },
                    {
                      label: "GLOBAL E2E DELAY",
                      value: `${
                        metricsData?.global_e2e_ms?.toLocaleString() || 0
                      } ms`,
                      bg: "#EEFCEF",
                      color:
                        (metricsData?.global_e2e_ms || 0) > 50000
                          ? "#D32F2F"
                          : "#2E7D32",
                      icon: <SpeedRoundedIcon />,
                    },
                    {
                      label: "GLOBAL INFERENCE DELAY",
                      value: `${
                        metricsData?.global_inf_ms?.toLocaleString() || 0
                      } ms`,
                      bg: "#FFF7EC",
                      color: "#EF6C00",
                      icon: <PsychologyRoundedIcon />,
                    },
                  ].map((kpi, i) => (
                    <Paper
                      key={i}
                      elevation={3}
                      sx={{
                        flex: 1,
                        p: 2,
                        borderRadius: 3,
                        overflow: "hidden",
                        position: "relative",

                        background: getCardGradient(
                          kpi.bg,
                          kpi.color,
                          isDark
                        ),

                        border: `1px solid ${alpha(kpi.color, 0.18)}`,

                        boxShadow: isDark
                          ? `0 8px 24px ${alpha("#000", 0.45)}`
                          : `0 10px 25px ${alpha(kpi.color, 0.12)}`,

                        transition: ".25s",

                        // "&:hover": {
                        //   transform: "translateY(-3px)",
                        //   boxShadow: isDark
                        //     ? `0 14px 32px ${alpha("#000", 0.55)}`
                        //     : `0 16px 36px ${alpha(kpi.color, 0.18)}`,
                        // },

                        "&:before": {
                          content: '""',
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: 5,
                          height: "100%",
                          background: kpi.color,
                        },
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {/* Circular Icon */}
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
                        <Box flex={1}>
                          <Typography
                            sx={{
                              fontSize: "14px",
                              fontWeight: 700,
                              color: isDark ? "#e2e8f0" : "#1f2937",
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
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>

                <Paper
                  sx={{
                    height: 290,
                    display: "flex",
                    flex: 1,
                    minHeight: 0,
                    // display: "flex",
                    // flexDirection: "column",
                    flexDirection: "column",
                    borderRadius: 2,
                    overflow: "hidden",
                    p: 1,
                  }}
                >
                  <Box
                    sx={{
                      p: 0,
                      // borderBottom: `1px solid ${theme.palette.divider}`,
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
                        mb: 1,
                      }}
                    >
                      <InsightsRoundedIcon
                        sx={{
                          color: "#1976D2",
                          fontSize: 18,
                        }}
                      />
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontSize: "12px",
                          lineHeight: 2,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          color: isDark ? "text.primary" : "#005071",
                        }}
                      >
                        Subsystem Latency Profile:
                      </Typography>
                    </Box>
                    <Box
                      className={agTheme}
                      sx={{
                        ...agGridContainerSx,
                        flex: 1,
                        minHeight: 0,
                        mt: 1,
                        height: 330,
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
                            ? '<span class="ag-overlay-loading-center">Fetching ML Telemetry...</span>'
                            : undefined
                        }
                        overlayNoRowsTemplate={
                          metricsError
                            ? '<span class="ag-overlay-loading-center">ERROR: Backend Unreachable</span>'
                            : undefined
                        }
                      />
                    </Box>
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
            "& .MuiTypography-root": { fontSize: "10px" },
            "& .MuiInputLabel-root": { fontSize: "10px" },
            "& .MuiSelect-select": { fontSize: "10px" },
            "& .MuiMenuItem-root": { fontSize: "10px" },
            "& .MuiButton-root": { fontSize: "10px" },
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 1,
              flexWrap: "wrap",
            }}
          >
            <FormControl size="small" sx={{ minWidth: 250 }}>
              <InputLabel sx={{ fontSize: "10px" }}>
                Target ML Module
              </InputLabel>

              <Select
                value={selectedModule}
                onChange={(e) => {
                  setSelectedModule(e.target.value);
                  setFilterSim("ALL");
                }}
                label="Target ML Module"
                sx={{
                  borderRadius: 0,
                  height: 30,
                  fontSize: "10px",
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      "& .MuiMenuItem-root": {
                        fontSize: "10px",
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

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel sx={{ fontSize: "10px" }}>Filter Vehicle</InputLabel>

              <Select
                value={filterSim}
                onChange={(e) => setFilterSim(e.target.value)}
                label="Filter Vehicle"
                sx={{
                  borderRadius: 0,
                  height: 30,
                  fontSize: "10px",
                }}
                MenuProps={{
                  PaperProps: {
                    sx: {
                      "& .MuiMenuItem-root": {
                        fontSize: "10px",
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

            <Button
              variant="contained"
              color="primary"
              onClick={() => refetchInspector()}
              disabled={inspectorLoading}
              startIcon={<RefreshIcon sx={{ fontSize: "14px" }} />}
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
              FETCH LATEST 100 INFERENCES
            </Button>

            <Typography
              sx={{
                ml: 1,
                color: "text.secondary",
                fontSize: "10px",
              }}
            >
              *Inspector applies native AG Grid filtering. Use column headers to
              slice by Sim ID or Severity.
            </Typography>
          </Box>

          <Divider sx={{ mb: 1 }} />

          <Box
            className={agTheme}
            sx={{
              ...agGridContainerSx,
              flex: 1,
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
                  ? '<span class="ag-overlay-loading-center">Scanning Silver Parquet...</span>'
                  : undefined
              }
              overlayNoRowsTemplate='<span class="ag-overlay-loading-center">No Inferences Available in Silver Layer</span>'
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
}
