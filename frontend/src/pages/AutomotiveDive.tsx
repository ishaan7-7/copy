import React, { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Plot from "react-plotly.js";
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
  Chip,
  Grid,
  Button,
  IconButton,
  Badge,
  Dialog,
  DialogContent,
  DialogTitle,
  Tabs,
  Tab,
  Divider,
  CircularProgress,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { ClientSideRowModelModule, ModuleRegistry } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useStore } from "../store";
import { useChartTheme } from "../hooks/useChartTheme";
import EChart from "../components/EChart";
import type { EChartsOption } from "echarts";
import TimeRangePicker from "../components/TimeRangePicker";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  MODULE_COLORS,
  SHAP_COLORS_LIGHT,
  SHAP_COLORS_DARK,
} from "../constants/chartColors";
import DirectionsCarFilledRoundedIcon from "@mui/icons-material/DirectionsCarFilledRounded";
import TableRowsRoundedIcon from "@mui/icons-material/TableRowsRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import CommuteRoundedIcon from "@mui/icons-material/CommuteRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import SensorsRoundedIcon from "@mui/icons-material/SensorsRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const API = "http://127.0.0.1:8005";

const ALL_MODULES = ["engine", "transmission", "battery", "body", "tyre"];

const ALL_MODULES_NEW = [
  { field: "engine_contrib", header: "ENGINE", width: 95 },
  { field: "transmission_contrib", header: "TRANSMISSION", width: 110 },
  { field: "battery_contrib", header: "BATTERY", width: 95 },
  { field: "body_contrib", header: "BODY", width: 95 },
  { field: "tyre_contrib", header: "TYRE", width: 95 },
];
const getHealthColor = (score: number) => {
  if (score > 90) return "#2E7D32";
  if (score > 80) return "#66BB6A";
  if (score > 50) return "#FFA000";
  return "#E53935";
};

const MODULE_WEIGHTS: Record<string, number> = {
  engine: 0.35,
  transmission: 0.25,
  battery: 0.2,
  body: 0.1,
  tyre: 0.1,
};

type XAxisMode = "timestamp" | "mileage";

const MODULE_CHART_GROUPS: Record<
  string,
  { title: string; sensors: { key: string; color: string; label: string }[] }[]
> = {
  engine: [
    {
      title: "ENGINE RPM",
      sensors: [{ key: "engine_rpm_rpm", color: "#e57373", label: "RPM" }],
    },
    {
      title: "TEMPERATURES",
      sensors: [
        {
          key: "ecu_7ea_engine_coolant_temperature",
          color: "#ff7043",
          label: "Coolant °C",
        },
        { key: "engine_oil_temperature", color: "#ffa726", label: "Oil °C" },
      ],
    },
    {
      title: "ENGINE LOAD %",
      sensors: [
        { key: "engine_load_absolute", color: "#ab47bc", label: "Load %" },
      ],
    },
    {
      title: "FUEL FLOW (L/h)",
      sensors: [
        { key: "fuel_flow_rate_hour_l_hr", color: "#42a5f5", label: "L/h" },
      ],
    },
    {
      title: "TURBO BOOST (psi)",
      sensors: [
        { key: "turbo_boost_vacuum_gauge_psi", color: "#26c6da", label: "psi" },
      ],
    },
    {
      title: "MODULE VOLTAGE (V)",
      sensors: [
        { key: "voltage_control_module_v", color: "#66bb6a", label: "V" },
      ],
    },
  ],
  battery: [
    {
      title: "STATE OF CHARGE (%)",
      sensors: [
        {
          key: "battery_state_of_charge_soc_pct",
          color: "#66bb6a",
          label: "SoC %",
        },
      ],
    },
    {
      title: "STATE OF HEALTH (%)",
      sensors: [
        {
          key: "battery_state_of_health_soh_pct",
          color: "#26a69a",
          label: "SoH %",
        },
      ],
    },
    {
      title: "VOLTAGE",
      sensors: [
        { key: "battery_voltage_ecu_7ee", color: "#42a5f5", label: "12V (V)" },
        {
          key: "hv_battery_pack_voltage",
          color: "#1565c0",
          label: "HV Pack (V)",
        },
      ],
    },
    {
      title: "CELL TEMPERATURE (°C)",
      sensors: [
        { key: "battery_temperature_cell", color: "#ef5350", label: "°C" },
      ],
    },
    {
      title: "INTERNAL RESISTANCE (Ohm)",
      sensors: [
        { key: "internal_resistance_impedance", color: "#ab47bc", label: "Ohm" },
      ],
    },
    {
      title: "CHARGING POWER (kW)",
      sensors: [{ key: "charging_power_kw", color: "#ec407a", label: "kW" }],
    },
  ],
  body: [
    {
      title: "FUEL LEVEL (%)",
      sensors: [{ key: "fuel_level_pct", color: "#42a5f5", label: "%" }],
    },
    {
      title: "CABIN TEMPERATURE (°C)",
      sensors: [{ key: "cabin_temperature", color: "#66bb6a", label: "°C" }],
    },
    {
      title: "CABIN HUMIDITY (%)",
      sensors: [{ key: "cabin_humidity_pct", color: "#7e57c2", label: "%" }],
    },
    {
      title: "HVAC & AC",
      sensors: [
        { key: "hvac_blower_speed", color: "#26c6da", label: "Blower Speed" },
        { key: "ac_compressor_load_pct", color: "#0097a7", label: "AC Load %" },
      ],
    },
    {
      title: "ODOMETER (km)",
      sensors: [{ key: "odometer_reading", color: "#78909c", label: "km" }],
    },
  ],
  transmission: [
    {
      title: "OIL TEMPERATURE (°C)",
      sensors: [
        { key: "transmission_oil_temperature", color: "#ffb74d", label: "°C" },
      ],
    },
    {
      title: "VEHICLE SPEED (km/h)",
      sensors: [{ key: "vehicle_speed_kmh", color: "#42a5f5", label: "km/h" }],
    },
    {
      title: "ENGINE TORQUE (%)",
      sensors: [
        { key: "actual_engine_pct_torque", color: "#ab47bc", label: "%" },
      ],
    },
    {
      title: "GEAR POSITION",
      sensors: [
        { key: "gear_position_actual", color: "#66bb6a", label: "Gear" },
      ],
    },
    {
      title: "CLUTCH SLIP",
      sensors: [
        { key: "clutch_engagement_per_slip", color: "#ef5350", label: "slip" },
      ],
    },
    {
      title: "TC SLIP SPEED (rpm)",
      sensors: [
        { key: "torque_converter_slip_speed", color: "#ffa726", label: "rpm" },
      ],
    },
  ],
  tyre: [
    {
      title: "PRESSURE  -  FRONT (psi)",
      sensors: [
        { key: "tyre_pressure_fl_psi", color: "#4dd0e1", label: "FL" },
        { key: "tyre_pressure_fr_psi", color: "#42a5f5", label: "FR" },
      ],
    },
    {
      title: "PRESSURE  -  REAR (psi)",
      sensors: [
        { key: "tyre_pressure_rl_psi", color: "#26a69a", label: "RL" },
        { key: "tyre_pressure_rr_psi", color: "#66bb6a", label: "RR" },
      ],
    },
    {
      title: "TEMP  -  FRONT (°C)",
      sensors: [
        { key: "tyre_temp_fl_c", color: "#ef5350", label: "FL" },
        { key: "tyre_temp_fr_c", color: "#ff7043", label: "FR" },
      ],
    },
    {
      title: "WEAR  -  FRONT (%)",
      sensors: [
        { key: "tyre_wear_fl_pct", color: "#ffa726", label: "FL" },
        { key: "tyre_wear_fr_pct", color: "#ffca28", label: "FR" },
      ],
    },
    {
      title: "WEAR  -  REAR (%)",
      sensors: [
        { key: "tyre_wear_rl_pct", color: "#a5d6a7", label: "RL" },
        { key: "tyre_wear_rr_pct", color: "#80cbc4", label: "RR" },
      ],
    },
  ],
};

const MODULE_KPI_FIELDS: Record<
  string,
  {
    key: string;
    label: string;
    unit: string;
    warnFn?: (v: number) => boolean;
  }[]
> = {
  engine: [
    { key: "engine_rpm_rpm", label: "RPM", unit: "rpm" },
    {
      key: "ecu_7ea_engine_coolant_temperature",
      label: "Coolant",
      unit: "°C",
      warnFn: (v) => v > 100,
    },
    {
      key: "engine_oil_temperature",
      label: "Oil Temp",
      unit: "°C",
      warnFn: (v) => v > 110,
    },
    {
      key: "engine_load_absolute",
      label: "Load",
      unit: "%",
      warnFn: (v) => v > 75,
    },
    { key: "fuel_flow_rate_hour_l_hr", label: "Fuel Flow", unit: "L/h" },
  ],
  battery: [
    {
      key: "battery_state_of_charge_soc_pct",
      label: "SoC",
      unit: "%",
      warnFn: (v) => v < 25,
    },
    {
      key: "battery_state_of_health_soh_pct",
      label: "SoH",
      unit: "%",
      warnFn: (v) => v < 85,
    },
    {
      key: "battery_voltage_ecu_7ee",
      label: "12V Battery",
      unit: "V",
      warnFn: (v) => v < 12.2,
    },
    {
      key: "battery_temperature_cell",
      label: "Cell Temp",
      unit: "°C",
      warnFn: (v) => v > 45,
    },
    {
      key: "internal_resistance_impedance",
      label: "Int. Resistance",
      unit: "Ohm",
      warnFn: (v) => v > 0.015,
    },
  ],
  body: [
    {
      key: "fuel_level_pct",
      label: "Fuel Level",
      unit: "%",
      warnFn: (v) => v < 15,
    },
    { key: "cabin_temperature", label: "Cabin Temp", unit: "°C" },
    { key: "cabin_humidity_pct", label: "Humidity", unit: "%" },
    { key: "ac_compressor_load_pct", label: "AC Load", unit: "%" },
    { key: "odometer_reading", label: "Odometer", unit: "km" },
  ],
  transmission: [
    {
      key: "transmission_oil_temperature",
      label: "Oil Temp",
      unit: "°C",
      warnFn: (v) => v > 95,
    },
    { key: "vehicle_speed_kmh", label: "Speed", unit: "km/h" },
    { key: "gear_position_actual", label: "Gear", unit: "" },
    { key: "actual_engine_pct_torque", label: "Torque", unit: "%" },
    {
      key: "torque_converter_slip_speed",
      label: "TC Slip",
      unit: "rpm",
      warnFn: (v) => v > 80,
    },
  ],
  tyre: [
    {
      key: "tyre_pressure_fl_psi",
      label: "FL Pressure",
      unit: "psi",
      warnFn: (v) => v < 30 || v > 38,
    },
    {
      key: "tyre_pressure_fr_psi",
      label: "FR Pressure",
      unit: "psi",
      warnFn: (v) => v < 30 || v > 38,
    },
    {
      key: "tyre_wear_fl_pct",
      label: "FL Wear",
      unit: "%",
      warnFn: (v) => v < 70,
    },
    {
      key: "tyre_wear_fr_pct",
      label: "FR Wear",
      unit: "%",
      warnFn: (v) => v < 70,
    },
    {
      key: "tyre_temp_fl_c",
      label: "FL Temp",
      unit: "°C",
      warnFn: (v) => v > 80,
    },
  ],
};

function buildPlotLayout(darkMode: boolean) {
  const textColor = darkMode ? "#e8ecf0" : "#212121";
  const gridColor = darkMode ? "#2a3a4a" : "#e0e0e0";
  const lineColor = darkMode ? "#2a3a4a" : "#bdbdbd";
  const tickColor = darkMode ? "#8a9bb0" : "#616161";
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
    xaxis: {
      gridcolor: gridColor,
      linecolor: lineColor,
      tickfont: { color: tickColor },
    },
    yaxis: {
      gridcolor: gridColor,
      linecolor: lineColor,
      tickfont: { color: tickColor },
    },
  };
}

function formatXTick(val: string | number, mode: XAxisMode): string {
  if (mode === "mileage") return `${Math.round(Number(val)).toLocaleString()}`;
  const s = String(val);
  if (s.includes("T")) return s.slice(5, 16).replace("T", " ");
  if (s.length >= 16) return s.slice(5, 16);
  return s;
}

function parseTopFeatures(raw: string): { feature: string; score: number }[] {
  if (!raw) return [];
  try {
    const obj = JSON.parse(String(raw));
    return Object.entries(obj)
      .map(([k, v]) => ({ feature: k, score: Number(v) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch {
    return String(raw)
      .split(",")
      .map((part) => {
        const [f, s] = part.trim().split(":");
        return { feature: (f || "").trim(), score: Number((s || "0").trim()) };
      })
      .filter((x) => x.feature && !isNaN(x.score))
      .slice(0, 5);
  }
}

function formatFeatureKey(k: string): string {
  return k
    .replace(/_calculated/g, "")
    .replace(/_absolute/g, "")
    .replace(/_sensor_\d+/g, "")
    .replace(/_bank_\d+/g, "")
    .replace(/_pct$/g, "")
    .replace(/_voltage_v$/g, "")
    .replace(/_voltage$/g, "")
    .replace(/_rpm$/g, "")
    .replace(/_g_s$/g, "")
    .replace(/_kpa$/g, "")
    .replace(/_bar$/g, "")
    .split("_")
    .filter((w) => w.length > 1 || /\d/.test(w))
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 22);
}

function SensorChart({
  data,
  group,
  xAxisMode,
  height = 210,
}: {
  data: any[];
  group: {
    title: string;
    sensors: { key: string; color: string; label: string }[];
  };
  xAxisMode: XAxisMode;
  height?: number | string;
}) {
  const ct = useChartTheme();
  const darkMode = useStore((s) => s.darkMode);
  const axisStyle = { fontSize: "10px", fill: ct.axisColor, fontWeight: 600 };
  const tooltipStyle = {
    borderRadius: 2,
    fontSize: "11px",
    padding: "6px 10px",
    backgroundColor: ct.tooltipBg,
    border: `1px solid ${ct.tooltipBorder}`,
    color: ct.tooltipText,
  };
  const xKey = xAxisMode === "timestamp" ? "timestamp" : "mileage";
  return (
    <Paper
      sx={{
        p: 1.5,
        borderRadius: 2,
        height,
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${darkMode ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.08)}`,
      }}
    >
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          fontSize: "11px",
          color: darkMode ? "#94a3b8" : "#64748b",
          letterSpacing: "0.5px",
          mb: 0.5,
        }}
      >
        {group.title}
      </Typography>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, left: -28, bottom: 20 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke={ct.gridColor}
            />
            <XAxis
              dataKey={xKey}
              tick={axisStyle}
              axisLine={{ stroke: ct.tableBorder }}
              tickLine={false}
              minTickGap={40}
              tickFormatter={(v) => formatXTick(v, xAxisMode)}
            />
            <YAxis
              tick={axisStyle}
              axisLine={{ stroke: ct.tableBorder }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number) => v.toFixed(2)}
            />
            {group.sensors.length > 1 && (
              <Legend
                wrapperStyle={{
                  fontSize: "10px",
                  fontWeight: "bold",
                  paddingTop: 2,
                  color: ct.tooltipText,
                }}
              />
            )}
            {group.sensors.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
            <Brush
              dataKey={xKey}
              height={18}
              stroke={ct.tableBorder}
              travellerWidth={6}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  );
}

export default function AutomotiveDive({
  isActive = true,
}: {
  isActive?: boolean;
}) {
  const { autoRefresh, darkMode } = useStore();
  const queryClient = useQueryClient();
  const wasActiveRef = useRef(false);
  const theme = useTheme();
  const ct = useChartTheme();
  const [searchParams] = useSearchParams();

  const _initVehicle = searchParams.get("vehicle") || "";
  const _initModule = searchParams.get("module") || "engine";

  const [xAxisMode, setXAxisMode] = useState<XAxisMode>("timestamp");
  const [selectedVehicle, setSelectedVehicle] = useState<string>(_initVehicle);
  const [selectedModule, setSelectedModule] = useState<string>(
    ALL_MODULES.includes(_initModule) ? _initModule : "engine"
  );
  const [analysisModule, setAnalysisModule] = useState<string>("engine");
  const [distributionKey, setDistributionKey] = useState<string>("");
  const [analysisTimeRange, setAnalysisTimeRange] = useState<number>(168);
  const [dtcResult, setDtcResult] = useState<any>(null);
  const [dtcRunning, setDtcRunning] = useState(false);
  const [vehicleTimelineSensorKey, setVehicleTimelineSensorKey] =
    useState<string>("");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertsTab, setAlertsTab] = useState(0);
  const [viewMode, setViewMode] = useState<"summary" | "module">("summary");
  const [kpiChartSensor, setKpiChartSensor] = useState<{ module: string; key: string; label: string; unit: string } | null>(null);
  const navigate = useNavigate();

  const axisStyle = { fontSize: "10px", fill: ct.axisColor, fontWeight: 600 };
  const agTheme = darkMode ? "ag-theme-balham-dark" : "ag-theme-balham";
  const tooltipStyle = {
    borderRadius: 2,
    fontSize: "10px",
    padding: "6px 10px",
    backgroundColor: ct.tooltipBg,
    border: `1px solid ${ct.tooltipBorder}`,
    color: ct.tooltipText,
  };
  const SHAP_COLORS = darkMode ? SHAP_COLORS_DARK : SHAP_COLORS_LIGHT;
  const plotLayout = buildPlotLayout(darkMode);

  const tblHeaders: React.CSSProperties = {
    textAlign: "left",
    padding: "4px 12px",
    color: ct.tableHeaderText,
    fontWeight: 700,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    background: ct.tableHeaderBg,
    boxShadow: `0 1px 0 ${ct.tableBorder}`,
  };
  const tblRowEvens: React.CSSProperties = {
    borderBottom: `1px solid ${ct.tableBorder}`,
    background: ct.tableRowEven,
  };
  const tblRowOdds: React.CSSProperties = {
    borderBottom: `1px solid ${ct.tableBorder}`,
    background: ct.tableRowOdd,
  };

  const fleetQuery = useQuery({
    queryKey: ["autoFleetSummary"],
    queryFn: () =>
      axios.get(`${API}/api/automotive/fleet-summary`).then((r) => r.data),
    refetchInterval: isActive && autoRefresh ? 15000 : false,
  });

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      fleetQuery.refetch();
      vehicleHealthQuery.refetch();
      moduleHealthQuery.refetch();
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  const sensorQuery = useQuery({
    queryKey: ["autoSensorHistory", selectedVehicle, selectedModule],
    queryFn: () =>
      axios
        .get(
          `${API}/api/automotive/sensor-history/${selectedVehicle}/${selectedModule}`
        )
        .then((r) => r.data),
    enabled: !!selectedVehicle,
    refetchInterval: false,
  });

  const bodyOdometerQuery = useQuery({
    queryKey: ["autoBodyOdometer", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/sensor-history/${selectedVehicle}/body`)
        .then((r) => r.data),
    enabled: !!selectedVehicle,
    refetchInterval: false,
    staleTime: 60000,
  });

  const moduleHealthQuery = useQuery({
    queryKey: ["autoModuleHealth", selectedVehicle, selectedModule],
    queryFn: () =>
      axios
        .get(
          `${API}/api/automotive/module-health/${selectedVehicle}/${selectedModule}`
        )
        .then((r) => r.data),
    enabled: !!selectedVehicle,
    refetchInterval: isActive && autoRefresh ? 10000 : false,
  });

  const vehicleHealthQuery = useQuery({
    queryKey: ["autoVehicleHealth", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/vehicle-health-history/${selectedVehicle}`)
        .then((r) => r.data),
    enabled: !!selectedVehicle,
    refetchInterval: isActive && autoRefresh ? 10000 : false,
  });

  const vehicleDecompQuery = useQuery({
    queryKey: ["autoVehicleDecomp", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/vehicle-decomposition/${selectedVehicle}`)
        .then((r) => r.data),
    enabled: !!selectedVehicle,
    refetchInterval: false,
  });

  // Module analysis cross-fleet (Bronze stats per vehicle per module)
  const crossfleetQuery = useQuery({
    queryKey: ["autoCrossfleet", analysisModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/module-crossfleet/${analysisModule}`)
        .then((r) => r.data),
    enabled: false,
    refetchInterval: false,
  });

  const vehicleAlertsQuery = useQuery({
    queryKey: ["autoVehicleAlerts", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/alerts/${selectedVehicle}`)
        .then((r) => r.data),
    enabled: !!selectedVehicle,
    refetchInterval: false,
  });

  const dtcHistoryQuery = useQuery({
    queryKey: ["autoDtcHistory", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/dtc-history/${selectedVehicle}`)
        .then((r) => r.data),
    enabled: !!selectedVehicle,
    refetchInterval: false,
  });

  const vehicleOpenAlerts: any[] = vehicleAlertsQuery.data?.open ?? [];
  const vehicleClosedAlerts: any[] = vehicleAlertsQuery.data?.closed ?? [];
  const allVehicleAlerts = [...vehicleOpenAlerts, ...vehicleClosedAlerts];
  const dtcRuns: any[] = dtcHistoryQuery.data?.runs ?? [];
  const normPeakTs = (ts: string) => String(ts || "").slice(0, 16).replace(" ", "T");
  const analyzedSet = new Set(dtcRuns.map((r: any) => `${r.module}|${normPeakTs(r.peak_ts)}`));
  const analyzedVehicleAlerts = allVehicleAlerts.filter((a: any) =>
    analyzedSet.has(`${a.module}|${normPeakTs(a.peak_anomaly_ts)}`)
  );
  const unanalyzedVehicleAlerts = allVehicleAlerts.filter((a: any) =>
    !analyzedSet.has(`${a.module}|${normPeakTs(a.peak_anomaly_ts)}`)
  );

  // Module tab sensor timeline  -  separate from vehicle tab's sensorQuery
  const moduleTimelineQuery = useQuery({
    queryKey: ["autoModuleTimeline", selectedVehicle, analysisModule],
    queryFn: () =>
      axios
        .get(
          `${API}/api/automotive/sensor-history/${selectedVehicle}/${analysisModule}`
        )
        .then((r) => r.data),
    enabled: !!selectedVehicle && !!analysisModule && isActive,
    refetchInterval: isActive && autoRefresh ? 10_000 : false,
  });

  const moduleFleetRankingQuery = useQuery({
    queryKey: ["moduleFleetRanking", analysisModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/module-fleet-ranking/${analysisModule}`)
        .then((r) => r.data),
    enabled: false,
    refetchInterval: false,
  });

  const moduleFleetHealthQuery = useQuery({
    queryKey: ["moduleFleetHealth", analysisModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/module-fleet-health/${analysisModule}`)
        .then((r) => r.data),
    enabled: false,
    refetchInterval:
      false,
  });

  const moduleSensorStatsQuery = useQuery({
    queryKey: ["moduleSensorStats", analysisModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/module-sensor-stats/${analysisModule}`)
        .then((r) => r.data),
    enabled: false,
    refetchInterval: false,
  });

  const moduleTopFeaturesQuery = useQuery({
    queryKey: ["moduleTopFeatures", analysisModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/module-top-features/${analysisModule}`)
        .then((r) => r.data),
    enabled: false,
    refetchInterval: false,
  });

  const vehicleSummaryQuery = useQuery({
    queryKey: ["autoVehicleSummary", selectedVehicle],
    queryFn: () =>
      axios.get(`${API}/api/automotive/vehicle-summary/${selectedVehicle}`).then((r) => r.data),
    enabled: !!selectedVehicle && viewMode === "summary",
    refetchInterval: isActive && autoRefresh && viewMode === "summary" ? 10000 : false,
  });

  const observerQuery = useQuery({
    queryKey: ["observerSnapshot"],
    queryFn: () =>
      axios.get(`${API}/api/observer/snapshot`).then((r) => r.data),
    enabled: !!selectedVehicle && viewMode === "summary",
    refetchInterval: isActive && autoRefresh && viewMode === "summary" ? 5000 : false,
  });

  const fleetSimBehaviorQuery = useQuery({
    queryKey: ["fleetSimBehavior", selectedVehicle],
    queryFn: () =>
      axios.get(`${API}/api/fleet/vehicle/${selectedVehicle}/behavior`).then((r) => r.data),
    enabled: !!selectedVehicle && viewMode === "summary",
    refetchInterval: isActive && autoRefresh && viewMode === "summary" ? 5000 : false,
  });

  const kpiSensorHistoryQuery = useQuery({
    queryKey: ["kpiSensorHistory", selectedVehicle, kpiChartSensor?.module],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/sensor-history/${selectedVehicle}/${kpiChartSensor!.module}`)
        .then((r) => r.data),
    enabled: !!selectedVehicle && !!kpiChartSensor,
    staleTime: 60_000,
  });

  useEffect(() => {
    const vehicles = fleetQuery.data?.vehicles;
    if (vehicles?.length > 0 && !selectedVehicle)
      setSelectedVehicle(vehicles[0].vehicle_id);
  }, [fleetQuery.data]);

  useEffect(() => {
    const keys = crossfleetQuery.data?.sensor_keys;
    if (keys?.length > 0) setDistributionKey(keys[0]);
  }, [crossfleetQuery.data]);

  useEffect(() => {
    setDistributionKey("");
  }, [analysisModule]);

  useEffect(() => {
    setVehicleTimelineSensorKey("");
    setDtcResult(null);
  }, [selectedModule]);

  useEffect(() => {
    if (selectedVehicle) setViewMode("summary");
  }, [selectedVehicle]);

  const vehicles: any[] = fleetQuery.data?.vehicles || [];
  const fleetStats = fleetQuery.data?.fleet_stats || {};

  // BRONZE derived
  const SERVICE_INTERVAL_KM = 15000;
  const sensorData: any[] = sensorQuery.data?.data || [];
  const latestBronzeRow: any =
    sensorData.length > 0 ? sensorData[sensorData.length - 1] : null;
  const bodyOdometerData: any[] = bodyOdometerQuery.data?.data || [];
  const latestBodyRow: any =
    bodyOdometerData.length > 0 ? bodyOdometerData[bodyOdometerData.length - 1] : null;
  const lastMileage: number = latestBodyRow?.odometer_reading ?? latestBronzeRow?.odometer_reading ?? latestBronzeRow?.mileage ?? 0;
  const kmSinceService = lastMileage % SERVICE_INTERVAL_KM;
  const nextServiceInKm = Math.round(SERVICE_INTERVAL_KM - kmSinceService);
  const downsampledBronze = useMemo(() => {
    const factor = Math.max(1, Math.floor(sensorData.length / 400));
    return factor === 1
      ? sensorData
      : sensorData.filter((_: any, i: number) => i % factor === 0);
  }, [sensorData]);

  // SILVER derived
  const moduleHealthData: any[] = useMemo(() => {
    const raw: any[] = moduleHealthQuery.data?.data || [];
    const factor = Math.max(1, Math.floor(raw.length / 400));
    return factor === 1
      ? raw
      : raw.filter((_: any, i: number) => i % factor === 0);
  }, [moduleHealthQuery.data]);

  const latestSilverRow: any = useMemo(() => {
    const raw: any[] = moduleHealthQuery.data?.data || [];
    return raw.length > 0 ? raw[raw.length - 1] : null;
  }, [moduleHealthQuery.data]);

  const topFeatures = useMemo(
    () => parseTopFeatures(latestSilverRow?.top_features || ""),
    [latestSilverRow]
  );

  const latestSeverity: string = useMemo(() => {
    const raw: any[] = moduleHealthQuery.data?.data || [];
    if (raw.length === 0) return "NORMAL";
    const recent = raw.slice(-50);
    const counts: Record<string, number> = {};
    for (const r of recent) {
      const s: string = r.severity || "NORMAL";
      counts[s] = (counts[s] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "NORMAL";
  }, [moduleHealthQuery.data]);

  const severityColor =
    latestSeverity === "CRITICAL"
      ? "#ef4444"
      : latestSeverity === "WARNING"
      ? "#eab308"
      : "#22c55e";

  // GOLD derived
  const healthHistory = useMemo(() => {
    const raw: any[] = vehicleHealthQuery.data?.data || [];
    const factor = Math.max(1, Math.floor(raw.length / 400));
    const sampled =
      factor === 1 ? raw : raw.filter((_: any, i: number) => i % factor === 0);
    return sampled.map((r: any) => ({
      ts: r.ts || String(r.timestamp || "").slice(5, 16),
      health: r.health,
      mileage: r.mileage ?? 0,
    }));
  }, [vehicleHealthQuery.data]);

  const summaryHealthData = useMemo(() => {
    const raw: any[] = vehicleHealthQuery.data?.data || [];
    const factor = Math.max(1, Math.floor(raw.length / 200));
    const sampled = factor === 1 ? raw : raw.filter((_: any, i: number) => i % factor === 0);
    return sampled.map((r: any) => ({
      ts: r.ts || String(r.timestamp || "").slice(5, 16),
      health: r.health,
      mileage: r.mileage ?? 0,
      engine_contrib: r.engine_contrib,
      transmission_contrib: r.transmission_contrib,
      battery_contrib: r.battery_contrib,
      body_contrib: r.body_contrib,
      tyre_contrib: r.tyre_contrib,
    }));
  }, [vehicleHealthQuery.data]);

  const observerVehicleEntry = useMemo(() => {
    const vList: any[] = (observerQuery.data as any)?.vehicles || [];
    return vList.find((v: any) => v.source_id === selectedVehicle) ?? null;
  }, [observerQuery.data, selectedVehicle]);

  const summaryData = vehicleSummaryQuery.data as any;
  const behaviorData = fleetSimBehaviorQuery.data as any;
  const healthScore: number | null = summaryData?.health_snapshot?.health_score ?? null;
  const healthStatus: string = summaryData?.health_snapshot?.status ?? "UNKNOWN";
  const fleetRank: number | null = summaryData?.health_snapshot?.fleet_rank ?? null;
  const fleetTotal: number | null = summaryData?.health_snapshot?.fleet_total ?? null;
  const moduleContribs: Record<string, number> = summaryData?.health_snapshot?.module_contribs ?? {};
  const odometerKm: number | null = summaryData?.service_info?.odometer_km ?? null;
  const nextServiceKm: number | null = summaryData?.service_info?.next_service_in_km ?? null;
  const summaryServiceProgress = odometerKm != null ? Math.min(100, ((odometerKm % 15000) / 15000) * 100) : 0;
  const topDrivers: any[] = summaryData?.top_anomaly_drivers ?? [];
  const maxDriverScore = topDrivers.length > 0 ? Math.max(...topDrivers.map((d: any) => d.score)) : 1;
  const alertsSummary: { open_count: number; closed_count: number; recent_open: any[] } = summaryData?.alerts_summary ?? { open_count: 0, closed_count: 0, recent_open: [] };
  const fleetSimData: any = summaryData?.fleet_sim ?? {};

  // Fleet/module analysis derived
  const fleetChartData = useMemo(
    () =>
      vehicles.map((v: any) => ({
        vehicle_id: v.vehicle_id,
        health_score: v.health_score,
      })),
    [vehicles]
  );

  const sensorKeys: string[] = crossfleetQuery.data?.sensor_keys || [];

  const moduleTimelineData: any[] = useMemo(() => {
    const raw: any[] = moduleTimelineQuery.data?.data || [];
    const factor = Math.max(1, Math.floor(raw.length / 300));
    return factor === 1
      ? raw
      : raw.filter((_: any, i: number) => i % factor === 0);
  }, [moduleTimelineQuery.data]);

  const fleetColDefs = useMemo<ColDef[]>(
    () => [
      {
        field: "vehicle_id",
        headerName: "VEHICLE ID",
        width: 125,
        flex: 0.8,
        pinned: "left",
      },
      {
        field: "health_score",
        headerName: "HEALTH",
        // width: 95,
        flex: 1.3,
        cellStyle: (params) => ({
          fontWeight: 700,
          color:
            params.value > 90
              ? "#1B5E20"
              : params.value > 80
              ? "#43A047"
              : params.value > 50
              ? "#FB8C00"
              : "#E53935",
        }),
      },

      ...ALL_MODULES_NEW.map((m) => ({
        field: m.field,
        headerName: m.header,
        width: m.width,
        flex: m.header === "transmission" ? 2.5 : 1.8,
        sortable: true,
        valueFormatter: (params) =>
          params.value != null ? params.value.toFixed(3) : " - ",
      })),

      {
        field: "data_source",
        headerName: "SOURCE",
        // width: 90,
        flex: 1.3,
        cellRenderer: (params: any) => (
          <Chip
            size="small"
            label={params.value}
            color={params.value === "live" ? "success" : "default"}
            sx={{ borderRadius: 2, height: 18, fontSize: "10px" }}
          />
        ),
      },
    ],
    []
  );

  const autoSizeStrategy = {
    type: "fitCellContents",
  };

  const chartGroups = MODULE_CHART_GROUPS[selectedModule] || [];
  const kpiFields = MODULE_KPI_FIELDS[selectedModule] || [];

  const moduleRankings: any[] = moduleFleetRankingQuery.data?.rankings || [];

  const rankingChartData = useMemo(
    () =>
      [...moduleRankings]
        .sort((a: any, b: any) => b.avg_health - a.avg_health)
        .map((r: any) => ({
          vehicle_id: r.vehicle_id,
          avg_health: r.avg_health,
        })),
    [moduleRankings]
  );

  const fleetHealthTrendOption = useMemo((): EChartsOption => {
    const allVids: string[] = moduleFleetHealthQuery.data?.vehicles || [];
    const rawSeries: any[] = moduleFleetHealthQuery.data?.series || [];
    const cutoff =
      analysisTimeRange < 8760
        ? new Date(Date.now() - analysisTimeRange * 60 * 60 * 1000)
        : null;
    const series = cutoff
      ? rawSeries.filter((r: any) => new Date(r.ts) >= cutoff)
      : rawSeries;
    const VID_COLORS = [
      "#e57373",
      "#ffb74d",
      "#81c784",
      "#ba68c8",
      "#4dd0e1",
      "#42a5f5",
      "#ff8a65",
    ];

    const selectedDefault = Object.fromEntries(
      allVids.map((vid: string) => [vid, false])
    );

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: ct.tooltipBg,
        borderColor: ct.tooltipBorder,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          fontFamily: "monospace",
          fontSize: 11,
          color: ct.tooltipText,
        },
        axisPointer: {
          type: "line",
          lineStyle: { color: ct.gridColor, type: "dashed" },
        },
        formatter: (params: any) => {
          const sorted = [...params].sort(
            (a: any, b: any) => (b.value ?? 0) - (a.value ?? 0)
          );
          return sorted
            .map(
              (p: any) =>
                `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${
                  p.color
                };margin-right:4px"></span>${p.seriesName}: <b>${
                  p.value ?? " - "
                }%</b>`
            )
            .join("<br/>");
        },
      },
      legend: {
        data: [
          ...allVids.map((vid: string) => ({ name: vid })),
          { name: "FLEET AVG" },
        ],
        selected: { ...selectedDefault, "FLEET AVG": true },
        textStyle: {
          fontFamily: "monospace",
          fontSize: 10,
          color: ct.axisColor,
        },
        itemHeight: 8,
        top: 4,
        right: 8,
        type: "scroll" as const,
        orient: "horizontal" as const,
        icon: "circle",
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0 },
        {
          type: "slider",
          xAxisIndex: 0,
          bottom: 2,
          height: 20,
          borderColor: ct.tooltipBorder,
          fillerColor: "rgba(25,118,210,0.08)",
          handleStyle: { color: "#1976d2" },
        },
      ],
      grid: { top: 44, right: 16, bottom: 48, left: 52 },
      xAxis: {
        type: "category",
        data: series.map((r: any) => r.ts),
        axisLabel: {
          fontFamily: "monospace",
          fontSize: 10,
          color: ct.axisColor,
        },
        axisLine: { lineStyle: { color: ct.tableBorder } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        axisLabel: {
          fontFamily: "monospace",
          fontSize: 10,
          color: ct.axisColor,
          formatter: "{value}%",
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { type: "dashed", color: ct.gridColor } },
      },
      series: [
        ...allVids.map((vid: string, i: number) => ({
          name: vid,
          type: "line" as const,
          data: series.map((r: any) => r[vid] ?? null),
          symbol: "none",
          lineStyle: {
            color: VID_COLORS[i % VID_COLORS.length],
            width: 1.2,
            opacity: 0.55,
          },
          itemStyle: { color: VID_COLORS[i % VID_COLORS.length] },
          smooth: false,
          connectNulls: false,
          emphasis: { lineStyle: { width: 2, opacity: 1 } },
        })),
        {
          name: "FLEET AVG",
          type: "line" as const,
          data: series.map((r: any) => r.fleet_avg ?? null),
          symbol: "none",
          lineStyle: { color: "#1976d2", width: 2.5 },
          itemStyle: { color: "#1976d2" },
          smooth: false,
          z: 10,
          markLine: {
            silent: true,
            symbol: "none",
            data: [
              {
                yAxis: 60,
                lineStyle: { color: "#d32f2f", type: "dashed", width: 1 },
                label: {
                  formatter: "CRITICAL",
                  fontSize: 9,
                  color: "#d32f2f",
                  fontFamily: "monospace",
                  position: "insideStartTop",
                },
              },
              {
                yAxis: 80,
                lineStyle: { color: "#ed6c02", type: "dashed", width: 1 },
                label: {
                  formatter: "WARNING",
                  fontSize: 9,
                  color: "#ed6c02",
                  fontFamily: "monospace",
                  position: "insideStartTop",
                },
              },
            ],
          },
          markArea: {
            silent: true,
            data: [
              [
                { yAxis: 0, itemStyle: { color: "rgba(211,47,47,0.04)" } },
                { yAxis: 60 },
              ],
              [
                { yAxis: 60, itemStyle: { color: "rgba(237,108,2,0.03)" } },
                { yAxis: 80 },
              ],
            ],
          },
        },
      ],
    } as EChartsOption;
  }, [moduleFleetHealthQuery.data, analysisTimeRange, ct]);

  const sensorBoxData = useMemo(() => {
    const vehicles: any[] = moduleSensorStatsQuery.data?.vehicles || [];
    const sk = distributionKey;
    if (!sk) return [] as any[];
    return vehicles.map((v: any) => ({
      vehicle_id: v.vehicle_id,
      min: v[`${sk}_min`] ?? 0,
      p25: v[`${sk}_p25`] ?? 0,
      median: v[`${sk}_median`] ?? 0,
      p75: v[`${sk}_p75`] ?? 0,
      max: v[`${sk}_max`] ?? 0,
    }));
  }, [moduleSensorStatsQuery.data, distributionKey]);

  const sensorFleetVehicles: string[] =
    moduleFleetHealthQuery.data?.vehicles || [];

  const topFeaturesData = useMemo(
    () => (moduleTopFeaturesQuery.data?.features || []).slice(0, 12) as any[],
    [moduleTopFeaturesQuery.data]
  );

  const rankingColDefs = useMemo<ColDef[]>(
    () => [
      {
        field: "vehicle_id",
        headerName: "VEHICLE",
        width: 120,
        pinned: "left",
        cellRenderer: (params: any) => (
          <button
            onClick={() => {
              setSelectedVehicle(params.value);
              setSelectedModule(analysisModule);
            }}
            style={{
              background: "none",
              border: "none",
              color: theme.palette.primary.main,
              fontWeight: "bold",
              fontFamily: "monospace",
              fontSize: "11px",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {params.value}
          </button>
        ),
      },
      {
        field: "avg_health",
        headerName: "AVG HEALTH",
        width: 120,
        sortable: true,
        sort: "desc" as const,
        cellStyle: (params: any) => ({
          fontWeight: "bold",
          color:
            params.value < 60
              ? "#d32f2f"
              : params.value < 80
              ? "#f57c00"
              : "#388e3c",
        }),
        valueFormatter: (params: any) => `${params.value}%`,
      },
      {
        field: "min_health",
        headerName: "MIN HEALTH",
        width: 110,
        sortable: true,
        cellStyle: (params: any) => ({
          color: params.value < 60 ? "#d32f2f" : ct.tooltipText,
        }),
        valueFormatter: (params: any) => `${params.value}%`,
      },
      {
        field: "trend_slope",
        headerName: "TREND",
        width: 100,
        sortable: true,
        cellRenderer: (params: any) => {
          const s = params.value ?? 0;
          const arrow = s > 0.05 ? "^" : s < -0.05 ? "v" : "->";
          const color =
            s > 0.05 ? "#388e3c" : s < -0.05 ? "#d32f2f" : ct.axisColor;
          return (
            <span
              style={{ color, fontWeight: "bold", fontFamily: "monospace" }}
            >
              {arrow} {Math.abs(s).toFixed(3)}
            </span>
          );
        },
      },
      {
        field: "alert_count",
        headerName: "TOTAL ALERTS",
        width: 110,
        sortable: true,
        cellStyle: (params: any) => ({
          fontWeight: "bold",
          color: params.value > 0 ? "#d32f2f" : "#388e3c",
        }),
      },
      {
        field: "total_pts",
        headerName: "DATA PTS",
        width: 100,
        sortable: true,
      },
    ],
    [analysisModule, theme, ct]
  );

  const runDtcAnalysis = async () => {
    if (!selectedVehicle) return;
    const peakTs =
      vehicleAlertsQuery.data?.open?.[0]?.peak_anomaly_ts ||
      vehicleAlertsQuery.data?.closed?.[0]?.peak_anomaly_ts ||
      latestBronzeRow?.timestamp ||
      new Date().toISOString();
    setDtcRunning(true);
    setDtcResult(null);
    try {
      const res = await axios.get(`${API}/api/dtc/analyze`, {
        params: {
          module: selectedModule,
          source_id: selectedVehicle,
          peak_ts: peakTs,
        },
        timeout: 60000,
      });
      setDtcResult(res.data);
      if (res.data?.success) {
        dtcHistoryQuery.refetch();
        queryClient.invalidateQueries({ queryKey: ["dtcVehicleHistory"] });
        queryClient.invalidateQueries({ queryKey: ["dtcAllHistory"] });
        queryClient.invalidateQueries({ queryKey: ["dtcFleetDistribution"] });
      }
    } catch {
      setDtcResult({
        error:
          "DTC service offline or unreachable. Start dtc_service/api.py to enable analysis.",
      });
    } finally {
      setDtcRunning(false);
    }
  };

  const decompositionHistory = useMemo(() => {
    const raw: any[] = vehicleDecompQuery.data?.data || [];
    return raw.map((r: any) => ({
      ts: r.ts || String(r.timestamp || "").slice(5, 16),
      mileage: r.mileage ?? 0,
      ...Object.fromEntries(
        ALL_MODULES.map((mod) => [
          mod,
          parseFloat(
            ((r[`${mod}_contrib`] ?? 0) * (MODULE_WEIGHTS[mod] ?? 0.2)).toFixed(
              2
            )
          ),
        ])
      ),
    }));
  }, [vehicleDecompQuery.data]);

  const radarData = useMemo(() => {
    const v = vehicles.find((v: any) => v.vehicle_id === selectedVehicle);
    if (!v)
      return ALL_MODULES.map((mod) => ({
        module: mod.toUpperCase(),
        score: 0,
        fullMark: 100,
      }));
    return ALL_MODULES.map((mod) => ({
      module: mod.toUpperCase(),
      score: Math.round(v[`${mod}_contrib`] ?? 0),
      fullMark: 100,
    }));
  }, [vehicles, selectedVehicle]);

  const { anomalyTrendSeries, anomalyTrendData } = useMemo(() => {
    const raw: any[] = moduleHealthQuery.data?.data || [];
    if (!raw.length)
      return {
        anomalyTrendSeries: [] as string[],
        anomalyTrendData: [] as any[],
      };
    const featureSet = new Set<string>();
    raw.forEach((r: any) =>
      parseTopFeatures(r.top_features || "").forEach((f) =>
        featureSet.add(f.feature)
      )
    );
    const series = Array.from(featureSet).slice(0, 6);
    const factor = Math.max(1, Math.floor(raw.length / 300));
    const sampled =
      factor === 1 ? raw : raw.filter((_: any, i: number) => i % factor === 0);
    const data: any[] = sampled.map((r: any) => {
      const fm: Record<string, number> = {};
      parseTopFeatures(r.top_features || "").forEach((f) => {
        fm[f.feature] = f.score;
      });
      const row: Record<string, any> = {
        timestamp: String(r.timestamp || "").slice(5, 16),
        mileage: r.mileage ?? 0,
      };
      series.forEach((s) => {
        row[s] = fm[s] ?? 0;
      });
      return row;
    });
    return { anomalyTrendSeries: series, anomalyTrendData: data };
  }, [moduleHealthQuery.data]);

  const severityDistribution = useMemo(() => {
    const raw: any[] = moduleHealthQuery.data?.data || [];
    const counts: Record<string, number> = {
      NORMAL: 0,
      WARNING: 0,
      CRITICAL: 0,
    };
    raw.forEach((r: any) => {
      const s = r.severity || "NORMAL";
      counts[s] = (counts[s] || 0) + 1;
    });
    const total = raw.length || 1;
    return [
      {
        name: "NORMAL",
        value: counts.NORMAL,
        pct: Math.round((counts.NORMAL / total) * 100),
        color: "#22c55e",
      },
      {
        name: "WARNING",
        value: counts.WARNING,
        pct: Math.round((counts.WARNING / total) * 100),
        color: "#eab308",
      },
      {
        name: "CRITICAL",
        value: counts.CRITICAL,
        pct: Math.round((counts.CRITICAL / total) * 100),
        color: "#ef4444",
      },
    ];
  }, [moduleHealthQuery.data]);

  const severityRuns = useMemo(() => {
    const raw: any[] = moduleHealthQuery.data?.data || [];
    if (!raw.length)
      return [] as {
        severity: string;
        count: number;
        startTs: string;
        endTs: string;
      }[];
    type Run = {
      severity: string;
      count: number;
      startTs: string;
      endTs: string;
    };
    const runs: Run[] = [];
    let cur: Run = {
      severity: raw[0].severity || "NORMAL",
      count: 1,
      startTs: String(raw[0].timestamp || "").slice(5, 16),
      endTs: "",
    };
    for (let i = 1; i < raw.length; i++) {
      const s = raw[i].severity || "NORMAL";
      if (s === cur.severity) {
        cur.count++;
      } else {
        cur.endTs = String(raw[i - 1].timestamp || "").slice(5, 16);
        runs.push({ ...cur });
        cur = {
          severity: s,
          count: 1,
          startTs: String(raw[i].timestamp || "").slice(5, 16),
          endTs: "",
        };
      }
    }
    cur.endTs = String(raw[raw.length - 1].timestamp || "").slice(5, 16);
    runs.push(cur);
    return runs;
  }, [moduleHealthQuery.data]);

  const sensorStats = useMemo(() => {
    if (!sensorData.length) return [] as any[];
    return kpiFields.map((f) => {
      const vals = sensorData
        .map((r: any) => Number(r[f.key]))
        .filter((v) => !isNaN(v) && isFinite(v));
      if (!vals.length)
        return {
          ...f,
          min: null,
          max: null,
          mean: null,
          std: null,
          latest: null,
        };
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const std = Math.sqrt(
        vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length
      );
      return {
        ...f,
        min: Math.min(...vals),
        max: Math.max(...vals),
        mean,
        std,
        latest: latestBronzeRow ? Number(latestBronzeRow[f.key]) : null,
      };
    });
  }, [sensorData, kpiFields, latestBronzeRow]);

  const allVehicleSensorKeys = useMemo(
    () =>
      chartGroups.flatMap((g) =>
        g.sensors.map((s) => ({ ...s, groupTitle: g.title }))
      ),
    [chartGroups]
  );

  const vehicleTimelineSensorGroup = useMemo(() => {
    const sk = vehicleTimelineSensorKey || allVehicleSensorKeys[0]?.key || "";
    const sensor = allVehicleSensorKeys.find((s) => s.key === sk);
    if (!sensor) return null;
    return {
      title: `${sensor.groupTitle}  -  ${selectedVehicle}`,
      sensors: [{ key: sensor.key, color: sensor.color, label: sensor.label }],
    };
  }, [vehicleTimelineSensorKey, allVehicleSensorKeys, selectedVehicle]);

  const fleetTopFeaturesOption = useMemo((): EChartsOption => {
    if (!topFeaturesData.length) return {};
    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: ct.tooltipBg,
        borderColor: ct.tooltipBorder,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          fontFamily: "monospace",
          fontSize: 11,
          color: ct.tooltipText,
        },
        formatter: (params: any) => {
          const p = (params as any[])[0];
          return `${String(p.name).replace(/_/g, " ")}<br/><b>${(
            p.value as number
          ).toFixed(4)}</b>`;
        },
      },
      grid: { top: 8, right: 80, bottom: 8, left: 8, containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: {
          fontFamily: "monospace",
          fontSize: 10,
          color: ct.axisColor,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { type: "dashed", color: ct.gridColor } },
      },
      yAxis: {
        type: "category",
        data: topFeaturesData.map((d: any) => d.feature),
        axisLabel: {
          fontFamily: "monospace",
          fontSize: 10,
          color: ct.tooltipText,
          fontWeight: "bold",
          formatter: (v: string) => v.replace(/_/g, " "),
        },
        axisLine: { show: false },
        axisTick: { show: false },
        inverse: true,
      },
      series: [
        {
          type: "bar" as const,
          data: topFeaturesData.map((d: any) => d.total_score),
          itemStyle: { color: MODULE_COLORS[analysisModule] },
          barMaxWidth: 40,
          label: {
            show: true,
            position: "right" as const,
            fontFamily: "monospace",
            fontSize: 9,
            fontWeight: "bold",
            color: ct.axisColor,
            formatter: (p: any) => (p.value as number).toFixed(4),
          },
        },
      ],
    } as EChartsOption;
  }, [topFeaturesData, analysisModule, ct]);

  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    fontFamily: "inherit",
    fontSize: "11px",
  };

  const tblHeader = {
    background: "#005071",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "10px",
    textAlign: "left",
    padding: "8px 12px",
    borderBottom: `1px solid ${ct.tableBorder}`,
    whiteSpace: "nowrap",
  };

  const tblCell = {
    padding: "7px 12px",
    borderBottom: `1px solid ${ct.tableBorder}`,
    verticalAlign: "middle",
  };

  const tblRowEven = {
    background: ct.tableRowEven,
    height: 36,
  };

  const tblRowOdd = {
    background: ct.tableRowOdd,
    height: 36,
  };

  const getCardGradient = (bg: string, color: string, darkMode: boolean) => {
    if (!darkMode) {
      return `linear-gradient(180deg, #FFFFFF 0%, ${bg} 100%)`;
    }

    return `linear-gradient(
      180deg,
      ${alpha(color, 0.22)} 0%,
      ${alpha(color, 0.1)} 35%,
      #1E293B 100%
    )`;
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
        background: darkMode
          ? "linear-gradient(145deg, #06111d 0%, #0b1724 52%, #0d1b2a 100%)"
          : "linear-gradient(145deg, #f8fafc 0%, #eef6ff 52%, #f7fbff 100%)",
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
            color: darkMode ? "text.primary" : "#005071",
            letterSpacing: "-0.3px",
            fontSize: "14px !important",
            whiteSpace: "nowrap",
          }}
        >
          AUTOMOTIVE DEEP DIVE
        </Typography>
        <Box
          sx={{
            display: "flex",
            gap: 1.5,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <ToggleButtonGroup
            value={xAxisMode}
            exclusive
            onChange={(_e, val) => val && setXAxisMode(val)}
            size="small"
            sx={{
              height: 28,
              bgcolor: "background.paper",
              "& .MuiToggleButton-root": {
                px: 2,
                py: 0,
                minHeight: 28,
                borderRadius: 2,
                fontSize: "10px",
                fontWeight: 700,
                lineHeight: 1,
              },
            }}
          >
            <ToggleButton
              value="timestamp"
              sx={{
                fontWeight: "bold",
                px: 1.5,
                borderRadius: 2,
                fontSize: "11px",
              }}
            >
              TIMESTAMP
            </ToggleButton>
            <ToggleButton
              value="mileage"
              sx={{
                fontWeight: "bold",
                px: 1.5,
                borderRadius: 2,
                fontSize: "11px",
              }}
            >
              MILEAGE
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>


      {/* ---- VEHICLE DEEP DIVE ---- */}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            flex: 1,
            minHeight: 0,
            overflow: "auto",
          }}
        >
          {viewMode === "summary" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>

            {/* ── SUMMARY CONTROL BAR ── */}
            <Paper sx={{ p: 1, borderRadius: 2, display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.8) : alpha("#f8fafc", 0.95) }}>
              <FormControl size="small" sx={{ minWidth: 180, "& .MuiOutlinedInput-root": { bgcolor: darkMode ? "#1e293b" : "#fff", borderRadius: 1, fontSize: "10px", "& fieldset": { borderColor: darkMode ? alpha("#7dd3fc", 0.2) : alpha("#94a3b8", 0.35) }, "&:hover fieldset": { borderColor: darkMode ? alpha("#7dd3fc", 0.4) : alpha("#94a3b8", 0.6) }, "&.Mui-focused fieldset": { borderColor: darkMode ? "#38bdf8" : "#005071" } }, "& .MuiInputLabel-root": { fontSize: "10px", color: darkMode ? "#64748b" : "#94a3b8", "&.Mui-focused": { color: darkMode ? "#38bdf8" : "#005071" } } }}>
                <InputLabel>Vehicle</InputLabel>
                <Select value={selectedVehicle} onChange={(e) => setSelectedVehicle(e.target.value)} label="Vehicle" sx={{ height: 30, "& .MuiSelect-select": { fontSize: "10px", py: 0.5 } }} MenuProps={{ PaperProps: { sx: { "& .MuiMenuItem-root": { fontSize: "10px" } } } }}>
                  {vehicles.map((v: any) => (
                    <MenuItem key={v.vehicle_id} value={v.vehicle_id} sx={{ fontSize: "10px" }}>{v.vehicle_id}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              {healthScore != null && (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Box sx={{ width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", bgcolor: alpha(getHealthColor(healthScore), darkMode ? 0.18 : 0.1), border: `2px solid ${getHealthColor(healthScore)}` }}>
                    <Typography sx={{ fontSize: "12px", fontWeight: 900, color: getHealthColor(healthScore), fontFamily: "monospace", lineHeight: 1 }}>{healthScore.toFixed(0)}</Typography>
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: "9px", fontWeight: 600, color: darkMode ? "#475569" : "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 1.2 }}>Health Score</Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25 }}>
                      <Chip size="small" label={healthStatus} sx={{ height: 16, borderRadius: 1, fontSize: "8px", fontWeight: 700, bgcolor: healthStatus === "OK" ? alpha("#22c55e", darkMode ? 0.2 : 0.1) : healthStatus === "WARNING" ? alpha("#f59e0b", darkMode ? 0.2 : 0.1) : alpha("#ef4444", darkMode ? 0.2 : 0.1), color: healthStatus === "OK" ? "#22c55e" : healthStatus === "WARNING" ? "#f59e0b" : "#ef4444" }} />
                      {fleetRank != null && (
                        <Typography sx={{ fontSize: "9px", fontWeight: 600, color: darkMode ? "#64748b" : "#94a3b8" }}>#{fleetRank} of {fleetTotal}</Typography>
                      )}
                    </Box>
                  </Box>
                </Box>
              )}

              {fleetSimData?.status && (
                <Chip size="small" label={String(fleetSimData.status).replace(/_/g, " ")} sx={{ height: 20, borderRadius: 1, fontSize: "9px", fontWeight: 700, bgcolor: fleetSimData.status === "active" ? alpha("#22c55e", 0.12) : alpha("#94a3b8", 0.12), color: fleetSimData.status === "active" ? "#22c55e" : darkMode ? "#94a3b8" : "#64748b", border: `1px solid ${fleetSimData.status === "active" ? alpha("#22c55e", 0.3) : alpha("#94a3b8", 0.3)}` }} />
              )}

              {vehicleSummaryQuery.isLoading && (
                <Typography sx={{ fontSize: "10px", color: darkMode ? "#475569" : "#94a3b8" }}>Loading summary…</Typography>
              )}

              <Box sx={{ flex: 1 }} />

              <Badge badgeContent={alertsSummary.open_count} color="error" sx={{ "& .MuiBadge-badge": { fontSize: "9px", height: 16, minWidth: 16 } }}>
                <Button size="small" onClick={() => setAlertsOpen(true)} disabled={!selectedVehicle} sx={{ height: 28, fontSize: "10px", fontWeight: 700, px: 1.5, borderRadius: "4px", textTransform: "uppercase", bgcolor: darkMode ? alpha("#ef4444", 0.12) : alpha("#ef4444", 0.08), color: darkMode ? "#f87171" : "#dc2626", border: `1px solid ${darkMode ? alpha("#ef4444", 0.3) : alpha("#ef4444", 0.22)}`, "&:hover": { bgcolor: darkMode ? alpha("#ef4444", 0.2) : alpha("#ef4444", 0.14) }, "&.Mui-disabled": { bgcolor: darkMode ? alpha("#475569", 0.1) : alpha("#94a3b8", 0.08), color: darkMode ? "#475569" : "#94a3b8", borderColor: darkMode ? alpha("#475569", 0.2) : alpha("#94a3b8", 0.2) } }}>
                  Alerts ({allVehicleAlerts.length})
                </Button>
              </Badge>
            </Paper>

            {/* ── MODULE KPI STRIP ── */}
            <Box sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 0.5, "&::-webkit-scrollbar": { height: 3 }, "&::-webkit-scrollbar-track": { bgcolor: "transparent" }, "&::-webkit-scrollbar-thumb": { bgcolor: darkMode ? alpha("#334155", 0.8) : alpha("#cbd5e1", 0.8), borderRadius: 2 } }}>
              {ALL_MODULES.map((mod) => {
                const modColor = (MODULE_COLORS as Record<string, string>)[mod];
                const modKpi = summaryData?.kpi_snapshot?.[mod];
                const modHealth = moduleContribs[mod];
                const modStatusColor = modHealth == null ? (darkMode ? "#475569" : "#94a3b8") : modHealth >= 80 ? "#22c55e" : modHealth >= 60 ? "#f59e0b" : "#ef4444";
                return (
                  <Paper
                    key={mod}
                    elevation={3}
                    sx={{ minWidth: 175, flexShrink: 0, p: 1.5, borderRadius: 2, borderTop: `3px solid ${modColor}`, background: getCardGradient(darkMode ? alpha(modColor, 0.05) : alpha(modColor, 0.025), modColor, darkMode), cursor: "pointer", transition: "box-shadow 0.15s", "&:hover": { boxShadow: `0 4px 20px ${alpha(modColor, darkMode ? 0.3 : 0.14)}` } }}
                    onClick={() => { setSelectedModule(mod); setViewMode("module"); }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                      <Typography sx={{ fontSize: "10px", fontWeight: 800, color: modColor, textTransform: "uppercase", letterSpacing: 0.8 }}>{mod}</Typography>
                      <Box sx={{ px: 0.75, py: "1px", borderRadius: 1, bgcolor: alpha(modStatusColor, darkMode ? 0.18 : 0.1), border: `1px solid ${alpha(modStatusColor, 0.3)}` }}>
                        <Typography sx={{ fontSize: "9px", fontWeight: 700, color: modStatusColor }}>{modHealth != null ? `${modHealth.toFixed(1)}%` : "--"}</Typography>
                      </Box>
                    </Box>
                    {(modKpi?.sensors || []).map((s: any) => (
                      <Box key={s.key} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                        <Typography sx={{ fontSize: "9px", color: darkMode ? "#64748b" : "#94a3b8", fontWeight: 500, flex: 1, minWidth: 0 }}>{s.label}</Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
                          <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.25 }}>
                            <Typography sx={{ fontSize: "11px", fontWeight: 700, fontFamily: "monospace", color: darkMode ? "#cbd5e1" : "#1e293b" }}>{s.value != null ? s.value : "--"}</Typography>
                            <Typography sx={{ fontSize: "8px", color: darkMode ? "#475569" : "#94a3b8" }}>{s.unit}</Typography>
                          </Box>
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); setKpiChartSensor({ module: mod, key: s.key, label: s.label, unit: s.unit }); }}
                            sx={{ p: "2px", color: alpha(modColor, 0.55), "&:hover": { color: modColor, bgcolor: alpha(modColor, 0.12) } }}
                          >
                            <ShowChartRoundedIcon sx={{ fontSize: "11px !important" }} />
                          </IconButton>
                        </Box>
                      </Box>
                    ))}
                    <Button size="small" fullWidth endIcon={<TuneRoundedIcon sx={{ fontSize: "10px !important" }} />} sx={{ mt: 1, fontSize: "9px", fontWeight: 700, height: 22, bgcolor: alpha(modColor, darkMode ? 0.15 : 0.08), color: modColor, border: `1px solid ${alpha(modColor, 0.3)}`, borderRadius: 1, "&:hover": { bgcolor: alpha(modColor, darkMode ? 0.25 : 0.14) } }}>
                      Deep Dive
                    </Button>
                  </Paper>
                );
              })}
            </Box>

            {/* ── 3-COLUMN MAIN CONTENT ── */}
            <Box sx={{ display: "flex", gap: 1, minHeight: 0 }}>

              {/* ─── LEFT COL: Health trend + Anomaly drivers ─── */}
              <Box sx={{ flex: "0 0 44%", display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>

                {/* Health Trend */}
                <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Box sx={{ width: 3, height: 14, borderRadius: 2, bgcolor: darkMode ? "#38bdf8" : "#005071" }} />
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>Health Trend</Typography>
                    <Chip size="small" label={`${summaryHealthData.length} pts`} sx={{ height: 16, borderRadius: 1, fontSize: "8px", fontWeight: 700, bgcolor: darkMode ? alpha("#38bdf8", 0.12) : alpha("#0284c7", 0.08), color: darkMode ? "#38bdf8" : "#0369a1" }} />
                    <Box sx={{ flex: 1 }} />
                    <Typography sx={{ fontSize: "9px", color: darkMode ? "#475569" : "#94a3b8" }}>Fused + module breakdown</Typography>
                  </Box>
                  <ResponsiveContainer width="100%" height={170}>
                    <AreaChart data={summaryHealthData} margin={{ top: 2, right: 6, bottom: 0, left: -10 }}>
                      <defs>
                        {ALL_MODULES.map((mod) => (
                          <linearGradient key={mod} id={`summGrad${mod}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={(MODULE_COLORS as Record<string, string>)[mod]} stopOpacity={0.3} />
                            <stop offset="95%" stopColor={(MODULE_COLORS as Record<string, string>)[mod]} stopOpacity={0.02} />
                          </linearGradient>
                        ))}
                        <linearGradient id="summGradHealth" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={darkMode ? "#38bdf8" : "#005071"} stopOpacity={0.45} />
                          <stop offset="95%" stopColor={darkMode ? "#38bdf8" : "#005071"} stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={ct.gridColor} vertical={false} />
                      <XAxis dataKey={xAxisMode === "mileage" ? "mileage" : "ts"} tick={axisStyle} tickFormatter={(v) => formatXTick(v, xAxisMode)} interval="preserveStartEnd" />
                      <YAxis domain={[0, 100]} tick={axisStyle} width={28} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${Number(v).toFixed(1)}%`, ""]} />
                      <Area type="monotone" dataKey="health" stroke={darkMode ? "#38bdf8" : "#005071"} fill="url(#summGradHealth)" strokeWidth={2} dot={false} name="Fused Health" />
                      {ALL_MODULES.map((mod) => (
                        <Area key={mod} type="monotone" dataKey={`${mod}_contrib`} stroke={(MODULE_COLORS as Record<string, string>)[mod]} fill={`url(#summGrad${mod})`} strokeWidth={1} strokeDasharray="4 2" dot={false} name={mod.charAt(0).toUpperCase() + mod.slice(1)} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </Paper>

                {/* Top Anomaly Drivers */}
                <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc", flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Box sx={{ width: 3, height: 14, borderRadius: 2, bgcolor: "#ef4444" }} />
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>Top Anomaly Drivers</Typography>
                    <Chip size="small" label="All Modules" sx={{ height: 16, borderRadius: 1, fontSize: "8px", fontWeight: 700, bgcolor: alpha("#ef4444", darkMode ? 0.15 : 0.08), color: "#ef4444" }} />
                  </Box>
                  {topDrivers.length === 0 ? (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                      <Typography sx={{ fontSize: "11px", color: "text.secondary" }}>
                        {vehicleSummaryQuery.isLoading ? "Loading…" : "No anomaly data available"}
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                      {topDrivers.map((d: any, i: number) => {
                        const modColor = (MODULE_COLORS as Record<string, string>)[d.module] || (darkMode ? "#7dd3fc" : "#0369a1");
                        const barPct = maxDriverScore > 0 ? (d.score / maxDriverScore) * 100 : 0;
                        return (
                          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: modColor, flexShrink: 0 }} />
                            <Typography sx={{ fontSize: "9px", fontWeight: 600, color: darkMode ? "#94a3b8" : "#64748b", width: 56, flexShrink: 0, textTransform: "uppercase", letterSpacing: 0.3 }}>{d.module}</Typography>
                            <Typography sx={{ fontSize: "10px", flex: 1, color: darkMode ? "#cbd5e1" : "#1e293b", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatFeatureKey(d.feature)}</Typography>
                            <Box sx={{ width: 90, height: 6, borderRadius: 3, bgcolor: alpha(modColor, 0.15), flexShrink: 0, position: "relative", overflow: "hidden" }}>
                              <Box sx={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barPct}%`, background: `linear-gradient(90deg, ${alpha(modColor, 0.5)}, ${modColor})`, borderRadius: 3 }} />
                            </Box>
                            <Typography sx={{ fontSize: "9px", fontFamily: "monospace", width: 36, textAlign: "right", color: darkMode ? "#64748b" : "#94a3b8", flexShrink: 0 }}>{d.score.toFixed(3)}</Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Paper>
              </Box>

              {/* ─── MIDDLE COL: Service + Alerts + Observer ─── */}
              <Box sx={{ flex: "0 0 27%", display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>

                {/* Service Info */}
                <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
                    <Box sx={{ width: 3, height: 14, borderRadius: 2, bgcolor: "#f59e0b" }} />
                    <BuildRoundedIcon sx={{ fontSize: 12, color: "#f59e0b" }} />
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>Service Info</Typography>
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75, mb: 1 }}>
                    <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: darkMode ? alpha("#1e293b", 0.6) : alpha("#f1f5f9", 0.8), border: `1px solid ${darkMode ? alpha("#334155", 0.5) : alpha("#e2e8f0", 1)}` }}>
                      <Typography sx={{ fontSize: "8px", fontWeight: 600, color: darkMode ? "#475569" : "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.25 }}>Odometer</Typography>
                      <Typography sx={{ fontSize: "16px", fontWeight: 900, fontFamily: "monospace", color: darkMode ? "#e2e8f0" : "#0f172a", lineHeight: 1 }}>{odometerKm != null ? odometerKm.toLocaleString() : "--"}</Typography>
                      <Typography sx={{ fontSize: "8px", color: darkMode ? "#475569" : "#94a3b8" }}>km total</Typography>
                    </Box>
                    <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: darkMode ? alpha("#1e293b", 0.6) : alpha("#f1f5f9", 0.8), border: `1px solid ${darkMode ? alpha("#334155", 0.5) : alpha("#e2e8f0", 1)}` }}>
                      <Typography sx={{ fontSize: "8px", fontWeight: 600, color: darkMode ? "#475569" : "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, mb: 0.25 }}>Next Service</Typography>
                      <Typography sx={{ fontSize: "16px", fontWeight: 900, fontFamily: "monospace", lineHeight: 1, color: nextServiceKm != null && nextServiceKm < 2000 ? "#ef4444" : nextServiceKm != null && nextServiceKm < 5000 ? "#f59e0b" : "#22c55e" }}>
                        {nextServiceKm != null ? nextServiceKm.toLocaleString() : "--"}
                      </Typography>
                      <Typography sx={{ fontSize: "8px", color: darkMode ? "#475569" : "#94a3b8" }}>km remaining</Typography>
                    </Box>
                  </Box>
                  {odometerKm != null && (
                    <Box>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                        <Typography sx={{ fontSize: "8px", color: darkMode ? "#475569" : "#94a3b8" }}>Service interval progress</Typography>
                        <Typography sx={{ fontSize: "8px", fontFamily: "monospace", color: darkMode ? "#64748b" : "#94a3b8" }}>{summaryServiceProgress.toFixed(0)}%</Typography>
                      </Box>
                      <Box sx={{ height: 5, borderRadius: 3, bgcolor: darkMode ? alpha("#1e293b", 0.8) : alpha("#e2e8f0", 0.8), overflow: "hidden" }}>
                        <Box sx={{ height: "100%", width: `${summaryServiceProgress}%`, bgcolor: summaryServiceProgress > 80 ? "#ef4444" : summaryServiceProgress > 60 ? "#f59e0b" : "#22c55e", borderRadius: 3 }} />
                      </Box>
                    </Box>
                  )}
                </Paper>

                {/* Alerts Summary */}
                <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc", flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                    <Box sx={{ width: 3, height: 14, borderRadius: 2, bgcolor: "#ef4444" }} />
                    <WarningAmberRoundedIcon sx={{ fontSize: 12, color: "#ef4444" }} />
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>Alerts</Typography>
                    <Box sx={{ ml: "auto", display: "flex", gap: 0.5 }}>
                      <Box sx={{ px: 0.75, py: "1px", borderRadius: 1, bgcolor: alpha("#ef4444", darkMode ? 0.15 : 0.08), border: `1px solid ${alpha("#ef4444", 0.25)}` }}>
                        <Typography sx={{ fontSize: "9px", fontWeight: 700, color: "#ef4444" }}>{alertsSummary.open_count} Open</Typography>
                      </Box>
                      <Box sx={{ px: 0.75, py: "1px", borderRadius: 1, bgcolor: alpha("#22c55e", darkMode ? 0.12 : 0.07), border: `1px solid ${alpha("#22c55e", 0.22)}` }}>
                        <Typography sx={{ fontSize: "9px", fontWeight: 700, color: "#22c55e" }}>{alertsSummary.closed_count} Closed</Typography>
                      </Box>
                    </Box>
                  </Box>
                  {alertsSummary.recent_open.length === 0 ? (
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 2, gap: 0.75 }}>
                      <CheckCircleRoundedIcon sx={{ fontSize: 16, color: "#22c55e", opacity: 0.7 }} />
                      <Typography sx={{ fontSize: "11px", color: "text.secondary" }}>No open alerts</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                      {alertsSummary.recent_open.slice(0, 5).map((a: any, i: number) => {
                        const modColor = (MODULE_COLORS as Record<string, string>)[a.module?.toLowerCase()] || (darkMode ? "#7dd3fc" : "#0369a1");
                        return (
                          <Box key={a.alert_id || i} sx={{ display: "flex", alignItems: "center", gap: 0.75, p: 0.75, borderRadius: 1.5, bgcolor: darkMode ? alpha("#1e293b", 0.4) : alpha("#f8fafc", 0.8), border: `1px solid ${darkMode ? alpha("#334155", 0.5) : alpha("#e2e8f0", 1)}`, cursor: "pointer", "&:hover": { bgcolor: darkMode ? alpha("#1e293b", 0.7) : alpha("#f1f5f9", 1) } }}
                            onClick={() => { setSelectedModule(a.module?.toLowerCase() || "engine"); setViewMode("module"); setAlertsOpen(true); }}>
                            <Box sx={{ width: 3, minHeight: 28, borderRadius: 2, bgcolor: modColor, flexShrink: 0 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                                <Typography sx={{ fontSize: "9px", fontWeight: 800, color: modColor, textTransform: "uppercase" }}>{a.module}</Typography>
                                <Typography sx={{ fontSize: "9px", fontFamily: "monospace", color: darkMode ? "#475569" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(a.peak_anomaly_ts || "").slice(0, 16)}</Typography>
                              </Box>
                              {a.max_composite_score != null && (
                                <Typography sx={{ fontSize: "8px", color: Number(a.max_composite_score) >= 0.8 ? "#ef4444" : "#f59e0b" }}>score: {Number(a.max_composite_score).toFixed(3)}</Typography>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                      {alertsSummary.open_count > 5 && (
                        <Typography sx={{ fontSize: "9px", color: darkMode ? "#475569" : "#94a3b8", textAlign: "center", pt: 0.25 }}>+{alertsSummary.open_count - 5} more → click Alerts button</Typography>
                      )}
                    </Box>
                  )}
                </Paper>

                {/* Observer Live */}
                <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                    <Box sx={{ width: 3, height: 14, borderRadius: 2, bgcolor: "#a855f7" }} />
                    <SensorsRoundedIcon sx={{ fontSize: 12, color: "#a855f7" }} />
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>Live Observer</Typography>
                    {observerVehicleEntry && (
                      <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "#22c55e" }} />
                        <Typography sx={{ fontSize: "9px", fontWeight: 600, color: "#22c55e" }}>Active</Typography>
                      </Box>
                    )}
                  </Box>
                  {observerVehicleEntry ? (
                    <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                      {[
                        { label: "Rows Processed", value: observerVehicleEntry.rows_processed != null ? Number(observerVehicleEntry.rows_processed).toLocaleString() : "--" },
                        { label: "Rejected", value: observerVehicleEntry.rejected_rows != null ? String(observerVehicleEntry.rejected_rows) : "--" },
                        { label: "Validation Rate", value: observerVehicleEntry.validation_rate != null ? `${(Number(observerVehicleEntry.validation_rate) * 100).toFixed(1)}%` : "--" },
                        { label: "Avg Latency", value: observerVehicleEntry.avg_latency != null ? `${Number(observerVehicleEntry.avg_latency).toFixed(0)} ms` : "--" },
                      ].map(({ label, value }) => (
                        <Box key={label} sx={{ p: 0.75, borderRadius: 1, bgcolor: darkMode ? alpha("#1e293b", 0.5) : alpha("#f1f5f9", 0.8) }}>
                          <Typography sx={{ fontSize: "8px", fontWeight: 600, color: darkMode ? "#475569" : "#94a3b8", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</Typography>
                          <Typography sx={{ fontSize: "12px", fontWeight: 700, fontFamily: "monospace", color: darkMode ? "#e2e8f0" : "#0f172a" }}>{value}</Typography>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: "10px", color: "text.secondary", py: 1, textAlign: "center" }}>
                      {observerQuery.isLoading ? "Loading observer data…" : "Not active in observer"}
                    </Typography>
                  )}
                </Paper>
              </Box>

              {/* ─── RIGHT COL: Fleet Sim + Driver Behavior + DTC ─── */}
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>

                {/* Fleet Sim Position */}
                <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                    <Box sx={{ width: 3, height: 14, borderRadius: 2, bgcolor: "#22c55e" }} />
                    <CommuteRoundedIcon sx={{ fontSize: 12, color: "#22c55e" }} />
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>Fleet Position</Typography>
                  </Box>
                  {fleetSimData?.vehicle_id ? (
                    <Box>
                      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75, mb: 0.75 }}>
                        {[
                          { label: "Vehicle", value: fleetSimData.name || selectedVehicle },
                          { label: "Type", value: fleetSimData.vehicle_type || "--" },
                          { label: "Driver", value: fleetSimData.driver || "--" },
                          { label: "Status", value: String(fleetSimData.status || "--").replace(/_/g, " ") },
                        ].map(({ label, value }) => (
                          <Box key={label} sx={{ p: 0.75, borderRadius: 1, bgcolor: darkMode ? alpha("#1e293b", 0.5) : alpha("#f1f5f9", 0.8) }}>
                            <Typography sx={{ fontSize: "8px", color: darkMode ? "#475569" : "#94a3b8", textTransform: "uppercase" }}>{label}</Typography>
                            <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "#e2e8f0" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</Typography>
                          </Box>
                        ))}
                      </Box>
                      {fleetSimData.position && (
                        <Box sx={{ p: 0.75, borderRadius: 1, bgcolor: darkMode ? alpha("#1e293b", 0.3) : alpha("#f8fafc", 0.8), border: `1px solid ${darkMode ? alpha("#334155", 0.4) : alpha("#e2e8f0", 1)}` }}>
                          <Typography sx={{ fontSize: "8px", color: darkMode ? "#475569" : "#94a3b8", textTransform: "uppercase", mb: 0.25 }}>Position</Typography>
                          <Typography sx={{ fontSize: "10px", fontFamily: "monospace", color: darkMode ? "#94a3b8" : "#475569" }}>
                            {Number(fleetSimData.position.lat ?? 0).toFixed(4)}°N, {Number(fleetSimData.position.lng ?? 0).toFixed(4)}°E
                          </Typography>
                          {fleetSimData.route && (
                            <Typography sx={{ fontSize: "9px", color: darkMode ? "#64748b" : "#94a3b8", mt: 0.25 }}>Route: {String(fleetSimData.route).replace(/_/g, " → ")}</Typography>
                          )}
                          {fleetSimData.speed_kmh != null && (
                            <Typography sx={{ fontSize: "9px", color: darkMode ? "#64748b" : "#94a3b8" }}>Speed: {Number(fleetSimData.speed_kmh).toFixed(0)} km/h</Typography>
                          )}
                        </Box>
                      )}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: "10px", color: "text.secondary", py: 1, textAlign: "center" }}>
                      {vehicleSummaryQuery.isLoading ? "Loading…" : "Not active in fleet simulator"}
                    </Typography>
                  )}
                </Paper>

                {/* Driver Behavior */}
                <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc", flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                    <Box sx={{ width: 3, height: 14, borderRadius: 2, bgcolor: "#38bdf8" }} />
                    <PersonRoundedIcon sx={{ fontSize: 12, color: "#38bdf8" }} />
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>Driver Behavior</Typography>
                  </Box>
                  {behaviorData ? (
                    <Box>
                      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5, mb: 1 }}>
                        <Typography sx={{ fontSize: "32px", fontWeight: 900, fontFamily: "monospace", lineHeight: 1, color: (behaviorData.current_score ?? 0) >= 85 ? "#22c55e" : (behaviorData.current_score ?? 0) >= 70 ? "#f59e0b" : "#ef4444" }}>
                          {behaviorData.current_score != null ? Math.round(behaviorData.current_score) : "--"}
                        </Typography>
                        <Typography sx={{ fontSize: "14px", color: darkMode ? "#475569" : "#94a3b8", fontFamily: "monospace" }}>/100</Typography>
                        <Chip size="small" label={(behaviorData.current_score ?? 0) >= 85 ? "Good" : (behaviorData.current_score ?? 0) >= 70 ? "Fair" : "Poor"} sx={{ height: 16, borderRadius: 1, fontSize: "8px", fontWeight: 700, ml: 0.5, bgcolor: (behaviorData.current_score ?? 0) >= 85 ? alpha("#22c55e", 0.15) : (behaviorData.current_score ?? 0) >= 70 ? alpha("#f59e0b", 0.15) : alpha("#ef4444", 0.15), color: (behaviorData.current_score ?? 0) >= 85 ? "#22c55e" : (behaviorData.current_score ?? 0) >= 70 ? "#f59e0b" : "#ef4444" }} />
                      </Box>
                      {behaviorData.risk_radar && (
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mb: 1 }}>
                          {([
                            { label: "Harsh Braking", key: "braking_per_100km", color: "#ef4444", max: 15 },
                            { label: "Hard Accel", key: "accel_per_100km", color: "#f59e0b", max: 15 },
                            { label: "Sharp Corners", key: "cornering_per_100km", color: "#a855f7", max: 15 },
                          ] as const).map(({ label, key, color, max }) => {
                            const val = behaviorData.risk_radar[key] ?? 0;
                            const pct = Math.min(100, (val / max) * 100);
                            return (
                              <Box key={key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography sx={{ fontSize: "9px", color: darkMode ? "#64748b" : "#94a3b8", width: 68, flexShrink: 0 }}>{label}</Typography>
                                <Box sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: alpha(color, 0.15), overflow: "hidden" }}>
                                  <Box sx={{ height: "100%", width: `${pct}%`, bgcolor: color, borderRadius: 3 }} />
                                </Box>
                                <Typography sx={{ fontSize: "9px", fontFamily: "monospace", width: 30, textAlign: "right", color: darkMode ? "#94a3b8" : "#64748b" }}>{val.toFixed(1)}</Typography>
                              </Box>
                            );
                          })}
                        </Box>
                      )}
                      {behaviorData.event_summary && (
                        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0.5 }}>
                          {[
                            { label: "Braking", value: behaviorData.event_summary.total_braking, color: "#ef4444" },
                            { label: "Accel", value: behaviorData.event_summary.total_accel, color: "#f59e0b" },
                            { label: "Corners", value: behaviorData.event_summary.total_cornering, color: "#a855f7" },
                          ].map(({ label, value, color }) => (
                            <Box key={label} sx={{ p: 0.5, borderRadius: 1, bgcolor: darkMode ? alpha("#1e293b", 0.5) : alpha("#f1f5f9", 0.8), textAlign: "center" }}>
                              <Typography sx={{ fontSize: "12px", fontWeight: 700, fontFamily: "monospace", color }}>{value ?? "--"}</Typography>
                              <Typography sx={{ fontSize: "8px", color: darkMode ? "#475569" : "#94a3b8" }}>{label}</Typography>
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  ) : (
                    <Typography sx={{ fontSize: "10px", color: "text.secondary", py: 2, textAlign: "center" }}>
                      {fleetSimBehaviorQuery.isLoading ? "Loading…" : "Driver data unavailable"}
                    </Typography>
                  )}
                </Paper>

                {/* DTC History */}
                <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc" }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75 }}>
                    <Box sx={{ width: 3, height: 14, borderRadius: 2, bgcolor: "#f59e0b" }} />
                    <ErrorRoundedIcon sx={{ fontSize: 12, color: "#f59e0b" }} />
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>DTC History</Typography>
                    <Typography sx={{ fontSize: "9px", color: darkMode ? "#475569" : "#94a3b8", ml: "auto" }}>{dtcRuns.length} runs</Typography>
                  </Box>
                  {dtcRuns.length === 0 ? (
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 1.5, gap: 0.75 }}>
                      <CheckCircleRoundedIcon sx={{ fontSize: 14, color: "#22c55e", opacity: 0.7 }} />
                      <Typography sx={{ fontSize: "10px", color: "text.secondary" }}>No DTC runs recorded</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                      {dtcRuns.slice(0, 3).map((run: any, i: number) => {
                        const triggerCount = run.triggers?.length ?? 0;
                        return (
                          <Box key={run.run_id || i} sx={{ display: "flex", alignItems: "center", gap: 1, p: 0.75, borderRadius: 1.5, bgcolor: darkMode ? alpha("#1e293b", 0.4) : alpha("#f8fafc", 0.8), border: `1px solid ${darkMode ? alpha("#334155", 0.4) : alpha("#e2e8f0", 1)}`, cursor: "pointer", "&:hover": { bgcolor: darkMode ? alpha("#1e293b", 0.7) : alpha("#f1f5f9", 1) } }}
                            onClick={() => navigate(`/dtc?vehicle=${encodeURIComponent(selectedVehicle)}`)}>
                            <Box sx={{ width: 3, minHeight: 28, borderRadius: 2, bgcolor: triggerCount > 0 ? "#ef4444" : "#22c55e", flexShrink: 0 }} />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography sx={{ fontSize: "9px", fontFamily: "monospace", color: darkMode ? "#94a3b8" : "#64748b" }}>{String(run.run_ts || "").slice(0, 16)}</Typography>
                              <Typography sx={{ fontSize: "10px", fontWeight: 700, color: darkMode ? "#cbd5e1" : "#1e293b" }}>{triggerCount > 0 ? `${triggerCount} code${triggerCount > 1 ? "s" : ""} found` : "No codes"}</Typography>
                            </Box>
                            <Box sx={{ px: 0.75, py: "2px", borderRadius: 1, bgcolor: triggerCount > 0 ? alpha("#ef4444", darkMode ? 0.15 : 0.08) : alpha("#22c55e", darkMode ? 0.12 : 0.07) }}>
                              <Typography sx={{ fontSize: "9px", fontWeight: 700, color: triggerCount > 0 ? "#ef4444" : "#22c55e" }}>{run.module?.toUpperCase() || "ALL"}</Typography>
                            </Box>
                          </Box>
                        );
                      })}
                      {dtcRuns.length > 3 && (
                        <Button size="small" onClick={() => navigate(`/dtc?vehicle=${encodeURIComponent(selectedVehicle)}`)} sx={{ fontSize: "9px", fontWeight: 600, height: 22, color: darkMode ? "#64748b" : "#94a3b8" }}>
                          +{dtcRuns.length - 3} more → View full history
                        </Button>
                      )}
                    </Box>
                  )}
                </Paper>
              </Box>
            </Box>
          </Box>
          ) : (
          <>
          {/* Controls */}
          <Paper
            sx={{
              p: 1,
              borderRadius: 2,
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
              border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`,
              bgcolor: darkMode ? alpha("#0f172a", 0.8) : alpha("#f8fafc", 0.95),
            }}
          >

            <Button
              size="small"
              startIcon={<ArrowBackRoundedIcon sx={{ fontSize: "13px !important" }} />}
              onClick={() => setViewMode("summary")}
              sx={{ height: 28, fontSize: "10px", fontWeight: 700, px: 1.5, borderRadius: "4px", bgcolor: darkMode ? alpha("#38bdf8", 0.1) : alpha("#0284c7", 0.07), color: darkMode ? "#38bdf8" : "#0369a1", border: `1px solid ${darkMode ? alpha("#38bdf8", 0.22) : alpha("#0284c7", 0.18)}`, "&:hover": { bgcolor: darkMode ? alpha("#38bdf8", 0.18) : alpha("#0284c7", 0.13) } }}
            >
              Summary
            </Button>

            <FormControl
              size="small"
              sx={{
                minWidth: 180,
                "& .MuiOutlinedInput-root": {
                  bgcolor: darkMode ? "#1e293b" : "#fff",
                  borderRadius: 1,
                  fontSize: "10px",
                  "& fieldset": { borderColor: darkMode ? alpha("#7dd3fc", 0.2) : alpha("#94a3b8", 0.35) },
                  "&:hover fieldset": { borderColor: darkMode ? alpha("#7dd3fc", 0.4) : alpha("#94a3b8", 0.6) },
                  "&.Mui-focused fieldset": { borderColor: darkMode ? "#38bdf8" : "#005071" },
                },
                "& .MuiInputLabel-root": {
                  fontSize: "10px",
                  color: darkMode ? "#64748b" : "#94a3b8",
                  "&.Mui-focused": { color: darkMode ? "#38bdf8" : "#005071" },
                },
              }}
            >
              <InputLabel>Vehicle</InputLabel>
              <Select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                label="Vehicle"
                sx={{ height: 30, "& .MuiSelect-select": { fontSize: "10px", py: 0.5 } }}
                MenuProps={{ PaperProps: { sx: { "& .MuiMenuItem-root": { fontSize: "10px" } } } }}
              >
                {vehicles.map((v: any) => (
                  <MenuItem key={v.vehicle_id} value={v.vehicle_id} sx={{ fontSize: "10px" }}>
                    {v.vehicle_id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <ToggleButtonGroup
              value={selectedModule}
              exclusive
              onChange={(_e, val) => val && setSelectedModule(val)}
              size="small"
              sx={{
                bgcolor: darkMode ? alpha("#020c16", 0.7) : alpha("#e2eaf4", 0.8),
                borderRadius: "6px",
                border: `1px solid ${darkMode ? alpha("#7dd3fc", 0.1) : alpha("#94a3b8", 0.22)}`,
                p: "2px",
                gap: "2px",
                "& .MuiToggleButtonGroup-grouped": {
                  border: "none !important",
                  borderRadius: "4px !important",
                },
                "& .MuiToggleButton-root": {
                  fontWeight: 700,
                  px: 1.25,
                  fontSize: "10px",
                  minHeight: 26,
                  textTransform: "uppercase",
                  color: darkMode ? alpha("#94a3b8", 0.8) : "#64748b",
                  transition: "all .15s",
                  "&:hover:not(.Mui-selected)": {
                    bgcolor: darkMode ? alpha("#7dd3fc", 0.07) : alpha("#94a3b8", 0.12),
                    color: darkMode ? "#cbd5e1" : "#374151",
                  },
                  "&.Mui-selected": { color: "#fff", fontWeight: 700 },
                },
              }}
            >
              {ALL_MODULES.map((mod) => (
                <ToggleButton
                  key={mod}
                  value={mod}
                  sx={{
                    "&.Mui-selected": {
                      bgcolor: MODULE_COLORS[mod],
                      "&:hover": { bgcolor: MODULE_COLORS[mod] },
                    },
                  }}
                >
                  {mod.toUpperCase()}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <Chip
              size="small"
              label={`${sensorData.length} Bronze pts`}
              sx={{
                borderRadius: "4px",
                fontWeight: 700,
                fontSize: "10px",
                height: 24,
                bgcolor: darkMode ? alpha("#f59e0b", 0.12) : alpha("#d97706", 0.08),
                color: darkMode ? "#fbbf24" : "#b45309",
                border: `1px solid ${darkMode ? alpha("#f59e0b", 0.28) : alpha("#d97706", 0.22)}`,
              }}
            />

            <Chip
              size="small"
              label={`${moduleHealthQuery.data?.count ?? 0} Silver pts`}
              sx={{
                borderRadius: "4px",
                fontWeight: 700,
                fontSize: "10px",
                height: 24,
                bgcolor: darkMode ? alpha("#38bdf8", 0.12) : alpha("#0284c7", 0.08),
                color: darkMode ? "#38bdf8" : "#0369a1",
                border: `1px solid ${darkMode ? alpha("#38bdf8", 0.28) : alpha("#0284c7", 0.2)}`,
              }}
            />

            <Box sx={{ flex: 1 }} />

            <Badge
              badgeContent={unanalyzedVehicleAlerts.length}
              color="error"
              sx={{ "& .MuiBadge-badge": { fontSize: "9px", height: 16, minWidth: 16 } }}
            >
              <Button
                size="small"
                onClick={() => setAlertsOpen(true)}
                disabled={!selectedVehicle || vehicleAlertsQuery.isLoading}
                sx={{
                  height: 28,
                  fontSize: "10px",
                  fontWeight: 700,
                  px: 1.5,
                  borderRadius: "4px",
                  textTransform: "uppercase",
                  bgcolor: darkMode ? alpha("#ef4444", 0.12) : alpha("#ef4444", 0.08),
                  color: darkMode ? "#f87171" : "#dc2626",
                  border: `1px solid ${darkMode ? alpha("#ef4444", 0.3) : alpha("#ef4444", 0.22)}`,
                  "&:hover": {
                    bgcolor: darkMode ? alpha("#ef4444", 0.2) : alpha("#ef4444", 0.14),
                  },
                  "&.Mui-disabled": {
                    bgcolor: darkMode ? alpha("#475569", 0.1) : alpha("#94a3b8", 0.08),
                    color: darkMode ? "#475569" : "#94a3b8",
                    borderColor: darkMode ? alpha("#475569", 0.2) : alpha("#94a3b8", 0.2),
                  },
                }}
              >
                Alerts ({allVehicleAlerts.length})
              </Button>
            </Badge>
          </Paper>

          {/* GOLD + SILVER health charts side by side */}
          <Grid container spacing={1} alignItems="stretch">
            {/* LEFT SECTION -> 9 columns */}
            <Grid item xs={12} md={9}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  height: "100%",
                }}
              >
                {/* KPI CARDS  -  Row 1 */}
                <Box
                  sx={{
                    display: "flex",
                    gap: 1.5,
                    flexWrap: "nowrap",
                    overflowX: "auto",
                  }}
                >
                  {kpiFields.map((f) => {
                    const val = latestBronzeRow
                      ? Number(latestBronzeRow[f.key] ?? 0)
                      : null;
                    const isWarn = val !== null && f.warnFn ? f.warnFn(val) : false;
                    const tileColor = isWarn ? "#ef4444" : MODULE_COLORS[selectedModule];
                    const tileBg = isWarn ? "#FFF1F1" : ({ engine: "#FFF1F1", transmission: "#FFF3E0", battery: "#EEF6FF", body: "#F4EEFF", tyre: "#EEFCEF" } as Record<string, string>)[selectedModule] ?? "#EEF6FF";

                    return (
                      <Paper
                        key={f.key}
                        elevation={3}
                        sx={{
                          flex: 1,
                          minWidth: 110,
                          p: 2,
                          borderRadius: 3,
                          borderLeft: `5px solid ${tileColor}`,
                          background: getCardGradient(tileBg, tileColor, darkMode),
                          boxShadow: darkMode
                            ? "0 4px 20px rgba(0,0,0,.35)"
                            : "0 2px 10px rgba(0,0,0,.08)",
                          transition: "all .25s ease",
                        }}
                      >
                        <Typography
                          sx={{
                            fontSize: "10px",
                            fontWeight: 500,
                            color: darkMode ? "#94a3b8" : "#475569",
                          }}
                        >
                          {f.label}
                        </Typography>
                        <Typography
                          sx={{
                            fontWeight: 700,
                            color: isWarn ? "#ef4444" : darkMode ? "#e2e8f0" : "#1f2937",
                            fontSize: "14px",
                            mt: 0.5,
                            lineHeight: 1,
                          }}
                        >
                          {val !== null ? `${val.toFixed(2)} ${f.unit}` : "-"}
                        </Typography>
                      </Paper>
                    );
                  })}

                  {/* Next Service KM card */}
                  {lastMileage > 0 && (
                    <Paper
                      elevation={3}
                      sx={{
                        flex: 1,
                        minWidth: 110,
                        p: 2,
                        borderRadius: 3,
                        borderLeft: `5px solid ${nextServiceInKm < 1000 ? "#ef4444" : nextServiceInKm < 3000 ? "#f59e0b" : "#22c55e"}`,
                        background: getCardGradient(
                          nextServiceInKm < 1000 ? "#FFF1F1" : nextServiceInKm < 3000 ? "#FFFBEB" : "#EEFCEF",
                          nextServiceInKm < 1000 ? "#ef4444" : nextServiceInKm < 3000 ? "#f59e0b" : "#22c55e",
                          darkMode
                        ),
                        boxShadow: darkMode ? "0 4px 20px rgba(0,0,0,.35)" : "0 2px 10px rgba(0,0,0,.08)",
                        transition: "all .25s ease",
                      }}
                    >
                      <Typography sx={{ fontSize: "10px", fontWeight: 500, color: darkMode ? "#94a3b8" : "#475569" }}>
                        Next Service
                      </Typography>
                      <Typography
                        sx={{
                          fontWeight: 700,
                          fontSize: "14px",
                          mt: 0.5,
                          lineHeight: 1,
                          color: nextServiceInKm < 1000 ? "#ef4444" : nextServiceInKm < 3000 ? "#f59e0b" : darkMode ? "#e2e8f0" : "#1f2937",
                        }}
                      >
                        {nextServiceInKm.toLocaleString()} km
                      </Typography>
                    </Paper>
                  )}
                </Box>

                {/* CHARTS  -  Row 2 */}
                <Grid container spacing={1}>
                  {/* GOLD */}
                  <Grid item xs={12} md={6}>
                    <Paper
                      sx={{
                        p: 1.25,
                        borderRadius: 2,
                        height: 260,
                        display: "flex",
                        flexDirection: "column",
                        border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`,
                        bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc",
                      }}
                    >
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                          <Box sx={{ width: 3, height: 12, borderRadius: 1, bgcolor: "#3b82f6" }} />
                          <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "text.primary" : "#005071" }}>
                            Fused Vehicle Health
                          </Typography>
                          <Chip
                            size="small"
                            label="Gold"
                            sx={{ height: 16, borderRadius: 1, fontSize: "9px", fontWeight: 700, bgcolor: darkMode ? alpha("#3b82f6", 0.12) : alpha("#3b82f6", 0.08), color: darkMode ? "#93c5fd" : "#2563eb", border: `1px solid ${alpha("#3b82f6", 0.2)}` }}
                          />
                        </Box>
                        <Chip
                          size="small"
                          label={vehicleHealthQuery.data?.data_source || " - "}
                          sx={{ borderRadius: 2, fontWeight: "bold", fontSize: "10px", height: 18 }}
                        />
                      </Box>
                      <Box sx={{ flex: 1, minHeight: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={healthHistory}
                            margin={{ top: 4, right: 15, left: -25, bottom: 20 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
                            <XAxis
                              dataKey={xAxisMode === "mileage" ? "mileage" : "ts"}
                              tick={axisStyle}
                              axisLine={{ stroke: ct.tableBorder }}
                              tickLine={false}
                              minTickGap={40}
                              tickFormatter={(v) => formatXTick(v, xAxisMode)}
                            />
                            <YAxis domain={[0, 100]} tick={axisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                            <Tooltip
                              cursor={{ stroke: darkMode ? alpha("#7dd3fc", 0.3) : alpha("#3b82f6", 0.2), strokeWidth: 1 }}
                              contentStyle={tooltipStyle}
                              formatter={(v: number) => `${v.toFixed(1)}%`}
                            />
                            <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "CRIT", fontSize: 9, fill: "#ef4444", position: "insideTopRight" }} />
                            <ReferenceLine y={80} stroke="#eab308" strokeDasharray="4 4" label={{ value: "WARN", fontSize: 9, fill: "#eab308", position: "insideTopRight" }} />
                            <Line
                              type="monotone"
                              dataKey="health"
                              name="Health %"
                              stroke="#3b82f6"
                              strokeWidth={3}
                              dot={false}
                              activeDot={{ r: 5 }}
                              isAnimationActive={false}
                            />
                            <Brush
                              dataKey={xAxisMode === "mileage" ? "mileage" : "ts"}
                              height={18}
                              stroke={darkMode ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5)}
                              fill={darkMode ? alpha("#0d2137", 0.85) : alpha("#e2eaf4", 0.9)}
                              travellerWidth={6}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>
                    </Paper>
                  </Grid>

                  {/* SILVER */}
                  <Grid item xs={12} md={6}>
                    <Paper
                      sx={{
                        p: 1.25,
                        borderRadius: 2,
                        height: 260,
                        display: "flex",
                        flexDirection: "column",
                        border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`,
                        bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc",
                      }}
                    >
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                          <Box sx={{ width: 3, height: 12, borderRadius: 1, bgcolor: MODULE_COLORS[selectedModule] }} />
                          <Typography sx={{ fontSize: "11px", fontWeight: 700, color: darkMode ? "#94a3b8" : "#64748b" }}>
                            {selectedModule.charAt(0).toUpperCase() + selectedModule.slice(1)} ML Health
                            <span style={{ fontWeight: 400, marginLeft: 4 }}>· Silver</span>
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={latestSeverity}
                          sx={{
                            borderRadius: 2,
                            fontWeight: "bold",
                            fontSize: "10px",
                            height: 18,
                            bgcolor: severityColor,
                            color: "white",
                          }}
                        />
                      </Box>
                      <Box sx={{ flex: 1, minHeight: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={moduleHealthData}
                            margin={{ top: 4, right: 15, left: -25, bottom: 20 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
                            <XAxis
                              dataKey={xAxisMode === "timestamp" ? "timestamp" : "mileage"}
                              tick={axisStyle}
                              axisLine={{ stroke: ct.tableBorder }}
                              tickLine={false}
                              minTickGap={40}
                              tickFormatter={(v) => formatXTick(v, xAxisMode)}
                            />
                            <YAxis domain={[0, 100]} tick={axisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                            <Tooltip
                              cursor={{ stroke: darkMode ? alpha("#7dd3fc", 0.3) : alpha("#3b82f6", 0.2), strokeWidth: 1 }}
                              contentStyle={tooltipStyle}
                              formatter={(v: number) => `${v.toFixed(1)}%`}
                            />
                            <ReferenceLine
                              y={60}
                              stroke="#ef4444"
                              strokeDasharray="4 4"
                              label={{ value: "CRIT", fontSize: 9, fill: "#ef4444" }}
                            />
                            <ReferenceLine
                              y={80}
                              stroke="#eab308"
                              strokeDasharray="4 4"
                              label={{ value: "WARN", fontSize: 9, fill: "#eab308" }}
                            />
                            <Line
                              type="monotone"
                              dataKey="health_score"
                              name="ML Health"
                              stroke={MODULE_COLORS[selectedModule]}
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                            <Brush
                              dataKey={xAxisMode === "timestamp" ? "timestamp" : "mileage"}
                              height={18}
                              stroke={darkMode ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5)}
                              fill={darkMode ? alpha("#0d2137", 0.85) : alpha("#e2eaf4", 0.9)}
                              travellerWidth={6}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>
                    </Paper>
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            {/* RIGHT SECTION -> 3 columns */}
            <Grid item xs={12} md={3} sx={{ display: "flex", flexDirection: "column" }}>
              <Paper
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`,
                  bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
                  <Box sx={{ width: 3, height: 14, borderRadius: 1, bgcolor: MODULE_COLORS[selectedModule] }} />
                  <Typography sx={{ fontSize: "11px", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: darkMode ? "#94a3b8" : "#64748b" }}>
                    Top Anomaly Drivers
                  </Typography>
                </Box>

                <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
                  {topFeatures.length > 0 ? (
                    topFeatures.map((f) => {
                      const modColor = MODULE_COLORS[selectedModule] ?? "#ef4444";
                      return (
                        <Box
                          key={f.feature}
                          sx={{
                            display: "flex", alignItems: "center", gap: 1.2,
                            p: 1, mb: 0.8, borderRadius: 1.5,
                            border: `1px solid ${darkMode ? alpha("#7dd3fc", 0.12) : alpha("#1f2937", 0.1)}`,
                            background: darkMode ? alpha("#fff", 0.02) : "#fff",
                            transition: ".2s",
                            "&:hover": { boxShadow: "0 3px 8px rgba(0,0,0,.08)", transform: "translateY(-1px)" },
                          }}
                        >
                          <Box
                            sx={{
                              width: 30, height: 30, borderRadius: 1.5,
                              bgcolor: alpha(modColor, 0.1), color: modColor,
                              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                              "& svg": { fontSize: 16 },
                            }}
                          >
                            <WarningAmberRoundedIcon />
                          </Box>
                          <Box flex={1}>
                            <Typography sx={{ fontSize: "10px", fontWeight: 700, mb: 0.5, lineHeight: 1.2, wordBreak: "break-word" }}>
                              {f.feature.replace(/_/g, " ")}
                            </Typography>
                            <Box sx={{ height: 6, bgcolor: ct.gridColor, borderRadius: 10, overflow: "hidden" }}>
                              <Box
                                sx={{
                                  width: `${Math.min(100, f.score * 200)}%`,
                                  height: "100%", borderRadius: 10,
                                  background: `linear-gradient(90deg, ${alpha(modColor, 0.5)}, ${modColor})`,
                                }}
                              />
                            </Box>
                          </Box>
                          <Box
                            sx={{
                              minWidth: 42, height: 30, borderRadius: 1.5,
                              bgcolor: alpha(modColor, 0.1),
                              display: "flex", alignItems: "center", justifyContent: "center", px: 0.5,
                            }}
                          >
                            <Typography sx={{ color: modColor, fontWeight: 700, fontSize: "10px", lineHeight: 1 }}>
                              {f.score.toFixed(2)}
                            </Typography>
                          </Box>
                        </Box>
                      );
                    })
                  ) : (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      No Silver data yet
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Grid>
          </Grid>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box sx={{ width: 3, height: 16, borderRadius: 1, bgcolor: MODULE_COLORS[selectedModule] }} />
            <Typography sx={{ fontSize: "11px", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: darkMode ? "#94a3b8" : "#64748b" }}>
              Bronze Sensors
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: darkMode ? alpha("#334155", 0.8) : alpha("#e2e8f0", 1) }} />
          </Box>

          {/* Bronze sensor charts grid */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1.5,
            }}
          >
            {chartGroups.map((group) => (
              <SensorChart
                key={group.title}
                data={downsampledBronze}
                group={group}
                xAxisMode={xAxisMode}
              />
            ))}
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1 }}>
            <Box sx={{ width: 3, height: 16, borderRadius: 1, bgcolor: MODULE_COLORS[selectedModule] }} />
            <Typography sx={{ fontSize: "11px", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: darkMode ? "#94a3b8" : "#64748b" }}>
              Health Analytics
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: darkMode ? alpha("#334155", 0.8) : alpha("#e2e8f0", 1) }} />
          </Box>

          {/* ---- ROW A: Health decomposition stacked area ---- */}
          <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                <Box sx={{ width: 3, height: 12, borderRadius: 1, bgcolor: "#3b82f6" }} />
                <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "12px", color: darkMode ? "text.primary" : "#005071" }}>
                  HEALTH DECOMPOSITION
                  <span style={{ color: ct.axisColor, fontWeight: 400, marginLeft: 4 }}>· Silver · all modules</span>
                </Typography>
              </Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                {ALL_MODULES.map((mod) => (
                  <Box key={mod} sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                    <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: MODULE_COLORS[mod], flexShrink: 0 }} />
                    <Typography sx={{ fontSize: "9px", fontWeight: 700, color: ct.axisColor, textTransform: "uppercase", letterSpacing: 0.3 }}>
                      {mod}
                    </Typography>
                  </Box>
                ))}
                <Chip
                  size="small"
                  label={
                    vehicleDecompQuery.isLoading
                      ? "loading..."
                      : vehicleDecompQuery.isError
                      ? "error"
                      : decompositionHistory.length > 0
                      ? `${decompositionHistory.length} pts`
                      : "no data"
                  }
                  sx={{
                    borderRadius: 2,
                    fontWeight: "bold",
                    fontSize: "10px",
                    height: 18,
                    bgcolor: vehicleDecompQuery.isError ? "#ffebee" : "default",
                    color: vehicleDecompQuery.isError ? "#d32f2f" : "default",
                  }}
                />
              </Box>
            </Box>
            <Box sx={{ height: 340 }}>
              {decompositionHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={decompositionHistory} margin={{ top: 8, right: 12, left: -22, bottom: 20 }}>
                    <defs>
                      {ALL_MODULES.map((mod) => (
                        <linearGradient key={mod} id={`dg_${mod}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={MODULE_COLORS[mod]} stopOpacity={0.85} />
                          <stop offset="100%" stopColor={MODULE_COLORS[mod]} stopOpacity={0.25} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
                    <XAxis
                      dataKey={xAxisMode === "mileage" ? "mileage" : "ts"}
                      tick={axisStyle}
                      axisLine={{ stroke: ct.tableBorder }}
                      tickLine={false}
                      minTickGap={40}
                      tickFormatter={(v) => formatXTick(v, xAxisMode)}
                    />
                    <YAxis domain={[0, 100]} tick={axisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                    <Tooltip
                      cursor={{ stroke: darkMode ? alpha("#7dd3fc", 0.3) : alpha("#3b82f6", 0.2), strokeWidth: 1 }}
                      contentStyle={tooltipStyle}
                      formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name.toUpperCase()]}
                    />
                    <ReferenceLine y={80} stroke="#eab308" strokeDasharray="4 4" label={{ value: "WARN", fontSize: 9, fill: "#eab308", position: "insideTopRight" }} />
                    <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "CRIT", fontSize: 9, fill: "#ef4444", position: "insideTopRight" }} />
                    {ALL_MODULES.map((mod) => (
                      <Area
                        key={mod}
                        type="monotone"
                        dataKey={mod}
                        name={mod}
                        stackId="decomp"
                        stroke={MODULE_COLORS[mod]}
                        strokeWidth={1.5}
                        fill={`url(#dg_${mod})`}
                        dot={false}
                        isAnimationActive={false}
                      />
                    ))}
                    <Brush
                      dataKey={xAxisMode === "mileage" ? "mileage" : "ts"}
                      height={18}
                      stroke={darkMode ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5)}
                      fill={darkMode ? alpha("#0d2137", 0.85) : alpha("#e2eaf4", 0.9)}
                      travellerWidth={6}
                      tickFormatter={(v) => formatXTick(v, xAxisMode)}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    {vehicleDecompQuery.isError
                      ? "Restart backend to load new endpoint (dash_backend)"
                      : vehicleDecompQuery.isLoading
                      ? "Loading module decomposition..."
                      : "No silver history for this vehicle"}
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>

          {/* ---- ROW B: Module health radar + Severity transition strip ---- */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Paper
              sx={{
                width: 290,
                p: 1,
                borderRadius: 2,
                height: 280,
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`,
                bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc",
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, fontSize: "12px", color: darkMode ? "text.primary" : "#005071", mb: 0.5 }}
              >
                MODULE HEALTH RADAR  -  {selectedVehicle || " - "}
              </Typography>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={radarData}
                    margin={{ top: 10, right: 20, bottom: 10, left: 20 }}
                  >
                    <PolarGrid stroke={ct.gridColor} />
                    <PolarAngleAxis
                      dataKey="module"
                      tick={
                        {
                          fontSize: 10,
                          fontWeight: 700,
                          fill: ct.tooltipText,
                          fontFamily: "monospace",
                        } as any
                      }
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={false}
                      axisLine={false}
                    />
                    <Radar
                      name="Health %"
                      dataKey="score"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.2}
                      isAnimationActive={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: any) => [`${v}%`, "Health"]}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>

            <Paper
              sx={{
                flex: 1,
                p: 1,
                borderRadius: 2,
                height: 280,
                display: "flex",
                flexDirection: "column",
                border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`,
                bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 1,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, fontSize: "12px", color: darkMode ? "text.primary" : "#005071" }}
                >
                  SEVERITY TRANSITION HISTORY  -  {selectedModule.toUpperCase()}{" "}
                  &nbsp;
                  <span style={{ color: ct.axisColor, fontWeight: 400 }}>
                    (SILVER)
                  </span>
                </Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                  {[
                    { label: "NORMAL", color: "#22c55e" },
                    { label: "WARNING", color: "#eab308" },
                    { label: "CRITICAL", color: "#ef4444" },
                  ].map((s) => (
                    <Box
                      key={s.label}
                      sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                    >
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          bgcolor: s.color,
                          borderRadius: "2px",
                        }}
                      />
                      <Typography
                        variant="caption"
                        sx={{
                          fontSize: "10px",
                          color: "text.secondary",
                          fontFamily: "monospace",
                        }}
                      >
                        {s.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
              {severityRuns.length > 0 ? (
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                    flex: 1,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      height: 44,
                      width: "100%",
                      overflow: "hidden",
                      borderRadius: "2px",
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  >
                    {severityRuns.map((run, i) => (
                      <Box
                        key={i}
                        title={`${run.severity}: ${run.startTs} -> ${run.endTs} (${run.count} pts)`}
                        sx={{
                          flex: run.count,
                          bgcolor:
                            run.severity === "CRITICAL"
                              ? "#ef4444"
                              : run.severity === "WARNING"
                              ? "#eab308"
                              : "#22c55e",
                          "&:hover": { opacity: 0.75, cursor: "default" },
                        }}
                      />
                    ))}
                  </Box>
                  <Box
                    sx={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "10px",
                        color: "text.secondary",
                        fontFamily: "monospace",
                      }}
                    >
                      {severityRuns[0]?.startTs}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: "10px",
                        color: "text.secondary",
                        fontFamily: "monospace",
                      }}
                    >
                      {severityRuns[severityRuns.length - 1]?.endTs}
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", gap: 3, mt: 0.5 }}>
                    {severityDistribution.map((d) => (
                      <Box
                        key={d.name}
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                        }}
                      >
                        <Typography
                          variant="h6"
                          sx={{
                            fontWeight: "bold",
                            color: d.color,
                            fontFamily: "monospace",
                            lineHeight: 1.1,
                          }}
                        >
                          {d.pct}%
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: "10px",
                            color: "text.secondary",
                            fontFamily: "monospace",
                          }}
                        >
                          {d.name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: "9px",
                            color: "text.secondary",
                            fontFamily: "monospace",
                          }}
                        >
                          {d.value} pts
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Box>
              ) : (
                <Box
                  sx={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary" }}
                  >
                    No silver data for this module
                  </Typography>
                </Box>
              )}
            </Paper>
          </Box>

          {/* ---- ROW C: Anomaly driver trends  -  small multiples grid ---- */}
          <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc" }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 1,
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, fontSize: "12px", color: darkMode ? "text.primary" : "#005071" }}
              >
                ANOMALY DRIVER TRENDS  -  LSTM RECONSTRUCTION ERROR PER FEATURE
                &nbsp;
                <span style={{ color: ct.axisColor, fontWeight: 400 }}>
                  ({selectedModule.toUpperCase()} SILVER  -  higher = more
                  anomalous  -  standardized units)
                </span>
              </Typography>
              {anomalyTrendSeries.length > 0 && (
                <Chip
                  size="small"
                  label={`${anomalyTrendSeries.length} drivers · ${anomalyTrendData.length} pts`}
                  sx={{ borderRadius: 2, fontWeight: 700, fontSize: "10px", height: 18 }}
                />
              )}
            </Box>
            {anomalyTrendData.length > 0 && anomalyTrendSeries.length > 0 ? (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 1.5,
                }}
              >
                {anomalyTrendSeries.map((feature, i) => (
                  <SensorChart
                    key={feature}
                    data={anomalyTrendData}
                    group={{
                      title: feature.replace(/_/g, " ").toUpperCase(),
                      sensors: [
                        {
                          key: feature,
                          color: SHAP_COLORS[i % SHAP_COLORS.length],
                          label: "recon. error²",
                        },
                      ],
                    }}
                    xAxisMode={xAxisMode}
                    height={170}
                  />
                ))}
              </Box>
            ) : (
              <Box
                sx={{
                  p: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  No SHAP data in silver history for this module
                </Typography>
              </Box>
            )}
          </Paper>

          {/* ---- ROW D: Bronze sensor statistics table ---- */}
          <Paper sx={{ p: 1.25, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, fontSize: "12px", color: darkMode ? "text.primary" : "#005071" }}
              >
                BRONZE SENSOR STATISTICS  -  {selectedModule.toUpperCase()}
              </Typography>
              <Chip
                size="small"
                label={`${sensorData.length.toLocaleString()} pts`}
                sx={{ borderRadius: 2, fontWeight: 700, fontSize: "10px", height: 18, bgcolor: darkMode ? alpha("#f59e0b", 0.12) : alpha("#d97706", 0.08), color: darkMode ? "#fbbf24" : "#b45309", border: `1px solid ${darkMode ? alpha("#f59e0b", 0.28) : alpha("#d97706", 0.22)}` }}
              />
            </Box>
            {sensorStats.length > 0 ? (
              <Box sx={{ overflowX: "auto" }}>
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
                      {[
                        "SENSOR",
                        "UNIT",
                        "MIN",
                        "MAX",
                        "MEAN",
                        "STD DEV",
                        "LATEST",
                      ].map((h) => (
                        <th key={h} style={tblHeader}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensorStats.map((s: any, i: number) => {
                      const isWarn =
                        s.latest !== null && !isNaN(s.latest) && s.warnFn
                          ? s.warnFn(s.latest)
                          : false;

                      return (
                        <tr
                          key={s.key}
                          style={i % 2 === 0 ? tblRowEven : tblRowOdd}
                        >
                          <td style={{ padding: "5px 12px", fontWeight: 600 }}>
                            {s.label}
                          </td>
                          <td
                            style={{ padding: "5px 12px", color: ct.axisColor }}
                          >
                            {s.unit || " - "}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {s.min !== null ? s.min.toFixed(2) : " - "}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {s.max !== null ? s.max.toFixed(2) : " - "}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {s.mean !== null ? s.mean.toFixed(2) : " - "}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {s.std !== null ? s.std.toFixed(2) : " - "}
                          </td>
                          <td
                            style={{
                              padding: "5px 12px",
                              fontWeight: "bold",
                              color: isWarn ? "#d32f2f" : ct.tooltipText,
                            }}
                          >
                            {s.latest !== null && !isNaN(s.latest)
                              ? s.latest.toFixed(2)
                              : " - "}
                            {isWarn && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  fontSize: "9px",
                                  color: "#d32f2f",
                                }}
                              >
                                ^
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Box>
            ) : (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Select a vehicle and module to load sensor statistics
              </Typography>
            )}
          </Paper>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mt: 1 }}>
            <Box sx={{ width: 3, height: 16, borderRadius: 1, bgcolor: MODULE_COLORS[selectedModule] }} />
            <Typography sx={{ fontSize: "11px", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: darkMode ? "#94a3b8" : "#64748b" }}>
              Sensor Timeline
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: darkMode ? alpha("#334155", 0.8) : alpha("#e2e8f0", 1) }} />
          </Box>

          {/* Sensor Timeline */}
          <Paper sx={{ p: 1.5, borderRadius: 2, border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: darkMode ? alpha("#0f172a", 0.6) : "#fafbfc" }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                mb: 1,
                flexWrap: "wrap",
              }}
            >
              {allVehicleSensorKeys.length > 0 && (
                <FormControl
                  size="small"
                  sx={{
                    minWidth: 300,
                    "& .MuiOutlinedInput-root": {
                      bgcolor: darkMode ? "#1e293b" : "#fff",
                      borderRadius: 1,
                      fontSize: "10px",
                      "& fieldset": { borderColor: darkMode ? alpha("#7dd3fc", 0.2) : alpha("#94a3b8", 0.35) },
                      "&:hover fieldset": { borderColor: darkMode ? alpha("#7dd3fc", 0.4) : alpha("#94a3b8", 0.6) },
                      "&.Mui-focused fieldset": { borderColor: darkMode ? "#38bdf8" : "#005071" },
                    },
                  }}
                >
                  <Select
                    value={
                      vehicleTimelineSensorKey ||
                      allVehicleSensorKeys[0]?.key ||
                      ""
                    }
                    onChange={(e) =>
                      setVehicleTimelineSensorKey(e.target.value)
                    }
                    sx={{ height: 30, "& .MuiSelect-select": { fontSize: "10px", py: 0.5, fontFamily: "monospace" } }}
                    MenuProps={{ PaperProps: { sx: { "& .MuiMenuItem-root": { fontSize: "10px", fontFamily: "monospace" } } } }}
                  >
                    {allVehicleSensorKeys.map((s) => (
                      <MenuItem
                        key={s.key}
                        value={s.key}
                        sx={{ fontFamily: "monospace", fontSize: "10px" }}
                      >
                        {s.groupTitle}  -  {s.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <Chip
                size="small"
                label={`${downsampledBronze.length} pts`}
                sx={{ borderRadius: "4px", fontWeight: 700, fontSize: "10px", height: 24, bgcolor: darkMode ? alpha("#f59e0b", 0.12) : alpha("#d97706", 0.08), color: darkMode ? "#fbbf24" : "#b45309", border: `1px solid ${darkMode ? alpha("#f59e0b", 0.28) : alpha("#d97706", 0.22)}` }}
              />
            </Box>
            {vehicleTimelineSensorGroup && downsampledBronze.length > 0 ? (
              <SensorChart
                data={downsampledBronze}
                group={vehicleTimelineSensorGroup}
                xAxisMode={xAxisMode}
                height={280}
              />
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: 280,
                }}
              >
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {!selectedVehicle
                    ? "Select a vehicle"
                    : sensorQuery.isLoading
                    ? "Loading..."
                    : "No bronze sensor data for this module"}
                </Typography>
              </Box>
            )}
          </Paper>
          </>
          )}
        </Box>

      {/* Alerts Dialog */}
      <Dialog
        open={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: "hidden",
            bgcolor: darkMode ? "#0c1628" : "#ffffff",
            border: `1px solid ${darkMode ? alpha("#334155", 0.8) : alpha("#e2e8f0", 1)}`,
            boxShadow: darkMode
              ? "0 25px 60px rgba(0,0,0,0.6)"
              : "0 25px 60px rgba(15,23,42,0.12)",
          },
        }}
      >
        <Box
          sx={{
            px: 3,
            pt: 2.5,
            pb: 0,
            background: darkMode
              ? `linear-gradient(135deg, ${alpha("#1e3a5f", 0.8)}, ${alpha("#0c1628", 0.95)})`
              : `linear-gradient(135deg, ${alpha("#eff6ff", 1)}, ${alpha("#f8fafc", 1)})`,
            borderBottom: `1px solid ${darkMode ? alpha("#334155", 0.6) : alpha("#e2e8f0", 1)}`,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 2 }}>
            <Box>
              <Typography sx={{ fontSize: "10px", fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: darkMode ? "#64748b" : "#94a3b8", fontFamily: "monospace", mb: 0.25 }}>
                {viewMode === "module" ? `${selectedModule.toUpperCase()} Module Alerts` : "Vehicle Alerts"}
              </Typography>
              <Typography sx={{ fontSize: "20px", fontWeight: 700, color: darkMode ? "#f1f5f9" : "#0f172a", letterSpacing: "-0.3px" }}>
                {selectedVehicle}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ display: "flex", gap: 0.75 }}>
                <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, bgcolor: alpha("#ef4444", darkMode ? 0.15 : 0.08), border: `1px solid ${alpha("#ef4444", 0.25)}` }}>
                  <Typography sx={{ fontSize: "11px", fontWeight: 700, color: "#ef4444" }}>{vehicleOpenAlerts.length} Open</Typography>
                </Box>
                <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, bgcolor: alpha("#22c55e", darkMode ? 0.12 : 0.07), border: `1px solid ${alpha("#22c55e", 0.22)}` }}>
                  <Typography sx={{ fontSize: "11px", fontWeight: 700, color: "#22c55e" }}>{vehicleClosedAlerts.length} Closed</Typography>
                </Box>
                {unanalyzedVehicleAlerts.length > 0 && (
                  <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, bgcolor: alpha("#f59e0b", darkMode ? 0.12 : 0.07), border: `1px solid ${alpha("#f59e0b", 0.22)}` }}>
                    <Typography sx={{ fontSize: "11px", fontWeight: 700, color: "#f59e0b" }}>{unanalyzedVehicleAlerts.length} Unanalyzed</Typography>
                  </Box>
                )}
              </Box>
              <IconButton size="small" onClick={() => setAlertsOpen(false)} sx={{ color: darkMode ? "#64748b" : "#94a3b8", "&:hover": { bgcolor: alpha("#ef4444", 0.1), color: "#ef4444" } }}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>

          <Tabs
            value={alertsTab}
            onChange={(_e, v) => setAlertsTab(v)}
            sx={{
              minHeight: 34,
              "& .MuiTabs-indicator": { height: 2, borderRadius: "2px 2px 0 0", bgcolor: darkMode ? "#38bdf8" : "#0284c7" },
              "& .MuiTab-root": { minHeight: 34, fontSize: "11px", fontWeight: 600, textTransform: "none", color: darkMode ? "#64748b" : "#94a3b8", px: 2, "&.Mui-selected": { color: darkMode ? "#38bdf8" : "#0284c7", fontWeight: 700 } },
            }}
          >
            <Tab label="All" />
            <Tab label="Unanalyzed" sx={{ "&.Mui-selected": { color: unanalyzedVehicleAlerts.length > 0 ? "#f59e0b !important" : undefined } }} />
            <Tab label="Analyzed" />
          </Tabs>
        </Box>

        <DialogContent sx={{ p: 2, maxHeight: 400, overflowY: "auto" }}>
          {vehicleAlertsQuery.isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <Typography sx={{ fontSize: "13px", color: "text.secondary" }}>Loading alerts...</Typography>
            </Box>
          ) : (
            (() => {
              const allRows = alertsTab === 0 ? allVehicleAlerts : alertsTab === 1 ? unanalyzedVehicleAlerts : analyzedVehicleAlerts;
              const rows = viewMode === "module" ? allRows.filter((a: any) => a.module?.toLowerCase() === selectedModule) : allRows;
              if (rows.length === 0) {
                return (
                  <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 5, gap: 1 }}>
                    <CheckCircleRoundedIcon sx={{ fontSize: 32, color: "#22c55e", opacity: 0.6 }} />
                    <Typography sx={{ fontSize: "13px", color: "text.secondary" }}>No alerts in this category</Typography>
                  </Box>
                );
              }
              return (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, pt: 0.5 }}>
                  {rows.map((a: any, i: number) => {
                    const isAnalyzed = analyzedSet.has(`${a.module}|${normPeakTs(a.peak_anomaly_ts)}`);
                    const isOpen = a.status === "OPEN";
                    const scoreNum = Number(a.max_composite_score);
                    const scoreColor = scoreNum >= 0.8 ? "#ef4444" : scoreNum >= 0.5 ? "#f59e0b" : "#22c55e";
                    const scoreBg = scoreNum >= 0.8 ? alpha("#ef4444", darkMode ? 0.14 : 0.08) : scoreNum >= 0.5 ? alpha("#f59e0b", darkMode ? 0.14 : 0.08) : alpha("#22c55e", darkMode ? 0.14 : 0.08);
                    const modColor = (MODULE_COLORS as Record<string, string>)[a.module?.toLowerCase()] || (darkMode ? "#7dd3fc" : "#0369a1");
                    type FeatureEntry = { label: string; value: number };
                    const fmtFeatureKey = (k: string): string =>
                      k
                        .replace(/_calculated/g, "")
                        .replace(/_absolute/g, "")
                        .replace(/_sensor_\d+/g, "")
                        .replace(/_bank_\d+/g, "")
                        .replace(/_pct$/g, "")
                        .replace(/_voltage_v$/g, "")
                        .replace(/_voltage$/g, "")
                        .replace(/_rpm$/g, "")
                        .replace(/_g_s$/g, "")
                        .replace(/_kpa$/g, "")
                        .replace(/_bar$/g, "")
                        .split("_")
                        .filter((w) => w.length > 1 || /\d/.test(w))
                        .slice(0, 4)
                        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                        .join(" ")
                        .slice(0, 22);
                    let featureEntries: FeatureEntry[] = [];
                    if (a.top_10_features) {
                      try {
                        const parsed = JSON.parse(a.top_10_features) as Record<string, number>;
                        const totalScore = Object.values(parsed).reduce((s, v) => s + Math.abs(v), 0);
                        featureEntries = Object.entries(parsed)
                          .slice(0, 5)
                          .map(([k, v]) => ({
                            label: fmtFeatureKey(k),
                            value: totalScore > 0 ? Math.round((Math.abs(v) / totalScore) * 100) : 0,
                          }));
                      } catch {
                        featureEntries = [];
                      }
                    }
                    return (
                      <Box
                        key={a.alert_id || i}
                        sx={{
                          display: "flex",
                          borderRadius: 2,
                          overflow: "hidden",
                          border: `1px solid ${darkMode ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`,
                          bgcolor: darkMode ? alpha("#1e293b", 0.5) : "#fafbfc",
                          transition: "box-shadow 0.15s",
                          "&:hover": { boxShadow: darkMode ? `0 4px 20px ${alpha("#000", 0.3)}` : `0 4px 16px ${alpha("#0f172a", 0.08)}` },
                        }}
                      >
                        <Box sx={{ width: 4, flexShrink: 0, bgcolor: isOpen ? "#ef4444" : "#22c55e" }} />
                        <Box sx={{ flex: 1, p: 1.5, display: "flex", gap: 2, alignItems: "center", minWidth: 0 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.75, flexWrap: "wrap" }}>
                              <Box sx={{ px: 0.85, py: "2px", borderRadius: "5px", fontSize: "9px", fontWeight: 800, letterSpacing: 0.5, bgcolor: isOpen ? alpha("#ef4444", darkMode ? 0.18 : 0.1) : alpha("#22c55e", darkMode ? 0.14 : 0.08), color: isOpen ? "#ef4444" : "#22c55e", border: `1px solid ${isOpen ? alpha("#ef4444", 0.3) : alpha("#22c55e", 0.25)}` }}>
                                {a.status}
                              </Box>
                              <Box sx={{ px: 0.85, py: "2px", borderRadius: "5px", fontSize: "9px", fontWeight: 800, letterSpacing: 0.5, bgcolor: alpha(modColor, darkMode ? 0.16 : 0.1), color: modColor, border: `1px solid ${alpha(modColor, 0.28)}` }}>
                                {String(a.module || "").toUpperCase()}
                              </Box>
                              {isAnalyzed && (
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.4 }}>
                                  <CheckCircleRoundedIcon sx={{ fontSize: 12, color: "#22c55e" }} />
                                  <Typography sx={{ fontSize: "9px", fontWeight: 600, color: "#22c55e" }}>Analyzed</Typography>
                                </Box>
                              )}
                            </Box>
                            <Box sx={{ display: "flex", gap: 2.5, mb: featureEntries.length > 0 ? 0.75 : 0 }}>
                              <Box>
                                <Typography sx={{ fontSize: "9px", fontWeight: 600, color: darkMode ? "#475569" : "#94a3b8", mb: "1px", textTransform: "uppercase", letterSpacing: 0.4 }}>Peak</Typography>
                                <Typography sx={{ fontSize: "11px", fontFamily: "monospace", color: darkMode ? "#cbd5e1" : "#334155" }}>{String(a.peak_anomaly_ts || "").slice(0, 19)}</Typography>
                              </Box>
                              {a.alert_start_ts && (
                                <Box>
                                  <Typography sx={{ fontSize: "9px", fontWeight: 600, color: darkMode ? "#475569" : "#94a3b8", mb: "1px", textTransform: "uppercase", letterSpacing: 0.4 }}>Started</Typography>
                                  <Typography sx={{ fontSize: "11px", fontFamily: "monospace", color: darkMode ? "#94a3b8" : "#64748b" }}>{String(a.alert_start_ts).slice(0, 19)}</Typography>
                                </Box>
                              )}
                            </Box>
                            {featureEntries.length > 0 && (
                              <Box>
                              <Typography sx={{ fontSize: "9px", fontWeight: 600, color: darkMode ? "#475569" : "#94a3b8", mb: "3px", textTransform: "uppercase", letterSpacing: 0.4 }}>
                                Top anomaly drivers (% of total weight)
                              </Typography>
                              <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                                {featureEntries.map((f, fi) => (
                                  <Box
                                    key={fi}
                                    sx={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 0.6,
                                      px: 0.85,
                                      py: "2px",
                                      borderRadius: "5px",
                                      bgcolor: darkMode ? alpha("#1e293b", 0.9) : alpha("#f1f5f9", 1),
                                      border: `1px solid ${darkMode ? alpha("#475569", 0.35) : alpha("#cbd5e1", 1)}`,
                                    }}
                                  >
                                    <Typography sx={{ fontSize: "9px", fontWeight: 500, color: darkMode ? "#94a3b8" : "#475569" }}>
                                      {f.label}
                                    </Typography>
                                    <Typography sx={{ fontSize: "9px", fontWeight: 800, color: darkMode ? "#e2e8f0" : "#0f172a", fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
                                      {f.value}%
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                              </Box>
                            )}
                          </Box>
                          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1, flexShrink: 0 }}>
                            {a.max_composite_score != null && (
                              <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, bgcolor: scoreBg, border: `1px solid ${alpha(scoreColor, 0.25)}`, textAlign: "center" }}>
                                <Typography sx={{ fontSize: "9px", fontWeight: 600, color: scoreColor, textTransform: "uppercase", letterSpacing: 0.5, lineHeight: 1.2 }}>Score</Typography>
                                <Typography sx={{ fontSize: "15px", fontWeight: 800, color: scoreColor, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{scoreNum.toFixed(3)}</Typography>
                              </Box>
                            )}
                            <Button
                              size="small"
                              endIcon={<OpenInNewRoundedIcon sx={{ fontSize: "11px !important" }} />}
                              onClick={() => { setAlertsOpen(false); navigate(`/dtc?vehicle=${encodeURIComponent(selectedVehicle)}&module=${encodeURIComponent(a.module)}&peak_ts=${encodeURIComponent(a.peak_anomaly_ts)}`); }}
                              sx={{ fontSize: "10px", fontWeight: 700, height: 28, px: 1.5, borderRadius: "6px", bgcolor: darkMode ? alpha("#38bdf8", 0.1) : alpha("#0284c7", 0.07), color: darkMode ? "#38bdf8" : "#0369a1", border: `1px solid ${darkMode ? alpha("#38bdf8", 0.22) : alpha("#0284c7", 0.18)}`, "&:hover": { bgcolor: darkMode ? alpha("#38bdf8", 0.18) : alpha("#0284c7", 0.13) } }}
                            >
                              Investigate
                            </Button>
                          </Box>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              );
            })()
          )}
        </DialogContent>
      </Dialog>

      {/* KPI Sensor Timeline Dialog */}
      <Dialog
        open={!!kpiChartSensor}
        onClose={() => setKpiChartSensor(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, bgcolor: darkMode ? "#0f172a" : "#f8fafc", border: `1px solid ${darkMode ? alpha("#334155", 0.8) : alpha("#e2e8f0", 1)}` } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, py: 1.5, px: 2, borderBottom: `1px solid ${darkMode ? alpha("#334155", 0.6) : alpha("#e2e8f0", 1)}` }}>
          <Box sx={{ width: 4, height: 18, borderRadius: 2, bgcolor: (MODULE_COLORS as Record<string, string>)[kpiChartSensor?.module ?? "engine"], flexShrink: 0 }} />
          <Typography sx={{ fontWeight: 700, fontSize: "13px", flex: 1 }}>
            {kpiChartSensor?.label}
            <Typography component="span" sx={{ fontSize: "11px", fontWeight: 500, color: "text.secondary", ml: 1 }}>
              ({kpiChartSensor?.module?.toUpperCase()})
            </Typography>
          </Typography>
          <IconButton size="small" onClick={() => setKpiChartSensor(null)} sx={{ p: 0.5 }}>
            <CloseRoundedIcon sx={{ fontSize: "16px" }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 2, pt: "16px !important" }}>
          {kpiSensorHistoryQuery.isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
              <CircularProgress size={28} />
            </Box>
          ) : !(kpiSensorHistoryQuery.data as any)?.data?.length ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
              <Typography sx={{ fontSize: "12px", color: "text.secondary" }}>No data available</Typography>
            </Box>
          ) : (
            <SensorChart
              data={(kpiSensorHistoryQuery.data as any).data}
              group={{
                title: `${kpiChartSensor?.label ?? ""} (${kpiChartSensor?.unit ?? ""})`,
                sensors: [{
                  key: kpiChartSensor?.key ?? "",
                  color: (MODULE_COLORS as Record<string, string>)[kpiChartSensor?.module ?? "engine"],
                  label: kpiChartSensor?.label ?? "",
                }],
              }}
              xAxisMode={xAxisMode}
              height={340}
            />
          )}
        </DialogContent>
      </Dialog>

    </Box>
  );
}
