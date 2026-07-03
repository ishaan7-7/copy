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

export default function DashboardInference({ isActive = true }: { isActive?: boolean }) {
  const { autoRefresh, darkMode } = useStore();
  const wasActiveRef = useRef(false);
  const theme = useTheme();
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
    refetchInterval: isActive && viewMode === "metrics" && autoRefresh ? 3000 : false,
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
          ML ENGINE & SILVER LAYER PIPELINE
        </Typography>
        <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
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
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            gap: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              gap: 1,

              "& .MuiTypography-root": {
                fontSize: "10px",
              },

              "& .ag-header": {
                background: "#005071 !important",
              },

              "& .ag-header-cell": {
                background: "#005071 !important",
                color: "#fff !important",
                fontSize: "10px !important",
                fontWeight: 700,
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
            <Grid container spacing={1}>
              {/* LEFT KPI */}
              <Grid item xs={12} md={3}>
                <Paper
                  sx={{
                    p: 1,
                    borderRadius: 0,
                    bgcolor: "background.paper",
                    height: "100%",
                  }}
                >
                  <Grid container spacing={1}>
                    {[
                      {
                        label: "ACTIVE SIMULATIONS",
                        value: metricsData?.active_sims || 0,
                        bg: "#EEF6FF",
                        border: "#4A90E2",
                      },
                      {
                        label: "ACTIVE ML MODULES",
                        value: `${metricsData?.active_modules || 0} / 5`,
                        bg: "#F4F1FF",
                        border: "#6D5BD0",
                      },
                      {
                        label: "GLOBAL E2E DELAY",
                        value: `${
                          metricsData?.global_e2e_ms?.toLocaleString() || 0
                        } ms`,
                        color:
                          (metricsData?.global_e2e_ms || 0) > 50000
                            ? theme.palette.error.main
                            : undefined,
                        bg: "#EEFCEF",
                        border: "#2E7D32",
                      },
                      {
                        label: "GLOBAL INFERENCE DELAY",
                        value: `${
                          metricsData?.global_inf_ms?.toLocaleString() || 0
                        } ms`,
                        bg: "#FFF6E8",
                        border: "#E67E22",
                      },
                    ].map((kpi, idx) => (
                      <Grid item xs={6} key={idx}>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1.5,
                            borderRadius: 0,
                            bgcolor: kpi.bg,
                            borderLeft: `5px solid ${kpi.border}`,
                            minHeight: 110,
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: "10px",
                              fontWeight: 700,
                              color: "text.secondary",
                            }}
                          >
                            {kpi.label}
                          </Typography>

                          <Typography
                            sx={{
                              mt: 1,
                              fontSize: "20px !important",
                              fontWeight: 700,
                              color: kpi.color || "text.primary",
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
                    height: "100%",
                  }}
                >
                  <Box
                    sx={{
                      p: 0,
                      bgcolor: "transparent",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: "bold",
                        color: "text.secondary",
                        // mb: 1,
                        fontSize: "12px !important",
                      }}
                    >
                      SUBSYSTEM LATENCY PROFILE:
                    </Typography>
                  </Box>

                  <Box
                    className={agTheme}
                    sx={{
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
                        resizable: true,
                        sortable: true,
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
                </Paper>
              </Grid>
            </Grid>
          </Box>

          <Box
            sx={{
              display: "flex",
              gap: 1,
              width: "100%",
              minHeight: 320, // controls overall chart section height
              alignItems: "stretch",
            }}
          >
            {/* Chart 1 */}
            <Paper
              sx={{
                flex: 1,
                p: 1,
                borderRadius: 0,
                display: "flex",
                flexDirection: "column",
                minHeight: 320,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: "bold",
                  color: "text.secondary",
                  mb: 1,
                  fontSize: "12px !important",
                }}
              >
                E2E VS PURE INFERENCE LATENCY (MS)
              </Typography>

              <Box
                sx={{
                  flex: 1,
                  minHeight: 260,
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={metricsRowData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={ct.gridColor}
                    />

                    <XAxis
                      dataKey="module"
                      tick={{ fontSize: 10 }}
                      axisLine={{ stroke: ct.tableBorder }}
                      tickLine={false}
                    />

                    <YAxis
                      tick={{ fontSize: 10 }}
                      axisLine={{ stroke: ct.tableBorder }}
                      tickLine={false}
                    />

                    <Tooltip
                      contentStyle={{
                        ...tooltipStyle,
                        fontSize: "10px",
                      }}
                    />

                    <Legend
                      wrapperStyle={{
                        fontSize: "10px",
                      }}
                    />

                    <Bar
                      dataKey="e2e_latency"
                      name="Total E2E Latency"
                      fill={ct.gridColor}
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

            {/* Chart 2 */}
            <Paper
              sx={{
                flex: 1,
                p: 1,
                borderRadius: 0,
                display: "flex",
                flexDirection: "column",
                minHeight: 320,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: "bold",
                  color: "text.secondary",
                  mb: 1,
                  fontSize: "12px !important",
                }}
              >
                MODULE THROUGHPUT — ROWS PROCESSED (LAST 5M)
              </Typography>

              <Box
                sx={{
                  flex: 1,
                  minHeight: 260,
                }}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={throughputChartData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={ct.gridColor}
                    />

                    <XAxis
                      dataKey="module"
                      tick={{ fontSize: 10 }}
                      axisLine={{ stroke: ct.tableBorder }}
                      tickLine={false}
                    />

                    <YAxis
                      tick={{ fontSize: 10 }}
                      axisLine={{ stroke: ct.tableBorder }}
                      tickLine={false}
                    />

                    <Tooltip
                      contentStyle={{
                        ...tooltipStyle,
                        fontSize: "10px",
                      }}
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

            "& .MuiTypography-root": {
              fontSize: "10px",
            },

            "& .MuiInputLabel-root": {
              fontSize: "10px",
            },

            "& .MuiSelect-select": {
              fontSize: "10px",
            },

            "& .MuiMenuItem-root": {
              fontSize: "10px",
            },

            "& .MuiButton-root": {
              fontSize: "10px",
            },

            /* AG GRID HEADER */
            "& .ag-header": {
              background: "#005071 !important",
            },

            "& .ag-header-cell": {
              background: "#005071 !important",
              color: "#fff !important",
              fontSize: "10px !important",
              fontWeight: 700,
            },

            "& .ag-header-cell-label": {
              color: "#fff !important",
            },

            "& .ag-icon": {
              color: "#fff !important",
            },

            "& .ag-cell": {
              fontSize: "10px !important",
            },
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
