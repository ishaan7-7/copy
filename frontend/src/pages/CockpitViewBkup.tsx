import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import ReactECharts from "echarts-for-react";
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import DirectionsCarFilledOutlinedIcon from "@mui/icons-material/DirectionsCarFilledOutlined";
import ElectricBoltOutlinedIcon from "@mui/icons-material/ElectricBoltOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import GpsFixedOutlinedIcon from "@mui/icons-material/GpsFixedOutlined";
import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";

const FLEET_API = "http://127.0.0.1:8009/api/fleet";
const PIPELINE_API = "http://127.0.0.1:8005";

type Severity = "active" | "parked" | "warning" | "critical" | "service";

interface FleetSummary {
  total: number;
  active: number;
  in_service: number;
  parked: number;
  avg_health: number;
  severity_counts: { normal: number; warning: number; critical: number };
  avg_driver_score: number;
}

interface VehiclePosition {
  vehicle_id: string;
  name: string;
  type: string;
  status: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  health: number;
  driver: string;
  driver_score: number;
  road_type: string;
  route_name: string;
}

interface PipelineVehicle {
  vehicle_id: string;
  health_score: number;
  battery_contrib?: number;
}

interface PipelineFleetSummary {
  vehicles: PipelineVehicle[];
  fleet_stats: {
    total_vehicles: number;
    avg_health: number;
    critical_count: number;
    warning_count: number;
  };
}

interface HealthHistoryRow {
  ts?: string;
  timestamp?: string;
  health: number;
  mileage?: number;
}

interface HealthHistoryResponse {
  data: HealthHistoryRow[];
  vehicle_id: string;
}

interface CockpitVehicle {
  id: string;
  name: string;
  status: Severity;
  health: number;
  battery: number;
  speed: number;
  driver: string;
  location: string;
  trip: string;
  updated: string;
  lat: number;
  lng: number;
}

const fallbackSummary: FleetSummary = {
  total: 40,
  active: 18,
  in_service: 3,
  parked: 7,
  avg_health: 77.9,
  avg_driver_score: 82,
  severity_counts: { normal: 18, warning: 10, critical: 5 },
};

const fallbackVehicles: CockpitVehicle[] = [
  {
    id: "DL01",
    name: "DL01",
    status: "active",
    health: 78,
    battery: 81,
    speed: 62,
    driver: "Rahul Verma",
    location: "NH48, Jaipur, RJ",
    trip: "Trip #TRP1287",
    updated: "1 min ago",
    lat: 26.91,
    lng: 75.78,
  },
  {
    id: "DL07",
    name: "DL07",
    status: "critical",
    health: 48,
    battery: 18,
    speed: 0,
    driver: "Suresh Yadav",
    location: "Agra Road, Bharatpur, RJ",
    trip: "Trip #TRP1281",
    updated: "2 min ago",
    lat: 27.22,
    lng: 77.49,
  },
  {
    id: "MH12",
    name: "MH12",
    status: "warning",
    health: 65,
    battery: 42,
    speed: 35,
    driver: "Amit Singh",
    location: "NH60, Kota, RJ",
    trip: "Trip #TRP1289",
    updated: "3 min ago",
    lat: 25.21,
    lng: 75.86,
  },
  {
    id: "GJ05",
    name: "GJ05",
    status: "parked",
    health: 82,
    battery: 67,
    speed: 0,
    driver: "Mahesh Patel",
    location: "Sanand GIDC, Ahmedabad, GJ",
    trip: "Idle",
    updated: "5 min ago",
    lat: 23.02,
    lng: 72.57,
  },
  {
    id: "KA03",
    name: "KA03",
    status: "active",
    health: 88,
    battery: 76,
    speed: 58,
    driver: "Vijay Kumar",
    location: "Tumakuru Road, Bengaluru, KA",
    trip: "Trip #TRP1290",
    updated: "6 min ago",
    lat: 13.08,
    lng: 77.49,
  },
  {
    id: "RJ11",
    name: "RJ11",
    status: "service",
    health: 57,
    battery: 54,
    speed: 0,
    driver: "Priya Nair",
    location: "Service Bay, Jaipur, RJ",
    trip: "Maintenance",
    updated: "9 min ago",
    lat: 26.82,
    lng: 75.6,
  },
];

const statusMeta: Record<
  Severity,
  { label: string; color: string; soft: string }
> = {
  active: { label: "Active", color: "#22c55e", soft: "#dcfce7" },
  parked: { label: "Parked", color: "#3b82f6", soft: "#dbeafe" },
  warning: { label: "Warning", color: "#f59e0b", soft: "#fef3c7" },
  critical: { label: "Critical", color: "#ef4444", soft: "#fee2e2" },
  service: { label: "Service", color: "#8b5cf6", soft: "#ede9fe" },
};

const mapStatus = (status: string, health: number): Severity => {
  if (health < 55) return "critical";
  if (health < 72) return "warning";
  if (status === "active") return "active";
  if (status === "in_service") return "service";
  return "parked";
};

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
        border: `1px solid ${
          isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)
        }`,
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
    <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{title}</Typography>
    {action}
  </Box>
);

function FilterSelect({ label }: { label: string }) {
  return (
    <Select
      value="all"
      size="small"
      displayEmpty
      sx={{
        minWidth: 150,
        height: 42,
        fontSize: 12,
        ".MuiSelect-select": { py: 0.7 },
      }}
    >
      <MenuItem value="all">All {label}</MenuItem>
    </Select>
  );
}

function KpiCard({
  label,
  value,
  delta,
  icon,
  color,
  trend = "up",
}: {
  label: string;
  value: string | number;
  delta: string;
  icon: React.ReactNode;
  color: string;
  trend?: "up" | "down";
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const trendColor = trend === "up" ? "#22c55e" : "#ef4444";
  return (
    <Card
      sx={{
        p: 1.3,
        minHeight: 84,
        background: isDark
          ? `linear-gradient(135deg, ${alpha(color, 0.22)}, ${alpha(
              "#0b1724",
              0.95
            )})`
          : `linear-gradient(135deg, ${alpha(color, 0.11)}, #fff)`,
      }}
    >
      <Stack direction="row" spacing={1.2} alignItems="center">
        <Box
          sx={{
            width: 38,
            height: 38,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            bgcolor: alpha(color, isDark ? 0.26 : 0.14),
            color,
            flex: "0 0 auto",
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 25, fontWeight: 850, lineHeight: 1 }}>
            {value}
          </Typography>
          <Typography
            sx={{ fontSize: 11, color: "text.secondary", mt: 0.3 }}
            noWrap
          >
            {label}
          </Typography>
          <Stack direction="row" spacing={0.4} alignItems="center" mt={0.7}>
            {trend === "up" ? (
              <TrendingUpOutlinedIcon
                sx={{ fontSize: 14, color: trendColor }}
              />
            ) : (
              <TrendingDownOutlinedIcon
                sx={{ fontSize: 14, color: trendColor }}
              />
            )}
            <Typography
              sx={{ fontSize: 11, color: trendColor, fontWeight: 700 }}
            >
              {delta}
            </Typography>
          </Stack>
        </Box>
      </Stack>
    </Card>
  );
}

function FleetMap({ vehicles }: { vehicles: CockpitVehicle[] }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const selected = vehicles[0] || fallbackVehicles[0];
  const mapVehicles = vehicles.length ? vehicles : fallbackVehicles;

  const project = (lat: number, lng: number) => ({
    left: `${Math.max(8, Math.min(92, ((lng - 67) / 23) * 100))}%`,
    top: `${Math.max(12, Math.min(86, ((31 - lat) / 22) * 100))}%`,
  });

  return (
    <Card sx={{ p: 1.4, height: "100%", minHeight: 330 }}>
      <SectionTitle
        title="Live Fleet Map"
        action={
          <Chip label="Live" size="small" color="success" sx={{ height: 22 }} />
        }
      />
      <Box
        sx={{
          position: "relative",
          height: 300,
          borderRadius: 1.5,
          overflow: "hidden",
          bgcolor: isDark ? "#071320" : "#eaf4fb",
          backgroundImage: isDark
            ? `radial-gradient(circle at 52% 48%, ${alpha(
                "#38bdf8",
                0.16
              )}, transparent 34%), linear-gradient(145deg, #091827, #0b2236)`
            : `radial-gradient(circle at 53% 45%, ${alpha(
                "#0ea5e9",
                0.15
              )}, transparent 34%), linear-gradient(145deg, #e0f2fe, #f8fafc)`,
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            opacity: isDark ? 0.2 : 0.35,
            backgroundImage:
              "linear-gradient(rgba(125,211,252,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,.28) 1px, transparent 1px)",
            backgroundSize: "42px 42px",
          }}
        />
        <Box
          sx={{
            position: "absolute",
            left: "15%",
            right: "17%",
            top: "11%",
            bottom: "8%",
            clipPath:
              "polygon(35% 0, 55% 8%, 64% 25%, 75% 31%, 68% 49%, 72% 66%, 55% 78%, 49% 100%, 36% 83%, 25% 74%, 28% 56%, 14% 44%, 22% 27%)",
            bgcolor: isDark ? alpha("#164e63", 0.52) : alpha("#bae6fd", 0.75),
            border: `1px solid ${alpha("#38bdf8", 0.28)}`,
          }}
        />
        {["New Delhi", "Kolkata", "Mumbai", "Hyderabad", "Bengaluru"].map(
          (city, index) => (
            <Typography
              key={city}
              sx={{
                position: "absolute",
                left: ["44%", "63%", "35%", "43%", "42%"][index],
                top: ["23%", "43%", "56%", "65%", "80%"][index],
                fontSize: 10,
                color: "text.secondary",
              }}
            >
              {city}
            </Typography>
          )
        )}
        {mapVehicles.map((vehicle) => {
          const meta = statusMeta[vehicle.status];
          return (
            <Tooltip key={vehicle.id} title={`${vehicle.id} - ${meta.label}`}>
              <Box
                sx={{
                  position: "absolute",
                  ...project(vehicle.lat, vehicle.lng),
                  transform: "translate(-50%, -50%)",
                  width: vehicle.status === "active" ? 34 : 28,
                  height: vehicle.status === "active" ? 34 : 28,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: alpha(meta.color, 0.24),
                  border: `2px solid ${meta.color}`,
                  color: meta.color,
                  fontSize: 12,
                  fontWeight: 850,
                  boxShadow: `0 0 0 6px ${alpha(meta.color, 0.08)}`,
                }}
              >
                {vehicle.status === "parked" ? (
                  <DirectionsCarFilledOutlinedIcon sx={{ fontSize: 16 }} />
                ) : (
                  vehicle.id.replace(/\D/g, "").slice(-1) || "1"
                )}
              </Box>
            </Tooltip>
          );
        })}
        <Stack
          spacing={1}
          sx={{
            position: "absolute",
            left: 12,
            top: 12,
            "& .MuiIconButton-root": {
              width: 30,
              height: 30,
              borderRadius: 1,
              bgcolor: isDark ? alpha("#020617", 0.72) : alpha("#fff", 0.86),
              border: `1px solid ${alpha("#64748b", 0.25)}`,
            },
          }}
        >
          <IconButton size="small">+</IconButton>
          <IconButton size="small">-</IconButton>
          <IconButton size="small">
            <GpsFixedOutlinedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>
        <Card
          sx={{
            position: "absolute",
            right: 18,
            bottom: 34,
            width: 210,
            p: 1.2,
            bgcolor: isDark ? alpha("#020617", 0.82) : alpha("#ffffff", 0.9),
          }}
        >
          <Stack direction="row" justifyContent="space-between">
            <Typography sx={{ fontSize: 13, fontWeight: 800 }}>
              {selected.id}
            </Typography>
            <Typography
              sx={{ fontSize: 11, color: "#22c55e", fontWeight: 800 }}
            >
              Active
            </Typography>
          </Stack>
          {[
            ["Health", `${selected.health}%`],
            ["Driver", selected.driver],
            ["Battery", `${selected.battery}%`],
            ["Speed", `${selected.speed} km/h`],
            ["Location", selected.location],
          ].map(([label, value]) => (
            <Stack
              key={label}
              direction="row"
              justifyContent="space-between"
              spacing={1}
              sx={{ mt: 0.6 }}
            >
              <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                {label}
              </Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 700 }} noWrap>
                {value}
              </Typography>
            </Stack>
          ))}
        </Card>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            position: "absolute",
            left: 14,
            bottom: 12,
            p: 0.8,
            borderRadius: 1,
            bgcolor: isDark ? alpha("#020617", 0.65) : alpha("#fff", 0.78),
          }}
        >
          {(["active", "parked", "warning", "critical"] as Severity[]).map(
            (status) => (
              <Stack
                key={status}
                direction="row"
                spacing={0.6}
                alignItems="center"
              >
                <Box
                  sx={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    bgcolor: statusMeta[status].color,
                  }}
                />
                <Typography sx={{ fontSize: 11 }}>
                  {statusMeta[status].label}
                </Typography>
              </Stack>
            )
          )}
        </Stack>
      </Box>
    </Card>
  );
}

function HealthGauge({ value }: { value: number }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const option = {
    series: [
      {
        type: "gauge",
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: 100,
        radius: "92%",
        center: ["50%", "58%"],
        pointer: { show: false },
        progress: { show: true, width: 14, roundCap: false },
        axisLine: {
          lineStyle: {
            width: 14,
            color: [
              [0.55, "#ef4444"],
              [0.75, "#f59e0b"],
              [1, "#22c55e"],
            ],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        detail: {
          valueAnimation: true,
          formatter: "{value}%",
          fontSize: 28,
          fontWeight: 850,
          color: isDark ? "#e5edf7" : "#1f2937",
          offsetCenter: [0, "18%"],
        },
        data: [{ value: Math.round(value * 10) / 10 }],
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: 150 }} />;
}

function Distribution({ summary }: { summary: FleetSummary }) {
  const rows = [
    ["Active", summary.active, "#22c55e"],
    ["Parked", Math.max(summary.parked, 0), "#3b82f6"],
    ["Service", summary.in_service, "#8b5cf6"],
    ["Warning", summary.severity_counts.warning, "#f59e0b"],
    ["Critical", summary.severity_counts.critical, "#ef4444"],
  ] as const;
  const total = Math.max(summary.total, 1);
  return (
    <Card sx={{ p: 1.4 }}>
      <SectionTitle title="Fleet Status Distribution" />
      <Stack spacing={0.9}>
        {rows.map(([label, count, color]) => (
          <Stack
            key={label}
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{ minHeight: 20 }}
          >
            <Typography sx={{ width: 66, fontSize: 12 }}>{label}</Typography>
            <LinearProgress
              variant="determinate"
              value={(count / total) * 100}
              sx={{
                flex: 1,
                height: 9,
                borderRadius: 2,
                bgcolor: alpha(color, 0.12),
                ".MuiLinearProgress-bar": { bgcolor: color, borderRadius: 2 },
              }}
            />
            <Typography sx={{ width: 72, textAlign: "right", fontSize: 12 }}>
              {count}{" "}
              <Box component="span" sx={{ color: color, fontSize: 11 }}>
                ({Math.round((count / total) * 100)}%)
              </Box>
            </Typography>
          </Stack>
        ))}
      </Stack>
      <Divider sx={{ my: 1 }} />
      <Stack direction="row" justifyContent="space-between">
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          Total
        </Typography>
        <Typography sx={{ fontSize: 12, fontWeight: 800 }}>
          {summary.total} Vehicles
        </Typography>
      </Stack>
    </Card>
  );
}

function ScatterChart({ vehicles }: { vehicles: CockpitVehicle[] }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const data = (vehicles.length ? vehicles : fallbackVehicles).flatMap((v, i) =>
    Array.from({ length: 5 }, (_, point) => [
      i * 5 + point,
      Math.max(35, Math.min(98, v.health + ((point % 3) - 1) * 7)),
      statusMeta[v.status].color,
    ])
  );
  const option = {
    grid: { top: 16, left: 32, right: 12, bottom: 26 },
    tooltip: { trigger: "item" },
    xAxis: {
      type: "value",
      axisLabel: { fontSize: 10, color: isDark ? "#94a3b8" : "#64748b" },
      splitLine: { lineStyle: { color: alpha("#94a3b8", 0.18) } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { fontSize: 10, color: isDark ? "#94a3b8" : "#64748b" },
      splitLine: { lineStyle: { color: alpha("#94a3b8", 0.18) } },
    },
    series: [
      {
        type: "scatter",
        symbolSize: 8,
        data,
        itemStyle: {
          color: (p: { data: [number, number, string] }) => p.data[2],
        },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: 190 }} />;
}

function TimelineChart({ history }: { history: HealthHistoryRow[] }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const values = history.length
    ? history.slice(-32).map((d) => Math.round(d.health))
    : [
        89, 88, 86, 85, 83, 82, 80, 81, 78, 77, 76, 79, 80, 82, 81, 78, 76, 77,
        79, 81, 82, 80, 79, 78, 79, 80, 79, 81, 82, 80, 81, 82,
      ];
  const option = {
    grid: { top: 18, left: 34, right: 16, bottom: 28 },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: values.map((_, i) => `${i}`),
      axisLabel: { fontSize: 10, color: isDark ? "#94a3b8" : "#64748b" },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      axisLabel: { fontSize: 10, color: isDark ? "#94a3b8" : "#64748b" },
      splitLine: { lineStyle: { color: alpha("#94a3b8", 0.18) } },
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbol: "none",
        data: values,
        lineStyle: { color: "#3b82f6", width: 2 },
        markLine: {
          symbol: "none",
          data: [
            { yAxis: 80, lineStyle: { color: "#f59e0b", type: "dashed" } },
            { yAxis: 60, lineStyle: { color: "#ef4444", type: "dashed" } },
          ],
        },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height: 190 }} />;
}

function RecentAlerts() {
  const alerts = [
    ["DL07 Engine Temperature High", "2 min ago", "critical"],
    ["MH12 Tire Pressure Low", "5 min ago", "warning"],
    ["DL03 Back Online", "8 min ago", "active"],
    ["Battery SOC below 20%", "12 min ago", "critical"],
    ["GPS Signal Lost - GJ05", "18 min ago", "warning"],
  ] as const;
  return (
    <Card sx={{ p: 1.4, height: "100%" }}>
      <SectionTitle
        title="Recent Alerts"
        action={
          <Button size="small" variant="outlined">
            View All
          </Button>
        }
      />
      <Stack spacing={0.75}>
        {alerts.map(([label, time, severity]) => {
          const meta = statusMeta[severity];
          return (
            <Stack
              key={label}
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{
                px: 1,
                py: 0.8,
                borderRadius: 1,
                bgcolor: alpha(meta.color, 0.1),
                border: `1px solid ${alpha(meta.color, 0.22)}`,
              }}
            >
              <Stack
                direction="row"
                spacing={0.8}
                alignItems="center"
                minWidth={0}
              >
                <WarningAmberOutlinedIcon
                  sx={{ fontSize: 17, color: meta.color }}
                />
                <Typography sx={{ fontSize: 12, fontWeight: 700 }} noWrap>
                  {label}
                </Typography>
              </Stack>
              <Typography
                sx={{ fontSize: 11, color: "text.secondary", ml: 1 }}
                noWrap
              >
                {time}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
      <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 1 }}>
        12 Unread Alerts
      </Typography>
    </Card>
  );
}

function AiSummary({ summary }: { summary: FleetSummary }) {
  const items = [
    [`Fleet health is stable at ${summary.avg_health.toFixed(1)}%.`, "active"],
    [
      `${summary.severity_counts.critical} vehicles require immediate attention.`,
      "critical",
    ],
    ["Vehicle DL07 shows recurring battery degradation.", "warning"],
    ["Tire pressure anomalies increased 12% vs yesterday.", "warning"],
    [
      "Recommend scheduling maintenance for 3 vehicles within 48 hours.",
      "parked",
    ],
  ] as const;
  return (
    <Card sx={{ p: 1.4, height: "100%" }}>
      <SectionTitle
        title="AI Fleet Summary"
        action={
          <Button size="small" variant="outlined">
            View All Insights
          </Button>
        }
      />
      <Stack spacing={1.35} sx={{ mt: 1.2 }}>
        {items.map(([text, severity]) => (
          <Stack key={text} direction="row" spacing={1} alignItems="flex-start">
            <Box
              sx={{
                width: 10,
                height: 10,
                mt: 0.45,
                borderRadius: "50%",
                bgcolor: statusMeta[severity].color,
                boxShadow: `0 0 0 4px ${alpha(
                  statusMeta[severity].color,
                  0.13
                )}`,
                flex: "0 0 auto",
              }}
            />
            <Typography sx={{ fontSize: 12.5, color: "text.secondary" }}>
              {text}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Card>
  );
}

function FleetTable({ vehicles }: { vehicles: CockpitVehicle[] }) {
  const rows = vehicles.length ? vehicles : fallbackVehicles;
  return (
    <Card sx={{ p: 0, overflow: "auto" }}>
      <Box sx={{ p: 1.4, display: "flex", alignItems: "center", gap: 1.2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 850 }}>
          Fleet List
        </Typography>
        <Chip label={`${rows.length} Vehicles`} size="small" />
        <TextField
          size="small"
          placeholder="Search in table"
          InputProps={{
            startAdornment: (
              <SearchOutlinedIcon sx={{ fontSize: 18, mr: 0.7 }} />
            ),
          }}
          sx={{ width: 260, ml: 2, "& input": { fontSize: 12 } }}
        />
        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined">
          Export
        </Button>
        <IconButton size="small">
          <SettingsOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ minWidth: 980 }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns:
              "110px 120px 130px 130px 100px 160px 230px 150px 120px 80px",
            px: 1.4,
            py: 1,
            borderTop: (t) => `1px solid ${t.palette.divider}`,
            borderBottom: (t) => `1px solid ${t.palette.divider}`,
            color: "text.secondary",
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {[
            "Vehicle ID",
            "Status",
            "Health",
            "Battery",
            "Speed",
            "Driver",
            "Location",
            "Trip",
            "Updated",
            "Actions",
          ].map((h) => (
            <Box key={h}>{h}</Box>
          ))}
        </Box>
        {rows.map((vehicle) => {
          const meta = statusMeta[vehicle.status];
          return (
            <Box
              key={vehicle.id}
              sx={{
                display: "grid",
                gridTemplateColumns:
                  "110px 120px 130px 130px 100px 160px 230px 150px 120px 80px",
                alignItems: "center",
                px: 1.4,
                py: 0.9,
                borderBottom: (t) =>
                  `1px solid ${alpha(t.palette.divider, 0.75)}`,
                fontSize: 12,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  sx={{
                    width: 32,
                    height: 22,
                    borderRadius: 0.8,
                    bgcolor: alpha(meta.color, 0.16),
                    display: "grid",
                    placeItems: "center",
                    color: meta.color,
                  }}
                >
                  <LocalShippingOutlinedIcon sx={{ fontSize: 16 }} />
                </Box>
                <Typography
                  sx={{ color: "#3b82f6", fontSize: 12, fontWeight: 800 }}
                >
                  {vehicle.id}
                </Typography>
              </Stack>
              <Chip
                label={meta.label}
                size="small"
                sx={{
                  width: 76,
                  height: 22,
                  color: meta.color,
                  bgcolor: alpha(meta.color, 0.15),
                  fontWeight: 800,
                  fontSize: 11,
                }}
              />
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography
                  sx={{
                    width: 34,
                    color: meta.color,
                    fontWeight: 850,
                    fontSize: 12,
                  }}
                >
                  {vehicle.health}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={vehicle.health}
                  sx={{
                    width: 56,
                    height: 7,
                    borderRadius: 2,
                    bgcolor: alpha(meta.color, 0.14),
                    ".MuiLinearProgress-bar": { bgcolor: meta.color },
                  }}
                />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography
                  sx={{
                    width: 34,
                    color: vehicle.battery < 25 ? "#ef4444" : "#22c55e",
                    fontWeight: 850,
                    fontSize: 12,
                  }}
                >
                  {vehicle.battery}%
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={vehicle.battery}
                  sx={{
                    width: 56,
                    height: 7,
                    borderRadius: 2,
                    bgcolor: alpha("#22c55e", 0.12),
                    ".MuiLinearProgress-bar": {
                      bgcolor: vehicle.battery < 25 ? "#ef4444" : "#22c55e",
                    },
                  }}
                />
              </Stack>
              <Typography sx={{ fontSize: 12 }}>
                {vehicle.speed} km/h
              </Typography>
              <Typography sx={{ fontSize: 12 }} noWrap>
                {vehicle.driver}
              </Typography>
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                minWidth={0}
              >
                <GpsFixedOutlinedIcon
                  sx={{ fontSize: 14, color: "text.secondary" }}
                />
                <Typography sx={{ fontSize: 12 }} noWrap>
                  {vehicle.location}
                </Typography>
              </Stack>
              <Typography
                sx={{
                  fontSize: 12,
                  color: vehicle.trip === "Idle" ? "text.secondary" : "#3b82f6",
                }}
                noWrap
              >
                {vehicle.trip}
              </Typography>
              <Stack direction="row" spacing={0.6} alignItems="center">
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    bgcolor: "#22c55e",
                  }}
                />
                <Typography sx={{ fontSize: 12 }}>{vehicle.updated}</Typography>
              </Stack>
              <IconButton size="small">
                <MoreHorizOutlinedIcon fontSize="small" />
              </IconButton>
            </Box>
          );
        })}
      </Box>
    </Card>
  );
}

export default function CockpitView() {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const { data: summaryData } = useQuery<FleetSummary>({
    queryKey: ["fleet-summary"],
    queryFn: () => axios.get(`${FLEET_API}/summary`).then((r) => r.data),
    retry: 1,
  });

  const { data: positionsData } = useQuery<VehiclePosition[]>({
    queryKey: ["fleet-positions"],
    queryFn: () => axios.get(`${FLEET_API}/positions`).then((r) => r.data),
    retry: 1,
  });

  const { data: pipelineFleet } = useQuery<PipelineFleetSummary>({
    queryKey: ["pipeline-fleet-summary"],
    queryFn: () =>
      axios
        .get(`${PIPELINE_API}/api/automotive/fleet-summary`)
        .then((r) => r.data),
    retry: 1,
  });

  const healthVehicleId =
    pipelineFleet?.vehicles?.[0]?.vehicle_id ||
    positionsData?.[0]?.vehicle_id ||
    "DL01";

  const { data: healthHistory } = useQuery<HealthHistoryResponse>({
    queryKey: ["cockpit-health-history", healthVehicleId],
    queryFn: () =>
      axios
        .get(
          `${PIPELINE_API}/api/automotive/vehicle-health-history/${healthVehicleId}`
        )
        .then((r) => r.data),
    retry: 1,
    enabled: Boolean(healthVehicleId),
  });

  const vehicles = useMemo<CockpitVehicle[]>(() => {
    if (!positionsData?.length) return fallbackVehicles;
    return positionsData.slice(0, 12).map((v, index) => {
      const pipeline = pipelineFleet?.vehicles?.find(
        (item) => item.vehicle_id === v.vehicle_id
      );
      const health = Math.round(pipeline?.health_score ?? v.health ?? 75);
      const battery = Math.max(
        12,
        Math.min(
          96,
          Math.round(100 - (pipeline?.battery_contrib ?? index * 7) * 2)
        )
      );
      return {
        id: v.vehicle_id,
        name: v.name,
        status: mapStatus(v.status, health),
        health,
        battery,
        speed: Math.round(v.speed || 0),
        driver: v.driver || "Unassigned",
        location: v.route_name || v.road_type || "Live route",
        trip: v.status === "active" ? `Trip #${1280 + index}` : "Idle",
        updated: `${index + 1} min ago`,
        lat: v.lat,
        lng: v.lng,
      };
    });
  }, [pipelineFleet?.vehicles, positionsData]);

  const summary = useMemo<FleetSummary>(() => {
    const base = summaryData || fallbackSummary;
    const pipelineStats = pipelineFleet?.fleet_stats;
    return {
      ...base,
      total: pipelineStats?.total_vehicles || base.total || vehicles.length,
      avg_health: pipelineStats?.avg_health || base.avg_health,
      severity_counts: {
        normal:
          base.severity_counts?.normal ??
          vehicles.filter((v) => v.status === "active").length,
        warning:
          pipelineStats?.warning_count ??
          base.severity_counts?.warning ??
          vehicles.filter((v) => v.status === "warning").length,
        critical:
          pipelineStats?.critical_count ??
          base.severity_counts?.critical ??
          vehicles.filter((v) => v.status === "critical").length,
      },
    };
  }, [pipelineFleet?.fleet_stats, summaryData, vehicles]);

  const avgBattery = Math.round(
    vehicles.reduce((sum, vehicle) => sum + vehicle.battery, 0) /
      vehicles.length
  );

  return (
    <Box
      sx={{
        minHeight: "calc(100vh - 64px)",
        p: 0.5,
        color: "text.primary",
        background: isDark
          ? "linear-gradient(145deg, #06111d 0%, #0b1724 52%, #0d1b2a 100%)"
          : "linear-gradient(145deg, #f8fafc 0%, #eef6ff 52%, #f7fbff 100%)",
      }}
    >
      <Stack spacing={1}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", lg: "flex-start" }}
          spacing={1}
        >
          <Box>
            <Typography sx={{ fontSize: 20, fontWeight: 900 }}>
              Fleet Overview
            </Typography>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
              Real-time overview of your entire fleet
            </Typography>
          </Box>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
          >
            <Button
              variant="outlined"
              startIcon={<CalendarTodayOutlinedIcon />}
              sx={{ height: 36 }}
            >
              Today
            </Button>
            <TextField
              size="small"
              placeholder="Search Vehicle / Driver / Location"
              InputProps={{
                startAdornment: (
                  <SearchOutlinedIcon sx={{ fontSize: 18, mr: 1 }} />
                ),
              }}
              sx={{
                width: { xs: "100%", sm: 360 },
                "& input": { fontSize: 12 },
              }}
            />
            <Tooltip title="Notifications">
              <IconButton>
                <NotificationsNoneOutlinedIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>

        <Card sx={{ p: 1 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <FilterSelect label="Plants" />
            <FilterSelect label="Regions" />
            <FilterSelect label="Types" />
            <FilterSelect label="Drivers" />
            <FilterSelect label="Health" />
            <FilterSelect label="Trips" />
            <FilterSelect label="Battery" />
            <IconButton
              sx={{
                border: (t) => `1px solid ${t.palette.divider}`,
                borderRadius: 1,
              }}
            >
              <MoreHorizOutlinedIcon />
            </IconButton>
            <Box sx={{ flex: 1 }} />
            <Button variant="outlined" startIcon={<FilterAltOutlinedIcon />}>
              More Filters
            </Button>
          </Stack>
        </Card>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              lg: "repeat(4, 1fr)",
              xl: "repeat(8, 1fr)",
            },
            gap: 1,
          }}
        >
          <KpiCard
            label="Total Fleet"
            value={summary.total}
            delta="2 vs yesterday"
            icon={<LocalShippingOutlinedIcon />}
            color="#3b82f6"
          />
          <KpiCard
            label="Active Vehicles"
            value={summary.active}
            delta="3 vs yesterday"
            icon={<HealthAndSafetyOutlinedIcon />}
            color="#22c55e"
          />
          <KpiCard
            label="Critical Vehicles"
            value={summary.severity_counts.critical}
            delta="1 vs yesterday"
            icon={<ShieldOutlinedIcon />}
            color="#ef4444"
          />
          <KpiCard
            label="Warning Vehicles"
            value={summary.severity_counts.warning}
            delta="2 vs yesterday"
            icon={<WarningAmberOutlinedIcon />}
            color="#f59e0b"
            trend="down"
          />
          <KpiCard
            label="Due for Service"
            value={summary.in_service}
            delta="Today"
            icon={<SettingsOutlinedIcon />}
            color="#8b5cf6"
          />
          <KpiCard
            label="Avg. Battery SOC"
            value={`${avgBattery}%`}
            delta="4% vs yesterday"
            icon={<ElectricBoltOutlinedIcon />}
            color="#14b8a6"
          />
          <KpiCard
            label="Avg. Tire Health"
            value="82%"
            delta="2% vs yesterday"
            icon={<TimelineOutlinedIcon />}
            color="#0ea5e9"
          />
          <KpiCard
            label="Alerts (Last 1 Hr)"
            value="12"
            delta="4 vs yesterday"
            icon={<ErrorOutlineOutlinedIcon />}
            color="#ef4444"
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", xl: "1.9fr 1fr 0.8fr" },
            gap: 1,
            alignItems: "stretch",
          }}
        >
          <FleetMap vehicles={vehicles} />
          <AiSummary summary={summary} />
          <RecentAlerts />
        </Box>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", lg: "1fr 1.35fr 1.55fr" },
            gap: 1,
          }}
        >
          <Card sx={{ p: 1.4 }}>
            <SectionTitle
              title="Fleet Health Scatter"
              action={
                <Chip
                  label="Average Health 77%"
                  size="small"
                  variant="outlined"
                />
              }
            />
            <ScatterChart vehicles={vehicles} />
          </Card>
          <Card sx={{ p: 1.4 }}>
            <SectionTitle
              title="Vehicle Health Timeline"
              action={
                <Chip label={healthVehicleId} size="small" variant="outlined" />
              }
            />
            <TimelineChart history={healthHistory?.data || []} />
          </Card>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1.1fr" },
              gap: 1,
            }}
          >
            <Distribution summary={summary} />
            <Card sx={{ p: 1.4 }}>
              <SectionTitle title="Overall Fleet Health" />
              <HealthGauge value={summary.avg_health} />
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 1,
                }}
              >
                {[
                  ["Excellent", 18, "#22c55e"],
                  ["Good", 12, "#84cc16"],
                  ["Warning", summary.severity_counts.warning, "#f59e0b"],
                  ["Critical", summary.severity_counts.critical, "#ef4444"],
                ].map(([label, count, color]) => (
                  <Box
                    key={label}
                    sx={{
                      p: 0.9,
                      textAlign: "center",
                      borderRadius: 1,
                      bgcolor: alpha(String(color), 0.12),
                      border: `1px solid ${alpha(String(color), 0.18)}`,
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 18,
                        color: String(color),
                        fontWeight: 900,
                      }}
                    >
                      {count}
                    </Typography>
                    <Typography sx={{ fontSize: 11 }}>{label}</Typography>
                  </Box>
                ))}
              </Box>
            </Card>
          </Box>
        </Box>

        <Card sx={{ p: 1.4 }}>
          <SectionTitle title="Operational Metrics (Today)" />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
                xl: "repeat(6, 1fr)",
              },
              gap: 1,
            }}
          >
            {[
              ["3,241 km", "Distance Traveled", "8.5%", "#22c55e"],
              ["420 L", "Fuel Consumed", "4.3%", "#ef4444"],
              ["3h 15m", "Total Idle Time", "6.2%", "#22c55e"],
              ["54", "Trips Completed", "12.5%", "#22c55e"],
              ["47 km/h", "Avg. Speed", "3.1%", "#22c55e"],
              ["220 kg", "CO2 Saved", "9.7%", "#22c55e"],
            ].map(([value, label, delta, color]) => (
              <Box
                key={label}
                sx={{
                  p: 1.2,
                  textAlign: "center",
                  borderRadius: 1,
                  border: (t) => `1px solid ${t.palette.divider}`,
                  bgcolor: alpha(String(color), 0.05),
                }}
              >
                <Typography sx={{ fontSize: 16, fontWeight: 900 }}>
                  {value}
                </Typography>
                <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                  {label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 11,
                    color: String(color),
                    fontWeight: 800,
                    mt: 0.3,
                  }}
                >
                  {delta}
                </Typography>
              </Box>
            ))}
          </Box>
        </Card>

        <FleetTable vehicles={vehicles} />
      </Stack>
    </Box>
  );
}
