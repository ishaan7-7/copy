import React, { useMemo, useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
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
  Button,
  CircularProgress,
  Popover,
  TextField,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRefetchOnActivate } from "../hooks/useApi";
import axios from "axios";
import Plot from "react-plotly.js";
import {
  MODULE_COLORS,
  SEVERITY_BG_DARK,
  SEVERITY_BG_LIGHT,
} from "../constants/chartColors";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  ReferenceDot,
  Brush,
} from "recharts";

const API = "http://127.0.0.1:8005";
const ALL_MODULES = ["engine", "transmission", "battery", "body", "tyre"];

const MODULE_SENSOR_KEYS: Record<string, string[]> = {
  engine: [
    "engine_rpm_rpm",
    "engine_oil_temperature",
    "ecu_7ea_engine_coolant_temperature",
    "engine_load_absolute",
    "fuel_flow_rate_hour_l_hr",
    "turbo_boost_vacuum_gauge_psi",
    "voltage_control_module_v",
  ],
  battery: [
    "battery_state_of_charge_soc_pct",
    "battery_state_of_health_soh_pct",
    "battery_voltage_ecu_7ee",
    "battery_temperature_cell",
    "internal_resistance_impedance",
    "charging_power_kw",
    "hv_battery_pack_voltage",
  ],
  body: [
    "cabin_temperature",
    "fuel_level_pct",
    "cabin_humidity_pct",
    "hvac_blower_speed",
    "ac_compressor_load_pct",
    "distance_since_codes_cleared",
    "odometer_reading",
  ],
  transmission: [
    "transmission_oil_temperature",
    "gear_position_actual",
    "torque_converter_slip_speed",
    "vehicle_speed_kmh",
    "actual_engine_pct_torque",
    "clutch_engagement_per_slip",
    "engine_rpm",
  ],
  tyre: [
    "tyre_pressure_fl_psi",
    "tyre_pressure_fr_psi",
    "tyre_pressure_rl_psi",
    "tyre_pressure_rr_psi",
    "tyre_temp_fl_c",
    "tyre_temp_fr_c",
    "tyre_wear_fl_pct",
    "tyre_wear_fr_pct",
    "tyre_wear_rl_pct",
    "tyre_wear_rr_pct",
  ],
};

function sevColor(sev: string): string {
  return sev === "critical" || sev === "CRITICAL" ? "#ef4444" : "#eab308";
}

function buildPlotLayout(isDark: boolean) {
  const textColor = isDark ? "#e2e8f0" : "#1e293b";
  const gridColor = isDark ? "rgba(51,65,85,0.5)" : "rgba(226,232,240,1)";
  const lineColor = isDark ? "rgba(51,65,85,0.8)" : "rgba(203,213,225,1)";
  const tickColor = isDark ? "#94a3b8" : "#64748b";
  return {
    autosize: true,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "monospace", size: 10, color: textColor },
    margin: { t: 28, r: 12, b: 60, l: 50 },
    legend: {
      orientation: "h" as const,
      y: -0.3,
      font: { size: 9, color: textColor },
    },
    xaxis: { gridcolor: gridColor, linecolor: lineColor, tickfont: { color: tickColor } },
    yaxis: { gridcolor: gridColor, linecolor: lineColor, tickfont: { color: tickColor } },
  };
}

export default function DtcInvestigation({ isActive = true }: { isActive?: boolean }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const initVehicle = searchParams.get("vehicle") || "";
  const initModule = searchParams.get("module") || "engine";
  const initPeakTs = searchParams.get("peak_ts") || "";
  const [selectedVehicle, setSelectedVehicle] = useState<string>(initVehicle);
  const [selectedModule, setSelectedModule] = useState<string>(
    ALL_MODULES.includes(initModule) ? initModule : "engine"
  );
  const [peakTs, setPeakTs] = useState<string>(initPeakTs);
  const [evidenceWindow, setEvidenceWindow] = useState<number>(60);
  const [selectedSensor, setSelectedSensor] = useState<string>("");
  const [selectedDtcCode, setSelectedDtcCode] = useState<string>("");
  const [loadEvidence, setLoadEvidence] = useState<boolean>(
    !!initPeakTs && !!initVehicle
  );
  const [eventAnchor, setEventAnchor] = useState<HTMLElement | null>(null);
  const [shouldRunAnalysis, setShouldRunAnalysis] = useState<boolean>(false);
  const [manualTs, setManualTs] = useState<string>("");

  const sensorKeys = MODULE_SENSOR_KEYS[selectedModule] || [];

  useEffect(() => {
    if (sensorKeys.length === 0) return;
    const alerts = [
      ...(alertsMetricsQuery.data?.open_alerts || []),
      ...(alertsMetricsQuery.data?.closed_alerts || []),
    ].filter((a: Record<string, string>) => a.module === selectedModule);
    if (alerts.length > 0) {
      try {
        const feats = JSON.parse(String(alerts[0].top_10_features || "{}"));
        const topSensor = Object.entries(feats).sort(
          ([, a], [, b]) => Number(b) - Number(a)
        )[0]?.[0];
        if (topSensor && sensorKeys.includes(topSensor)) {
          setSelectedSensor(topSensor);
          return;
        }
      } catch {}
    }
    setSelectedSensor(sensorKeys[0]);
  }, [selectedModule]);

  const alertsMetricsQuery = useQuery({
    queryKey: ["alertsMetrics"],
    queryFn: () => axios.get(`${API}/api/alerts/metrics`).then((r) => r.data),
    refetchInterval: false,
    staleTime: 30000,
  });

  const fleetQuery = useQuery({
    queryKey: ["autoFleetSummary"],
    queryFn: () =>
      axios.get(`${API}/api/automotive/fleet-summary`).then((r) => r.data),
    refetchInterval: false,
  });

  const dtcMasterQuery = useQuery({
    queryKey: ["dtcMaster"],
    queryFn: () =>
      axios.get(`${API}/api/automotive/dtc-master`).then((r) => r.data),
    staleTime: Infinity,
  });

  const vehicleHistoryQuery = useQuery({
    queryKey: ["dtcVehicleHistory", selectedVehicle, selectedModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/dtc-history/${selectedVehicle}`)
        .then((r) => r.data),
    enabled: !!selectedVehicle,
    refetchInterval: false,
  });

  const dtcAnalysisQuery = useQuery({
    queryKey: ["dtcAnalysis", selectedVehicle, selectedModule, peakTs],
    queryFn: () =>
      axios
        .get(`${API}/api/dtc/analyze`, {
          params: {
            source_id: selectedVehicle,
            module: selectedModule,
            peak_ts: peakTs,
          },
          timeout: 70000,
        })
        .then((r) => r.data),
    enabled: false,
    staleTime: Infinity,
    gcTime: 3_600_000,
    retry: false,
  });

  const sensorEvidenceQuery = useQuery({
    queryKey: [
      "dtcSensorEvidence",
      selectedVehicle,
      selectedModule,
      selectedSensor,
      peakTs,
      evidenceWindow,
    ],
    queryFn: () =>
      axios
        .get(
          `${API}/api/automotive/dtc-sensor-evidence/${selectedVehicle}/${selectedModule}/${selectedSensor}`,
          { params: { around_ts: peakTs, window: evidenceWindow } }
        )
        .then((r) => r.data),
    enabled:
      loadEvidence && !!selectedVehicle && !!selectedModule && !!selectedSensor,
    refetchInterval: false,
  });

  useRefetchOnActivate(isActive, [fleetQuery.refetch, vehicleHistoryQuery.refetch, alertsMetricsQuery.refetch]);

  useEffect(() => {
    if (initVehicle && initPeakTs) dtcAnalysisQuery.refetch();
  }, []);

  useEffect(() => {
    if (dtcAnalysisQuery.isSuccess && (dtcAnalysisQuery.data as any)?.success) {
      queryClient.invalidateQueries({
        queryKey: ["dtcVehicleHistory", selectedVehicle, selectedModule],
      });
      queryClient.invalidateQueries({ queryKey: ["dtcFleetDistribution"] });
      queryClient.invalidateQueries({ queryKey: ["dtcAllHistory"] });
      queryClient.invalidateQueries({ queryKey: ["autoDtcHistory"] });
      queryClient.invalidateQueries({ queryKey: ["alertsMetrics"] });
      const triggers = (dtcAnalysisQuery.data as any)?.triggers || [];
      if (triggers.length > 0) setSelectedDtcCode(triggers[0].code);
    }
  }, [dtcAnalysisQuery.isSuccess, dtcAnalysisQuery.dataUpdatedAt]);

  const vehicles: any[] = fleetQuery.data?.vehicles || [];
  useEffect(() => {
    if (vehicles.length > 0 && !selectedVehicle)
      setSelectedVehicle(vehicles[0].vehicle_id);
  }, [fleetQuery.data]);

  useEffect(() => {
    if (shouldRunAnalysis && !!selectedVehicle && !!selectedModule && !!peakTs) {
      dtcAnalysisQuery.refetch();
      setShouldRunAnalysis(false);
    }
  }, [shouldRunAnalysis, peakTs]);

  useEffect(() => {
    if (!selectedDtcCode) return;
    const detail = selectedDtcCode ? dtcMasterFlat[selectedDtcCode] : null;
    if (!detail) return;
    const features: string[] = detail.features || [];
    const validSensors = features.filter((f: string) =>
      MODULE_SENSOR_KEYS[selectedModule]?.includes(f)
    );
    if (validSensors.length > 0) {
      setSelectedSensor(validSensors[0]);
      if (peakTs) setLoadEvidence(true);
    }
  }, [selectedDtcCode]);

  const dtcMasterFlat = useMemo((): Record<string, any> => {
    const modules = dtcMasterQuery.data?.modules || {};
    const flat: Record<string, any> = {};
    Object.values(modules).forEach((codes: any) => {
      if (Array.isArray(codes))
        codes.forEach((c: any) => {
          flat[c.dtc_code] = c;
        });
    });
    return flat;
  }, [dtcMasterQuery.data]);

  const selectedDtcDetail: any = selectedDtcCode
    ? dtcMasterFlat[selectedDtcCode]
    : null;

  const candidateRuns = useMemo((): any[] => {
    const allRuns: any[] = vehicleHistoryQuery.data?.runs || [];
    return allRuns
      .filter((r: any) => !selectedModule || r.module === selectedModule)
      .slice(0, 30);
  }, [vehicleHistoryQuery.data, selectedModule]);

  const allTriggeredCodes = useMemo((): string[] => {
    const codes = new Set<string>();
    candidateRuns.forEach((r: any) =>
      r.triggers?.forEach((t: any) => codes.add(t.code))
    );
    return Array.from(codes);
  }, [candidateRuns]);

  const evidenceData: any[] = sensorEvidenceQuery.data?.data || [];

  const peakTsMs = useMemo((): number | null => {
    if (!peakTs) return null;
    const d = new Date(peakTs);
    return isNaN(d.getTime()) ? null : d.getTime();
  }, [peakTs]);

  const analysisData: any = dtcAnalysisQuery.data;
  const analysisTriggered = (analysisData?.triggers || []) as any[];
  const criticalPlot: any = analysisData?.critical_plot ?? null;
  const nonCriticalPlot: any = analysisData?.non_critical_plot ?? null;
  const canRun = !!selectedVehicle && !!selectedModule && !!peakTs;

  const unanalyzedAlerts = useMemo((): any[] => {
    return [
      ...(alertsMetricsQuery.data?.open_alerts || []),
      ...(alertsMetricsQuery.data?.closed_alerts || []),
    ].filter(
      (a: any) =>
        String(a.source_id || "").toLowerCase() === String(selectedVehicle || "").toLowerCase() &&
        String(a.module || "").toLowerCase() === String(selectedModule || "").toLowerCase() &&
        !a.analyzed
    );
  }, [alertsMetricsQuery.data, selectedVehicle, selectedModule]);

  const selectedRun = candidateRuns.find((r: any) => r.peak_ts === peakTs);
  const eventButtonLabel = (() => {
    if (!peakTs) return "SELECT FAULT EVENT";
    const fmtTs = String(peakTs).slice(0, 16);
    if (selectedRun) {
      const codes = (selectedRun.triggers || []).map((t: any) => t.code).join(", ");
      return codes ? `${fmtTs}  ·  ${codes}` : `${fmtTs}  ·  No faults`;
    }
    return `${fmtTs}  ·  from alert`;
  })();

  const xData = evidenceData.map((r: any) => String(r.ts).slice(0, 16));
  const peakIdx = xData.findIndex(
    (ts: string) => ts === (peakTs || "").slice(0, 16)
  );
  const half = Math.floor(evidenceWindow * 0.25);
  const center = peakIdx >= 0 ? peakIdx : Math.floor(xData.length / 2);
  const winS = Math.max(0, center - half);
  const winE = Math.min(Math.max(0, xData.length - 1), center + half);

  const plotLayout = buildPlotLayout(isDark);

  const cardSx = {
    borderRadius: 2,
    border: `1px solid ${isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)}`,
    bgcolor: isDark ? "#0b1724" : "#ffffff",
  };

  const _axisColor = isDark ? "#94a3b8" : "#64748b";
  const _gridColor = isDark ? "#1e2433" : alpha("#e2e8f0", 1);
  const _tblBorder = isDark ? "#1e2433" : alpha("#e2e8f0", 1);
  const _tblEvenBg = isDark ? "#0d1117" : alpha("#f8fafc", 1);
  const _tooltipBg = isDark ? "#131722" : "#ffffff";
  const _tooltipBorder = isDark ? alpha("#7dd3fc", 0.3) : alpha("#94a3b8", 0.3);
  const _tooltipText = isDark ? "#e2e8f0" : "#1e293b";

  const axisStyle = {
    fontSize: "10px" as const,
    fill: _axisColor,
    fontWeight: 600,
  };
  const tooltipStyle = {
    borderRadius: 4,
    fontSize: "11px",
    fontFamily: "monospace",
    backgroundColor: _tooltipBg,
    border: `1px solid ${_tooltipBorder}`,
    color: _tooltipText,
  };
  const tblHeader: React.CSSProperties = {
    textAlign: "left",
    padding: "6px 12px",
    color: "#ffffff",
    fontWeight: 700,
    position: "sticky",
    top: 0,
    background: "#005071",
    whiteSpace: "nowrap",
    fontSize: "10px",
  };

  const sevBg = (sev: string) =>
    sev === "critical" || sev === "CRITICAL"
      ? isDark
        ? SEVERITY_BG_DARK.CRITICAL
        : SEVERITY_BG_LIGHT.CRITICAL
      : isDark
      ? SEVERITY_BG_DARK.WARNING
      : SEVERITY_BG_LIGHT.WARNING;

  const inputSx = {
    "& .MuiOutlinedInput-root": {
      borderRadius: 1.5,
      fontSize: "10px",
      bgcolor: isDark ? "#0d1117" : "#f8fafc",
      "& fieldset": {
        borderColor: isDark ? alpha("#7dd3fc", 0.2) : alpha("#94a3b8", 0.35),
      },
      "&:hover fieldset": {
        borderColor: isDark ? alpha("#7dd3fc", 0.4) : alpha("#94a3b8", 0.6),
      },
      "&.Mui-focused fieldset": {
        borderColor: isDark ? "#38bdf8" : "#005071",
      },
    },
    "& .MuiInputLabel-root": { fontSize: "10px" },
    "& .MuiSelect-select": { fontSize: "10px" },
  };

  return (
    <Box
      sx={{
        height: "calc(100vh - 80px)",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: "0 8px",
        bgcolor: "background.default",
      }}
    >
      {/* PAGE HEADER */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `2px solid ${theme.palette.divider}`,
          pb: 1,
          gap: 2,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {(initVehicle || initPeakTs) && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => navigate(-1)}
              sx={{ fontSize: "9px", py: "1px", px: "8px", whiteSpace: "nowrap", flexShrink: 0 }}
            >
              ← Back
            </Button>
          )}
          <Box
            sx={{ width: 4, height: 22, borderRadius: 1, bgcolor: "#005071", flexShrink: 0 }}
          />
          <Box>
            <Typography
              sx={{
                fontWeight: 700,
                color: isDark ? "text.primary" : "#005071",
                letterSpacing: "-0.3px",
                fontSize: "14px",
                lineHeight: 1.2,
              }}
            >
              DTC INVESTIGATION CENTER
            </Typography>
            {initPeakTs && (
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", fontFamily: "monospace", fontSize: "10px" }}
              >
                Pre-populated from alert · Peak: {initPeakTs.slice(0, 16)} ·
                Vehicle: {initVehicle} · Module: {initModule.toUpperCase()}
              </Typography>
            )}
          </Box>
        </Box>
        {peakTs && (
          <Chip
            size="small"
            label={`PEAK  ${String(peakTs).slice(0, 16)}`}
            sx={{
              borderRadius: "4px",
              fontFamily: "monospace",
              fontWeight: 700,
              fontSize: "10px",
              height: 22,
              bgcolor: isDark ? alpha("#ef4444", 0.12) : alpha("#ef4444", 0.07),
              color: "#ef4444",
              border: `1px solid ${alpha("#ef4444", 0.3)}`,
              letterSpacing: 0.3,
            }}
          />
        )}
      </Box>

      {/* SCROLLABLE BODY */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          pb: 2,
        }}
      >
        {/* CONTROL BAR */}
        <Paper
          sx={{
            ...cardSx,
            p: 1.5,
            display: "flex",
            gap: 1.5,
            alignItems: "center",
            flexWrap: "wrap",
            flexShrink: 0,
          }}
        >
          <FormControl size="small" sx={{ minWidth: 160, ...inputSx }}>
            <InputLabel sx={{ fontSize: "10px" }}>Vehicle</InputLabel>
            <Select
              value={selectedVehicle}
              onChange={(e) => setSelectedVehicle(e.target.value)}
              label="Vehicle"
              MenuProps={{
                PaperProps: {
                  sx: { "& .MuiMenuItem-root": { fontSize: "10px", fontFamily: "monospace" } },
                },
              }}
            >
              {vehicles.map((v: any) => (
                <MenuItem
                  key={v.vehicle_id}
                  value={v.vehicle_id}
                  sx={{ fontFamily: "monospace", fontSize: "10px" }}
                >
                  {v.vehicle_id}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <ToggleButtonGroup
            value={selectedModule}
            exclusive
            size="small"
            onChange={(_e, val) => {
              if (val) {
                setSelectedModule(val);
                setSelectedSensor(MODULE_SENSOR_KEYS[val]?.[0] || "");
              }
            }}
            sx={{
              border: `1px solid ${isDark ? alpha("#334155", 0.6) : alpha("#e2e8f0", 1)}`,
              borderRadius: 1.5,
              overflow: "hidden",
              "& .MuiToggleButton-root": {
                border: "none",
                borderRight: `1px solid ${isDark ? alpha("#334155", 0.6) : alpha("#e2e8f0", 1)}`,
                fontSize: "10px",
                fontWeight: 700,
                px: 1.5,
                height: 34,
                color: _axisColor,
                "&:last-child": { borderRight: "none" },
                "&.Mui-selected": {
                  color: "#ffffff",
                  "&:hover": { opacity: 0.9 },
                },
              },
            }}
          >
            {ALL_MODULES.map((mod) => (
              <ToggleButton
                key={mod}
                value={mod}
                sx={{
                  "&.Mui-selected": {
                    bgcolor: `${MODULE_COLORS[mod]} !important`,
                  },
                }}
              >
                {mod.toUpperCase()}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Box sx={{ flex: 1 }} />

          {/* EVENT PICKER */}
          <Button
            variant="outlined"
            size="small"
            endIcon={<KeyboardArrowDownIcon sx={{ fontSize: 14 }} />}
            onClick={(e) => setEventAnchor(e.currentTarget)}
            sx={{
              borderRadius: 1.5,
              fontSize: "10px",
              fontFamily: "monospace",
              fontWeight: peakTs ? 700 : 400,
              height: 34,
              minWidth: 280,
              justifyContent: "space-between",
              textTransform: "none",
              letterSpacing: 0,
              borderColor: peakTs
                ? alpha("#ef4444", 0.5)
                : isDark ? alpha("#7dd3fc", 0.2) : alpha("#94a3b8", 0.35),
              color: peakTs ? "#ef4444" : "text.disabled",
              bgcolor: peakTs
                ? isDark ? alpha("#ef4444", 0.06) : alpha("#ef4444", 0.03)
                : "transparent",
              "&:hover": {
                borderColor: peakTs ? alpha("#ef4444", 0.8) : alpha("#005071", 0.5),
                bgcolor: peakTs
                  ? isDark ? alpha("#ef4444", 0.1) : alpha("#ef4444", 0.05)
                  : isDark ? alpha("#005071", 0.06) : alpha("#005071", 0.03),
              },
            }}
          >
            {eventButtonLabel}
          </Button>

          <Popover
            open={Boolean(eventAnchor)}
            anchorEl={eventAnchor}
            onClose={() => setEventAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
            transformOrigin={{ vertical: "top", horizontal: "left" }}
            PaperProps={{
              sx: {
                mt: 0.5,
                borderRadius: 2,
                border: `1px solid ${isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)}`,
                bgcolor: isDark ? "#0b1724" : "#ffffff",
                boxShadow: isDark
                  ? "0 8px 32px rgba(0,0,0,0.6)"
                  : "0 8px 32px rgba(0,0,0,0.12)",
                minWidth: 520,
                maxHeight: 340,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              },
            }}
          >
            <Box
              sx={{
                px: 1.5,
                py: 1,
                borderBottom: `1px solid ${_tblBorder}`,
                display: "flex",
                alignItems: "center",
                gap: 1,
                flexShrink: 0,
              }}
            >
              <Box sx={{ width: 3, height: 12, borderRadius: 1, bgcolor: "#005071" }} />
              <Typography
                sx={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: isDark ? "#94a3b8" : "#64748b",
                }}
              >
                Fault Events — {selectedVehicle} / {selectedModule.toUpperCase()}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Typography sx={{ fontSize: "9px", color: "text.disabled", fontFamily: "monospace" }}>
                click to select · runs analysis automatically
              </Typography>
            </Box>
            <Box sx={{ overflowY: "auto", flex: 1 }}>
              {/* UNANALYZED ALERTS */}
              {alertsMetricsQuery.isLoading && (
                <Box sx={{ px: 1.5, py: 1, display: "flex", alignItems: "center", gap: 1, borderBottom: `1px solid ${_tblBorder}` }}>
                  <CircularProgress size={12} sx={{ color: "#ef4444" }} />
                  <Typography sx={{ fontSize: "9px", color: "text.disabled", fontFamily: "monospace" }}>
                    Loading alerts…
                  </Typography>
                </Box>
              )}
              {!alertsMetricsQuery.isLoading && unanalyzedAlerts.length > 0 && (
                <>
                  <Box
                    sx={{
                      px: 1.5,
                      py: 0.75,
                      bgcolor: isDark ? alpha("#ef4444", 0.06) : alpha("#ef4444", 0.03),
                      borderBottom: `1px solid ${_tblBorder}`,
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "9px",
                        fontWeight: 700,
                        letterSpacing: 0.8,
                        textTransform: "uppercase",
                        color: "#ef4444",
                      }}
                    >
                      Unanalyzed Alerts
                    </Typography>
                    <Chip
                      size="small"
                      label={unanalyzedAlerts.length}
                      sx={{
                        height: 16,
                        borderRadius: "3px",
                        fontSize: "9px",
                        fontWeight: 700,
                        bgcolor: alpha("#ef4444", 0.15),
                        color: "#ef4444",
                        border: `1px solid ${alpha("#ef4444", 0.3)}`,
                      }}
                    />
                    <Typography
                      sx={{ fontSize: "9px", color: "text.disabled", fontFamily: "monospace" }}
                    >
                      · click to run DTC analysis
                    </Typography>
                  </Box>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontFamily: "monospace",
                      fontSize: "10px",
                    }}
                  >
                    <thead>
                      <tr>
                        {["ALERT TIME", "PEAK TIMESTAMP", "MODULE", "SEVERITY"].map((h) => (
                          <th key={h} style={{ ...tblHeader, background: isDark ? "#1a0a0a" : "#3d0000", position: "sticky", top: 0, zIndex: 1 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {unanalyzedAlerts.map((alert: any, i: number) => {
                        const isSelected = alert.peak_anomaly_ts === peakTs;
                        const sev = (alert.severity || "warning").toLowerCase();
                        return (
                          <tr
                            key={i}
                            onClick={() => {
                              setPeakTs(alert.peak_anomaly_ts || "");
                              setEventAnchor(null);
                              setShouldRunAnalysis(true);
                            }}
                            style={{
                              borderBottom: `1px solid ${_tblBorder}`,
                              borderLeft: `3px solid ${sev === "critical" ? "#ef4444" : "#eab308"}`,
                              background: isSelected
                                ? isDark ? alpha("#ef4444", 0.15) : alpha("#ef4444", 0.06)
                                : i % 2 === 0 ? _tblEvenBg : "transparent",
                              cursor: "pointer",
                            }}
                          >
                            <td style={{ padding: "6px 12px", color: _axisColor }}>
                              {String(alert.alert_start_ts || "—").slice(0, 16)}
                            </td>
                            <td style={{ padding: "6px 12px", fontWeight: 700, color: "#ef4444" }}>
                              {String(alert.peak_anomaly_ts || "—").slice(0, 16)}
                            </td>
                            <td style={{ padding: "6px 12px", color: _axisColor, textTransform: "uppercase" }}>
                              {alert.module || "—"}
                            </td>
                            <td style={{ padding: "6px 12px" }}>
                              <span
                                style={{
                                  fontWeight: 700,
                                  fontSize: "9px",
                                  color: sev === "critical" ? "#ef4444" : "#eab308",
                                }}
                              >
                                {(alert.severity || "WARNING").toUpperCase()}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}

              {/* ANALYZED RUNS */}
              {!alertsMetricsQuery.isLoading && (candidateRuns.length > 0 || unanalyzedAlerts.length === 0) && (
                <>
                  {unanalyzedAlerts.length > 0 && (
                    <Box
                      sx={{
                        px: 1.5,
                        py: 0.75,
                        bgcolor: isDark ? alpha("#005071", 0.06) : alpha("#005071", 0.03),
                        borderBottom: `1px solid ${_tblBorder}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "9px",
                          fontWeight: 700,
                          letterSpacing: 0.8,
                          textTransform: "uppercase",
                          color: isDark ? "#94a3b8" : "#64748b",
                        }}
                      >
                        Analyzed Runs
                      </Typography>
                      <Chip
                        size="small"
                        label={candidateRuns.length}
                        sx={{
                          height: 16,
                          borderRadius: "3px",
                          fontSize: "9px",
                          fontWeight: 700,
                          bgcolor: isDark ? alpha("#3b82f6", 0.15) : alpha("#3b82f6", 0.08),
                          color: "#3b82f6",
                          border: `1px solid ${alpha("#3b82f6", 0.25)}`,
                        }}
                      />
                    </Box>
                  )}
                  {candidateRuns.length === 0 ? (
                    <Box sx={{ p: 2, textAlign: "center" }}>
                      <Typography sx={{ fontSize: "10px", color: "text.disabled", fontFamily: "monospace" }}>
                        {vehicleHistoryQuery.isLoading
                          ? "Loading…"
                          : "No analysis runs yet for this vehicle / module"}
                      </Typography>
                    </Box>
                  ) : (
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontFamily: "monospace",
                        fontSize: "10px",
                      }}
                    >
                      <thead>
                        <tr>
                          {["RUN TIME", "PEAK TIMESTAMP", "FAULT CODES", "SEVERITY"].map((h) => (
                            <th key={h} style={{ ...tblHeader, position: "sticky", top: 0, zIndex: 1 }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {candidateRuns.map((run: any, i: number) => {
                          const isSelected = run.peak_ts === peakTs;
                          const hasFaults = (run.triggers || []).length > 0;
                          const worstSev = (run.triggers || []).find(
                            (t: any) => t.severity === "critical" || t.severity === "CRITICAL"
                          )
                            ? "critical"
                            : hasFaults
                            ? "warning"
                            : "ok";
                          return (
                            <tr
                              key={i}
                              onClick={() => {
                                setPeakTs(run.peak_ts || "");
                                setEventAnchor(null);
                                setShouldRunAnalysis(true);
                              }}
                              style={{
                                borderBottom: `1px solid ${_tblBorder}`,
                                background: isSelected
                                  ? isDark
                                    ? alpha("#005071", 0.25)
                                    : alpha("#005071", 0.08)
                                  : i % 2 === 0
                                  ? _tblEvenBg
                                  : "transparent",
                                cursor: "pointer",
                              }}
                            >
                              <td style={{ padding: "6px 12px", color: _axisColor }}>
                                {String(run.run_ts || "—").slice(0, 16)}
                              </td>
                              <td
                                style={{
                                  padding: "6px 12px",
                                  fontWeight: 700,
                                  color: isSelected ? "#005071" : "#ef4444",
                                }}
                              >
                                {String(run.peak_ts || "—").slice(0, 16)}
                              </td>
                              <td style={{ padding: "6px 12px" }}>
                                {!hasFaults ? (
                                  <span style={{ color: "#22c55e", fontWeight: 600 }}>
                                    NO FAULTS
                                  </span>
                                ) : (
                                  (run.triggers as any[]).map((t: any, j: number) => (
                                    <span
                                      key={j}
                                      style={{
                                        display: "inline-block",
                                        marginRight: 4,
                                        padding: "1px 6px",
                                        fontSize: "9px",
                                        fontWeight: 700,
                                        borderRadius: 3,
                                        background: alpha(sevColor(t.severity), 0.15),
                                        color: sevColor(t.severity),
                                        border: `1px solid ${alpha(sevColor(t.severity), 0.3)}`,
                                      }}
                                    >
                                      {t.code}
                                    </span>
                                  ))
                                )}
                              </td>
                              <td style={{ padding: "6px 12px" }}>
                                {worstSev === "critical" && (
                                  <span style={{ color: "#ef4444", fontWeight: 700, fontSize: "9px" }}>
                                    CRITICAL
                                  </span>
                                )}
                                {worstSev === "warning" && (
                                  <span style={{ color: "#eab308", fontWeight: 700, fontSize: "9px" }}>
                                    WARNING
                                  </span>
                                )}
                                {worstSev === "ok" && (
                                  <span style={{ color: "#22c55e", fontWeight: 700, fontSize: "9px" }}>
                                    CLEAR
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </Box>

            {/* MANUAL ENTRY — always visible at the bottom */}
            <Box
              sx={{
                borderTop: `1px solid ${_tblBorder}`,
                px: 1.5,
                py: 1,
                display: "flex",
                alignItems: "center",
                gap: 1,
                bgcolor: isDark ? "#0d1117" : alpha("#f8fafc", 1),
                flexShrink: 0,
              }}
            >
              <Typography
                sx={{
                  fontSize: "9px",
                  fontWeight: 700,
                  color: isDark ? "#475569" : "#94a3b8",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}
              >
                Manual
              </Typography>
              <TextField
                size="small"
                placeholder="YYYY-MM-DD HH:MM:SS"
                value={manualTs}
                onChange={(e) => setManualTs(e.target.value)}
                sx={{
                  flex: 1,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 1,
                    fontSize: "10px",
                    fontFamily: "monospace",
                    height: 28,
                    bgcolor: isDark ? "#080c12" : "#ffffff",
                    "& fieldset": {
                      borderColor: isDark ? alpha("#7dd3fc", 0.2) : alpha("#94a3b8", 0.35),
                    },
                    "&:hover fieldset": {
                      borderColor: isDark ? alpha("#7dd3fc", 0.4) : alpha("#94a3b8", 0.6),
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: isDark ? "#38bdf8" : "#005071",
                    },
                  },
                  "& .MuiInputBase-input": { py: 0.5, fontFamily: "monospace" },
                }}
              />
              <Button
                size="small"
                variant="outlined"
                disabled={!manualTs.trim() || !selectedVehicle}
                onClick={() => {
                  setPeakTs(manualTs.trim());
                  setEventAnchor(null);
                  setShouldRunAnalysis(true);
                }}
                sx={{
                  borderRadius: 1,
                  fontSize: "9px",
                  fontWeight: 700,
                  height: 28,
                  minWidth: 60,
                  flexShrink: 0,
                  borderColor: isDark ? alpha("#7dd3fc", 0.3) : alpha("#005071", 0.4),
                  color: isDark ? "#7dd3fc" : "#005071",
                  "&:hover": {
                    borderColor: isDark ? "#7dd3fc" : "#005071",
                    bgcolor: isDark ? alpha("#7dd3fc", 0.06) : alpha("#005071", 0.04),
                  },
                  "&.Mui-disabled": { opacity: 0.4 },
                }}
              >
                SET
              </Button>
            </Box>
          </Popover>

          <Button
            variant="contained"
            size="small"
            startIcon={
              dtcAnalysisQuery.isFetching ? (
                <CircularProgress size={12} color="inherit" />
              ) : (
                <PlayArrowIcon sx={{ fontSize: 14 }} />
              )
            }
            disabled={!canRun || dtcAnalysisQuery.isFetching}
            onClick={() => dtcAnalysisQuery.refetch()}
            sx={{
              borderRadius: 1.5,
              boxShadow: "none",
              fontWeight: 700,
              fontSize: "10px",
              height: 34,
              minWidth: 160,
              bgcolor: "#ef4444",
              "&:hover": { bgcolor: "#dc2626", boxShadow: "none" },
              "&.Mui-disabled": { opacity: 0.5 },
            }}
          >
            {dtcAnalysisQuery.isFetching ? "RUNNING…" : "RUN ANALYSIS"}
          </Button>
        </Paper>

        {/* FAULT MATURATION ANALYSIS */}
        <Paper sx={{ ...cardSx, p: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 1,
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ width: 3, height: 12, borderRadius: 1, bgcolor: "#ef4444" }} />
              <Typography
                sx={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: isDark ? "#94a3b8" : "#64748b",
                }}
              >
                DTC Prediction Engine
                <span
                  style={{
                    color: isDark ? "#475569" : "#94a3b8",
                    fontWeight: 400,
                    marginLeft: 6,
                    letterSpacing: 0,
                  }}
                >
                  · Fault Maturation Analysis
                </span>
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center" }}>
              {analysisData?.success === true && analysisTriggered.length === 0 && (
                <Chip
                  size="small"
                  label="NO FAULTS TRIGGERED"
                  sx={{
                    borderRadius: "4px",
                    bgcolor: isDark ? alpha("#22c55e", 0.12) : alpha("#22c55e", 0.08),
                    color: "#22c55e",
                    fontWeight: 700,
                    fontSize: "10px",
                    height: 20,
                    border: `1px solid ${alpha("#22c55e", 0.25)}`,
                  }}
                />
              )}
              {analysisTriggered.length > 0 && (
                <>
                  <Typography
                    variant="caption"
                    sx={{ color: "text.disabled", fontSize: "10px", mr: 0.5, fontFamily: "monospace" }}
                  >
                    TRIGGERED:
                  </Typography>
                  {analysisTriggered.map((t: any, i: number) => (
                    <Chip
                      key={i}
                      size="small"
                      label={`${t.code} · ${t.severity?.toUpperCase()}`}
                      onClick={() => setSelectedDtcCode(t.code)}
                      sx={{
                        borderRadius: "4px",
                        fontFamily: "monospace",
                        fontWeight: 700,
                        fontSize: "10px",
                        height: 20,
                        cursor: "pointer",
                        bgcolor: sevBg(t.severity),
                        color: sevColor(t.severity),
                        border: `1px solid ${alpha(sevColor(t.severity), 0.4)}`,
                      }}
                    />
                  ))}
                </>
              )}
            </Box>
          </Box>

          {dtcAnalysisQuery.isFetching ? (
            <Box
              sx={{
                height: 300,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <CircularProgress
                size={28}
                sx={{ color: "#ef4444" }}
                thickness={3}
              />
              <Typography
                variant="caption"
                sx={{ color: "text.disabled", fontFamily: "monospace", textAlign: "center" }}
              >
                Running PyTorch DTC inference · {selectedVehicle} /{" "}
                {selectedModule.toUpperCase()} · this may take up to 60 s
              </Typography>
            </Box>
          ) : analysisData?.error ? (
            <Box
              sx={{
                height: 300,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 2,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: "#ef4444",
                  fontFamily: "monospace",
                  textAlign: "center",
                  lineHeight: 1.6,
                }}
              >
                {analysisData.error}
              </Typography>
            </Box>
          ) : criticalPlot || nonCriticalPlot ? (
            <Box sx={{ display: "flex", gap: 2 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#ef4444" }} />
                  <Typography
                    sx={{ fontSize: "10px", fontWeight: 700, color: "#ef4444", letterSpacing: 0.5 }}
                  >
                    CRITICAL FAULT MATURATION
                  </Typography>
                </Box>
                {criticalPlot ? (
                  <Plot
                    data={criticalPlot.data}
                    layout={{ ...(criticalPlot.layout || {}), ...plotLayout }}
                    style={{ width: "100%", height: 290 }}
                    useResizeHandler
                    config={{ displayModeBar: false, responsive: true }}
                  />
                ) : (
                  <Box
                    sx={{
                      height: 290,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1px dashed ${_tblBorder}`,
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="caption" color="text.disabled" sx={{ fontFamily: "monospace" }}>
                      No critical fault activity detected
                    </Typography>
                  </Box>
                )}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#eab308" }} />
                  <Typography
                    sx={{ fontSize: "10px", fontWeight: 700, color: "#eab308", letterSpacing: 0.5 }}
                  >
                    NON-CRITICAL FAULT MATURATION
                  </Typography>
                </Box>
                {nonCriticalPlot ? (
                  <Plot
                    data={nonCriticalPlot.data}
                    layout={{ ...(nonCriticalPlot.layout || {}), ...plotLayout }}
                    style={{ width: "100%", height: 290 }}
                    useResizeHandler
                    config={{ displayModeBar: false, responsive: true }}
                  />
                ) : (
                  <Box
                    sx={{
                      height: 290,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1px dashed ${_tblBorder}`,
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="caption" color="text.disabled" sx={{ fontFamily: "monospace" }}>
                      No non-critical fault activity detected
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          ) : (
            <Box
              sx={{
                height: 300,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 1,
                border: `1px dashed ${_tblBorder}`,
                borderRadius: 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: "text.disabled", fontFamily: "monospace", textAlign: "center" }}
              >
                Select vehicle + module + peak timestamp, then click RUN DTC ANALYSIS
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "text.disabled", fontFamily: "monospace", fontSize: "10px", textAlign: "center" }}
              >
                Runs PyTorch ML models · produces critical and non-critical fault maturation curves
              </Typography>
            </Box>
          )}
        </Paper>

        {/* HISTORY + DTC DETAIL */}
        <Box sx={{ display: "flex", gap: 1.5 }}>
          {/* VEHICLE ANALYSIS HISTORY */}
          <Paper
            sx={{
              ...cardSx,
              flex: 2,
              p: 1.5,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 0.5,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ width: 3, height: 12, borderRadius: 1, bgcolor: "#3b82f6" }} />
                <Typography
                  sx={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    color: isDark ? "#94a3b8" : "#64748b",
                  }}
                >
                  Vehicle Analysis History
                  <span
                    style={{ fontWeight: 400, marginLeft: 6, letterSpacing: 0 }}
                  >
                    · {selectedVehicle || "—"} / {selectedModule.toUpperCase()}
                  </span>
                </Typography>
              </Box>
              <Typography
                variant="caption"
                sx={{ color: "text.disabled", fontFamily: "monospace", fontSize: "9px" }}
              >
                click row → load peak_ts · click code → inspect
              </Typography>
            </Box>

            <Box
              sx={{
                maxHeight: 220,
                overflowY: "auto",
                border: `1px solid ${_tblBorder}`,
                borderRadius: 1,
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontFamily: "monospace",
                  fontSize: "11px",
                }}
              >
                <thead>
                  <tr>
                    {["RUN TIME", "PEAK TS", "TRIGGERED CODES"].map((h) => (
                      <th key={h} style={tblHeader}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {candidateRuns.length > 0 ? (
                    candidateRuns.map((run: any, i: number) => (
                      <tr
                        key={i}
                        onClick={() => setPeakTs(run.peak_ts || "")}
                        title="Click to load peak timestamp"
                        style={{
                          borderBottom: `1px solid ${_tblBorder}`,
                          background: i % 2 === 0 ? _tblEvenBg : "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <td style={{ padding: "5px 12px", color: _axisColor }}>
                          {String(run.run_ts || "—").slice(0, 16)}
                        </td>
                        <td
                          style={{
                            padding: "5px 12px",
                            fontWeight: peakTs === run.peak_ts ? 700 : 400,
                            color: peakTs === run.peak_ts ? "#3b82f6" : _axisColor,
                          }}
                        >
                          {String(run.peak_ts || "—").slice(0, 16)}
                        </td>
                        <td style={{ padding: "5px 12px" }}>
                          {(run.triggers || []).length === 0 ? (
                            <span style={{ color: "#22c55e", fontWeight: 600 }}>
                              NO FAULTS
                            </span>
                          ) : (
                            (run.triggers as any[]).map((t: any, j: number) => (
                              <span
                                key={j}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedDtcCode(t.code);
                                }}
                                title="Click to inspect DTC detail"
                                style={{
                                  display: "inline-block",
                                  marginRight: 5,
                                  padding: "2px 7px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                  borderRadius: 4,
                                  background:
                                    t.code === selectedDtcCode
                                      ? "#3b82f6"
                                      : sevColor(t.severity),
                                  color: "white",
                                }}
                              >
                                {t.code}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={3}
                        style={{
                          padding: "14px 12px",
                          color: _axisColor,
                          textAlign: "center",
                          fontSize: "10px",
                        }}
                      >
                        {vehicleHistoryQuery.isLoading
                          ? "Loading…"
                          : "No analysis runs yet — click RUN DTC ANALYSIS above to start"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Box>
          </Paper>

          {/* DTC DETAIL PANEL */}
          <Paper
            sx={{
              ...cardSx,
              flex: 1,
              p: 1.5,
              display: "flex",
              flexDirection: "column",
              gap: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ width: 3, height: 12, borderRadius: 1, bgcolor: "#a855f7" }} />
              <Typography
                sx={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: isDark ? "#94a3b8" : "#64748b",
                }}
              >
                DTC Detail
              </Typography>
            </Box>

            {selectedDtcDetail ? (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                <Box sx={{ display: "flex", gap: 0.75, alignItems: "center", flexWrap: "wrap" }}>
                  <Typography
                    sx={{
                      fontWeight: 800,
                      fontFamily: "monospace",
                      color: "text.primary",
                      fontSize: "18px",
                      letterSpacing: "-0.5px",
                    }}
                  >
                    {selectedDtcDetail.dtc_code}
                  </Typography>
                  <Chip
                    size="small"
                    label={selectedDtcDetail.severity?.toUpperCase() || "?"}
                    sx={{
                      borderRadius: "4px",
                      fontWeight: 700,
                      fontSize: "10px",
                      bgcolor: alpha(sevColor(selectedDtcDetail.severity), 0.15),
                      color: sevColor(selectedDtcDetail.severity),
                      border: `1px solid ${alpha(sevColor(selectedDtcDetail.severity), 0.4)}`,
                      height: 20,
                    }}
                  />
                  <Chip
                    size="small"
                    label={selectedDtcDetail.category}
                    sx={{
                      borderRadius: "4px",
                      fontWeight: 700,
                      fontSize: "10px",
                      bgcolor: isDark ? alpha("#3b82f6", 0.15) : alpha("#3b82f6", 0.08),
                      color: "#3b82f6",
                      border: `1px solid ${alpha("#3b82f6", 0.25)}`,
                      height: 20,
                    }}
                  />
                </Box>

                <Box
                  sx={{
                    p: 1,
                    bgcolor: isDark ? "#0d1117" : alpha("#f8fafc", 1),
                    border: `1px solid ${_tblBorder}`,
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "9px",
                      fontWeight: 700,
                      fontFamily: "monospace",
                      color: isDark ? "#475569" : "#94a3b8",
                      letterSpacing: 0.6,
                      mb: 0.5,
                      display: "block",
                      textTransform: "uppercase",
                    }}
                  >
                    Description
                  </Typography>
                  <Typography
                    sx={{ fontSize: "11px", fontFamily: "monospace", color: "text.primary", lineHeight: 1.5 }}
                  >
                    {selectedDtcDetail.description}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    p: 1,
                    bgcolor: sevBg(selectedDtcDetail.severity),
                    border: `1px solid ${alpha(sevColor(selectedDtcDetail.severity), 0.3)}`,
                    borderRadius: 1,
                    borderLeft: `3px solid ${sevColor(selectedDtcDetail.severity)}`,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "9px",
                      fontWeight: 700,
                      fontFamily: "monospace",
                      color: isDark ? "#475569" : "#94a3b8",
                      letterSpacing: 0.6,
                      mb: 0.5,
                      display: "block",
                      textTransform: "uppercase",
                    }}
                  >
                    Dashboard Message
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "11px",
                      fontFamily: "monospace",
                      color: sevColor(selectedDtcDetail.severity),
                      lineHeight: 1.5,
                    }}
                  >
                    {selectedDtcDetail.dashboard_message}
                  </Typography>
                </Box>

                {selectedDtcDetail.features?.length > 0 && (
                  <Box>
                    <Typography
                      sx={{
                        fontSize: "9px",
                        fontWeight: 700,
                        fontFamily: "monospace",
                        color: isDark ? "#475569" : "#94a3b8",
                        letterSpacing: 0.6,
                        mb: 0.5,
                        display: "block",
                        textTransform: "uppercase",
                      }}
                    >
                      Monitored Features
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {(selectedDtcDetail.features as string[]).map((f: string) => (
                        <Chip
                          key={f}
                          size="small"
                          label={f.replace(/_/g, " ")}
                          onClick={() => {
                            setSelectedSensor(f);
                            setLoadEvidence(true);
                          }}
                          sx={{
                            borderRadius: "4px",
                            fontFamily: "monospace",
                            fontSize: "9px",
                            height: 18,
                            cursor: "pointer",
                            bgcolor: isDark ? alpha("#22c55e", 0.1) : alpha("#22c55e", 0.07),
                            color: isDark ? "#4ade80" : "#16a34a",
                            border: `1px solid ${alpha("#22c55e", 0.2)}`,
                          }}
                        />
                      ))}
                    </Box>
                    <Typography
                      sx={{ color: "text.disabled", fontSize: "9px", mt: 0.5, display: "block", fontFamily: "monospace" }}
                    >
                      click feature → load sensor evidence
                    </Typography>
                  </Box>
                )}
              </Box>
            ) : (
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 1,
                  minHeight: 140,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: "text.disabled", textAlign: "center", fontFamily: "monospace", fontSize: "10px" }}
                >
                  Click a DTC code from triggered chips or history table
                </Typography>
                {allTriggeredCodes.length > 0 && (
                  <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", justifyContent: "center" }}>
                    {allTriggeredCodes.map((code) => (
                      <Chip
                        key={code}
                        size="small"
                        label={code}
                        onClick={() => setSelectedDtcCode(code)}
                        sx={{
                          borderRadius: "4px",
                          fontFamily: "monospace",
                          fontWeight: 700,
                          fontSize: "10px",
                          cursor: "pointer",
                          bgcolor: isDark ? SEVERITY_BG_DARK.CRITICAL : SEVERITY_BG_LIGHT.CRITICAL,
                          color: "#ef4444",
                          border: `1px solid ${alpha("#ef4444", 0.3)}`,
                        }}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Paper>
        </Box>

        {/* SENSOR EVIDENCE */}
        <Paper sx={{ ...cardSx, p: 1.5 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              mb: 1,
              flexWrap: "wrap",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 3,
                  height: 12,
                  borderRadius: 1,
                  bgcolor: MODULE_COLORS[selectedModule],
                }}
              />
              <Typography
                sx={{
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: isDark ? "#94a3b8" : "#64748b",
                }}
              >
                Sensor Evidence
                {peakTs && (
                  <span style={{ color: "#ef4444", marginLeft: 6, fontWeight: 700 }}>
                    · PEAK {peakTs.slice(0, 16)}
                  </span>
                )}
              </Typography>
            </Box>

            <FormControl size="small" sx={{ minWidth: 240, ...inputSx }}>
              <InputLabel sx={{ fontSize: "10px" }}>Sensor</InputLabel>
              <Select
                value={selectedSensor}
                onChange={(e) => setSelectedSensor(e.target.value)}
                label="Sensor"
                MenuProps={{
                  PaperProps: {
                    sx: {
                      "& .MuiMenuItem-root": { fontSize: "10px", fontFamily: "monospace" },
                    },
                  },
                }}
                sx={{ "& .MuiSelect-select": { fontFamily: "monospace" } }}
              >
                {sensorKeys.map((k) => (
                  <MenuItem key={k} value={k} sx={{ fontFamily: "monospace", fontSize: "10px" }}>
                    {k.replace(/_/g, " ").toUpperCase()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ minWidth: 130, ...inputSx }}>
              <InputLabel sx={{ fontSize: "10px" }}>Window (min)</InputLabel>
              <Select
                value={evidenceWindow}
                onChange={(e) => setEvidenceWindow(Number(e.target.value))}
                label="Window (min)"
                MenuProps={{
                  PaperProps: {
                    sx: { "& .MuiMenuItem-root": { fontSize: "10px" } },
                  },
                }}
              >
                {[30, 60, 120, 240, 480].map((w) => (
                  <MenuItem key={w} value={w} sx={{ fontSize: "10px" }}>
                    {w} min
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              size="small"
              disabled={!selectedVehicle || !selectedSensor}
              onClick={() => setLoadEvidence(true)}
              sx={{
                borderRadius: 1.5,
                boxShadow: "none",
                fontWeight: 700,
                fontSize: "10px",
                height: 34,
                bgcolor: "#005071",
                "&:hover": { bgcolor: "#003d56", boxShadow: "none" },
                "&.Mui-disabled": { opacity: 0.45 },
              }}
            >
              LOAD EVIDENCE
            </Button>

            {sensorEvidenceQuery.data?.data_source && (
              <Chip
                size="small"
                label={sensorEvidenceQuery.data.data_source}
                sx={{
                  borderRadius: "4px",
                  fontWeight: 700,
                  fontSize: "10px",
                  height: 20,
                  bgcolor: isDark ? alpha("#3b82f6", 0.12) : alpha("#3b82f6", 0.08),
                  color: isDark ? "#93c5fd" : "#2563eb",
                  border: `1px solid ${alpha("#3b82f6", 0.2)}`,
                }}
              />
            )}

            {evidenceData.length > 0 && (
              <Chip
                size="small"
                label={`${evidenceData.length} pts`}
                sx={{
                  borderRadius: "4px",
                  fontWeight: 700,
                  fontSize: "10px",
                  height: 20,
                  bgcolor: isDark ? alpha("#f59e0b", 0.12) : alpha("#d97706", 0.08),
                  color: isDark ? "#fbbf24" : "#b45309",
                  border: `1px solid ${isDark ? alpha("#f59e0b", 0.28) : alpha("#d97706", 0.22)}`,
                }}
              />
            )}
          </Box>

          {selectedSensor && (
            <Box
              sx={{
                mb: 0.75,
                px: 0.5,
                display: "flex",
                alignItems: "center",
                gap: 1,
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: MODULE_COLORS[selectedModule],
                  flexShrink: 0,
                }}
              />
              <Typography
                sx={{
                  fontSize: "11px",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: isDark ? "text.primary" : "#005071",
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                {selectedSensor.replace(/_/g, " ")}
              </Typography>
              {selectedDtcDetail && (
                <Typography
                  sx={{ fontSize: "10px", color: "text.disabled", fontFamily: "monospace" }}
                >
                  · monitored by {selectedDtcDetail.dtc_code}
                </Typography>
              )}
            </Box>
          )}

          <Box sx={{ height: 260, position: "relative" }}>
            {sensorEvidenceQuery.isFetching ? (
              <Box
                sx={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "column",
                  gap: 1.5,
                }}
              >
                <CircularProgress
                  size={24}
                  sx={{ color: MODULE_COLORS[selectedModule] }}
                  thickness={3}
                />
                <Typography variant="caption" sx={{ color: "text.disabled", fontFamily: "monospace" }}>
                  Loading sensor data…
                </Typography>
              </Box>
            ) : evidenceData.length === 0 ? (
              <Box
                sx={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `1px dashed ${_tblBorder}`,
                  borderRadius: 1,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: "text.disabled", fontFamily: "monospace", textAlign: "center" }}
                >
                  {loadEvidence
                    ? "No bronze data found for this vehicle / module / sensor"
                    : "Select vehicle, sensor, and click LOAD EVIDENCE"}
                </Typography>
              </Box>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={evidenceData}
                  margin={{ top: 8, right: 16, left: -18, bottom: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={_gridColor}
                  />
                  <XAxis
                    dataKey="ts"
                    tick={axisStyle}
                    axisLine={{ stroke: _tblBorder }}
                    tickLine={false}
                    minTickGap={40}
                    tickFormatter={(v: string) => String(v).slice(5, 16)}
                  />
                  <YAxis
                    tick={axisStyle}
                    axisLine={{ stroke: _tblBorder }}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{
                      stroke: isDark ? alpha("#7dd3fc", 0.3) : alpha("#3b82f6", 0.2),
                      strokeWidth: 1,
                    }}
                    contentStyle={tooltipStyle}
                    labelFormatter={(v: string) => String(v).slice(0, 16)}
                    formatter={(val: number) => [
                      val?.toFixed(3),
                      selectedSensor.replace(/_/g, " ").toUpperCase(),
                    ]}
                  />
                  {peakTsMs && winS < winE && xData[winS] && xData[winE] && (
                    <ReferenceArea
                      x1={xData[winS]}
                      x2={xData[winE]}
                      fill="rgba(239,68,68,0.08)"
                      stroke={alpha("#ef4444", 0.2)}
                      strokeWidth={1}
                    />
                  )}
                  {peakIdx >= 0 && (
                    <ReferenceLine
                      x={xData[peakIdx]}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      strokeWidth={2}
                      label={{
                        value: "PEAK",
                        position: "top",
                        fill: "#ef4444",
                        fontSize: 9,
                        fontFamily: "monospace",
                        fontWeight: 700,
                      }}
                    />
                  )}
                  {peakIdx >= 0 && evidenceData[peakIdx] !== undefined && (
                    <ReferenceDot
                      x={xData[peakIdx]}
                      y={evidenceData[peakIdx]?.value}
                      r={6}
                      fill="#ef4444"
                      stroke={isDark ? "#0b1724" : "#ffffff"}
                      strokeWidth={2}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={selectedSensor.replace(/_/g, " ").toUpperCase()}
                    stroke={MODULE_COLORS[selectedModule] || "#3b82f6"}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                  <Brush
                    dataKey="ts"
                    height={16}
                    stroke={isDark ? alpha("#7dd3fc", 0.4) : alpha("#3b82f6", 0.4)}
                    fill={isDark ? alpha("#0d2137", 0.85) : alpha("#e2eaf4", 0.9)}
                    travellerWidth={6}
                    tickFormatter={(v: string) => String(v).slice(5, 13)}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}
