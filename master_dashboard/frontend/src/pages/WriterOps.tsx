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
  const { autoRefresh, darkMode } = useStore();
  const theme = useTheme();
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
    refetchInterval: isActive && viewMode === "operations" && autoRefresh ? 3000 : false,
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
    placeholderData: undefined,
  });

  const { data: observerData } = useQuery({
    queryKey: ["observerSnapshot"],
    queryFn: fetchObserverSnapshot,
    enabled: isActive && viewMode === "live",
    refetchInterval: isActive && viewMode === "live" && autoRefresh ? 3000 : false,
  });

  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActiveRef.current) refetchMetrics();
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
        minWidth: 120,
      },
      {
        field: "status",
        headerName: "PROCESS STATUS",
        flex: 1,
        minWidth: 140,
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
              backgroundColor: darkMode ? "rgba(211,47,47,0.20)" : "#ffebee",
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
    [theme, darkMode]
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

  if (observerVehicles.length > 0 && !inspectorVid) {
    setInspectorVid(observerVehicles[0].vehicle_id);
  }

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

  const agTheme = darkMode ? "ag-theme-balham-dark" : "ag-theme-balham";
  const chartAxisStyle = {
    fontSize: "11px",
    fill: ct.axisColor,
    fontWeight: 600,
  };
  const tooltipStyle = {
    borderRadius: 0,
    fontSize: "12px",
    padding: "5px",
    backgroundColor: ct.tooltipBg,
    border: `1px solid ${ct.tooltipBorder}`,
    color: ct.tooltipText,
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
            fontWeight: 600,
            color: "text.secondary",
            letterSpacing: "-0.5px",
            fontSize: "14px",
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
              bgcolor: "background.paper",
              height: 28,
              "& .MuiToggleButton-root": {
                py: 0.25,
                px: 1.5,
                minHeight: 28,
                fontSize: "10px",
                fontWeight: 600,
                lineHeight: 1,
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
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            gap: 1,
          }}
        >
          <Grid
            container
            columnSpacing={0}
            rowSpacing={1}
            sx={{ width: "100%" }}
          >
            {/* Left Section */}
            <Grid
              item
              xs={12}
              md={3}
              sx={{
                pr: 1, // only creates separation from table
              }}
            >
              <Paper
                sx={{
                  p: 1,
                  bgcolor: "background.paper",
                  borderRadius: 0,
                  height: "100%",
                }}
              >
                <Grid container spacing={1}>
                  {[
                    {
                      label: "ACTIVE WRITERS",
                      value: `${summaryStats.active} / 5`,
                      bg: "#EEF6FF",
                      border: "#4A90E2",
                    },
                    {
                      label: "TOTAL WRITTEN",
                      value: summaryStats.written.toLocaleString(),
                      bg: "#F4F1FF",
                      border: "#6D5BD0",
                    },
                    {
                      label: "GLOBAL LAG",
                      value: summaryStats.lag.toLocaleString(),
                      color:
                        summaryStats.lag > 500
                          ? theme.palette.error.main
                          : theme.palette.success.main,
                      bg: "#EEFCEF",
                      border: "#2E7D32",
                    },
                    {
                      label: "AVG LATENCY",
                      value: `${summaryStats.latency.toFixed(1)} ms`,
                      bg: "#FFF6E8",
                      border: "#E67E22",
                    },
                  ].map((kpi, idx) => (
                    <Grid item xs={6} key={idx}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 1,
                          borderRadius: 0,
                          borderLeft: `5px solid ${kpi.border}`,
                          minHeight: 110,
                          bgcolor: kpi.bg,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "center",
                          // border: `1px solid ${kpi.border}22`,
                          transition: "0.2s ease",
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.secondary",
                            fontWeight: 700,
                            fontSize: "10px",
                            letterSpacing: "0.5px",
                            mb: 1,
                          }}
                        >
                          {kpi.label}
                        </Typography>

                        <Typography
                          variant="h4"
                          sx={{
                            fontWeight: 700,
                            color: kpi.color || "#1F2937",
                            lineHeight: 1.1,
                            fontSize: "20px",
                          }}
                        >
                          {kpi.value}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
            </Grid>

            {/* Right Section - Table */}
            <Grid
              item
              xs={12}
              md={9}
              sx={{
                pl: 0,
              }}
            >
              <Paper
                sx={{
                  p: 0.5,
                  bgcolor: "background.paper",
                  borderRadius: 0,
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",

                  /* Header */
                  "& .ag-header": {
                    backgroundColor: "#005071 !important",
                  },

                  "& .ag-header-cell": {
                    backgroundColor: "#005071 !important",
                    color: "#fff !important",
                    fontSize: "10px !important",
                    fontWeight: 700,
                  },

                  "& .ag-header-cell-label": {
                    color: "#fff !important",
                  },

                  /* SORT ICONS → WHITE */
                  "& .ag-icon": {
                    color: "#fff !important",
                  },

                  "& .ag-sort-ascending-icon": {
                    color: "#fff !important",
                  },

                  "& .ag-sort-descending-icon": {
                    color: "#fff !important",
                  },

                  "& .ag-sort-none-icon": {
                    color: "#fff !important",
                  },

                  "& .ag-header-icon": {
                    color: "#fff !important",
                  },

                  "& .ag-cell": {
                    fontSize: "10px",
                  },

                  "& .ag-row": {
                    fontSize: "10px",
                  },
                }}
              >
                {/* Header */}
                <Box
                  sx={{
                    p: 1,
                    // bgcolor: "#005071",
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Typography
                    sx={{
                      fontWeight: 700,
                      color: "#333",
                      fontSize: "10px",
                    }}
                  >
                    FILTER CONTEXT:
                  </Typography>

                  <FormControl
                    size="small"
                    sx={{
                      minWidth: 200,
                      bgcolor: "#fff",
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

                {/* Grid */}
                <Box
                  className={agTheme}
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    mt: 1,

                    "& .ag-root-wrapper": {
                      fontSize: "10px",
                    },
                  }}
                >
                  <AgGridReact
                    rowData={metricsRowData}
                    columnDefs={metricsColumnDefs}
                    animateRows={false}
                    rowSelection="single"
                    defaultColDef={{
                      resizable: true,
                      sortable: true,
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
            </Grid>
          </Grid>

          <Box sx={{ display: "flex", gap: 2, height: "240px" }}>
            <Paper
              sx={{
                flex: 1,
                p: 1,
                borderRadius: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: "bold", color: "text.secondary", mb: 1 }}
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
                  <Tooltip
                    cursor={{ fill: ct.tableRowEven }}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="throughput" fill="#1976d2" barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>

            <Paper
              sx={{
                flex: 1,
                p: 1,
                borderRadius: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: "bold", color: "text.secondary", mb: 1 }}
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
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="latency"
                    stroke="#d32f2f"
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Box>
        </Box>
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

            /* AG Grid Header */
            "& .ag-header": {
              backgroundColor: "#005071 !important",
            },

            "& .ag-header-cell": {
              backgroundColor: "#005071 !important",
              color: "#fff !important",
              fontSize: "10px !important",
              fontWeight: 700,
            },

            "& .ag-header-cell-label": {
              color: "#fff !important",
            },

            "& .ag-header-icon": {
              color: "#fff !important",
            },

            "& .ag-icon": {
              color: "#fff !important",
            },

            "& .ag-sort-ascending-icon": {
              color: "#fff !important",
            },

            "& .ag-sort-descending-icon": {
              color: "#fff !important",
            },

            "& .ag-sort-none-icon": {
              color: "#fff !important",
            },

            "& .ag-cell": {
              fontSize: "10px !important",
            },

            "& .ag-row": {
              fontSize: "10px !important",
            },
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
                bgcolor: "#fff",
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
                bgcolor: "#fff",
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
                color: "#333",
                fontSize: "10px",
              }}
            >
              *Inspector reads raw parquet files directly from disk.
              Auto-refresh disabled.
            </Typography>
          </Box>

          <Divider sx={{ mb: 1 }} />

          {/* Grid */}
          <Box
            className={agTheme}
            sx={{
              flexGrow: 1,
              minHeight: 0,
              width: "100%",

              "& .ag-root-wrapper": {
                fontSize: "10px",
              },
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
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            flex: 1,
            minHeight: 0,

            "& .MuiTypography-root": {
              fontSize: "10px",
            },

            "& .MuiInputLabel-root": {
              fontSize: "10px",
            },

            "& .MuiSelect-select": {
              fontSize: "10px",
            },

            "& .ag-header": {
              background: "#005071 !important",
            },

            "& .ag-header-cell": {
              background: "#005071 !important",
              color: "#fff !important",
              fontSize: "10px !important",
            },

            "& .ag-header-cell-label": {
              color: "#fff !important",
            },

            "& .ag-icon": {
              color: "#fff !important",
            },

            "& .ag-cell": {
              fontSize: "10px",
            },
          }}
        >
          {/* TOP */}
          <Grid container spacing={1}>
            {/* LEFT */}
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 1, height: "100%", borderRadius: 0 }}>
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 1,
                        bgcolor: "#EEF6FF",
                        borderLeft: "4px solid #005071",
                      }}
                    >
                      <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                        {Object.entries(observerHealth).map(
                          ([name, isUp]: [string, any]) => (
                            <Chip
                              key={name}
                              label={name.toUpperCase()}
                              size="small"
                              color={isUp ? "success" : "error"}
                              sx={{
                                fontSize: "10px",
                                height: 20,
                              }}
                            />
                          )
                        )}
                      </Box>
                    </Paper>
                  </Grid>

                  {[
                    {
                      label: "TOTAL THROUGHPUT",
                      value: observerGlobal.total_rows.toLocaleString(),
                    },
                    {
                      label: "ACTIVE FLEET",
                      value: observerGlobal.active_vehicles,
                    },
                    {
                      label: "DLQ BACKLOG",
                      value: observerGlobal.dlq_backlog,
                    },
                  ].map((kpi, idx) => (
                    <Grid item xs={12} key={idx}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 1,
                          bgcolor: "#EEF6FF",
                          borderLeft: "4px solid #005071",
                        }}
                      >
                        <Typography
                          sx={{
                            color: "text.secondary",
                            fontWeight: 700,
                          }}
                        >
                          {kpi.label}
                        </Typography>

                        <Typography
                          sx={{
                            fontSize: "18px",
                            fontWeight: 700,
                            color: kpi.color,
                          }}
                        >
                          {kpi.value}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
            </Grid>

            {/* RIGHT TABLE */}
            <Grid item xs={12} md={9}>
              <Paper
                sx={{
                  p: 1,
                  borderRadius: 0,
                  display: "flex",
                  flexDirection: "column",
                  height: 280,
                }}
              >
                <Box
                  sx={{
                    p: 1,
                    bgcolor: "transparent",
                  }}
                >
                  <Typography
                    sx={{
                      color: "#333",
                      fontWeight: 700,
                    }}
                  >
                    LIVE VEHICLE STATUS:
                  </Typography>
                </Box>

                <Box className={agTheme} sx={{ flex: 1 }}>
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
            </Grid>
          </Grid>

          {/* BOTTOM */}
          <Grid container spacing={1}>
            {/* CHARTS */}
            <Grid item xs={12} md={6}>
              <Paper
                sx={{
                  p: 1,
                  borderRadius: 0,
                  height: 450,
                }}
              >
                <Typography sx={{ mb: 1 }}>LATENCY BY VEHICLE (ms)</Typography>

                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={observerVehicles}>
                    <CartesianGrid strokeDasharray="3 3" />

                    <XAxis
                      dataKey="vehicle_id"
                      tick={{
                        fontSize: 10,
                      }}
                    />

                    <YAxis
                      tick={{
                        fontSize: 10,
                      }}
                    />

                    <Tooltip />

                    <Bar dataKey="avg_latency" fill="#fbc02d" />
                  </BarChart>
                </ResponsiveContainer>

                <Typography sx={{ mt: 2, mb: 1 }}>
                  DATA QUALITY DISTRIBUTION
                </Typography>

                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={observerVehicles}>
                    <CartesianGrid strokeDasharray="3 3" />

                    <XAxis
                      dataKey="vehicle_id"
                      tick={{
                        fontSize: 10,
                      }}
                    />

                    <YAxis
                      tick={{
                        fontSize: 10,
                      }}
                    />

                    <Tooltip />

                    <Legend
                      wrapperStyle={{
                        fontSize: "10px",
                      }}
                    />

                    <Bar dataKey="rows_processed" fill="#2e7d32" stackId="a" />

                    <Bar dataKey="rejected_rows" fill="#c62828" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </Paper>
            </Grid>

            {/* PAYLOAD */}
            <Grid item xs={12} md={6}>
              <Paper
                sx={{
                  py: 1.5,
                  px: 1,
                  borderRadius: 0,
                  height: 450,
                }}
              >
                <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Target Vehicle</InputLabel>

                    <Select
                      value={inspectorVid}
                      onChange={(e) => {
                        setInspectorVid(e.target.value);
                        setInspectorSource("ALL (Latest)");
                      }}
                    >
                      {observerVehicles.map((v: any) => (
                        <MenuItem key={v.vehicle_id} value={v.vehicle_id}>
                          {v.vehicle_id}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Payload Source</InputLabel>

                    <Select
                      value={inspectorSource}
                      onChange={(e) => setInspectorSource(e.target.value)}
                    >
                      {availableInspectorSources.map((src: string) => (
                        <MenuItem key={src} value={src}>
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
                    height: 375,
                    overflow: "auto",
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "10px",
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
          </Grid>
        </Box>
      )}
    </Box>
  );
}
