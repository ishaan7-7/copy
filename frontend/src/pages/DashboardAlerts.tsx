import React, { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Button,
  Stack,
  Tooltip,
  IconButton,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, ClientSideRowModelModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useStore } from "../store";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const fetchAlertsMetrics = async () =>
  (await axios.get("http://127.0.0.1:8005/api/alerts/metrics")).data;

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
        height: "100%",
        flex: 1,
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
    if (isActive && !wasActiveRef.current) refetchMetrics();
    wasActiveRef.current = isActive;
  }, [isActive]);

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
        cellRenderer: (params: any) => {
          if (!params.value) return null;
          const mod = params.value.toUpperCase();
          const modColor: Record<string, string> = {
            ENGINE: "#3b82f6",
            BATTERY: "#22c55e",
            TRANSMISSION: "#8b5cf6",
            BODY: "#f59e0b",
            TYRE: "#06b6d4",
          };
          const color = modColor[mod] || "#94a3b8";
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
                  width: 4,
                  height: 4,
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
                {mod}
              </Typography>
            </Box>
          );
        },
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
        cellStyle: (params: any): any => {
          const score = parseFloat(params.value);
          const color =
            score >= 0.8 ? "#ef4444" : score >= 0.5 ? "#f59e0b" : "#22c55e";
          return { color, fontWeight: "bold" };
        },
        valueFormatter: (p) =>
          p.value ? parseFloat(p.value).toFixed(2) : "",
      },
      {
        headerName: "ACTION",
        width: 160,
        pinned: "right",
        cellRenderer: (params: any) => (
          <Box sx={{ display: "flex", alignItems: "center", height: "100%" }}>
            <Button
              size="small"
              variant="contained"
              startIcon={
                <PsychologyOutlinedIcon
                  sx={{ fontSize: "12px !important" }}
                />
              }
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
                height: 24,
                fontSize: "10px",
                fontWeight: 700,
                borderRadius: 1,
                boxShadow: "none",
                textTransform: "none",
                bgcolor: isDark ? alpha("#3b82f6", 0.85) : "#1e40af",
                "&:hover": {
                  bgcolor: isDark ? "#3b82f6" : "#1e3a8a",
                  boxShadow: `0 4px 14px ${alpha("#3b82f6", 0.35)}`,
                },
              }}
            >
              Root Cause
            </Button>
          </Box>
        ),
      },
    ],
    [navigate, isDark]
  );

  const activeCount = metrics?.active_alerts_count || 0;
  const criticalCount = metrics?.critical_vehicles || 0;
  const lag = metrics?.processing_lag || 0;

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
          OPERATIONS CENTER: FLEET ALERTS
        </Typography>

        <ToggleButtonGroup
          value={activeTab}
          exclusive
          onChange={(_e, val) => val && setActiveTab(val)}
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
          <ToggleButton value="OPEN">Active Alerts</ToggleButton>
          <ToggleButton value="CLOSED">Resolved Alerts</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* KPI Tiles */}
      <Stack direction="row" spacing={1} sx={{ flexShrink: 0, alignItems: "stretch" }}>
        <Box sx={{ flex: 1, display: "flex" }}>
          <MetricTile
            label="Active Alerts"
            value={activeCount.toLocaleString()}
            color="#ef4444"
            icon={<NotificationsActiveOutlinedIcon sx={{ fontSize: 14 }} />}
            delta={activeCount > 0 ? "Requires attention" : "All clear"}
          />
        </Box>
        <Box sx={{ flex: 1, display: "flex" }}>
          <MetricTile
            label="Critical Vehicles"
            value={criticalCount.toLocaleString()}
            color="#f59e0b"
            icon={<WarningAmberOutlinedIcon sx={{ fontSize: 14 }} />}
          />
        </Box>
        <Box sx={{ flex: 1, display: "flex" }}>
          <MetricTile
            label="Processing Lag"
            value={lag.toLocaleString()}
            color="#3b82f6"
            icon={<TimerOutlinedIcon sx={{ fontSize: 14 }} />}
          />
        </Box>
      </Stack>

      {/* Alert Table */}
      <Card
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          p: 1.25,
        }}
      >
        <SectionTitle
          title="Alert Monitor"
          action={
            <Tooltip title="Refresh alerts">
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

        <Box
          className={agTheme}
          sx={{ flex: 1, minHeight: 0, width: "100%", ...agGridContainerSx }}
        >
          <AgGridReact
            rowData={(activeTab === "OPEN"
              ? metrics?.open_alerts ?? []
              : metrics?.closed_alerts ?? []
            ).filter(
              (a: any) => a.module !== "tyre" && a.module !== "body"
            )}
            columnDefs={tableColDefs}
            animateRows={false}
            defaultColDef={{ resizable: true, sortable: true, filter: true }}
            rowHeight={28}
            headerHeight={30}
            overlayLoadingTemplate={
              metricsLoading
                ? '<span class="ag-overlay-loading-center">Fetching Alerts…</span>'
                : undefined
            }
            overlayNoRowsTemplate='<span class="ag-overlay-loading-center">No Alerts Found</span>'
          />
        </Box>
      </Card>
    </Box>
  );
}
