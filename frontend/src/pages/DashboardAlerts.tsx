import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Button,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import PsychologyIcon from "@mui/icons-material/Psychology";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, ClientSideRowModelModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";
import { useQuery } from "@tanstack/react-query";
import NotificationImportantRoundedIcon from "@mui/icons-material/NotificationImportantRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import HourglassTopRoundedIcon from "@mui/icons-material/HourglassTopRounded";
import { alpha } from "@mui/material/styles";
import axios from "axios";
import { useStore } from "../store";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const fetchAlertsMetrics = async () =>
  (await axios.get("http://127.0.0.1:8005/api/alerts/metrics")).data;

export default function DashboardAlerts({
  isActive = true,
}: {
  isActive?: boolean;
}) {
  const { autoRefresh } = useStore();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const wasActiveRef = useRef(false);

  const [activeTab, setActiveTab] = useState<"OPEN" | "CLOSED">("OPEN");

  const {
    data: metrics,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
  } = useQuery({
    queryKey: ["alertsMetrics"],
    queryFn: fetchAlertsMetrics,
    refetchInterval: isActive && autoRefresh ? 20000 : false,
  });

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      refetchMetrics();
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  const tableColDefs = useMemo<ColDef[]>(
    () => [
      {
        field: "alert_id",
        headerName: "ALERT ID",
        flex: 1,
        minWidth: 120,
        valueFormatter: (p) => (p.value ? p.value.substring(0, 8) : ""),
        cellStyle: { fontFamily: "monospace", fontWeight: "bold" },
      },
      {
        field: "module",
        headerName: "MODULE",
        flex: 1,
        minWidth: 130,
        valueFormatter: (p) => p.value?.toUpperCase(),
      },
      {
        field: "source_id",
        headerName: "VEHICLE",
        flex: 1,
        minWidth: 120,
      },
      {
        field: "peak_anomaly_ts",
        headerName: "PEAK ANOMALY TS",
        flex: 1.5,
        minWidth: 200,
      },
      {
        field: "max_composite_score",
        headerName: "SEVERITY SCORE",
        flex: 1,
        minWidth: 140,
        type: "numericColumn",
        valueFormatter: (p) => (p.value ? parseFloat(p.value).toFixed(2) : ""),
      },
      {
        headerName: "ACTION",
        width: 160,
        pinned: "right",
        cellRenderer: (params: any) => (
          <Button
            size="small"
            variant="contained"
            color="error"
            startIcon={<PsychologyIcon />}
            onClick={() =>
              navigate(
                `/dtc?tab=1&vehicle=${encodeURIComponent(
                  params.data.source_id
                )}&module=${encodeURIComponent(
                  params.data.module
                )}&peak_ts=${encodeURIComponent(params.data.peak_anomaly_ts)}`
              )
            }
            sx={{
              height: "24px",
              fontSize: "10px",
              mt: 0.5,
              borderRadius: 0,
              boxShadow: "none",
            }}
          >
            ROOT CAUSE
          </Button>
        ),
      },
    ],
    [navigate]
  );

  const getCardGradient = (bg: string, color: string, isDark: boolean) => {
    if (isDark) {
      return `
          linear-gradient(
            145deg,
            ${alpha(color, 0.18)} 0%,
            ${alpha("#1E293B", 0.92)} 55%,
            ${alpha("#0F172A", 1)} 100%
          )
        `;
    }

    return `
          linear-gradient(
            145deg,
            ${bg} 0%,
            #FFFFFF 60%,
            ${alpha(color, 0.08)} 100%
          )
        `;
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
          OPERATIONS CENTER: FLEET ALERTS
        </Typography>

        <ToggleButtonGroup
          value={activeTab}
          exclusive
          onChange={(_e, val) => val && setActiveTab(val)}
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
          <ToggleButton value="OPEN" sx={{ height: 28, px: 3 }}>
            🔴 ACTIVE (OPEN)
          </ToggleButton>
          <ToggleButton value="CLOSED" sx={{ height: 28, px: 3 }}>
            📜 RESOLVED (CLOSED)
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* KPI CARDS */}
        <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
          {[
            {
              label: "ACTIVE ALERTS",
              value: metrics?.active_alerts_count?.toLocaleString() || 0,
              color: "#ef4444",
              border: "#ef4444",
              bg: "#FFEBEE",
              icon: <NotificationImportantRoundedIcon />,
            },
            {
              label: "CRITICAL VEHICLES",
              value: metrics?.critical_vehicles?.toLocaleString() || 0,
              color: "#eab308",
              border: "#eab308",
              bg: "#FFF4E5",
              icon: <WarningAmberRoundedIcon />,
            },
            {
              label: "PROCESSING LAG",
              value: metrics?.processing_lag?.toLocaleString() || 0,
              color: "#005071",
              border: "#005071",
              bg: "#E3F2FD",
              icon: <HourglassTopRoundedIcon />,
            },
          ].map((kpi, idx) => (
            <Paper
              key={idx}
              elevation={3}
              sx={{
                flex: 1,
                p: 2,
                minHeight: 90,
                borderRadius: 3,
                overflow: "hidden",
                position: "relative",

                background: getCardGradient(kpi.bg, kpi.color, isDark),

                border: `1px solid ${alpha(kpi.border, 0.18)}`,

                boxShadow: isDark
                  ? "0 8px 24px rgba(0,0,0,.35)"
                  : `0 8px 22px ${alpha(kpi.border, 0.1)}`,

                transition: ".25s",

                // "&:hover": {
                //   transform: "translateY(-2px)",
                //   boxShadow: isDark
                //     ? "0 12px 28px rgba(0,0,0,.45)"
                //     : `0 14px 30px ${alpha(kpi.border, 0.18)}`,
                // },

                "&:before": {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 5,
                  height: "100%",
                  background: kpi.border,
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Box
                  sx={{
                    width: 40,
                    height: 40,
                    mr: 1.5,
                    borderRadius: "50%",

                    background: `linear-gradient(
                135deg,
                ${alpha(kpi.border, 0.15)},
                ${alpha(kpi.border, 0.3)}
            )`,

                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",

                    color: kpi.border,

                    "& svg": {
                      fontSize: 22,
                    },
                  }}
                >
                  {kpi.icon}
                </Box>

                <Box flex={1}>
                  <Typography
                    sx={{
                      fontSize: "18px",
                      fontWeight: 700,
                      color: kpi.color,
                      lineHeight: 1,
                    }}
                  >
                    {kpi.value}
                  </Typography>

                  <Typography
                    sx={{
                      mt: 0.8,
                      fontSize: "10px",
                      fontWeight: 600,
                      color: isDark ? "#CBD5E1" : "#475569",
                    }}
                  >
                    {kpi.label}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>

        {/* TABLE */}
        <Paper
          sx={{
            display: "flex",
            flexDirection: "column",
            borderRadius: 0,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            p: 0,
            bgcolor: "background.paper",
          }}
        >
          <Box
            sx={{
              px: 1,
              py: 0.75,
              bgcolor: "transparent",
              borderBottom: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontSize: "12px",
                lineHeight: 2,
                fontWeight: 700,
                color: isDark ? "text.primary" : "#005071",
                // mb: 1,
              }}
            >
              ALERT MONITOR:
            </Typography>
          </Box>

          <Box
            className={isDark ? "ag-theme-balham-dark" : "ag-theme-balham"}
            sx={{
              "--ag-background-color": "transparent",
              "--ag-odd-row-background-color": isDark ? alpha("#7dd3fc", 0.04) : "#f8fafc",
              "--ag-row-hover-color": isDark ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05),
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
              "& .ag-cell": { fontSize: "10px !important" },
              "& .ag-row": { fontSize: "10px !important" },
              "& .ag-root-wrapper": { border: "none !important" },
              flex: 1,
              minHeight: 0,
              width: "100%",
            }}
          >
            <AgGridReact
              rowData={(activeTab === "OPEN"
                ? metrics?.open_alerts ?? []
                : metrics?.closed_alerts ?? []
              ).filter(
                (a: { module: string }) =>
                  a.module !== "tyre" && a.module !== "body"
              )}
              columnDefs={tableColDefs}
              animateRows={false}
              defaultColDef={{
                resizable: true,
                sortable: true,
                filter: true,
              }}
              rowHeight={28}
              headerHeight={30}
              overlayLoadingTemplate={
                metricsLoading
                  ? '<span class="ag-overlay-loading-center">Fetching Alerts...</span>'
                  : undefined
              }
              overlayNoRowsTemplate={
                '<span class="ag-overlay-loading-center">No Alerts Found</span>'
              }
            />
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
