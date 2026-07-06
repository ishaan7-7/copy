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
  Stack,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
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

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const CHART_FONT = '"Inter", "Segoe UI", Roboto, Arial, sans-serif';

const API = "http://127.0.0.1:8005";
const ALL_MODULES = ["engine", "transmission", "battery", "body", "tyre"];

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

function Card({
  children,
  sx = {},
}: {
  children: React.ReactNode;
  sx?: object;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Box
      sx={{
        borderRadius: 2,
        bgcolor: isDark ? alpha("#0b1724", 0.9) : "#ffffff",
        border: `1px solid ${isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)}`,
        boxShadow: isDark
          ? `0 18px 42px ${alpha("#000", 0.22)}`
          : `0 12px 30px ${alpha("#334155", 0.08)}`,
        overflow: "hidden",
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function SectionTitle({
  children,
  sx = {},
}: {
  children: React.ReactNode;
  sx?: object;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Typography
      sx={{
        fontSize: "11px",
        fontWeight: 700,
        color: isDark ? "#94a3b8" : "#64748b",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        mb: 1,
        ...sx,
      }}
    >
      {children}
    </Typography>
  );
}

function MetricTile({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string | number;
  accent: string;
  sub?: string;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Box
      sx={{
        p: 1.5,
        height: "100%",
        flex: 1,
        borderRadius: 1.5,
        bgcolor: isDark ? alpha("#0b1724", 0.9) : "#ffffff",
        border: `1px solid ${isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)}`,
        boxShadow: isDark
          ? `0 18px 42px ${alpha("#000", 0.22)}`
          : `0 12px 30px ${alpha("#334155", 0.08)}`,
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          bgcolor: accent,
          borderRadius: "4px 4px 0 0",
        },
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
        "&:hover": { transform: "translateY(-2px)" },
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Typography
        sx={{
          fontSize: "10px",
          fontWeight: 700,
          color: accent,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: "16px",
          fontWeight: 800,
          color: isDark ? "#e2e8f0" : "#0f172a",
          lineHeight: 1.1,
          mt: 0.5,
        }}
      >
        {value}
      </Typography>
      {sub && (
        <Typography
          sx={{
            fontSize: "10px",
            color: isDark ? "#64748b" : "#94a3b8",
            mt: 0.25,
          }}
        >
          {sub}
        </Typography>
      )}
    </Box>
  );
}

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
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const scAxisStyle = {
    fontSize: "10px",
    fill: isDark ? "#94a3b8" : "#64748b",
    fontFamily: CHART_FONT,
  };
  const scTooltipStyle = {
    borderRadius: 8,
    fontSize: "11px",
    padding: "10px 14px",
    backgroundColor: isDark ? alpha("#0b1724", 0.97) : "#ffffff",
    border: `1px solid ${isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.15)}`,
    color: isDark ? "#e2e8f0" : "#0f172a",
    boxShadow: isDark
      ? `0 8px 24px ${alpha("#000", 0.4)}`
      : `0 4px 16px ${alpha("#334155", 0.12)}`,
  };
  const gridStroke = isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.06);
  const axisStroke = isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1);
  const xKey = xAxisMode === "timestamp" ? "timestamp" : "mileage";
  return (
    <Card sx={{ p: 1.5, height, display: "flex", flexDirection: "column" }}>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: isDark ? "#94a3b8" : "#64748b",
          letterSpacing: "0.06em",
          fontSize: "10px",
          textTransform: "uppercase",
          mb: 0.5,
        }}
      >
        {group.title}
      </Typography>
      <Box sx={{ flex: 1 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, left: -28, bottom: 20 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke={gridStroke}
            />
            <XAxis
              dataKey={xKey}
              tick={scAxisStyle}
              axisLine={{ stroke: axisStroke }}
              tickLine={false}
              minTickGap={40}
              tickFormatter={(v) => formatXTick(v, xAxisMode)}
            />
            <YAxis
              tick={scAxisStyle}
              axisLine={{ stroke: axisStroke }}
              tickLine={false}
            />
            <Tooltip
              cursor={{ stroke: isDark ? alpha("#7dd3fc", 0.3) : alpha("#3b82f6", 0.2), strokeWidth: 1 }}
              contentStyle={scTooltipStyle}
              formatter={(v: number) => v.toFixed(2)}
            />
            {group.sensors.length > 1 && (
              <Legend
                wrapperStyle={{
                  fontSize: "10px",
                  fontWeight: "bold",
                  paddingTop: 2,
                  color: isDark ? "#e2e8f0" : "#0f172a",
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
              height={22}
              stroke={isDark ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5)}
              fill={isDark ? alpha("#0d2137", 0.85) : alpha("#e2eaf4", 0.9)}
              travellerWidth={10}
              tickFormatter={(v) => formatXTick(v, xAxisMode)}
              style={{ fontSize: "9px", fill: isDark ? "#94a3b8" : "#64748b" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Card>
  );
}

export default function AutomotiveDive({ isActive = true }: { isActive?: boolean }) {
  const { autoRefresh, setDtcResult: writeDtcCache } = useStore();
  const queryClient = useQueryClient();
  const wasActiveRef = useRef(false);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
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

  const axisStyle = { fontSize: "10px", fill: isDark ? "#94a3b8" : "#64748b", fontFamily: CHART_FONT };
  const agTheme = isDark ? "ag-theme-balham-dark" : "ag-theme-balham";
  const tooltipStyle = {
    borderRadius: 8,
    fontSize: "11px",
    padding: "10px 14px",
    backgroundColor: isDark ? alpha("#0b1724", 0.97) : "#ffffff",
    border: `1px solid ${isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.15)}`,
    color: isDark ? "#e2e8f0" : "#0f172a",
    boxShadow: isDark
      ? `0 8px 24px ${alpha("#000", 0.4)}`
      : `0 4px 16px ${alpha("#334155", 0.12)}`,
  };
  const SHAP_COLORS = isDark ? SHAP_COLORS_DARK : SHAP_COLORS_LIGHT;
  const plotLayout = buildPlotLayout(isDark);

  const agGridContainerSx: object = {
    "--ag-background-color": "transparent",
    "--ag-odd-row-background-color": isDark ? alpha("#7dd3fc", 0.04) : "#f8fafc",
    "--ag-row-hover-color": isDark ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05),
    "--ag-selected-row-background-color": isDark ? alpha("#3b82f6", 0.22) : alpha("#3b82f6", 0.1),
    "--ag-foreground-color": isDark ? "#e2e8f0" : "#0f172a",
    "--ag-data-color": isDark ? "#e2e8f0" : "#1f2937",
    "--ag-secondary-foreground-color": isDark ? "#94a3b8" : "#64748b",
    "--ag-border-color": isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1),
    "--ag-row-border-color": isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.07),
    "--ag-input-focus-border-color": isDark ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5),
    "& .ag-header": { backgroundColor: `${isDark ? "#0d2137" : "#1e3a5f"} !important` },
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
      borderColor: `${isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.08)} !important`,
    },
    "& .ag-root-wrapper": { borderRadius: "6px", border: "none !important" },
    "& .ag-root-wrapper-body": { borderRadius: "6px" },
  };

  const _tblBorder = isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1);
  const _tblHdrBg = isDark ? "#0d2137" : "#1e3a5f";
  const _tblEvenBg = isDark ? "transparent" : "#ffffff";
  const _tblOddBg = isDark ? alpha("#7dd3fc", 0.04) : "#f8fafc";
  const _tblText = isDark ? "#e2e8f0" : "#1f2937";
  const _tblMuted = isDark ? "#94a3b8" : "#64748b";
  const tblHeaders: React.CSSProperties = {
    textAlign: "left" as const,
    padding: "4px 12px",
    color: "#ffffff",
    fontWeight: 700,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 0,
    background: _tblHdrBg,
    boxShadow: `0 1px 0 ${_tblBorder}`,
  };
  const tblRowEvens: React.CSSProperties = {
    borderBottom: `1px solid ${_tblBorder}`,
    background: _tblEvenBg,
  };
  const tblRowOdds: React.CSSProperties = {
    borderBottom: `1px solid ${_tblBorder}`,
    background: _tblOddBg,
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
    refetchInterval: isActive && activeTab === "module" && autoRefresh ? 10000 : false,
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
      ? "#d32f2f"
      : latestSeverity === "WARNING"
      ? "#ed6c02"
      : "#2e7d32";

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
        width: 140,
        pinned: "left",
        sortable: true,
        filter: true,
      },
      {
        field: "health_score",
        headerName: "HEALTH SCORE",
        width: 150,
        sortable: true,
        cellStyle: (params: any) => ({
          fontWeight: "bold",
          color:
            params.value < 60
              ? "#ef4444"
              : params.value < 80
              ? "#eab308"
              : "#22c55e",
        }),
      },
      ...ALL_MODULES.map((mod) => ({
        field: `${mod}_contrib`,
        headerName: mod.toUpperCase(),
        width: 103,
        sortable: true,
        valueFormatter: (params: any) =>
          params.value != null ? params.value.toFixed(3) : "—",
      })),
      {
        field: "data_source",
        headerName: "SOURCE",
        width: 90,
        cellRenderer: (params: any) => (
          <Chip
            size="small"
            label={params.value}
            color={params.value === "live" ? "success" : "default"}
            sx={{ borderRadius: "4px", height: 18, fontSize: "10px" }}
          />
        ),
      },
    ],
    []
  );

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
        writeDtcCache(selectedVehicle, selectedModule, peakTs, res.data.triggers ?? []);
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
        color: "#2e7d32",
      },
      {
        name: "WARNING",
        value: counts.WARNING,
        pct: Math.round((counts.WARNING / total) * 100),
        color: "#ed6c02",
      },
      {
        name: "CRITICAL",
        value: counts.CRITICAL,
        pct: Math.round((counts.CRITICAL / total) * 100),
        color: "#d32f2f",
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
    background: _tblHdrBg,
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "10px",
    textAlign: "left" as const,
    padding: "8px 12px",
    borderBottom: `1px solid ${_tblBorder}`,
    whiteSpace: "nowrap" as const,
  };

  const tblCell = {
    padding: "7px 12px",
    borderBottom: `1px solid ${_tblBorder}`,
    verticalAlign: "middle" as const,
    color: _tblText,
    fontSize: "11px",
  };

  const tblRowEven = {
    background: _tblEvenBg,
    height: 36,
  };

  const tblRowOdd = {
    background: _tblOddBg,
    height: 36,
  };

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
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${isDark ? alpha("#7dd3fc", 0.12) : alpha("#1f2937", 0.08)}`,
          pb: 1,
          gap: 2,
          flexWrap: "wrap",
          flexShrink: 0,
        }}
      >
        <Typography
          sx={{
            fontWeight: 700,
            background: isDark
              ? "linear-gradient(90deg, #7dd3fc, #38bdf8)"
              : "linear-gradient(90deg, #0369a1, #0284c7)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.3px",
            fontSize: "16px",
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
              bgcolor: isDark ? alpha("#020c16", 0.7) : alpha("#dde6ef", 0.6),
              borderRadius: 2,
              p: 0.3,
              border: `1px solid ${isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.08)}`,
              "& .MuiToggleButton-root": {
                px: 1.5,
                py: 0.3,
                minHeight: 24,
                border: "none",
                borderRadius: "6px !important",
                fontSize: "10px",
                fontWeight: 600,
                lineHeight: 1,
                color: isDark ? "#94a3b8" : "#475569",
                textTransform: "none",
                transition: "all 0.15s ease",
                "&.Mui-selected": {
                  bgcolor: isDark ? "#0d2137" : "#ffffff",
                  color: isDark ? "#7dd3fc" : "#0369a1",
                  boxShadow: isDark
                    ? `0 2px 8px ${alpha("#000", 0.4)}`
                    : `0 2px 6px ${alpha("#334155", 0.12)}`,
                },
              },
            }}
          >
            <ToggleButton value="fleet">Fleet Overview</ToggleButton>
            <ToggleButton value="vehicle">Vehicle Deep Dive</ToggleButton>
            <ToggleButton value="module">Module Analysis</ToggleButton>
          </ToggleButtonGroup>

          <ToggleButtonGroup
            value={xAxisMode}
            exclusive
            onChange={(_e, val) => val && setXAxisMode(val)}
            size="small"
            sx={{
              bgcolor: isDark ? alpha("#020c16", 0.7) : alpha("#dde6ef", 0.6),
              borderRadius: 2,
              p: 0.3,
              border: `1px solid ${isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.08)}`,
              "& .MuiToggleButton-root": {
                px: 1.5,
                py: 0.3,
                minHeight: 24,
                border: "none",
                borderRadius: "6px !important",
                fontSize: "10px",
                fontWeight: 600,
                lineHeight: 1,
                color: isDark ? "#94a3b8" : "#475569",
                textTransform: "none",
                transition: "all 0.15s ease",
                "&.Mui-selected": {
                  bgcolor: isDark ? "#0d2137" : "#ffffff",
                  color: isDark ? "#7dd3fc" : "#0369a1",
                  boxShadow: isDark
                    ? `0 2px 8px ${alpha("#000", 0.4)}`
                    : `0 2px 6px ${alpha("#334155", 0.12)}`,
                },
              },
            }}
          >
            <ToggleButton value="timestamp">Timestamp</ToggleButton>
            <ToggleButton value="mileage">Mileage</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* ── FLEET OVERVIEW ── */}
      {activeTab === "fleet" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            flex: 1,
            minHeight: 0,
          }}
        >
          {!fleetQuery.isLoading && vehicles.length === 0 && (
            <Box
              sx={{
                p: 2,
                bgcolor: isDark ? alpha("#e65100", 0.1) : "#fff8e1",
                border: `1px solid ${isDark ? "#e65100" : "#ffe082"}`,
                borderRadius: 1.5,
              }}
            >
              <Typography variant="body2" sx={{ color: "#e65100", fontWeight: "bold" }}>
                No vehicle data. Start the streaming pipeline to populate fleet data.
              </Typography>
            </Box>
          )}
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0, alignItems: "stretch" }}>
            <Box sx={{ flex: 1, display: "flex" }}>
              <MetricTile
                label="Total Vehicles"
                value={fleetStats.total_vehicles ?? 0}
                accent="#3b82f6"
              />
            </Box>
            <Box sx={{ flex: 1, display: "flex" }}>
              <MetricTile
                label="Avg Fleet Health"
                value={`${fleetStats.avg_health ?? 0}%`}
                accent={
                  (fleetStats.avg_health ?? 100) >= 80
                    ? "#22c55e"
                    : (fleetStats.avg_health ?? 100) >= 60
                    ? "#eab308"
                    : "#ef4444"
                }
              />
            </Box>
            <Box sx={{ flex: 1, display: "flex" }}>
              <MetricTile
                label="Critical < 60%"
                value={fleetStats.critical_count ?? 0}
                accent="#ef4444"
              />
            </Box>
            <Box sx={{ flex: 1, display: "flex" }}>
              <MetricTile
                label="Warning 60–80%"
                value={fleetStats.warning_count ?? 0}
                accent="#f59e0b"
              />
            </Box>
          </Stack>

          <Box sx={{ display: "flex", gap: 2, flex: 1, minHeight: 0 }}>
            <Card sx={{ width: 320, p: 2, display: "flex", flexDirection: "column" }}>
              <SectionTitle>Vehicle Health Comparison</SectionTitle>
              <Box sx={{ flex: 1 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={fleetChartData}
                    layout="vertical"
                    margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke={isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.06)}
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={axisStyle}
                      axisLine={{ stroke: isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1) }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="vehicle_id"
                      tick={{
                        fontSize: 10,
                        fontWeight: 600,
                        fill: isDark ? "#e2e8f0" : "#0f172a",
                        fontFamily: "monospace",
                      }}
                      axisLine={false}
                      tickLine={false}
                      width={65}
                    />
                    <Tooltip
                      cursor={{ fill: isDark ? alpha("#7dd3fc", 0.08) : alpha("#3b82f6", 0.06) }}
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => `${v}%`}
                    />
                    <ReferenceLine x={60} stroke="#ef4444" strokeDasharray="4 4" />
                    <ReferenceLine x={80} stroke="#eab308" strokeDasharray="4 4" />
                    <Bar
                      dataKey="health_score"
                      name="Health"
                      fill={isDark ? "#3b82f6" : "#2563eb"}
                      isAnimationActive={false}
                      label={{
                        position: "right",
                        fontSize: 10,
                        fontWeight: "bold",
                        fill: isDark ? "#e2e8f0" : "#0f172a",
                        fontFamily: "monospace",
                        formatter: (v: number) => `${v}%`,
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Card>

            <Card sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <Box
                sx={{
                  p: 1.5,
                  borderBottom: `1px solid ${isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.08)}`,
                }}
              >
                <SectionTitle sx={{ mb: 0 }}>Fleet Health Table — Module Contributions (Gold)</SectionTitle>
              </Box>
              <Box
                className={agTheme}
                sx={{
                  flexGrow: 1,
                  minHeight: 0,
                  ...agGridContainerSx,
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
                    resizable: true,
                    sortable: true,
                    filter: true,
                  }}
                  rowHeight={28}
                  headerHeight={30}
                />
              </Box>
            </Card>
          </Box>
        </Box>
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
          <Card
            sx={{
              p: 1,
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: "11px",
                color: isDark ? "#94a3b8" : "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              CONTEXT:
            </Typography>

            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel sx={{ fontSize: "10px" }}>Vehicle</InputLabel>

              <Select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                label="Vehicle"
                sx={{
                  borderRadius: 1,
                  height: 30,
                  fontSize: "10px",
                }}
                MenuProps={{
                  PaperProps: {
                    sx: { "& .MuiMenuItem-root": { fontSize: "10px" } },
                  },
                }}
              >
                {vehicles.map((v: any) => (
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

            <ToggleButtonGroup
              value={selectedModule}
              exclusive
              onChange={(_e, val) => val && setSelectedModule(val)}
              size="small"
              sx={{
                bgcolor: isDark ? alpha("#020c16", 0.7) : alpha("#dde6ef", 0.6),
                borderRadius: 2,
                p: 0.3,
                border: `1px solid ${isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.08)}`,
                "& .MuiToggleButton-root": {
                  px: 1.25,
                  py: 0.3,
                  minHeight: 24,
                  border: "none",
                  borderRadius: "6px !important",
                  fontSize: "10px",
                  fontWeight: 600,
                  lineHeight: 1,
                  color: isDark ? "#94a3b8" : "#475569",
                  textTransform: "uppercase",
                  transition: "all 0.15s ease",
                  "&.Mui-selected": {
                    color: "#fff",
                    boxShadow: `0 2px 8px ${alpha("#000", 0.3)}`,
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
              sx={{ borderRadius: "4px", fontWeight: 700, fontSize: "10px", height: 24 }}
            />

            <Chip
              size="small"
              label={`${moduleHealthQuery.data?.count ?? 0} Silver pts`}
              sx={{
                borderRadius: "4px",
                fontWeight: 700,
                fontSize: "10px",
                height: 24,
                bgcolor: isDark ? alpha("#3b82f6", 0.18) : "#e3f2fd",
                color: isDark ? "#7dd3fc" : "#1565c0",
              }}
            />
          </Card>

          {/* GOLD + SILVER health charts side by side */}
          <Grid container spacing={2}>
            {/* LEFT SECTION → 9 columns */}
            <Grid item xs={12} md={9}>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
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
                    const accent = isWarn ? "#ef4444" : MODULE_COLORS[selectedModule];
                    return (
                      <Box key={f.key} sx={{ flex: 1, minWidth: 120, display: "flex" }}>
                        <MetricTile
                          label={f.label}
                          value={val !== null ? `${val.toFixed(2)} ${f.unit}` : "—"}
                          accent={accent}
                        />
                      </Box>
                    );
                  })}
                </Box>

                {/* CHARTS — Row 2 */}
                <Grid container spacing={2}>
                  {/* GOLD */}
                  <Grid item xs={12} md={6}>
                    <Card sx={{ p: 1.5, height: 260, display: "flex", flexDirection: "column" }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", fontSize: "10px" }}>
                          FUSED VEHICLE HEALTH — {selectedVehicle}
                          <span style={{ color: isDark ? "#60a5fa" : "#3b82f6", fontWeight: 400 }}> (GOLD)</span>
                        </Typography>
                        <Chip
                          size="small"
                          label={vehicleHealthQuery.data?.data_source || "—"}
                          sx={{ borderRadius: "4px", fontWeight: "bold", fontSize: "10px", height: 18 }}
                        />
                      </Box>
                      <Box sx={{ flex: 1, minHeight: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={healthHistory} margin={{ top: 4, right: 15, left: -25, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.06)} />
                            <XAxis
                              dataKey={xAxisMode === "mileage" ? "mileage" : "ts"}
                              tick={axisStyle}
                              axisLine={{ stroke: isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1) }}
                              tickLine={false}
                              minTickGap={40}
                              tickFormatter={(v) => formatXTick(v, xAxisMode)}
                            />
                            <YAxis
                              domain={[0, 100]}
                              tick={axisStyle}
                              axisLine={{ stroke: isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1) }}
                              tickLine={false}
                            />
                            <Tooltip
                              cursor={{ stroke: isDark ? alpha("#7dd3fc", 0.3) : alpha("#3b82f6", 0.2), strokeWidth: 1 }}
                              contentStyle={tooltipStyle}
                              formatter={(v: number) => `${v.toFixed(1)}%`}
                            />
                            <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="4 4" />
                            <ReferenceLine y={80} stroke="#eab308" strokeDasharray="4 4" />
                            <Line type="monotone" dataKey="health" name="Health %" stroke={isDark ? "#3b82f6" : "#2563eb"} strokeWidth={2} dot={false} isAnimationActive={false} />
                            <Brush
                              dataKey={xAxisMode === "mileage" ? "mileage" : "ts"}
                              height={22}
                              stroke={isDark ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5)}
                              fill={isDark ? alpha("#0d2137", 0.85) : alpha("#e2eaf4", 0.9)}
                              travellerWidth={10}
                              style={{ fontSize: "9px", fill: isDark ? "#94a3b8" : "#64748b" }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>
                    </Card>
                  </Grid>

                  {/* SILVER */}
                  <Grid item xs={12} md={6}>
                    <Card sx={{ p: 1.5, height: 260, display: "flex", flexDirection: "column" }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", fontSize: "10px" }}>
                          {selectedModule.toUpperCase()} ML HEALTH SCORE
                          <span style={{ color: isDark ? "#94a3b8" : "#64748b", fontWeight: 400 }}> (SILVER)</span>
                        </Typography>
                        <Chip
                          size="small"
                          label={latestSeverity}
                          sx={{ borderRadius: "4px", fontWeight: "bold", fontSize: "10px", height: 18, bgcolor: severityColor, color: "white" }}
                        />
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={moduleHealthData} margin={{ top: 4, right: 15, left: -25, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.06)} />
                            <XAxis
                              dataKey={xAxisMode === "timestamp" ? "timestamp" : "mileage"}
                              tick={axisStyle}
                              axisLine={{ stroke: isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1) }}
                              tickLine={false}
                              minTickGap={40}
                              tickFormatter={(v) => formatXTick(v, xAxisMode)}
                            />
                            <YAxis
                              domain={[0, 100]}
                              tick={axisStyle}
                              axisLine={{ stroke: isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1) }}
                              tickLine={false}
                            />
                            <Tooltip
                              cursor={{ stroke: isDark ? alpha("#7dd3fc", 0.3) : alpha("#3b82f6", 0.2), strokeWidth: 1 }}
                              contentStyle={tooltipStyle}
                              formatter={(v: number) => `${v.toFixed(1)}%`}
                            />
                            <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="4 4" label={{ value: "CRIT", fontSize: 9, fill: "#ef4444" }} />
                            <ReferenceLine y={80} stroke="#eab308" strokeDasharray="4 4" label={{ value: "WARN", fontSize: 9, fill: "#eab308" }} />
                            <Line type="monotone" dataKey="health_score" name="ML Health" stroke={MODULE_COLORS[selectedModule]} strokeWidth={2} dot={false} isAnimationActive={false} />
                            <Brush
                              dataKey={xAxisMode === "timestamp" ? "timestamp" : "mileage"}
                              height={22}
                              stroke={isDark ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5)}
                              fill={isDark ? alpha("#0d2137", 0.85) : alpha("#e2eaf4", 0.9)}
                              travellerWidth={10}
                              style={{ fontSize: "9px", fill: isDark ? "#94a3b8" : "#64748b" }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </Box>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            </Grid>

            {/* RIGHT SECTION → 3 columns */}
            <Grid item xs={12} md={3}>
              <Card sx={{ p: 1.5, height: 260, display: "flex", flexDirection: "column" }}>
                <SectionTitle sx={{ mb: 1 }}>Top Anomaly Drivers</SectionTitle>
                <Box sx={{ flex: 1, overflowY: "auto" }}>
                  {topFeatures.length > 0 ? (
                    topFeatures.map((f) => (
                      <Box key={f.feature} sx={{ mb: 1.25 }}>
                        <Typography variant="caption" sx={{ fontSize: "10px", fontWeight: 600, color: isDark ? "#e2e8f0" : "#1f2937" }}>
                          {f.feature.replace(/_/g, " ")}
                        </Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Box sx={{ flex: 1, height: 6, bgcolor: isDark ? alpha("#7dd3fc", 0.08) : alpha("#1f2937", 0.08), borderRadius: 1, overflow: "hidden" }}>
                            <Box sx={{ width: `${Math.min(100, f.score * 200)}%`, height: "100%", bgcolor: "#ef4444", borderRadius: 1 }} />
                          </Box>
                          <Typography variant="caption" sx={{ minWidth: 32, fontWeight: "bold", color: isDark ? "#94a3b8" : "#64748b" }}>
                            {f.score.toFixed(2)}
                          </Typography>
                        </Box>
                      </Box>
                    ))
                  ) : (
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      No Silver data yet
                    </Typography>
                  )}
                </Box>
              </Card>
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
                color: "text.secondary",
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
          <Card sx={{ p: 1.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", fontSize: "10px" }}>
                HEALTH DECOMPOSITION — ALL MODULE CONTRIBUTIONS OVER TIME
                <span style={{ color: isDark ? "#60a5fa" : "#3b82f6", fontWeight: 400 }}> (SILVER)</span>
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
                  borderRadius: "4px",
                  fontWeight: "bold",
                  fontSize: "10px",
                  height: 18,
                  bgcolor: vehicleDecompQuery.isError ? (isDark ? alpha("#ef4444", 0.12) : "#ffebee") : undefined,
                  color: vehicleDecompQuery.isError ? "#ef4444" : undefined,
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
          </Card>

          {/* ── ROW B: Module health radar + Severity transition strip ── */}
          <Box sx={{ display: "flex", gap: 2 }}>
            <Card sx={{ width: 290, p: 1.5, height: 280, display: "flex", flexDirection: "column", flexShrink: 0 }}>
              <SectionTitle sx={{ mb: 0.5 }}>Module Health Radar — {selectedVehicle || "—"}</SectionTitle>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                    <PolarGrid stroke={isDark ? alpha("#7dd3fc", 0.12) : alpha("#1f2937", 0.1)} />
                    <PolarAngleAxis
                      dataKey="module"
                      tick={{ fontSize: 10, fontWeight: 700, fill: isDark ? "#e2e8f0" : "#0f172a", fontFamily: "monospace" } as any}
                    />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar name="Health %" dataKey="score" stroke={isDark ? "#3b82f6" : "#2563eb"} fill={isDark ? "#3b82f6" : "#2563eb"} fillOpacity={0.18} isAnimationActive={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v}%`, "Health"]} />
                  </RadarChart>
                </ResponsiveContainer>
              </Box>
            </Card>

            <Card sx={{ flex: 1, p: 1.5, height: 280, display: "flex", flexDirection: "column" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", fontSize: "10px" }}>
                  SEVERITY TRANSITION HISTORY — {selectedModule.toUpperCase()}
                  <span style={{ color: isDark ? "#94a3b8" : "#64748b", fontWeight: 400 }}> (SILVER)</span>
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
            </Card>
          </Box>

          {/* ── ROW C: Anomaly driver trends — small multiples grid ── */}
          <Card sx={{ p: 1.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", fontSize: "10px" }}>
                ANOMALY DRIVER TRENDS — LSTM RECONSTRUCTION ERROR PER FEATURE
                <span style={{ color: isDark ? "#60a5fa" : "#3b82f6", fontWeight: 400 }}>
                  {" "}({selectedModule.toUpperCase()} SILVER · higher = more anomalous · standardized units)
                </span>
              </Typography>
              {anomalyTrendSeries.length > 0 && (
                <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace", fontSize: "10px" }}>
                  {anomalyTrendSeries.length} drivers · {anomalyTrendData.length} pts
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
          </Card>

          {/* ── ROW D: Bronze sensor statistics table ── */}
          <Card sx={{ p: 1.5 }}>
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", fontSize: "10px" }}>
                BRONZE SENSOR STATISTICS — {selectedModule.toUpperCase()}
                <span style={{ color: isDark ? "#94a3b8" : "#64748b", fontWeight: 400 }}> ({sensorData.length.toLocaleString()} data points)</span>
              </Typography>
            </Box>
            {sensorStats.length > 0 ? (
              <Box sx={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse" as const,
                    fontFamily: "monospace",
                    fontSize: "11px",
                    color: _tblText,
                  }}
                >
                  <thead>
                    <tr>
                      {["SENSOR", "UNIT", "MIN", "MAX", "MEAN", "STD DEV", "LATEST"].map((h) => (
                        <th key={h} style={tblHeader}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sensorStats.map((s: any, i: number) => {
                      const isWarn = s.latest !== null && !isNaN(s.latest) && s.warnFn ? s.warnFn(s.latest) : false;
                      return (
                        <tr key={s.key} style={i % 2 === 0 ? tblRowEven : tblRowOdd}>
                          <td style={{ padding: "5px 12px", fontWeight: 600, color: _tblText }}>{s.label}</td>
                          <td style={{ padding: "5px 12px", color: _tblMuted }}>{s.unit || "—"}</td>
                          <td style={{ padding: "5px 12px" }}>{s.min !== null ? s.min.toFixed(2) : "—"}</td>
                          <td style={{ padding: "5px 12px" }}>{s.max !== null ? s.max.toFixed(2) : "—"}</td>
                          <td style={{ padding: "5px 12px" }}>{s.mean !== null ? s.mean.toFixed(2) : "—"}</td>
                          <td style={{ padding: "5px 12px" }}>{s.std !== null ? s.std.toFixed(2) : "—"}</td>
                          <td style={{ padding: "5px 12px", fontWeight: "bold", color: isWarn ? "#ef4444" : _tblText }}>
                            {s.latest !== null && !isNaN(s.latest) ? s.latest.toFixed(2) : "—"}
                            {isWarn && <span style={{ marginLeft: 4, fontSize: "9px", color: "#ef4444" }}>▲</span>}
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
          </Card>

          {/* ── SECTION DIVIDER ── */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.5 }}>
            <Box sx={{ flex: 1, height: "1px", bgcolor: isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1) }} />
            <Typography variant="caption" sx={{ color: isDark ? "#94a3b8" : "#64748b", fontWeight: "bold", fontFamily: "monospace", letterSpacing: 1, whiteSpace: "nowrap" }}>
              FAULT & ALERT HISTORY
            </Typography>
            <Box sx={{ flex: 1, height: "1px", bgcolor: isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1) }} />
          </Box>

          {/* ── ROW E: Vehicle alerts table ── */}
          <Card sx={{ p: 1.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", fontSize: "10px" }}>
                VEHICLE ALERTS — {selectedVehicle}
                <span style={{ color: isDark ? "#60a5fa" : "#3b82f6", fontWeight: 400 }}> (GOLD ALERTS DELTA)</span>
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                {vehicleAlertsQuery.data?.open?.length > 0 && (
                  <Chip size="small" label={`${vehicleAlertsQuery.data.open.length} OPEN`}
                    sx={{ borderRadius: "4px", fontWeight: "bold", fontSize: "10px", height: 18, bgcolor: "#ef4444", color: "white" }}
                  />
                )}
                {vehicleAlertsQuery.data?.closed?.length > 0 && (
                  <Chip size="small" label={`${vehicleAlertsQuery.data.closed.length} CLOSED`}
                    sx={{ borderRadius: "4px", fontWeight: "bold", fontSize: "10px", height: 18 }}
                  />
                )}
              </Box>
            </Box>
            {vehicleAlertsQuery.isLoading ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>Loading…</Typography>
            ) : (
              <Box sx={{ maxHeight: 320, overflowY: "auto", overflowX: "auto", border: `1px solid ${_tblBorder}`, borderRadius: 1 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" as const, fontFamily: "monospace", fontSize: "11px", color: _tblText }}>
                  <thead>
                    <tr>
                      {["STATUS", "MODULE", "STARTED", "PEAK TS", "ENDED", "MAX SCORE", "TOP FEATURES"].map((h) => (
                        <th key={h} style={tblHeaders}>{h}</th>
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
                        style={i % 2 === 0 ? tblRowEvens : tblRowOdds}
                        onMouseEnter={(e) => { e.currentTarget.style.background = isDark ? alpha("#7dd3fc", 0.09) : alpha("#3b82f6", 0.05); }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? _tblEvenBg : _tblOddBg; }}
                      >
                        <td style={tblCell}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 56, padding: "2px 8px", fontSize: "10px", fontWeight: 700, borderRadius: "4px", background: a.status === "OPEN" ? "#ef4444" : _tblHdrBg, color: "#fff" }}>
                            {a.status}
                          </span>
                        </td>
                        <td style={{ ...tblCell, fontWeight: 600 }}>{(a.module || "—").toUpperCase()}</td>
                        <td style={{ ...tblCell, color: _tblMuted }}>{String(a.alert_start_ts || "—").slice(0, 16)}</td>
                        <td style={{ ...tblCell, color: _tblMuted }}>{String(a.peak_anomaly_ts || "—").slice(0, 16)}</td>
                        <td style={{ ...tblCell, color: _tblMuted }}>{a.status === "CLOSED" ? String(a.alert_end_ts || "—").slice(0, 16) : "—"}</td>
                        <td style={{ ...tblCell, fontWeight: 700, color: Number(a.max_composite_score) >= 80 ? "#ef4444" : Number(a.max_composite_score) >= 60 ? "#eab308" : "#22c55e" }}>
                          {a.max_composite_score != null ? Number(a.max_composite_score).toFixed(1) : "—"}
                        </td>
                        <td style={{ ...tblCell, color: _tblMuted, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={a.top_10_features}>
                          {a.top_10_features || "—"}
                        </td>
                      </tr>
                    ))}
                    {!vehicleAlertsQuery.data?.open?.length && !vehicleAlertsQuery.data?.closed?.length && (
                      <tr>
                        <td colSpan={7} style={{ padding: "24px", textAlign: "center" as const, color: _tblMuted, borderBottom: `1px solid ${_tblBorder}` }}>
                          No alerts recorded for this vehicle
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Box>
            )}
          </Card>

          {/* ── ROW F: DTC run history ── */}
          <Card sx={{ p: 1.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", mb: 1, display: "block", fontSize: "10px", letterSpacing: "0.06em" }}>
              DTC ANALYSIS RUN HISTORY — {selectedVehicle} &nbsp;
              <span style={{ color: isDark ? "#60a5fa" : "#3b82f6", fontWeight: 400 }}>(last 50 runs)</span>
            </Typography>
            {dtcHistoryQuery.isLoading ? (
              <Typography variant="caption" sx={{ color: "text.secondary" }}>Loading…</Typography>
            ) : (
              <Box sx={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" as const, fontFamily: "monospace", fontSize: "11px", color: _tblText }}>
                  <thead>
                    <tr>
                      {["RUN TIME", "MODULE", "PEAK TS", "TRIGGERED CODES"].map((h) => (
                        <th key={h} style={tblHeader}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(dtcHistoryQuery.data?.runs || []).map((run: any, i: number) => (
                      <tr key={i} style={i % 2 === 0 ? tblRowEven : tblRowOdd}>
                        <td style={{ padding: "5px 12px", color: _tblMuted }}>{String(run.run_ts || "—").slice(0, 16)}</td>
                        <td style={{ padding: "5px 12px", fontWeight: 600 }}>{(run.module || "—").toUpperCase()}</td>
                        <td style={{ padding: "5px 12px", color: _tblMuted }}>{String(run.peak_ts || "—").slice(0, 16)}</td>
                        <td style={{ padding: "5px 12px" }}>
                          {(run.triggers || []).length === 0 ? (
                            <span style={{ color: "#22c55e", fontWeight: 600 }}>NO FAULTS</span>
                          ) : (
                            (run.triggers as any[]).map((t: any, j: number) => (
                              <span key={j} style={{ display: "inline-block", marginRight: 6, padding: "1px 6px", fontSize: "10px", fontWeight: 700, borderRadius: "4px", background: t.severity === "CRITICAL" ? "#ef4444" : "#eab308", color: "white" }}>
                                {t.code}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                    {!dtcHistoryQuery.data?.runs?.length && (
                      <tr>
                        <td colSpan={4} style={{ padding: "10px 12px", color: _tblMuted, textAlign: "center" as const }}>
                          No DTC analysis runs recorded for this vehicle
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Box>
            )}
          </Card>

          {/* ── SECTION DIVIDER ── */}
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.5 }}
          >
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
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
          <Card sx={{ p: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1.5, flexWrap: "wrap" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", fontSize: "10px", letterSpacing: "0.06em" }}>
                DTC DEEP DIVE — {selectedVehicle} / {selectedModule.toUpperCase()}
              </Typography>
              <button
                onClick={runDtcAnalysis}
                disabled={dtcRunning || !selectedVehicle}
                style={{
                  padding: "4px 14px", fontFamily: "monospace", fontSize: "11px", fontWeight: 700,
                  background: dtcRunning ? theme.palette.action.disabledBackground : theme.palette.primary.main,
                  color: dtcRunning ? theme.palette.text.disabled : "white",
                  border: "none", borderRadius: "4px", cursor: dtcRunning ? "not-allowed" : "pointer", letterSpacing: "0.5px",
                }}
              >
                {dtcRunning ? "RUNNING INFERENCE…" : "RUN DTC ANALYSIS"}
              </button>
              <Typography variant="caption" sx={{ color: isDark ? "#64748b" : "#94a3b8", fontFamily: "monospace", fontSize: "10px" }}>
                Runs PyTorch fault models on 600-row bronze traceback at peak anomaly timestamp
              </Typography>
            </Box>

            {dtcResult?.error && (
              <Box sx={{ p: 1.5, bgcolor: isDark ? alpha("#e65100", 0.1) : "#fff8e1", border: `1px solid ${isDark ? "#e65100" : "#ffe082"}`, borderRadius: 1 }}>
                <Typography variant="caption" sx={{ color: "#e65100", fontFamily: "monospace" }}>
                  {dtcResult.error}
                </Typography>
              </Box>
            )}

            {dtcResult?.success && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", mr: 0.5, fontSize: "10px" }}>
                    TRIGGERED CODES:
                  </Typography>
                  {dtcResult.triggers?.length === 0 ? (
                    <Chip size="small" label="NO FAULTS TRIGGERED" sx={{ borderRadius: "4px", fontWeight: "bold", bgcolor: isDark ? alpha("#22c55e", 0.15) : "#dcfce7", color: "#22c55e", fontSize: "11px" }} />
                  ) : (
                    (dtcResult.triggers as any[]).map((t: any, i: number) => (
                      <Box key={i} sx={{ display: "flex", flexDirection: "column", p: 1, borderRadius: 1, border: `1px solid ${t.severity === "CRITICAL" ? "#ef4444" : "#eab308"}`, minWidth: 200, maxWidth: 320 }}>
                        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 0.5 }}>
                          <span style={{ padding: "1px 6px", fontSize: "10px", fontWeight: 700, borderRadius: "4px", background: t.severity === "CRITICAL" ? "#ef4444" : "#eab308", color: "white" }}>
                            {t.severity}
                          </span>
                          <Typography variant="caption" sx={{ fontWeight: "bold", fontFamily: "monospace" }}>
                            {t.code}
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ fontSize: "10px", color: isDark ? "#94a3b8" : "#64748b", lineHeight: 1.4 }}>
                          {t.message}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>

                <Box sx={{ display: "flex", gap: 2, height: 380 }}>
                  <Card sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {dtcResult.critical_plot ? (
                      <Plot data={dtcResult.critical_plot.data} layout={{ ...(dtcResult.critical_plot.layout || {}), ...plotLayout }} useResizeHandler={true} style={{ width: "100%", height: "100%" }} config={{ displayModeBar: false }} />
                    ) : (
                      <Typography variant="caption" sx={{ color: isDark ? "#64748b" : "#94a3b8" }}>No critical DTCs monitored for this module</Typography>
                    )}
                  </Card>
                  <Card sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {dtcResult.non_critical_plot ? (
                      <Plot data={dtcResult.non_critical_plot.data} layout={{ ...(dtcResult.non_critical_plot.layout || {}), ...plotLayout }} useResizeHandler={true} style={{ width: "100%", height: "100%" }} config={{ displayModeBar: false }} />
                    ) : (
                      <Typography variant="caption" sx={{ color: isDark ? "#64748b" : "#94a3b8" }}>No non-critical DTCs monitored for this module</Typography>
                    )}
                  </Card>
                </Box>

                {dtcResult.diagnostics?.skipped_dtcs && Object.keys(dtcResult.diagnostics.skipped_dtcs).length > 0 && (
                  <Box sx={{ p: 1, bgcolor: isDark ? alpha("#0b1724", 0.6) : "#f8fafc", border: `1px solid ${_tblBorder}`, borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ color: isDark ? "#64748b" : "#94a3b8", fontFamily: "monospace", fontSize: "10px" }}>
                      SKIPPED: {Object.keys(dtcResult.diagnostics.skipped_dtcs).join(", ")} — missing bronze features
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            {!dtcResult && !dtcRunning && (
              <Typography variant="caption" sx={{ color: isDark ? "#64748b" : "#94a3b8", fontFamily: "monospace" }}>
                Click RUN DTC ANALYSIS to run fault inference. Requires dtc_service/api.py to be running.
              </Typography>
            )}
          </Card>

          {/* ── SECTION DIVIDER ── */}
          <Box
            sx={{ display: "flex", alignItems: "center", gap: 1.5, my: 0.5 }}
          >
            <Box sx={{ flex: 1, height: "1px", bgcolor: "divider" }} />
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
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
          <Card sx={{ p: 1.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1, flexWrap: "wrap" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: isDark ? "#94a3b8" : "#64748b", fontSize: "10px", letterSpacing: "0.06em" }}>
                SENSOR TIMELINE — {selectedModule.toUpperCase()} · {selectedVehicle || "—"}
              </Typography>
              {allVehicleSensorKeys.length > 0 && (
                <FormControl size="small" sx={{ minWidth: 300 }}>
                  <Select
                    value={vehicleTimelineSensorKey || allVehicleSensorKeys[0]?.key || ""}
                    onChange={(e) => setVehicleTimelineSensorKey(e.target.value)}
                    sx={{ borderRadius: 1, fontFamily: "monospace", fontSize: "11px" }}
                  >
                    {allVehicleSensorKeys.map((s) => (
                      <MenuItem key={s.key} value={s.key} sx={{ fontFamily: "monospace", fontSize: "11px" }}>
                        {s.groupTitle} — {s.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <Chip size="small" label={`${downsampledBronze.length} pts`} sx={{ borderRadius: "4px", fontWeight: "bold", fontSize: "11px" }} />
            </Box>
            {vehicleTimelineSensorGroup && downsampledBronze.length > 0 ? (
              <SensorChart data={downsampledBronze} group={vehicleTimelineSensorGroup} xAxisMode={xAxisMode} height={280} />
            ) : (
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280 }}>
                <Typography variant="caption" sx={{ color: isDark ? "#64748b" : "#94a3b8" }}>
                  {!selectedVehicle ? "Select a vehicle" : sensorQuery.isLoading ? "Loading…" : "No bronze sensor data for this module"}
                </Typography>
              </Box>
            )}
          </Card>
        </Box>
      )}

      {/* ── MODULE ANALYSIS ── */}
      {activeTab === "module" && (
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
              gap: 1.5,
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            {/* MODULE LABEL */}
            <Typography
              sx={{
                fontSize: "11px", // only slightly bigger
                fontWeight: 700,
                letterSpacing: 0.3,
              }}
            >
              MODULE:
            </Typography>

            {/* TOGGLE GROUP */}
            <ToggleButtonGroup
              value={analysisModule}
              exclusive
              onChange={(_e, val) => {
                if (val) setAnalysisModule(val);
              }}
              size="small"
              sx={{
                "& .MuiToggleButton-root": {
                  fontSize: "10px",
                  fontWeight: 600,
                  px: 1.2,
                  py: 0.3,
                  textTransform: "uppercase",
                },
              }}
            >
              {ALL_MODULES.map((mod) => (
                <ToggleButton
                  key={mod}
                  value={mod}
                  sx={{
                    borderRadius: 0,
                    fontSize: "10px",
                    fontWeight: 600,

                    "&.Mui-selected": {
                      bgcolor: MODULE_COLORS[mod],
                      color: "#fff",
                      "&:hover": {
                        bgcolor: MODULE_COLORS[mod],
                      },
                    },
                  }}
                >
                  {mod.toUpperCase()}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            {/* TIME RANGE PICKER */}
            <Box
              sx={{
                minWidth: 160,

                // input text
                "& .MuiInputBase-root": {
                  fontSize: "10px",
                },

                "& .MuiInputBase-input": {
                  fontSize: "10px",
                },

                // label
                "& .MuiInputLabel-root": {
                  fontSize: "10px",
                },

                // dropdown / select menu items
                "& .MuiMenuItem-root": {
                  fontSize: "10px",
                },

                // autocomplete / list items (if used inside picker)
                "& .MuiAutocomplete-option": {
                  fontSize: "10px",
                },

                // calendar / date picker text (if used)
                "& .MuiPickersDay-root": {
                  fontSize: "10px",
                },

                "& .MuiTypography-root": {
                  fontSize: "10px",
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
                color: "text.secondary",
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
          <Box sx={{ display: "flex", gap: 2 }}>
            <Paper
              sx={{
                flex: 1,
                p: 1.5,
                borderRadius: 0,
                height: 320,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: "bold", color: "text.secondary", mb: 1 }}
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
                      stroke="#d32f2f"
                      strokeDasharray="4 4"
                    />
                    <ReferenceLine
                      x={80}
                      stroke="#ed6c02"
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
                  p: 1.5,
                  borderBottom: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: "bold", color: "text.secondary" }}
                >
                  VEHICLE RANKING TABLE — click vehicle to open deep dive
                </Typography>
              </Box>
              <Box className={agTheme} sx={{ flexGrow: 1 }}>
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
          <Paper sx={{ p: 1.5, borderRadius: 0 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: "bold",
                color: "text.secondary",
                mb: 0.5,
                display: "block",
              }}
            >
              FLEET HEALTH TREND — {analysisModule.toUpperCase()} ALL VEHICLES
              &nbsp;
              <span style={{ color: ct.axisColor, fontWeight: "normal" }}>
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
                color: "text.secondary",
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
          <Paper sx={{ p: 1.5, borderRadius: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: "bold", color: "text.secondary" }}
              >
                SENSOR DISTRIBUTION — PER VEHICLE &nbsp;
                <span style={{ color: ct.axisColor, fontWeight: "normal" }}>
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
                color: "text.secondary",
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
          <Paper sx={{ p: 1.5, borderRadius: 0 }}>
            <Typography
              variant="caption"
              sx={{
                fontWeight: "bold",
                color: "text.secondary",
                mb: 0.5,
                display: "block",
              }}
            >
              FLEET TOP ANOMALY DRIVERS — {analysisModule.toUpperCase()} &nbsp;
              <span style={{ color: ct.axisColor, fontWeight: "normal" }}>
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
