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
import axios from "axios";
import { useStore } from "../store";
import { SEVERITY_BG_DARK, SEVERITY_BG_LIGHT } from "../constants/chartColors";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const fetchAlertsMetrics = async () =>
  (await axios.get("http://127.0.0.1:8005/api/alerts/metrics")).data;

export default function DashboardAlerts({ isActive = true }: { isActive?: boolean }) {
  const { autoRefresh, darkMode } = useStore();
  const navigate = useNavigate();
  const theme = useTheme();

  const [activeTab, setActiveTab] = useState<"OPEN" | "CLOSED">("OPEN");

  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ["alertsMetrics"],
    queryFn: fetchAlertsMetrics,
    refetchInterval: isActive && autoRefresh ? 4000 : false,
  });

  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActiveRef.current) refetchMetrics();
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

  const activeBg = darkMode
    ? SEVERITY_BG_DARK.CRITICAL
    : SEVERITY_BG_LIGHT.CRITICAL;

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
          alignItems: "center",
          borderBottom: `2px solid ${theme.palette.divider}`,
          pb: 1,
          gap: 2,
          flexWrap: "wrap",

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
        }}
      >
        {/* LEFT TITLE */}
        <Typography
          sx={{
            fontWeight: 700,
            color: "text.secondary",
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
          sx={{ bgcolor: "background.paper" }}
        >
          <ToggleButton
            value="OPEN"
            sx={{
              height: 28,
              fontWeight: "bold",
              fontSize: "10px",
              px: 3,
              borderRadius: 0,
              color: "error.main",
              "&.Mui-selected": { bgcolor: activeBg, color: "error.main" },
              bgcolor: "background.paper",
              "& .MuiToggleButton-root": {
                px: 2,
                py: 0,
                minHeight: 28,
                borderRadius: 0,
                fontSize: "10px",
                fontWeight: 700,
                lineHeight: 1,
              },
            }}
          >
            🔴 ACTIVE (OPEN)
          </ToggleButton>
          <ToggleButton
            value="CLOSED"
            sx={{
              fontWeight: "700",
              px: 3,
              borderRadius: 0,
              height: 28,
              fontSize: "10px",
            }}
          >
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
            fontWeight: 600,
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
        {/* KPI CARDS */}
        <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
          {[
            {
              label: "🔴 ACTIVE ALERTS",
              value: metrics?.active_alerts_count?.toLocaleString() || 0,
              color: "#d32f2f",
              bg: "#ffebee",
            },
            {
              label: "⚠️ CRITICAL VEHICLES",
              value: metrics?.critical_vehicles?.toLocaleString() || 0,
              color: "#ed6c02",
              bg: "#fff4e5",
            },
            {
              label: "PROCESSING LAG",
              value: metrics?.processing_lag?.toLocaleString() || 0,
              color: "#005071",
              bg: "#e3f2fd",
            },
          ].map((kpi, idx) => (
            <Paper
              key={idx}
              elevation={0}
              sx={{
                flex: 1,
                p: 1.5,
                borderRadius: 0,
                bgcolor: kpi.bg,
                borderLeft: `4px solid ${kpi.color}`,
                minHeight: 90,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <Typography
                sx={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: kpi.color,
                  mb: 0.5,
                }}
              >
                {kpi.label}
              </Typography>

              <Typography
                sx={{
                  fontSize: "20px !important",
                  fontWeight: 700,
                  color: kpi.color,
                  lineHeight: 1.1,
                }}
              >
                {kpi.value}
              </Typography>
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
              color: "#333",
              borderBottom: "1px solid rgba(255,255,255,0.15)",
            }}
          >
            <Typography
              variant="caption"
              sx={{
                fontWeight: "bold",
                color: "text.secondary",
                mb: 0,
                fontSize: "12px !important",
                lineHeight: "12px",
              }}
            >
              ALERT MONITOR
            </Typography>
          </Box>

          <Box
            className={darkMode ? "ag-theme-balham-dark" : "ag-theme-balham"}
            sx={{
              flex: 1,
              minHeight: 0,
              width: "100%",
            }}
          >
            <AgGridReact
              rowData={(activeTab === "OPEN"
                ? metrics?.open_alerts ?? []
                : metrics?.closed_alerts ?? []
              ).filter((a) => a.module !== "tyre" && a.module !== "body")}
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
