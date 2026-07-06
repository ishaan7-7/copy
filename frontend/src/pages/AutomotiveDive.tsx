import React, { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
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
type PageTab = "fleet" | "vehicle" | "module";

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
      title: "INTERNAL RESISTANCE (Ω)",
      sensors: [
        { key: "internal_resistance_impedance", color: "#ab47bc", label: "Ω" },
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
      title: "PRESSURE — FRONT (psi)",
      sensors: [
        { key: "tyre_pressure_fl_psi", color: "#4dd0e1", label: "FL" },
        { key: "tyre_pressure_fr_psi", color: "#42a5f5", label: "FR" },
      ],
    },
    {
      title: "PRESSURE — REAR (psi)",
      sensors: [
        { key: "tyre_pressure_rl_psi", color: "#26a69a", label: "RL" },
        { key: "tyre_pressure_rr_psi", color: "#66bb6a", label: "RR" },
      ],
    },
    {
      title: "TEMP — FRONT (°C)",
      sensors: [
        { key: "tyre_temp_fl_c", color: "#ef5350", label: "FL" },
        { key: "tyre_temp_fr_c", color: "#ff7043", label: "FR" },
      ],
    },
    {
      title: "WEAR — FRONT (%)",
      sensors: [
        { key: "tyre_wear_fl_pct", color: "#ffa726", label: "FL" },
        { key: "tyre_wear_fr_pct", color: "#ffca28", label: "FR" },
      ],
    },
    {
      title: "WEAR — REAR (%)",
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
      unit: "Ω",
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
    borderRadius: 0,
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
        borderRadius: 0,
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
  const _initTab = searchParams.get("tab") as PageTab | null;

  const [activeTab, setActiveTab] = useState<PageTab>(
    _initTab === "vehicle" || _initTab === "module" ? _initTab : "fleet"
  );
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

  const axisStyle = { fontSize: "10px", fill: ct.axisColor, fontWeight: 600 };
  const agTheme = darkMode ? "ag-theme-balham-dark" : "ag-theme-balham";
  const tooltipStyle = {
    borderRadius: 0,
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

  const { data: summary = {} as FleetSummary } = useQuery<FleetSummary>({
    queryKey: ["fleet-summary"],
    queryFn: () => axios.get(`${FLEET_API}/summary`).then((r) => r.data),
    retry: 1,
    refetchInterval: isActive && autoRefresh ? 10000 : false,
  });

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      fleetQuery.refetch();
      if (activeTab === "vehicle") {
        vehicleHealthQuery.refetch();
        moduleHealthQuery.refetch();
      }
      if (activeTab === "module") {
        moduleFleetHealthQuery.refetch();
      }
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
    enabled: !!selectedVehicle && activeTab === "vehicle",
    refetchInterval: false,
  });

  const moduleHealthQuery = useQuery({
    queryKey: ["autoModuleHealth", selectedVehicle, selectedModule],
    queryFn: () =>
      axios
        .get(
          `${API}/api/automotive/module-health/${selectedVehicle}/${selectedModule}`
        )
        .then((r) => r.data),
    enabled: !!selectedVehicle && activeTab === "vehicle",
    refetchInterval: isActive && autoRefresh ? 10000 : false,
  });

  const vehicleHealthQuery = useQuery({
    queryKey: ["autoVehicleHealth", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/vehicle-health-history/${selectedVehicle}`)
        .then((r) => r.data),
    enabled: !!selectedVehicle && activeTab === "vehicle",
    refetchInterval: isActive && autoRefresh ? 10000 : false,
  });

  const vehicleDecompQuery = useQuery({
    queryKey: ["autoVehicleDecomp", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/vehicle-decomposition/${selectedVehicle}`)
        .then((r) => r.data),
    enabled: !!selectedVehicle && activeTab === "vehicle",
    refetchInterval: false,
  });

  // Module analysis cross-fleet (Bronze stats per vehicle per module)
  const crossfleetQuery = useQuery({
    queryKey: ["autoCrossfleet", analysisModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/module-crossfleet/${analysisModule}`)
        .then((r) => r.data),
    enabled: activeTab === "module",
    refetchInterval: false,
  });

  const vehicleAlertsQuery = useQuery({
    queryKey: ["autoVehicleAlerts", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/alerts/${selectedVehicle}`)
        .then((r) => r.data),
    enabled: !!selectedVehicle && activeTab === "vehicle",
    refetchInterval: false,
  });

  const dtcHistoryQuery = useQuery({
    queryKey: ["autoDtcHistory", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/dtc-history/${selectedVehicle}`)
        .then((r) => r.data),
    enabled: !!selectedVehicle && activeTab === "vehicle",
    refetchInterval: false,
  });

  // Module tab sensor timeline — separate from vehicle tab's sensorQuery
  const moduleTimelineQuery = useQuery({
    queryKey: ["autoModuleTimeline", selectedVehicle, analysisModule],
    queryFn: () =>
      axios
        .get(
          `${API}/api/automotive/sensor-history/${selectedVehicle}/${analysisModule}`
        )
        .then((r) => r.data),
    enabled: !!selectedVehicle && activeTab === "module",
    refetchInterval: false,
  });

  const moduleFleetRankingQuery = useQuery({
    queryKey: ["moduleFleetRanking", analysisModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/module-fleet-ranking/${analysisModule}`)
        .then((r) => r.data),
    enabled: activeTab === "module",
    refetchInterval: false,
  });

  const moduleFleetHealthQuery = useQuery({
    queryKey: ["moduleFleetHealth", analysisModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/module-fleet-health/${analysisModule}`)
        .then((r) => r.data),
    enabled: activeTab === "module",
    refetchInterval:
      isActive && activeTab === "module" && autoRefresh ? 10000 : false,
  });

  const moduleSensorStatsQuery = useQuery({
    queryKey: ["moduleSensorStats", analysisModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/module-sensor-stats/${analysisModule}`)
        .then((r) => r.data),
    enabled: activeTab === "module",
    refetchInterval: false,
  });

  const moduleTopFeaturesQuery = useQuery({
    queryKey: ["moduleTopFeatures", analysisModule],
    queryFn: () =>
      axios
        .get(`${API}/api/automotive/module-top-features/${analysisModule}`)
        .then((r) => r.data),
    enabled: activeTab === "module",
    refetchInterval: false,
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

  const vehicles: any[] = fleetQuery.data?.vehicles || [];
  const fleetStats = fleetQuery.data?.fleet_stats || {};

  // BRONZE derived
  const sensorData: any[] = sensorQuery.data?.data || [];
  const latestBronzeRow: any =
    sensorData.length > 0 ? sensorData[sensorData.length - 1] : null;
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

  const latestSeverity: string = latestSilverRow?.severity || "NORMAL";
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
          params.value != null ? params.value.toFixed(3) : "—",
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
            sx={{ borderRadius: 0, height: 18, fontSize: "10px" }}
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
                  p.value ?? "—"
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
              setActiveTab("vehicle");
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
          const arrow = s > 0.05 ? "▲" : s < -0.05 ? "▼" : "→";
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

  const decompositionOption = useMemo((): EChartsOption => {
    if (!decompositionHistory.length) return {};
    const xData = decompositionHistory.map((r) => r.ts);
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
        formatter: (params: any) =>
          (params as any[])
            .filter((p: any) => p.value > 0)
            .sort((a: any, b: any) => b.value - a.value)
            .map(
              (p: any) =>
                `<span style="display:inline-block;width:8px;height:8px;background:${p.color};margin-right:4px"></span>${p.seriesName}: <b>${p.value}%</b>`
            )
            .join("<br/>"),
      },
      legend: {
        data: ALL_MODULES.map((m) => m.toUpperCase()),
        textStyle: {
          fontFamily: "monospace",
          fontSize: 10,
          color: ct.axisColor,
        },
        itemHeight: 8,
        top: 2,
        right: 8,
        icon: "circle",
      },
      dataZoom: [
        { type: "inside", xAxisIndex: 0 },
        {
          type: "slider",
          xAxisIndex: 0,
          bottom: 2,
          height: 18,
          borderColor: ct.tooltipBorder,
          fillerColor: "rgba(25,118,210,0.08)",
          handleStyle: { color: "#1976d2" },
        },
      ],
      grid: { top: 28, right: 12, bottom: 40, left: 48 },
      xAxis: {
        type: "category",
        data: xData,
        axisLabel: {
          fontFamily: "monospace",
          fontSize: 10,
          color: ct.axisColor,
          formatter: (v: string) => formatXTick(v, xAxisMode),
        },
        axisLine: { lineStyle: { color: ct.tableBorder } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        min: 0,
        axisLabel: {
          fontFamily: "monospace",
          fontSize: 10,
          color: ct.axisColor,
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { type: "dashed", color: ct.gridColor } },
      },
      series: ALL_MODULES.map((mod) => ({
        name: mod.toUpperCase(),
        type: "line" as const,
        stack: "decomp",
        areaStyle: { color: MODULE_COLORS[mod], opacity: 0.75 },
        lineStyle: { color: MODULE_COLORS[mod], width: 1 },
        itemStyle: { color: MODULE_COLORS[mod] },
        symbol: "none",
        smooth: false,
        data: decompositionHistory.map(
          (r) => (r as Record<string, number>)[mod] ?? 0
        ),
        emphasis: { focus: "series" as const },
      })),
    } as EChartsOption;
  }, [decompositionHistory, xAxisMode, ct]);

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
      title: `${sensor.groupTitle} — ${selectedVehicle}`,
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
    background: ct.tableHeaderBg,
    color: ct.tableHeaderText,
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
            value={activeTab}
            exclusive
            onChange={(_e, val) => val && setActiveTab(val)}
            size="small"
            sx={{
              height: 34,
              bgcolor: "transparent",

              "& .MuiToggleButtonGroup-grouped": {
                border: "1px solid #D0D7DE !important",
                borderRadius: "8px !important",
                marginRight: "8px !important",
                padding: "0 16px",
                minHeight: 34,
                textTransform: "none",
                fontSize: "10px",
                fontWeight: 700,
                color: darkMode ? "#ffffff" : "#64748B",
                transition: "all .2s ease",

                "&:last-of-type": {
                  marginRight: 0,
                },

                "&:hover": {
                  backgroundColor: darkMode ? "#F2F8FA" : "#005071cc",
                  borderColor: darkMode ? "#005071" : "#ffffff",
                  color: darkMode ? "#005071" : "#ffffff",
                },

                "&.Mui-selected": {
                  backgroundColor: darkMode ? "#E6F4F9" : "#005071",
                  color: darkMode ? "#005071" : "#ffffff",
                  border: "1px solid #005071 !important",
                  boxShadow: "0 2px 8px rgba(0,80,113,0.18)",
                },

                "&.Mui-selected:hover": {
                  backgroundColor: darkMode ? "#E6F4F9" : "#005071",
                },
              },
            }}
          >
            <ToggleButton
              value="fleet"
              sx={{
                fontWeight: "bold",
                px: 2,
                borderRadius: 0,
                fontSize: "12px",
              }}
            >
              FLEET OVERVIEW
            </ToggleButton>
            <ToggleButton
              value="vehicle"
              sx={{
                fontWeight: "bold",
                px: 2,
                borderRadius: 0,
                fontSize: "12px",
              }}
            >
              VEHICLE DEEP DIVE
            </ToggleButton>
            <ToggleButton
              value="module"
              sx={{
                fontWeight: "bold",
                px: 2,
                borderRadius: 0,
                fontSize: "12px",
              }}
            >
              MODULE ANALYSIS
            </ToggleButton>
          </ToggleButtonGroup>

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
                borderRadius: 0,
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
                borderRadius: 0,
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
                borderRadius: 0,
                fontSize: "11px",
              }}
            >
              MILEAGE
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {activeTab === "fleet" && (
        <>
          <Grid container spacing={1} alignItems="stretch">
            <Grid item xs={12} sm={4} sx={{ display: "flex" }}>
              <Paper
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  p: 2,
                  borderRadius: 2,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 1,
                  }}
                >
                  <SpeedRoundedIcon
                    sx={{
                      color: darkMode ? "text.primary" : "#1976d2",
                      fontSize: 18,
                    }}
                  />

                  <Typography
                    variant="subtitle2"
                    sx={{
                      fontSize: "12px",
                      lineHeight: 2,
                      fontWeight: 700,
                      color: darkMode ? "text.primary" : "#005071",
                      textTransform: "uppercase",
                    }}
                  >
                    Vehicle Health Comparison
                  </Typography>
                </Box>
                <Box sx={{ flex: 1 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={fleetChartData}
                      layout="vertical"
                      margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke={ct.gridColor}
                      />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={axisStyle}
                        axisLine={{ stroke: ct.tableBorder }}
                        tickLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="vehicle_id"
                        tick={{
                          fontSize: "10px",
                          fontWeight: 700,
                          fill: ct.tooltipText,
                          fontFamily: "monospace",
                        }}
                        axisLine={false}
                        tickLine={false}
                        width={65}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v: number) => `${v}%`}
                      />
                      <ReferenceLine
                        x={60}
                        stroke="#d32f2f"
                        strokeDasharray="4 4"
                      />
                      <ReferenceLine
                        x={80}
                        stroke="#ed6c02"
                        strokeDasharray="4 4"
                      />
                      <Bar
                        dataKey="health_score"
                        name="Health"
                        radius={[0, 6, 6, 0]}
                        isAnimationActive={false}
                        label={{
                          position: "right",
                          fontSize: "10px",
                          fontWeight: "700",
                          fill: ct.tooltipText,
                        }}
                      >
                        {fleetChartData.map((entry, index) => (
                          <Cell
                            key={index}
                            fill={getHealthColor(entry.health_score)}
                          />
                        ))}
                      </Bar>
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
                }}
              >
                {!fleetQuery.isLoading && vehicles.length === 0 && (
                  <Box
                    sx={{
                      p: 2,
                      bgcolor: darkMode ? "rgba(230,81,0,0.1)" : "#fff8e1",
                      border: `1px solid ${darkMode ? "#e65100" : "#ffe082"}`,
                    }}
                  >
                    <Typography
                      variant="body2"
                      sx={{ color: "#e65100", fontWeight: "bold" }}
                    >
                      No vehicle data. Start the streaming pipeline to populate
                      fleet data.
                    </Typography>
                  </Box>
                )}
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
                      label: "TOTAL VEHICLES",
                      value: fleetStats.total_vehicles ?? 0,
                      color: "#005071",
                      bg: "#e6f4f9",
                      icon: <CommuteRoundedIcon />,
                    },
                    {
                      label: "AVG FLEET HEALTH",
                      icon: <SpeedRoundedIcon />,
                      value: `${fleetStats.avg_health ?? 0}%`,
                      color:
                        (fleetStats.avg_health ?? 100) < 60
                          ? "#d32f2f"
                          : "#2e7d32",
                      bg:
                        (fleetStats.avg_health ?? 100) < 60
                          ? "#ffebee"
                          : "#e8f5e9",
                    },
                    {
                      label: "CRITICAL ( < 60% )",
                      icon: <ErrorRoundedIcon />,
                      value: fleetStats.critical_count ?? 0,
                      color:
                        (fleetStats.critical_count ?? 0) > 0
                          ? "#d32f2f"
                          : "#e53935",
                      bg:
                        (fleetStats.critical_count ?? 0) > 0
                          ? "#ffebee"
                          : "#ffebee",
                    },
                    {
                      label: "WARNING ( 60–80% )",
                      icon: <WarningAmberRoundedIcon />,
                      value: fleetStats.warning_count ?? 0,
                      color:
                        (fleetStats.warning_count ?? 0) > 0
                          ? "#ed6c02"
                          : "#616161",
                      bg:
                        (fleetStats.warning_count ?? 0) > 0
                          ? "#fff4e5"
                          : "#f5f5f5",
                    },
                  ].map((kpi, i) => (
                    <Paper
                      key={i}
                      elevation={3}
                      sx={{
                        flex: 1,
                        p: 2,
                        background: getCardGradient(
                          kpi.bg,
                          kpi.color,
                          darkMode
                        ),
                        borderRadius: 3,
                        border: `1px solid ${
                          darkMode
                            ? alpha(kpi.color, 0.25)
                            : theme.palette.divider
                        }`,
                        boxShadow: darkMode
                          ? "0 6px 20px rgba(0,0,0,.35)"
                          : "0 2px 8px rgba(0,0,0,.08)",
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
                              color: darkMode ? "ffffff" : "#1f2937",
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
                              color: "#475569",
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
                            {i === 0 && "Registered Vehicles"}
                            {i === 1 && "Overall Fleet Health"}
                            {i === 2 && "Needs Immediate Attention"}
                            {i === 3 && "Monitor Closely"}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  ))}
                </Box>

                <Paper
                  sx={{
                    height: 375,
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
                      <TableRowsRoundedIcon
                        sx={{
                          color: darkMode ? "text.primary" : "#005071",
                          fontSize: 18,
                        }}
                      />

                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontSize: "12px",
                          lineHeight: 2,
                          fontWeight: 700,
                          color: darkMode ? "text.primary" : "#005071",
                          textTransform: "uppercase",
                        }}
                      >
                        Fleet Health Table
                      </Typography>
                    </Box>
                  </Box>
                  <Box
                    className={agTheme}
                    sx={{
                      flexGrow: 0,
                      flex: 1,
                      minHeight: 0,
                      height: 360,

                      "& .ag-root-wrapper": {
                        // border: "none",
                        fontSize: "10px",
                      },

                      "& .ag-header": {
                        background: "#005071 !important",
                      },

                      "& .ag-header-cell": {
                        background: "#005071",
                        color: "#fff",
                        fontSize: 10,
                        fontWeight: 700,
                        paddingLeft: "6px",
                        paddingRight: "6px",
                      },

                      "& .ag-header-cell-label": {
                        justifyContent: "flex-start",
                        overflow: "hidden",
                      },

                      "& .ag-header-cell-text": {
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      },

                      "& .ag-icon": {
                        color: "#fff !important",
                      },

                      "& .ag-cell": {
                        fontSize: "10px !important",
                        display: "flex",
                        alignItems: "left",
                      },

                      "& .ag-row": {
                        fontSize: "10px",
                      },

                      "& .ag-row:nth-of-type(even)": {
                        background: "#fafafa",
                      },
                      "& .fleet-header .ag-header-cell-label": {
                        justifyContent: "flex-start",
                      },
                    }}
                  >
                    <AgGridReact
                      rowData={vehicles}
                      columnDefs={fleetColDefs}
                      suppressDragLeaveHidesColumns={true}
                      suppressMovableColumns={true}
                      suppressColumnVirtualisation={true}
                      domLayout="normal"
                      animateRows={false}
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
                      rowHeight={28}
                      headerHeight={30}
                    />
                  </Box>
                </Paper>
              </Box>
            </Grid>
          </Grid>
        </>
      )}

      {/* ── VEHICLE DEEP DIVE ── */}
      {activeTab === "vehicle" && (
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
          {/* Controls */}
          <Paper
            sx={{
              p: 1,
              borderRadius: 0,
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
              borderBottom: `2px solid ${theme.palette.divider}`,
              bgcolor: darkMode ? alpha("#0b1929", 0.6) : alpha("#f8fafc", 0.95),
            }}
          >
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: "12px",
                color: darkMode ? "text.primary" : "#005071",
                whiteSpace: "nowrap",
              }}
            >
              CONTEXT:
            </Typography>

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
          </Paper>

          {/* GOLD + SILVER health charts side by side */}
          <Grid container spacing={1} alignItems="stretch">
            {/* LEFT SECTION → 9 columns */}
            <Grid item xs={12} md={9}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  height: "100%",
                }}
              >
                {/* KPI CARDS — Row 1 */}
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
                          {val !== null ? `${val.toFixed(2)} ${f.unit}` : "—"}
                        </Typography>
                      </Paper>
                    );
                  })}
                </Box>

                {/* CHARTS — Row 2 */}
                <Grid container spacing={1}>
                  {/* GOLD */}
                  <Grid item xs={12} md={6}>
                    <Paper
                      sx={{
                        p: 1,
                        borderRadius: 0,
                        height: 260,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            fontSize: "12px",
                            color: darkMode ? "text.primary" : "#005071",
                          }}
                        >
                          FUSED VEHICLE HEALTH — {selectedVehicle}
                          <span style={{ color: ct.axisColor, fontWeight: 400 }}> (GOLD)</span>
                        </Typography>
                        <Chip
                          size="small"
                          label={vehicleHealthQuery.data?.data_source || "—"}
                          sx={{ borderRadius: 0, fontWeight: "bold", fontSize: "10px", height: 18 }}
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
                            <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="4 4" />
                            <ReferenceLine y={80} stroke="#eab308" strokeDasharray="4 4" />
                            <Line
                              type="monotone"
                              dataKey="health"
                              name="Health %"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              dot={false}
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
                        p: 1,
                        borderRadius: 0,
                        height: 260,
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 0.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: 700,
                            fontSize: "12px",
                            color: darkMode ? "text.primary" : "#005071",
                          }}
                        >
                          {selectedModule.toUpperCase()} ML HEALTH SCORE
                          <span style={{ color: ct.axisColor, fontWeight: 400 }}> (SILVER)</span>
                        </Typography>
                        <Chip
                          size="small"
                          label={latestSeverity}
                          sx={{
                            borderRadius: 0,
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

            {/* RIGHT SECTION → 3 columns */}
            <Grid item xs={12} md={3} sx={{ display: "flex", flexDirection: "column" }}>
              <Paper
                sx={{
                  p: 1,
                  borderRadius: 0,
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    fontSize: "12px",
                    color: darkMode ? "text.primary" : "#005071",
                    mb: 1,
                    flexShrink: 0,
                  }}
                >
                  TOP ANOMALY DRIVERS
                </Typography>

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

          {/* ── SECTION DIVIDER ── */}
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.5 }}
          >
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            <Typography
              variant="caption"
              sx={{
                color: darkMode ? "#94a3b8" : "#64748b",
                fontWeight: "bold",
                fontFamily: "monospace",
                letterSpacing: 1,
                whiteSpace: "nowrap",
              }}
            >
              HEALTH ANALYTICS
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
          </Box>

          {/* ── ROW A: Health decomposition stacked area ── */}
          <Paper sx={{ p: 1, borderRadius: 0 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 0.5,
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, fontSize: "12px", color: darkMode ? "text.primary" : "#005071" }}
              >
                HEALTH DECOMPOSITION — ALL MODULE CONTRIBUTIONS OVER TIME &nbsp;
                <span style={{ color: ct.axisColor, fontWeight: 400 }}>
                  (SILVER)
                </span>
              </Typography>
              <Chip
                size="small"
                label={
                  vehicleDecompQuery.isLoading
                    ? "loading…"
                    : vehicleDecompQuery.isError
                    ? "endpoint missing — restart backend"
                    : decompositionHistory.length > 0
                    ? `${decompositionHistory.length} pts`
                    : "no data"
                }
                sx={{
                  borderRadius: 0,
                  fontWeight: "bold",
                  fontSize: "10px",
                  height: 18,
                  bgcolor: vehicleDecompQuery.isError ? "#ffebee" : "default",
                  color: vehicleDecompQuery.isError ? "#d32f2f" : "default",
                }}
              />
            </Box>
            <Box sx={{ height: 380 }}>
              {decompositionHistory.length > 0 ? (
                <EChart
                  option={decompositionOption}
                  style={{ height: "380px", width: "100%" }}
                />
              ) : (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{ color: "text.secondary" }}
                  >
                    {vehicleDecompQuery.isError
                      ? "Restart backend to load new endpoint (dash_backend)"
                      : vehicleDecompQuery.isLoading
                      ? "Loading module decomposition…"
                      : "No silver history for this vehicle"}
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>

          {/* ── ROW B: Module health radar + Severity transition strip ── */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Paper
              sx={{
                width: 290,
                p: 1,
                borderRadius: 0,
                height: 280,
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, fontSize: "12px", color: darkMode ? "text.primary" : "#005071", mb: 0.5 }}
              >
                MODULE HEALTH RADAR — {selectedVehicle || "—"}
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
                borderRadius: 0,
                height: 280,
                display: "flex",
                flexDirection: "column",
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
                  SEVERITY TRANSITION HISTORY — {selectedModule.toUpperCase()}{" "}
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
                        title={`${run.severity}: ${run.startTs} → ${run.endTs} (${run.count} pts)`}
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

          {/* ── ROW C: Anomaly driver trends — small multiples grid ── */}
          <Paper sx={{ p: 1, borderRadius: 0 }}>
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
                ANOMALY DRIVER TRENDS — LSTM RECONSTRUCTION ERROR PER FEATURE
                &nbsp;
                <span style={{ color: ct.axisColor, fontWeight: 400 }}>
                  ({selectedModule.toUpperCase()} SILVER · higher = more
                  anomalous · standardized units)
                </span>
              </Typography>
              {anomalyTrendSeries.length > 0 && (
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    fontFamily: "monospace",
                    fontSize: "10px",
                  }}
                >
                  {anomalyTrendSeries.length} drivers ·{" "}
                  {anomalyTrendData.length} pts
                </Typography>
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

          {/* ── ROW D: Bronze sensor statistics table ── */}
          <Paper sx={{ p: 1, borderRadius: 0 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                fontSize: "12px",
                color: darkMode ? "text.primary" : "#005071",
                mb: 1,
                display: "block",
              }}
            >
              BRONZE SENSOR STATISTICS — {selectedModule.toUpperCase()} &nbsp;
              <span style={{ color: ct.axisColor, fontWeight: 400 }}>
                ({sensorData.length.toLocaleString()} data points)
              </span>
            </Typography>
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
                            {s.unit || "—"}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {s.min !== null ? s.min.toFixed(2) : "—"}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {s.max !== null ? s.max.toFixed(2) : "—"}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {s.mean !== null ? s.mean.toFixed(2) : "—"}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {s.std !== null ? s.std.toFixed(2) : "—"}
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
                              : "—"}
                            {isWarn && (
                              <span
                                style={{
                                  marginLeft: 4,
                                  fontSize: "9px",
                                  color: "#d32f2f",
                                }}
                              >
                                ▲
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

          {/* ── SECTION DIVIDER ── */}
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.5 }}
          >
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            <Typography
              variant="caption"
              sx={{
                color: darkMode ? "#94a3b8" : "#64748b",
                fontWeight: "bold",
                fontFamily: "monospace",
                letterSpacing: 1,
                whiteSpace: "nowrap",
              }}
            >
              FAULT & ALERT HISTORY
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
          </Box>

          {/* ── ROW E: Vehicle alerts table ── */}
          <Paper sx={{ p: 1, borderRadius: 0 }}>
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
                VEHICLE ALERTS — {selectedVehicle} &nbsp;
                <span style={{ color: ct.axisColor, fontWeight: 400 }}>
                  (GOLD ALERTS DELTA)
                </span>
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                {vehicleAlertsQuery.data?.open?.length > 0 && (
                  <Chip
                    size="small"
                    label={`${vehicleAlertsQuery.data.open.length} OPEN`}
                    sx={{
                      borderRadius: 0,
                      fontWeight: "bold",
                      fontSize: "10px",
                      height: 18,
                      bgcolor: "#ef4444",
                      color: "white",
                    }}
                  />
                )}
                {vehicleAlertsQuery.data?.closed?.length > 0 && (
                  <Chip
                    size="small"
                    label={`${vehicleAlertsQuery.data.closed.length} CLOSED`}
                    sx={{
                      borderRadius: 0,
                      fontWeight: "bold",
                      fontSize: "10px",
                      height: 18,
                    }}
                  />
                )}
              </Box>
            </Box>
            {vehicleAlertsQuery.isLoading ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Loading…
              </Typography>
            ) : (
              <Box
                sx={{
                  maxHeight: 320,
                  overflowY: "auto",
                  overflowX: "auto",
                  border: `1px solid ${theme.palette.divider}`,
                }}
              >
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      {[
                        "STATUS",
                        "MODULE",
                        "STARTED",
                        "PEAK TS",
                        "ENDED",
                        "MAX SCORE",
                        "TOP FEATURES",
                      ].map((h) => (
                        <th key={h} style={tblHeaders}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {[
                      ...(vehicleAlertsQuery.data?.open || []),
                      ...(vehicleAlertsQuery.data?.closed || []),
                    ].map((a, i) => (
                      <tr
                        key={a.alert_id || i}
                        style={i % 2 === 0 ? tblRowEven : tblRowOdd}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = darkMode
                            ? alpha("#7dd3fc", 0.09)
                            : alpha("#3b82f6", 0.05);
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            i % 2 === 0 ? ct.tableRowEven : ct.tableRowOdd;
                        }}
                      >
                        {/* STATUS */}
                        <td style={tblCell}>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              minWidth: 56,
                              padding: "2px 8px",
                              fontSize: "10px",
                              fontWeight: 700,
                              borderRadius: 0,
                              background:
                                a.status === "OPEN"
                                  ? "#ef4444"
                                  : ct.tableHeaderBg,
                              color:
                                a.status === "OPEN"
                                  ? "#fff"
                                  : ct.tableHeaderText,
                            }}
                          >
                            {a.status}
                          </span>
                        </td>

                        {/* MODULE */}
                        <td
                          style={{
                            ...tblCell,
                            fontWeight: 600,
                          }}
                        >
                          {(a.module || "—").toUpperCase()}
                        </td>

                        {/* START */}
                        <td
                          style={{
                            ...tblCell,
                            color: ct.axisColor,
                          }}
                        >
                          {String(a.alert_start_ts || "—").slice(0, 16)}
                        </td>

                        {/* PEAK */}
                        <td
                          style={{
                            ...tblCell,
                            color: ct.axisColor,
                          }}
                        >
                          {String(a.peak_anomaly_ts || "—").slice(0, 16)}
                        </td>

                        {/* END */}
                        <td
                          style={{
                            ...tblCell,
                            color: ct.axisColor,
                          }}
                        >
                          {a.status === "CLOSED"
                            ? String(a.alert_end_ts || "—").slice(0, 16)
                            : "—"}
                        </td>

                        {/* SCORE */}
                        <td
                          style={{
                            ...tblCell,
                            fontWeight: 700,
                            color:
                              Number(a.max_composite_score) >= 80
                                ? "#ef4444"
                                : Number(a.max_composite_score) >= 60
                                ? "#eab308"
                                : "#22c55e",
                          }}
                        >
                          {a.max_composite_score != null
                            ? Number(a.max_composite_score).toFixed(1)
                            : "—"}
                        </td>

                        {/* FEATURES */}
                        <td
                          style={{
                            ...tblCell,
                            color: ct.axisColor,
                            maxWidth: 260,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={a.top_10_features}
                        >
                          {a.top_10_features || "—"}
                        </td>
                      </tr>
                    ))}

                    {!vehicleAlertsQuery.data?.open?.length &&
                      !vehicleAlertsQuery.data?.closed?.length && (
                        <tr>
                          <td
                            colSpan={7}
                            style={{
                              padding: "24px",
                              textAlign: "center",
                              color: ct.axisColor,
                              borderBottom: `1px solid ${ct.tableBorder}`,
                            }}
                          >
                            No alerts recorded for this vehicle
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </Box>
            )}
          </Paper>

          {/* ── ROW F: DTC run history ── */}
          <Paper sx={{ p: 1.5, borderRadius: 0 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: "bold",
                color: "text.secondary",
                mb: 1,
                display: "block",
              }}
            >
              DTC ANALYSIS RUN HISTORY — {selectedVehicle} &nbsp;
              <span style={{ color: ct.axisColor, fontWeight: "normal" }}>
                (last 50 runs)
              </span>
            </Typography>
            {dtcHistoryQuery.isLoading ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Loading…
              </Typography>
            ) : (
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
                      {["RUN TIME", "MODULE", "PEAK TS", "TRIGGERED CODES"].map(
                        (h) => (
                          <th key={h} style={tblHeader}>
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(dtcHistoryQuery.data?.runs || []).map(
                      (run: any, i: number) => (
                        <tr
                          key={i}
                          style={i % 2 === 0 ? tblRowEven : tblRowOdd}
                        >
                          <td
                            style={{ padding: "5px 12px", color: ct.axisColor }}
                          >
                            {String(run.run_ts || "—").slice(0, 16)}
                          </td>
                          <td style={{ padding: "5px 12px", fontWeight: 600 }}>
                            {(run.module || "—").toUpperCase()}
                          </td>
                          <td
                            style={{ padding: "5px 12px", color: ct.axisColor }}
                          >
                            {String(run.peak_ts || "—").slice(0, 16)}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {(run.triggers || []).length === 0 ? (
                              <span
                                style={{ color: "#2e7d32", fontWeight: 600 }}
                              >
                                NO FAULTS
                              </span>
                            ) : (
                              (run.triggers as any[]).map(
                                (t: any, j: number) => (
                                  <span
                                    key={j}
                                    style={{
                                      display: "inline-block",
                                      marginRight: 6,
                                      padding: "1px 6px",
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      background:
                                        t.severity === "CRITICAL"
                                          ? "#d32f2f"
                                          : "#ed6c02",
                                      color: "white",
                                    }}
                                  >
                                    {t.code}
                                  </span>
                                )
                              )
                            )}
                          </td>
                        </tr>
                      )
                    )}
                    {!dtcHistoryQuery.data?.runs?.length && (
                      <tr>
                        <td
                          colSpan={4}
                          style={{
                            padding: "10px 12px",
                            color: ct.axisColor,
                            textAlign: "center",
                          }}
                        >
                          No DTC analysis runs recorded for this vehicle
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Box>
            )}
          </Paper>

          {/* ── SECTION DIVIDER ── */}
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.5 }}
          >
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            <Typography
              variant="caption"
              sx={{
                color: darkMode ? "#94a3b8" : "#64748b",
                fontWeight: "bold",
                fontFamily: "monospace",
                letterSpacing: 1,
                whiteSpace: "nowrap",
              }}
            >
              DTC DEEP DIVE
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
          </Box>

          {/* ── ROW G: On-demand DTC analysis ── */}
          <Paper sx={{ p: 1.5, borderRadius: 0 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 1.5,
                flexWrap: "wrap",
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: "bold", color: "text.secondary" }}
              >
                DTC DEEP DIVE — {selectedVehicle} /{" "}
                {selectedModule.toUpperCase()}
              </Typography>
              <button
                onClick={runDtcAnalysis}
                disabled={dtcRunning || !selectedVehicle}
                style={{
                  padding: "4px 14px",
                  fontFamily: "monospace",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: dtcRunning
                    ? theme.palette.action.disabledBackground
                    : theme.palette.primary.main,
                  color: dtcRunning ? theme.palette.text.disabled : "white",
                  border: "none",
                  borderRadius: 0,
                  cursor: dtcRunning ? "not-allowed" : "pointer",
                  letterSpacing: "0.5px",
                }}
              >
                {dtcRunning ? "RUNNING INFERENCE…" : "RUN DTC ANALYSIS"}
              </button>
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  fontFamily: "monospace",
                  fontSize: "10px",
                }}
              >
                Runs PyTorch fault models on 600-row bronze traceback at peak
                anomaly timestamp
              </Typography>
            </Box>

            {dtcResult?.error && (
              <Box
                sx={{
                  p: 1.5,
                  bgcolor: darkMode ? "rgba(230,81,0,0.1)" : "#fff8e1",
                  border: `1px solid ${darkMode ? "#e65100" : "#ffe082"}`,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ color: "#e65100", fontFamily: "monospace" }}
                >
                  {dtcResult.error}
                </Typography>
              </Box>
            )}

            {dtcResult?.success && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    gap: 1,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      fontWeight: "bold",
                      color: "text.secondary",
                      mr: 0.5,
                    }}
                  >
                    TRIGGERED CODES:
                  </Typography>
                  {dtcResult.triggers?.length === 0 ? (
                    <Chip
                      size="small"
                      label="NO FAULTS TRIGGERED"
                      sx={{
                        borderRadius: 0,
                        fontWeight: "bold",
                        bgcolor: "#e8f5e9",
                        color: "#2e7d32",
                        fontSize: "11px",
                      }}
                    />
                  ) : (
                    (dtcResult.triggers as any[]).map((t: any, i: number) => (
                      <Box
                        key={i}
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          p: 1,
                          border: `1px solid ${
                            t.severity === "CRITICAL" ? "#d32f2f" : "#ed6c02"
                          }`,
                          minWidth: 200,
                          maxWidth: 320,
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            gap: 1,
                            alignItems: "center",
                            mb: 0.5,
                          }}
                        >
                          <span
                            style={{
                              padding: "1px 6px",
                              fontSize: "10px",
                              fontWeight: 700,
                              background:
                                t.severity === "CRITICAL"
                                  ? "#d32f2f"
                                  : "#ed6c02",
                              color: "white",
                            }}
                          >
                            {t.severity}
                          </span>
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: "bold", fontFamily: "monospace" }}
                          >
                            {t.code}
                          </Typography>
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{
                            fontSize: "10px",
                            color: "text.secondary",
                            lineHeight: 1.4,
                          }}
                        >
                          {t.message}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>

                <Box sx={{ display: "flex", gap: 2, height: 380 }}>
                  <Paper
                    sx={{
                      flex: 1,
                      borderRadius: 0,
                      border: `1px solid ${theme.palette.divider}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {dtcResult.critical_plot ? (
                      <Plot
                        data={dtcResult.critical_plot.data}
                        layout={{
                          ...(dtcResult.critical_plot.layout || {}),
                          ...plotLayout,
                        }}
                        useResizeHandler={true}
                        style={{ width: "100%", height: "100%" }}
                        config={{ displayModeBar: false }}
                      />
                    ) : (
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary" }}
                      >
                        No critical DTCs monitored for this module
                      </Typography>
                    )}
                  </Paper>
                  <Paper
                    sx={{
                      flex: 1,
                      borderRadius: 0,
                      border: `1px solid ${theme.palette.divider}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {dtcResult.non_critical_plot ? (
                      <Plot
                        data={dtcResult.non_critical_plot.data}
                        layout={{
                          ...(dtcResult.non_critical_plot.layout || {}),
                          ...plotLayout,
                        }}
                        useResizeHandler={true}
                        style={{ width: "100%", height: "100%" }}
                        config={{ displayModeBar: false }}
                      />
                    ) : (
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary" }}
                      >
                        No non-critical DTCs monitored for this module
                      </Typography>
                    )}
                  </Paper>
                </Box>

                {dtcResult.diagnostics?.skipped_dtcs &&
                  Object.keys(dtcResult.diagnostics.skipped_dtcs).length >
                    0 && (
                    <Box
                      sx={{
                        p: 1,
                        bgcolor: "background.default",
                        border: `1px solid ${theme.palette.divider}`,
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.secondary",
                          fontFamily: "monospace",
                          fontSize: "10px",
                        }}
                      >
                        SKIPPED:{" "}
                        {Object.keys(dtcResult.diagnostics.skipped_dtcs).join(
                          ", "
                        )}{" "}
                        — missing bronze features
                      </Typography>
                    </Box>
                  )}
              </Box>
            )}

            {!dtcResult && !dtcRunning && (
              <Typography
                variant="caption"
                sx={{ color: "text.secondary", fontFamily: "monospace" }}
              >
                Click RUN DTC ANALYSIS to run fault inference. Requires
                dtc_service/api.py to be running.
              </Typography>
            )}
          </Paper>

          {/* ── SECTION DIVIDER ── */}
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.5 }}
          >
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            <Typography
              variant="caption"
              sx={{
                color: darkMode ? "#94a3b8" : "#64748b",
                fontWeight: "bold",
                fontFamily: "monospace",
                letterSpacing: 1,
                whiteSpace: "nowrap",
              }}
            >
              SENSOR TIMELINE
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
          </Box>

          {/* ── Sensor Timeline ── */}
          <Paper sx={{ p: 1.5, borderRadius: 0 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                mb: 1,
                flexWrap: "wrap",
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: "bold", color: "text.secondary" }}
              >
                SENSOR TIMELINE — {selectedModule.toUpperCase()} ·{" "}
                {selectedVehicle || "—"}
              </Typography>
              {allVehicleSensorKeys.length > 0 && (
                <FormControl size="small" sx={{ minWidth: 300 }}>
                  <Select
                    value={
                      vehicleTimelineSensorKey ||
                      allVehicleSensorKeys[0]?.key ||
                      ""
                    }
                    onChange={(e) =>
                      setVehicleTimelineSensorKey(e.target.value)
                    }
                    sx={{
                      borderRadius: 0,
                      fontFamily: "monospace",
                      fontSize: "11px",
                    }}
                  >
                    {allVehicleSensorKeys.map((s) => (
                      <MenuItem
                        key={s.key}
                        value={s.key}
                        sx={{ fontFamily: "monospace", fontSize: "11px" }}
                      >
                        {s.groupTitle} — {s.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <Chip
                size="small"
                label={`${downsampledBronze.length} pts`}
                sx={{ borderRadius: 0, fontWeight: "bold", fontSize: "11px" }}
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
                    ? "Loading…"
                    : "No bronze sensor data for this module"}
                </Typography>
              </Box>
            )}
          </Paper>
        </Box>
      )}

      {/* ── MODULE ANALYSIS ── */}
      {activeTab === "module" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            flex: 1,
            minHeight: 0,
            overflow: "auto",
          }}
        >
          {/* Controls */}
          <Paper
            sx={{
              p: 1,
              borderRadius: 0,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              flexWrap: "wrap",
              flexShrink: 0,
              borderBottom: `2px solid ${theme.palette.divider}`,
              bgcolor: darkMode ? alpha("#0b1929", 0.6) : alpha("#f8fafc", 0.95),
            }}
          >
            <Typography
              sx={{
                fontSize: "12px",
                fontWeight: 700,
                color: darkMode ? "text.primary" : "#005071",
                whiteSpace: "nowrap",
              }}
            >
              MODULE:
            </Typography>

            <ToggleButtonGroup
              value={analysisModule}
              exclusive
              onChange={(_e, val) => { if (val) setAnalysisModule(val); }}
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

            <Box
              sx={{
                minWidth: 160,
                "& .MuiInputBase-root": { fontSize: "10px" },
                "& .MuiInputBase-input": { fontSize: "10px" },
                "& .MuiInputLabel-root": {
                  fontSize: "10px",
                  color: darkMode ? "#64748b" : "#94a3b8",
                  "&.Mui-focused": { color: darkMode ? "#38bdf8" : "#005071" },
                },
                "& .MuiMenuItem-root": { fontSize: "10px" },
                "& .MuiTypography-root": { fontSize: "10px" },
                "& .MuiOutlinedInput-root": {
                  bgcolor: darkMode ? "#1e293b" : "#fff",
                  borderRadius: 1,
                  "& fieldset": { borderColor: darkMode ? alpha("#7dd3fc", 0.2) : alpha("#94a3b8", 0.35) },
                  "&:hover fieldset": { borderColor: darkMode ? alpha("#7dd3fc", 0.4) : alpha("#94a3b8", 0.6) },
                  "&.Mui-focused fieldset": { borderColor: darkMode ? "#38bdf8" : "#005071" },
                },
              }}
            >
              <TimeRangePicker
                value={analysisTimeRange}
                onChange={setAnalysisTimeRange}
                minWidth={160}
              />
            </Box>
          </Paper>
          {/* ── SECTION DIVIDER ── */}
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.5 }}
          >
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            <Typography
              variant="caption"
              sx={{
                color: darkMode ? "#94a3b8" : "#64748b",
                fontWeight: "bold",
                fontFamily: "monospace",
                letterSpacing: 1,
                whiteSpace: "nowrap",
              }}
            >
              FLEET HEALTH ANALYSIS
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
          </Box>

          {/* ── SECTION: Fleet Health Ranking ── */}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Paper
              sx={{
                flex: 1,
                p: 1,
                borderRadius: 0,
                height: 320,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, fontSize: "12px", color: darkMode ? "text.primary" : "#005071", mb: 1 }}
              >
                VEHICLE HEALTH RANKING — {analysisModule.toUpperCase()} AVG
                (SILVER)
              </Typography>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={rankingChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 48, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke={ct.gridColor}
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={axisStyle}
                      axisLine={{ stroke: ct.tableBorder }}
                      tickLine={false}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <YAxis
                      type="category"
                      dataKey="vehicle_id"
                      tick={{
                        fontSize: 11,
                        fontWeight: 600,
                        fill: ct.tooltipText,
                        fontFamily: "monospace",
                      }}
                      axisLine={false}
                      tickLine={false}
                      width={65}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => `${v}%`}
                    />
                    <ReferenceLine
                      x={60}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                    />
                    <ReferenceLine
                      x={80}
                      stroke="#eab308"
                      strokeDasharray="4 4"
                    />
                    <Bar
                      dataKey="avg_health"
                      name="Avg Health"
                      isAnimationActive={false}
                      label={{
                        position: "right",
                        fontSize: 10,
                        fontWeight: "bold",
                        fill: ct.tooltipText,
                        fontFamily: "monospace",
                        formatter: (v: number) => `${v}%`,
                      }}
                      fill={MODULE_COLORS[analysisModule]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>

            <Paper
              sx={{
                flex: 1.2,
                borderRadius: 0,
                display: "flex",
                flexDirection: "column",
                p: 0,
              }}
            >
              <Box
                sx={{
                  p: 1,
                  borderBottom: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, fontSize: "12px", color: darkMode ? "text.primary" : "#005071" }}
                >
                  VEHICLE RANKING TABLE — click vehicle to open deep dive
                </Typography>
              </Box>
              <Box
                className={agTheme}
                sx={{
                  flexGrow: 1,
                  "--ag-background-color": "transparent",
                  "--ag-odd-row-background-color": darkMode ? alpha("#7dd3fc", 0.04) : "#f8fafc",
                  "--ag-row-hover-color": darkMode ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05),
                  "--ag-foreground-color": darkMode ? "#e2e8f0" : "#0f172a",
                  "--ag-data-color": darkMode ? "#e2e8f0" : "#1f2937",
                  "--ag-secondary-foreground-color": darkMode ? "#94a3b8" : "#64748b",
                  "--ag-border-color": darkMode ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1),
                  "--ag-row-border-color": darkMode ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.07),
                  "& .ag-header": { backgroundColor: `${darkMode ? "#0d2137" : "#005071"} !important` },
                  "& .ag-header-cell": {
                    backgroundColor: `${darkMode ? "#0d2137" : "#005071"} !important`,
                    color: "#fff !important", fontSize: "10px !important", fontWeight: "700 !important",
                  },
                  "& .ag-header-cell-label": { color: "#fff !important" },
                  "& .ag-icon": { color: "#fff !important" },
                  "& .ag-cell": { fontSize: "10px !important" },
                  "& .ag-root-wrapper": { border: "none !important" },
                }}
              >
                <AgGridReact
                  rowData={moduleRankings}
                  columnDefs={rankingColDefs}
                  defaultColDef={{ resizable: true, sortable: true }}
                  rowHeight={28}
                />
              </Box>
            </Paper>
          </Box>

          {/* ── SECTION: Multi-vehicle health trend (ECharts with zoom) ── */}
          <Paper sx={{ p: 1, borderRadius: 0 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                fontSize: "12px",
                color: darkMode ? "text.primary" : "#005071",
                mb: 0.5,
                display: "block",
              }}
            >
              FLEET HEALTH TREND — {analysisModule.toUpperCase()} ALL VEHICLES
              &nbsp;
              <span style={{ color: ct.axisColor, fontWeight: 400 }}>
                (SILVER · dashed = fleet avg · scroll or drag to zoom)
              </span>
            </Typography>
            <EChart
              option={fleetHealthTrendOption}
              style={{ height: "340px", width: "100%" }}
              loading={moduleFleetHealthQuery.isLoading}
              empty={(moduleFleetHealthQuery.data?.series?.length ?? 0) === 0}
              emptyText="No silver data — start the streaming pipeline"
            />
          </Paper>

          {/* ── SECTION DIVIDER ── */}
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.5 }}
          >
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            <Typography
              variant="caption"
              sx={{
                color: darkMode ? "#94a3b8" : "#64748b",
                fontWeight: "bold",
                fontFamily: "monospace",
                letterSpacing: 1,
                whiteSpace: "nowrap",
              }}
            >
              SENSOR FLEET ANALYSIS
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
          </Box>

          {/* ── SECTION: Sensor distribution stats table (p25/median/p75 per vehicle) ── */}
          <Paper sx={{ p: 1, borderRadius: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, fontSize: "12px", color: darkMode ? "text.primary" : "#005071" }}
              >
                SENSOR DISTRIBUTION — PER VEHICLE &nbsp;
                <span style={{ color: ct.axisColor, fontWeight: 400 }}>
                  (BRONZE · percentile statistics)
                </span>
              </Typography>
              {sensorKeys.length > 0 && (
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <Select
                    value={distributionKey || sensorKeys[0] || ""}
                    onChange={(e) => setDistributionKey(e.target.value)}
                    sx={{
                      borderRadius: 0,
                      fontSize: "11px",
                      fontFamily: "monospace",
                    }}
                  >
                    {sensorKeys.map((k) => (
                      <MenuItem
                        key={k}
                        value={k}
                        sx={{ fontSize: "11px", fontFamily: "monospace" }}
                      >
                        {k.replace(/_/g, " ").toUpperCase()}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>
            {sensorBoxData.length > 0 ? (
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
                        "VEHICLE",
                        "MIN",
                        "P25",
                        "MEDIAN",
                        "P75",
                        "MAX",
                        "RANGE",
                      ].map((h) => (
                        <th key={h} style={tblHeader}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensorBoxData.map((row: any, i: number) => {
                      const range = (row.max - row.min).toFixed(3);
                      return (
                        <tr
                          key={row.vehicle_id}
                          style={{
                            ...(i % 2 === 0 ? tblRowEvens : tblRowOdds),
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = darkMode
                              ? alpha("#7dd3fc", 0.09)
                              : alpha("#3b82f6", 0.05);
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background =
                              i % 2 === 0 ? ct.tableRowEven : ct.tableRowOdd;
                          }}
                          onClick={() => {
                            setSelectedVehicle(row.vehicle_id);
                            setSelectedModule(analysisModule);
                            setActiveTab("vehicle");
                          }}
                        >
                          <td
                            style={{
                              padding: "5px 12px",
                              fontWeight: 600,
                              color: theme.palette.primary.main,
                            }}
                          >
                            {row.vehicle_id}
                          </td>
                          <td
                            style={{ padding: "5px 12px", color: ct.axisColor }}
                          >
                            {row.min.toFixed(3)}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {row.p25.toFixed(3)}
                          </td>
                          <td
                            style={{ padding: "5px 12px", fontWeight: "bold" }}
                          >
                            {row.median.toFixed(3)}
                          </td>
                          <td style={{ padding: "5px 12px" }}>
                            {row.p75.toFixed(3)}
                          </td>
                          <td
                            style={{ padding: "5px 12px", color: ct.axisColor }}
                          >
                            {row.max.toFixed(3)}
                          </td>
                          <td
                            style={{ padding: "5px 12px", color: ct.axisColor }}
                          >
                            {range}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Box>
            ) : (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                {moduleSensorStatsQuery.isLoading
                  ? "Loading…"
                  : "No bronze sensor data"}
              </Typography>
            )}
          </Paper>

          {/* ── SECTION DIVIDER ── */}
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.5 }}
          >
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            <Typography
              variant="caption"
              sx={{
                color: darkMode ? "#94a3b8" : "#64748b",
                fontWeight: "bold",
                fontFamily: "monospace",
                letterSpacing: 1,
                whiteSpace: "nowrap",
              }}
            >
              ANOMALY INTELLIGENCE
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
          </Box>

          {/* ── SECTION: Fleet top features ── */}
          <Paper sx={{ p: 1, borderRadius: 0 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: 700,
                fontSize: "12px",
                color: darkMode ? "text.primary" : "#005071",
                mb: 0.5,
                display: "block",
              }}
            >
              FLEET TOP ANOMALY DRIVERS — {analysisModule.toUpperCase()} &nbsp;
              <span style={{ color: ct.axisColor, fontWeight: 400 }}>
                (LSTM RECONSTRUCTION ERROR TOTALS · SILVER · aggregated across
                all vehicles)
              </span>
            </Typography>
            <EChart
              option={fleetTopFeaturesOption}
              style={{ height: "300px", width: "100%" }}
              loading={moduleTopFeaturesQuery.isLoading}
              empty={topFeaturesData.length === 0}
              emptyText="No silver feature data for this module"
            />
          </Paper>
        </Box>
      )}
    </Box>
  );
}
