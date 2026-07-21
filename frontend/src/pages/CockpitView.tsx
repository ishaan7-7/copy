import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import ReactECharts from "echarts-for-react";
import {
  Box,
  Paper,
  Typography,
  Drawer,
  IconButton,
  Tabs,
  Tab,
  LinearProgress,
  Chip,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Grid,
  Dialog,
  DialogContent,
  DialogTitle,
  Tooltip,
  Popover,
  Stack,
  TextField,
  Button,
  CircularProgress,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Tooltip as LeafletTooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Pagination from "@mui/material/Pagination";

import { alpha, useTheme } from "@mui/material/styles";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import DirectionsCarFilledOutlinedIcon from "@mui/icons-material/DirectionsCarFilledOutlined";
import ElectricBoltOutlinedIcon from "@mui/icons-material/ElectricBoltOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import FilterAltOutlinedIcon from "@mui/icons-material/FilterAltOutlined";
import GpsFixedOutlinedIcon from "@mui/icons-material/GpsFixedOutlined";
import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import LocalGasStationOutlinedIcon from "@mui/icons-material/LocalGasStationOutlined";
import AirportShuttleOutlinedIcon from "@mui/icons-material/AirportShuttleOutlined";
import DirectionsBusFilledOutlinedIcon from "@mui/icons-material/DirectionsBusFilledOutlined";
import TwoWheelerOutlinedIcon from "@mui/icons-material/TwoWheelerOutlined";
import MoreHorizOutlinedIcon from "@mui/icons-material/MoreHorizOutlined";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import TipsAndUpdatesOutlinedIcon from "@mui/icons-material/TipsAndUpdatesOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import DonutSmallIcon from "@mui/icons-material/DonutSmall";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";
import DirectionsCarFilledIcon from "@mui/icons-material/DirectionsCarFilled";
import RouteIcon from "@mui/icons-material/Route";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import CloseIcon from "@mui/icons-material/Close";

import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import AspectRatioOutlinedIcon from "@mui/icons-material/AspectRatioOutlined";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ExploreIcon from "@mui/icons-material/Explore";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import Draggable from "react-draggable";
import { useStore } from "../store";
import { useGoldStream } from "../contexts/GoldStreamContext";
const FLEET_API = "http://127.0.0.1:8009/api/fleet";
const PIPELINE_API = "http://127.0.0.1:8005";
const _eventIconCache: Record<string, L.DivIcon> = Object.create(null);
const SCATTER_CAP = 300;
const VEHICLE_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#f97316",
  "#6366f1",
  "#14b8a6",
  "#a855f7",
];

type Severity = "active" | "parked" | "warning" | "critical" | "service";

type FleetFilter =
  | "ALL"
  | "ACTIVE"
  | "PARKED"
  | "SERVICE"
  | "CRITICAL"
  | "WARNING";

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
  engine_health?: number;
  driver: string;
  driver_score: number;
  road_type: string;
  route_name: string;
}

interface PipelineVehicle {
  vehicle_id: string;
  health_score: number;
  battery_contrib?: number;
  engine_contrib?: number;
  transmission_contrib?: number;
  body_contrib?: number;
  tyre_contrib?: number;
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

interface TripData {
  route: { lat: number; lng: number; road_type: string }[];
  completed_index: number;
  progress_pct: number;
  distance_completed_km: number;
  distance_total_km: number;
  events: {
    lat: number;
    lng: number;
    type: string;
    acc_x: number;
    acc_y: number;
    speed: number;
    distance_km: number;
  }[];
  origin: string;
  destination: string;
  route_name: string;
}

interface VehicleDetail {
  vehicle_id: string;
  name: string;
  type: string;
  status: string;
  health: number;
  composite: number;
  driver: string;
  module_health: Record<string, number>;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  driver_score: number;
  road_type: string;
  route_name?: string;
  route_origin?: string;
  route_destination?: string;
  elapsed_km?: number;
  total_km?: number;
  city?: string;
}

interface BehaviorData {
  current_score: number;
  score_timeline: {
    distance_km: number;
    score: number;
    event_type: string | null;
  }[];
  traction_circle: { acc_x: number; acc_y: number; speed: number }[];
  risk_radar: {
    braking_per_100km: number;
    accel_per_100km: number;
    cornering_per_100km: number;
  };
  speed_by_road: Record<
    string,
    {
      min: number;
      q1: number;
      median: number;
      q3: number;
      max: number;
      mean: number;
    }
  >;
  event_summary: {
    braking: number;
    accel: number;
    cornering: number;
    total: number;
  };
  trip_distance_km: number;
}

interface LastTripData {
  last_trip: {
    trip_id: string;
    start_time: string;
    end_time: string;
    distance_km: number;
    duration_secs: number;
    avg_speed_kmh: number;
    max_speed_kmh: number;
    harsh_braking_count: number;
    harsh_accel_count: number;
    harsh_cornering_count: number;
    event_count: number;
  } | null;
  driver_summary: {
    score: number;
    total_km: number;
    total_hours: number;
    harsh_braking_count: number;
    harsh_accel_count: number;
    harsh_cornering_count: number;
  };
  is_historical: boolean;
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

const LegendItem = ({
  color,
  label,
  value,
  selected,
  onClick,
}: {
  color: string;
  label: string;
  value: number;
  selected: boolean;
  onClick: () => void;
}) => (
  <Stack
    direction="row"
    justifyContent="space-between"
    alignItems="center"
    onClick={onClick}
    sx={{
      px: 0.75,
      py: 0.35,
      borderRadius: 1,
      cursor: "pointer",
      transition: "all .2s",

      bgcolor: selected ? "action.selected" : "transparent",

      "&:hover": {
        bgcolor: "action.hover",
      },
    }}
  >
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          bgcolor: color,
          flexShrink: 0,
        }}
      />
      <Typography fontSize={11}>{label}</Typography>
    </Stack>
    <Typography fontWeight={600} fontSize={11}>
      {value}
    </Typography>
  </Stack>
);

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
        bgcolor: isDark ? alpha("#0b1724", 0.95) : alpha("#ffffff", 0.96),
        backgroundImage: isDark
          ? "linear-gradient(145deg, rgba(16,34,53,0.95), rgba(7,17,30,0.98))"
          : "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(255,250,247,0.96))",
        border: `1px solid ${
          isDark ? alpha("#7dd3fc", 0.16) : alpha("#fb4e0b", 0.16)
        }`,
        boxShadow: isDark
          ? `0 18px 42px ${alpha("#000", 0.22)}`
          : `0 12px 30px ${alpha("#0f2f45", 0.08)}`,
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
      gap: 0.5,
      mb: 0.5,
      fontSize: "var(--app-font-lg)",
    }}
  >
    <Typography
      sx={{
        fontSize: "var(--app-font-md)",
        fontWeight: 800,
        lineHeight: 1.15,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {title}
    </Typography>
    {action}
  </Box>
);

const _iconCache: Record<string, L.DivIcon> = {};

function injectVehicleIconStyles() {
  if (typeof document === "undefined") return;
  const existing = document.getElementById("vc-pulse-style");
  if (existing) existing.remove();
  const s = document.createElement("style");
  s.id = "vc-pulse-style";
  s.textContent = `@keyframes vc-ping{0%{transform:scale(1);opacity:0}40%{opacity:.4}100%{transform:scale(1.35);opacity:0}}@keyframes vc-ping-dark{0%{transform:scale(1.3);opacity:0}15%{opacity:.40}100%{transform:scale(1.42);opacity:0}}.vc-pulse{animation:vc-ping 3.5s ease-in-out infinite;pointer-events:none;position:absolute;border-radius:50%;}.vc-pulse-dark{animation:vc-ping-dark 3.5s ease-in-out infinite;pointer-events:none;position:absolute;border-radius:50%;}`;
  document.head.appendChild(s);
}

function createVehicleIcon(
  status: string,
  health: number,
  heading: number,
  isDark: boolean = false
): L.DivIcon {
  injectVehicleIconStyles();
  let outerColor = "#6B7280";

  switch (status) {
    case "active":
      outerColor = "#16A34A";
      break;

    case "parked":
      outerColor = "#2563EB";
      break;

    case "in_service":
      outerColor = "#7C3AED";
      break;

    default:
      outerColor = "#6B7280";
  }

  let innerColor = "#10B981";

  if (health < 50) {
    innerColor = "#EF4444";
  } else if (health < 80) {
    innerColor = "#F59E0B";
  }

  const hdgBucket = status === "active" ? Math.round(heading / 15) * 15 : 0;

  const cacheKey = `${status}_${outerColor}_${innerColor}_${hdgBucket}_${
    isDark ? "d" : "l"
  }`;

  if (_iconCache[cacheKey]) {
    return _iconCache[cacheKey];
  }

  const outerSize = status === "active" ? 20 : 18;
  const innerSize = status === "active" ? 8 : 7;
  const total = outerSize + 14;

  const arrow =
    status === "active"
      ? `<svg
          style="position:absolute;top:-10px;left:50%;transform:translateX(-50%) rotate(${hdgBucket}deg);overflow:visible;pointer-events:none;"
          width="10" height="9" viewBox="0 0 10 9"
        >
          <polygon points="5,0 9.5,9 5,6.5 0.5,9"
            fill="${outerColor}"
            stroke="rgba(255,255,255,0.85)"
            stroke-width="1.2"
            stroke-linejoin="round"
          />
        </svg>`
      : "";

  const icon = L.divIcon({
    className: "",
    iconSize: [total, total],
    iconAnchor: [total / 2, total / 2],
    html: `<div style="position:relative;width:${total}px;height:${total}px;display:flex;align-items:center;justify-content:center;">
        ${
          status === "active"
            ? `<div class="${
                isDark ? "vc-pulse-dark" : "vc-pulse"
              }" style="width:${outerSize}px;height:${outerSize}px;border:${
                isDark ? `1.5px solid #4ade80` : `1.5px solid ${outerColor}`
              };"></div>`
            : ""
        }
        ${arrow}
        <div style="
          width:${outerSize}px;
          height:${outerSize}px;
          border-radius:50%;
          background:${outerColor};
          display:flex;
          align-items:center;
          justify-content:center;
          box-shadow:0 0 0 1.5px rgba(255,255,255,0.9),0 2px 7px rgba(0,0,0,0.45);
        ">
          <div style="
            width:${innerSize}px;
            height:${innerSize}px;
            border-radius:50%;
            background:${innerColor};
            box-shadow:0 0 0 2px rgba(255,255,255,0.9);
          "></div>
        </div>
      </div>`,
  });

  _iconCache[cacheKey] = icon;

  return icon;
}

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

const CHART_FONT = '"Inter", "Segoe UI", Roboto, Arial, sans-serif';

const commonGrid = {
  top: 24,
  left: 22,
  right: 20,
  bottom: 72,
  containLabel: true,
};

function KpiCard({
  label,
  value,
  delta,
  icon,
  color,
  iconLogo,
  trend = "up",
  selected = false,
  onClick,
}: {
  label: string;
  value: string | number;
  delta: string;
  iconLogo: boolean;
  icon: React.ReactNode;
  color: string;
  trend?: "up" | "down";
  selected?: boolean;
  onClick?: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const trendColor =
    trend === "up"
      ? label === "Avg Engine Health"
        ? "#22c55e"
        : "#ef4444"
      : label === "Active Vehicles"
      ? "#ef4444"
      : "#22c55e";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
      style={{ cursor: "pointer", borderRadius: 12 }}
    >
      <Card
        sx={{
          p: { xs: 0.55, lg: 0.7, xl: 0.9 },
          minHeight: { xs: 62, lg: 74, xl: 58 },
          height: "auto",
          transition: "all .25s ease",

          border: selected ? `2px solid ${color}` : "1px solid",

          borderColor: selected ? color : "divider",

          transform: selected ? "translateY(-2px)" : "none",

          boxShadow: selected ? `0 8px 24px ${alpha(color, 0.3)}` : 2,

          "&:hover": {
            transform: "translateY(-3px)",
            boxShadow: `0 10px 28px ${alpha(color, 0.25)}`,
          },

          background: isDark
            ? `linear-gradient(135deg, ${alpha(color, 0.2)}, ${alpha(
                "#07111e",
                0.97
              )})`
            : `linear-gradient(135deg, ${alpha(color, 0.11)}, #fff)`,
        }}
      >
        <Stack direction="row" spacing={0.6} alignItems="center">
          <Box
            sx={{
              width: { xs: 28, lg: 35, xl: 42 },
              height: { xs: 28, lg: 35, xl: 42 },
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
            <Typography
              sx={{
                fontSize: { xs: 14, lg: 18, xl: 22 },
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              {value}
            </Typography>
            <Typography
              sx={{
                fontSize: "var(--app-font-sm)",
                color: "text.secondary",
                mt: 0.5,
              }}
              noWrap
            >
              {label}
            </Typography>
            <Stack direction="row" spacing={0.4} alignItems="center" mt={0.7}>
              {iconLogo === true ? (
                <>
                  {trend === "up" ? (
                    <TrendingUpOutlinedIcon
                      sx={{ fontSize: "10px", color: trendColor }}
                    />
                  ) : (
                    <TrendingDownOutlinedIcon
                      sx={{ fontSize: "10px", color: trendColor }}
                    />
                  )}
                </>
              ) : (
                ""
              )}
              <Typography
                sx={{
                  fontSize: "var(--app-font-xs)",
                  color: trendColor,
                  fontWeight: 600,
                }}
              >
                {delta}
              </Typography>
            </Stack>
          </Box>
        </Stack>
      </Card>
    </div>
  );
}

function DistributionChart({ summary }: { summary: FleetSummary }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const option = {
    tooltip: {
      trigger: "item",
      backgroundColor: isDark ? "#0f1f31" : "#ffffff",
      borderColor: isDark ? "#334155" : "#e2e8f0",
      borderWidth: 1,
      textStyle: {
        fontSize: 11,
        color: isDark ? "#e2e8f0" : "#111827",
        whiteSpace: "nowrap",
      },
      radius: ["55%", "80%"],
      center: ["50%", "50%"],
      avoidLabelOverlap: false,

      extraCssText: `
          white-space: nowrap;
          padding: 6px 10px;
          border-radius: 8px;
        `,

      formatter: ({ marker, name, value, percent }: any) =>
        `
          <div style="
            display:flex;
            align-items:center;
            gap:8px;
            white-space:nowrap;
          ">
            ${marker}
            <span style="min-width:70px">
              ${name}
            </span>
    
            <span style="
              font-weight:700;
              color:${isDark ? "#e2e8f0" : "#111827"};
            ">
              ${value}
            </span>
    
         
          </div>
        `,
    },

    legend: {
      show: false,
    },

    series: [
      {
        type: "pie",

        // radius: ["55%", "80%"],

        // center: ["50%", "50%"],

        // avoidLabelOverlap: true,
        radius: ["55%", "80%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 0,
          borderColor: isDark ? "#07111e" : "#fff",
          borderWidth: 2,
        },

        label: {
          show: false,
        },

        labelLine: {
          show: false,
        },

        emphasis: {
          scale: true,

          label: {
            show: false,
          },
        },

        data: [
          {
            value: summary.active,
            name: "Active",
            itemStyle: { color: "#22c55e" },
          },
          {
            value:
              summary.parked -
              (summary?.severity_counts?.warning +
                summary?.severity_counts?.critical -
                summary.in_service),
            name: "Parked",
            itemStyle: { color: "#3b82f6" },
          },
          {
            value: summary.in_service,
            name: "In Workshop",
            itemStyle: { color: "#f59e0b" },
          },
          {
            value: summary?.severity_counts?.warning,
            name: "Warning",
            itemStyle: { color: "#eab308" },
          },
          {
            value: summary?.severity_counts?.critical,
            name: "Critical",
            itemStyle: { color: "#ef4444" },
          },
        ],
      },
    ],
  };

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1,
        minWidth: 170,
        borderRadius: 3,
        bgcolor: alpha("#3b82f6", 0.05),
        border: `1px solid ${alpha("#3b82f6", 0.12)}`,

        display: "flex",
        flexDirection: "column",
        gap: 1,

        // "&:hover": {
        //   boxShadow: 3,
        //   transform: "translateY(-2px)",
        // },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <DonutSmallIcon
          sx={{
            color: "#3b82f6",
            fontSize: 18,
          }}
        />

        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            color: "#3b82f6",
          }}
        >
          Fleet Distribution
        </Typography>
      </Box>

      {/* Chart Center */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          py: 0,
        }}
      >
        <ReactECharts
          option={option}
          style={{
            width: 100,
            height: 100,
          }}
        />
      </Box>

      {/* Legends */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          justifyContent: "center",
        }}
      >
        {[
          {
            label: "Active",
            count: summary.active,
            color: "#22c55e",
          },
          {
            label: "Parked",
            count:
              summary.parked -
              (summary?.severity_counts?.warning +
                summary?.severity_counts?.critical -
                summary.in_service),
            color: "#3b82f6",
          },
          {
            label: "Service",
            count: summary.in_service,
            color: "#f59e0b",
          },
          {
            label: "Warning",
            count: summary?.severity_counts?.warning,
            color: "#eab308",
          },
          {
            label: "Critical",
            count: summary?.severity_counts?.critical,
            color: "#ef4444",
          },
        ].map((item) => (
          <Box
            key={item.label}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.4,
              borderRadius: 10,
              bgcolor: alpha(item.color, 0.08),
            }}
          >
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: item.color,
              }}
            />

            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              {item.label}

              <Box
                component="span"
                sx={{
                  ml: 0.5,
                  color: "text.secondary",
                }}
              >
                {item.count}
              </Box>
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

const getHealthStatus = (health: number) => {
  if (health >= 90) {
    return {
      label: "Excellent",
      color: "#16a34a", // Dark Green
    };
  }

  if (health > 80) {
    return {
      label: "Good",
      color: "#22c55e", // Green
    };
  }

  if (health >= 60) {
    return {
      label: "Average",
      color: "#f59e0b", // Orange
    };
  }

  return {
    label: "Poor",
    color: "#ef4444", // Red
  };
};

function Distribution({ summary }: { summary: FleetSummary }) {
  const rows = [
    ["Active", summary.active, "#22c55e"],
    ["Parked", Math.max(summary.parked, 0), "#3b82f6"],
    ["Service", summary.in_service, "#8b5cf6"],
    ["Warning", summary?.severity_counts?.warning, "#f59e0b"],
    ["Critical", summary?.severity_counts?.critical, "#ef4444"],
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
function ScoreGauge({ score, label }: { score: number; label: string }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";
  const option = {
    series: [
      {
        type: "gauge" as const,
        startAngle: 220,
        endAngle: -40,
        min: 0,
        max: 100,
        pointer: { show: false },
        progress: {
          show: true,
          overlap: false,
          roundCap: true,
          width: 10,
          itemStyle: { color },
        },
        axisLine: {
          lineStyle: {
            width: 10,
            color: [[1, isDark ? "#1e293b" : "#e5e7eb"]],
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        title: {
          show: true,
          offsetCenter: [0, "65%"],
          fontSize: 10,
          color: isDark ? "#64748b" : "#999",
        },
        detail: {
          valueAnimation: true,
          fontSize: 22,
          fontWeight: 700,
          offsetCenter: [0, "15%"],
          color,
        },
        data: [{ value: Math.round(score), name: label }],
      },
    ],
  };
  return (
    <ReactECharts
      option={option}
      style={{ width: 140, height: 120 }}
      lazyUpdate
      notMerge={false}
    />
  );
}

function ScoreTimeline({ data }: { data: BehaviorData }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const timeline = data.score_timeline;

  const factor = Math.max(1, Math.floor(timeline.length / 300));
  const sampled =
    factor === 1 ? timeline : timeline.filter((_, i) => i % factor === 0);

  const eventScatter: [number, number][] = [];
  sampled.forEach((t, idx) => {
    if (t.event_type) eventScatter.push([idx, t.score]);
  });

  const option = {
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: {
      trigger: "axis" as const,
      textStyle: { fontSize: 10, color: isDark ? "#e2e8f0" : "#111827" },
      backgroundColor: isDark ? "#0f1f31" : "#fff",
      borderColor: isDark ? "#334155" : "#e2e8f0",
    },
    xAxis: {
      type: "category" as const,
      data: sampled.map((t) => t.distance_km),
      name: "km",
      nameTextStyle: { fontSize: 9 },
      axisLabel: {
        fontSize: 9,
        color: isDark ? "#8a9bb0" : "#666",
        interval: Math.max(0, Math.floor(sampled.length / 6)),
      },
    },
    yAxis: {
      type: "value" as const,
      min: 0,
      max: 105,
      name: "Score",
      nameTextStyle: { fontSize: 9 },
      axisLabel: { fontSize: 9, color: isDark ? "#8a9bb0" : "#666" },
    },
    series: [
      {
        type: "line" as const,
        data: sampled.map((t) => t.score),
        smooth: true,
        lineStyle: { width: 2, color: "#3b82f6" },
        symbol: "none",
        areaStyle: {
          color: {
            type: "linear" as const,
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: alpha("#3b82f6", 0.3) },
              { offset: 1, color: alpha("#3b82f6", 0.02) },
            ],
          },
        },
      },
      {
        type: "scatter" as const,
        data: eventScatter,
        symbol: "circle",
        symbolSize: 8,
        itemStyle: { color: "#ef4444", borderColor: "#fff", borderWidth: 1 },
        z: 10,
      },
    ],
  };
  return (
    <ReactECharts
      option={option}
      style={{ height: 180 }}
      lazyUpdate
      notMerge={false}
    />
  );
}

function TractionCircle({ data }: { data: BehaviorData }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const pts = data.traction_circle;
  const option = {
    grid: { top: 10, right: 10, bottom: 30, left: 40 },
    tooltip: {
      trigger: "item" as const,
      backgroundColor: isDark ? "#0f1f31" : "#fff",
      borderColor: isDark ? "#334155" : "#e2e8f0",
      textStyle: { fontSize: 10, color: isDark ? "#e2e8f0" : "#111827" },
      formatter: (p: { data: number[] }) =>
        `Lat: ${p.data[0]}g  Lon: ${p.data[1]}g  Spd: ${p.data[2]} km/h`,
    },
    xAxis: {
      type: "value" as const,
      min: -1.2,
      max: 1.2,
      name: "Lateral G",
      nameTextStyle: { fontSize: 9 },
      axisLabel: { fontSize: 8 },
    },
    yAxis: {
      type: "value" as const,
      min: -1.2,
      max: 1.2,
      name: "Longitudinal G",
      nameTextStyle: { fontSize: 9 },
      axisLabel: { fontSize: 8 },
    },
    visualMap: {
      show: true,
      dimension: 2,
      min: 0,
      max: 140,
      inRange: { color: ["#440154", "#31688e", "#35b779", "#fde725"] },
      textStyle: { fontSize: 9 },
      right: 0,
      top: "center",
      itemHeight: 80,
    },
    series: [
      {
        type: "scatter" as const,
        data: pts.map((p) => [p.acc_y, p.acc_x, p.speed]),
        symbolSize: 4,
        itemStyle: { opacity: 0.6 },
      },
    ],
    graphic: [
      {
        type: "circle" as const,
        shape: { cx: 0, cy: 0, r: 0 },
        style: {
          stroke: "#ef4444",
          lineDash: [4, 4],
          fill: "none",
          lineWidth: 1,
        },
        position: ["50%", "50%"],
      },
    ],
  };
  return (
    <ReactECharts
      option={option}
      style={{ height: 220 }}
      lazyUpdate
      notMerge={false}
    />
  );
}

function RiskRadar({ data }: { data: BehaviorData }) {
  const r = data.risk_radar;
  const maxVal = Math.max(
    r.braking_per_100km,
    r.accel_per_100km,
    r.cornering_per_100km,
    10
  );
  const option = {
    radar: {
      indicator: [
        { name: "Braking", max: maxVal * 1.2 },
        { name: "Acceleration", max: maxVal * 1.2 },
        { name: "Cornering", max: maxVal * 1.2 },
      ],
      radius: 50,
      name: { textStyle: { fontSize: 8 } },
    },
    series: [
      {
        type: "radar" as const,
        data: [
          {
            value: [
              r.braking_per_100km,
              r.accel_per_100km,
              r.cornering_per_100km,
            ],
            areaStyle: { color: alpha("#ef4444", 0.2) },
            lineStyle: { color: "#ef4444" },
            itemStyle: { color: "#ef4444" },
          },
        ],
      },
    ],
  };
  return (
    <ReactECharts
      option={option}
      style={{ height: 120 }}
      lazyUpdate
      notMerge={false}
    />
  );
}

function SpeedByRoad({ data }: { data: BehaviorData }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const roads = Object.entries(data.speed_by_road);
  if (roads.length === 0)
    return (
      <Typography variant="caption" color="text.secondary">
        Insufficient data
      </Typography>
    );

  const option = {
    grid: { top: 10, right: 10, bottom: 30, left: 60 },
    tooltip: {
      trigger: "item" as const,
      textStyle: { fontSize: 10, color: isDark ? "#e2e8f0" : "#111827" },
      backgroundColor: isDark ? "#0f1f31" : "#fff",
      borderColor: isDark ? "#334155" : "#e2e8f0",
    },
    xAxis: {
      type: "value" as const,
      name: "km/h",
      nameTextStyle: { fontSize: 9 },
      axisLabel: { fontSize: 9 },
    },
    yAxis: {
      type: "category" as const,
      data: roads.map(([r]) => r.charAt(0).toUpperCase() + r.slice(1)),
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        type: "boxplot" as const,
        data: roads.map(([, s]) => [s.min, s.q1, s.median, s.q3, s.max]),
        itemStyle: { color: "#3b82f6", borderColor: "#2563eb" },
      },
    ],
  };
  return (
    <ReactECharts
      option={option}
      style={{ height: 160 }}
      lazyUpdate
      notMerge={false}
    />
  );
}

// function ScatterChart({ vehicles }: { vehicles: CockpitVehicle[] }) {
//   const VEHICLE_COLORS = [
//     "#e57373",
//     "#ffb74d",
//     "#81c784",
//     "#ba68c8",
//     "#4dd0e1",
//     "#42a5f5",
//     "#ff8a65",
//     "#90a4ae",
//     "#f48fb1",
//     "#aed581",
//   ];

//   const hasData =
//     fleetHealthScatter && fleetHealthScatter.some((v) => v.data.length > 0);

//   let fleetScatterOption = {};

//   if (hasData) {
//     const allTs = new Set();

//     fleetHealthScatter.forEach((vh) =>
//       vh.data.forEach((r) => allTs.add(r.ts || r.timestamp || ""))
//     );

//     const sortedTs = Array.from(allTs).sort();

//     const series = fleetHealthScatter.map((vehicle, idx) => ({
//       name: vehicle.vehicle_id,

//       type: "scatter",

//       symbol: "circle",

//       z: 1,
//       zlevel: 1,

//       data: vehicle.data.map((r) => [r.ts || r.timestamp, r.health ?? 0]),

//       symbolSize: (val) => Math.max(8, (val[1] / 100) * 14),

//       itemStyle: {
//         color: VEHICLE_COLORS[idx % VEHICLE_COLORS.length],

//         opacity: 0.72,

//         borderWidth: 1,

//         borderColor: "#fff",

//         shadowBlur: 3,

//         shadowColor: VEHICLE_COLORS[idx % VEHICLE_COLORS.length],
//       },

//       emphasis: {
//         scale: 1.15,
//       },
//     }));

//     fleetScatterOption = {
//       animation: false,

//       tooltip: {
//         trigger: "item",

//         textStyle: {
//           fontSize: 10,
//         },

//         formatter: (p) => `
//       <b>${p.seriesName}</b>
//       <br/>
//       ${p.data[0]}
//       <br/>
//       Health: ${p.data[1]}%
//     `,
//       },

//       grid: commonGrid,

//       xAxis: {
//         ...commonXAxis,

//         data: sortedTs,

//         axisLabel: {
//           ...commonXAxis.axisLabel,

//           formatter: (v) => String(v).slice(5, 16).replace("T", " "),
//         },
//       },

//       yAxis: {
//         ...commonYAxis,
//       },

//       dataZoom: [
//         {
//           type: "inside",
//         },

//         {
//           type: "slider",

//           height: 22,

//           bottom: 10,

//           moveHandleSize: 8,

//           handleSize: "90%",
//         },
//       ],

//       series: [
//         ...series,

//         {
//           type: "line",

//           data: [[]],

//           silent: true,

//           lineStyle: {
//             opacity: 0,
//           },

//           markLine: {
//             silent: true,

//             symbol: ["none", "none"],

//             data: [
//               {
//                 yAxis: 60,

//                 label: {
//                   formatter: "CRITICAL",

//                   color: "#d32f2f",

//                   position: "insideStartBottom",

//                   offset: [12, 10],

//                   fontSize: "10px",
//                 },

//                 position: "insideStartBottom",

//                 lineStyle: {
//                   color: "#d32f2f",

//                   width: 5,

//                   type: "dotted",
//                 },
//               },

//               {
//                 yAxis: 80,

//                 label: {
//                   formatter: "WARNING",

//                   color: "#ed6c02",

//                   position: "insideStartBottom",

//                   offset: [12, 10],

//                   fontSize: "10px",
//                 },

//                 position: "insideStartBottom",

//                 lineStyle: {
//                   color: "#ed6c02",

//                   width: 7,

//                   type: "dotted",
//                 },
//               },
//             ],
//           },
//         },
//       ],
//     };
//   }
//   return (
//     <>
//       <Box
//         sx={{
//           display: "flex",
//           gap: 1,
//           flexWrap: "wrap",
//           justifyContent: "center",
//           mb: 1,
//         }}
//       >
//         {fleetHealthScatter?.map((v, i) => (
//           <Box
//             key={v.vehicle_id}
//             sx={{
//               display: "flex",
//               alignItems: "center",
//               gap: 0.5,
//             }}
//           >
//             <Box
//               sx={{
//                 width: 8,
//                 height: 8,
//                 borderRadius: "50%",

//                 bgcolor: VEHICLE_COLORS[i % 10],
//               }}
//             />

//             <Typography
//               sx={{
//                 fontSize: 10,
//               }}
//             >
//               {v.vehicle_id}
//             </Typography>
//           </Box>
//         ))}
//       </Box>

//       {/* GRAPH */}
//       <Box
//         sx={{
//           flex: 1,
//           minHeight: 0,
//         }}
//       >
//         {hasData ? (
//           <ReactECharts
//             option={fleetScatterOption}
//             style={{
//               width: "100%",
//               height: "100%",
//             }}
//           />
//         ) : (
//           <Box
//             sx={{
//               height: "100%",
//               display: "flex",
//               alignItems: "center",
//               justifyContent: "center",
//             }}
//           >
//             <Typography variant="caption">
//               Waiting for pipeline backend
//             </Typography>
//           </Box>
//         )}
//       </Box>
//     </>
//   );
// }

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
    tooltip: {
      trigger: "axis",
      backgroundColor: isDark ? "#0f1f31" : "#ffffff",
      borderColor: isDark ? "#334155" : "#e2e8f0",
      borderWidth: 1,
      textStyle: { fontSize: 10, color: isDark ? "#e2e8f0" : "#111827" },
    },
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

interface DisplayAlert {
  source_id: string;
  module: string;
  peak_anomaly_ts: string;
  severity: string;
  dtcMessage: string | null;
  relativeTime: string;
}

type OpenAlert = {
  source_id: string;
  module: string;
  peak_anomaly_ts: string;
  last_updated_ts?: string;
  max_composite_score?: number;
  severity?: string;
};

function alertRelativeTime(ts: string): string {
  if (!ts) return "—";
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function RecentAlerts({
  onTotalChange,
}: {
  onTotalChange: (n: number) => void;
}) {
  const navigate = useNavigate();
  const [displayed, setDisplayed] = useState<DisplayAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState("");
  const [total, setTotal] = useState<number>(0);

  const handleRefresh = async () => {
    if (loading) return;
    setLoading(true);
    setPhase("Fetching alerts…");
    try {
      const { data } = await axios.get(`${PIPELINE_API}/api/alerts/metrics`);
      const total: number = data.active_alerts_count ?? 0;
      onTotalChange(total);
      setTotal(total);

      const open: OpenAlert[] = data.open_alerts ?? [];
      if (!open.length) {
        setDisplayed([]);
        return;
      }
      const severityRank: Record<string, number> = {
        critical: 0,
        warning: 1,
        active: 2,
      };
      const sorted = [...open].sort((a, b) => {
        const sev =
          (severityRank[(a.severity ?? "warning").toLowerCase()] ?? 9) -
          (severityRank[(b.severity ?? "warning").toLowerCase()] ?? 9);
        if (sev !== 0) return sev;
        const score =
          (b.max_composite_score ?? 0) - (a.max_composite_score ?? 0);
        if (score !== 0) return score;
        return (
          new Date(b.last_updated_ts ?? b.peak_anomaly_ts).getTime() -
          new Date(a.last_updated_ts ?? a.peak_anomaly_ts).getTime()
        );
      });
      const vehicleBest = new Map<string, OpenAlert>();
      for (const a of sorted) {
        if (!vehicleBest.has(a.source_id)) vehicleBest.set(a.source_id, a);
      }
      setDisplayed(
        Array.from(vehicleBest.values())
          .slice(0, 4)
          .map((a) => ({
            source_id: a.source_id,
            module: a.module,
            peak_anomaly_ts: a.peak_anomaly_ts,
            severity: (a.severity ?? "warning").toLowerCase(),
            dtcMessage: `${String(
              a.module ?? "module"
            ).toUpperCase()} anomaly score ${Math.round(
              a.max_composite_score ?? 0
            )}`,
            relativeTime: alertRelativeTime(
              a.last_updated_ts ?? a.peak_anomaly_ts
            ),
          }))
      );
    } catch {
      // Retain previous displayed on error
    } finally {
      setLoading(false);
      setPhase("");
    }
  };

  useEffect(() => {
    handleRefresh();
  }, []);

  return (
    <Card
      sx={{
        p: 1,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <SectionTitle
        title={`Recent Alerts (${total})`}
        action={
          <Stack direction="row" spacing={0.3} alignItems="center">
            <IconButton
              size="small"
              onClick={handleRefresh}
              disabled={loading}
              sx={{ p: 0.2 }}
            >
              <RestartAltOutlinedIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <Button
              size="small"
              variant="outlined"
              sx={{ fontSize: "8px", py: "1px", px: "6px" }}
              onClick={() => navigate("/fleet-health#alerts-feed")}
            >
              View All
            </Button>
          </Stack>
        }
      />

      {loading ? (
        <Stack direction="row" alignItems="center" spacing={0} sx={{ mt: 0.3 }}>
          <CircularProgress size={12} />
          <Typography sx={{ fontSize: "9px", color: "text.secondary" }}>
            {phase}
          </Typography>
        </Stack>
      ) : displayed.length === 0 ? (
        <Stack alignItems="center" justifyContent="center" flex={1}>
          <Typography sx={{ fontSize: "10px", color: "text.secondary" }}>
            No alerts available
          </Typography>
        </Stack>
      ) : (
        <Stack spacing={0.2} sx={{ mt: 0.3, overflow: "hidden" }}>
          {displayed.map((a) => {
            const sevColor =
              a.severity === "critical"
                ? "#ef4444"
                : a.severity === "active"
                ? "#22c55e"
                : "#f59e0b";
            return (
              <Stack
                key={`${a.source_id}-${a.module}`}
                direction="row"
                alignItems="center"
                spacing={0.75}
                sx={{
                  pl: 1,
                  pr: 0.75,
                  py: 0.5,
                  borderRadius: 1,
                  borderLeft: `3px solid ${sevColor}`,
                  bgcolor: alpha(sevColor, 0.06),
                  minWidth: 0,
                  margin: "1px 0px !important",
                }}
              >
                <Box
                  sx={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    bgcolor: sevColor,
                    flexShrink: 0,
                  }}
                />
                <Box minWidth={0} flex={1}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography
                      sx={{
                        fontSize: "8px",
                        fontWeight: 700,
                        lineHeight: "8px",
                      }}
                      noWrap
                    >
                      {a.source_id.toUpperCase()}
                    </Typography>
                    <Box
                      sx={{
                        px: 0.5,
                        py: "1px",
                        borderRadius: 0.5,
                        bgcolor: alpha(sevColor, 0.18),
                        flexShrink: 0,
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "8px",
                          fontWeight: 600,
                          color: sevColor,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          lineHeight: "8px",
                        }}
                      >
                        {a.module}
                      </Typography>
                    </Box>
                  </Stack>
                  <Typography
                    sx={{
                      fontSize: "8px",
                      color: "text.secondary",
                      lineHeight: "8px",
                    }}
                    noWrap
                    title={a.dtcMessage ?? ""}
                  >
                    {a.dtcMessage ?? "—"}
                  </Typography>
                </Box>
                <Typography
                  sx={{
                    fontSize: "8px",
                    color: "text.secondary",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {a.relativeTime}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      )}
      {!loading && total > displayed.length && displayed.length > 0 && (
        <Box
          onClick={() => navigate("/fleet-health#alerts-feed")}
          sx={{
            mt: 0.3,
            textAlign: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <Typography
            sx={{
              fontSize: "8px",
              color: "text.secondary",
              fontWeight: 600,
              "&:hover": { color: "text.primary" },
            }}
          >
            +{total - displayed.length} more unread alerts
          </Typography>
        </Box>
      )}
    </Card>
  );
}

// function AiSummary({ summary }: { summary: FleetSummary }) {
//   const criticalCount = positions?.filter((v) => {
//     const h =
//       v.status === "active"
//         ? getVehicleHealth(v.vehicle_id, v.health)
//         : v.health;

//     return h < 40;
//   }).length;

//   const warningCount = positions?.filter((v) => {
//     const h =
//       v.status === "active"
//         ? getVehicleHealth(v.vehicle_id, v.health)
//         : v.health;

//     return h >= 40 && h < 70;
//   }).length;

//   const items = [
//     [
//       `Fleet health is stable at ${summary?.avg_health?.toFixed(1)}%.`,
//       "active",
//     ],
//     [`${criticalCount} vehicles require immediate attention.`, "critical"],
//     ["Vehicle DL07 shows recurring battery degradation.", "warning"],
//     ["Tire pressure anomalies increased 12% vs yesterday.", "warning"],
//     [
//       "Recommend scheduling maintenance for 3 vehicles within 48 hours.",
//       "parked",
//     ],
//   ] as const;
//   return (
//     <Card sx={{ p: 1, height: "100%" }}>
//       <SectionTitle
//         title="AI Fleet Summary"
//         action={
//           <Button
//             size="small"
//             variant="outlined"
//             sx={{ fontSize: "10px", p: "0px" }}
//           >
//             View All
//           </Button>
//         }
//       />
//       <Stack spacing={0.5} sx={{ mt: 0.3 }}>
//         {items.map(([text, severity]) => (
//           <Stack key={text} direction="row" spacing={1} alignItems="center">
//             <Box
//               sx={{
//                 width: 7,
//                 height: 7,
//                 mt: 0.45,
//                 borderRadius: "50%",
//                 bgcolor: statusMeta[severity].color,
//                 boxShadow: `0 0 0 4px ${alpha(
//                   statusMeta[severity].color,
//                   0.13
//                 )}`,
//                 flex: "0 0 auto",
//               }}
//             />
//             <Typography
//               sx={{
//                 fontSize: "10px",
//                 lineHeight: "12px",
//                 color: "text.secondary",
//               }}
//             >
//               {text}
//             </Typography>
//           </Stack>
//         ))}
//       </Stack>
//     </Card>
//   );
// }

function FleetTable({ vehicles }: { vehicles: CockpitVehicle[] }) {
  const rows = vehicles;
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
const EVENT_LABELS: Record<string, string> = {
  braking: "B",
  accel: "A",
  cornering: "C",
};

const EVENT_COLORS: Record<string, string> = {
  braking: "#ef4444",
  accel: "#22c55e",
  cornering: "#f59e0b",
};

function createEventIcon(type: string): L.DivIcon {
  if (_eventIconCache[type]) return _eventIconCache[type];
  const c = EVENT_COLORS[type] || "#888";
  const label = EVENT_LABELS[type] || "?";
  _eventIconCache[type] = L.divIcon({
    className: "",
    iconSize: [20, 28],
    iconAnchor: [10, 28],
    html: `<div style="display:flex;flex-direction:column;align-items:center;width:20px">
        <div style="width:20px;height:20px;border-radius:50%;background:${c};border:2px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;">
          <span style="color:white;font-size:10px;font-weight:800;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif;line-height:1;">${label}</span>
        </div>
        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${c};margin-top:-1px;"></div>
      </div>`,
  });
  return _eventIconCache[type];
}

function EventMarkers({ events }: { events: TripData["events"] }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const sampled = useMemo(() => {
    const precision =
      zoom >= 12 ? 200 : zoom >= 10 ? 80 : zoom >= 9 ? 30 : zoom >= 8 ? 15 : 7;
    const seen = new Set<string>();
    return events.filter((evt) => {
      const key = `${(evt.lat * precision).toFixed(0)}_${(
        evt.lng * precision
      ).toFixed(0)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [events, zoom]);

  return (
    <>
      {sampled.map((evt, i) => (
        <Marker
          key={`evt-${i}`}
          position={[evt.lat, evt.lng]}
          icon={createEventIcon(evt.type)}
        >
          <Popup>
            <strong>{evt.type.toUpperCase()}</strong>
            <br />
            G-force: X={evt.acc_x.toFixed(2)}, Y={evt.acc_y.toFixed(2)}
            <br />
            Speed: {evt.speed} km/h
          </Popup>
        </Marker>
      ))}
    </>
  );
}

function MapController({
  selectedVehicle,
  tripData,
  isActive,
}: {
  selectedVehicle: string | null;
  tripData: TripData | null;
  isActive: boolean;
}) {
  const map = useMap();
  const lastFittedVehicle = useRef<string | null>(null);
  const wasActiveRef = useRef(isActive);
  const didMountRef = useRef(false);

  useEffect(() => {
    const id = setTimeout(() => map.invalidateSize({ animate: false }), 200);
    return () => clearTimeout(id);
  }, [map]);

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      const id = setTimeout(() => map.invalidateSize({ animate: false }), 150);
      return () => clearTimeout(id);
    }
    wasActiveRef.current = isActive;
  }, [isActive, map]);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (
      selectedVehicle &&
      tripData?.route?.length > 0 &&
      lastFittedVehicle.current !== selectedVehicle
    ) {
      lastFittedVehicle.current = selectedVehicle;
      const validRoute = tripData.route.filter(
        (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
      );
      if (validRoute.length > 1) {
        map.stop();
        const bounds = L.latLngBounds(validRoute.map((p) => [p.lat, p.lng]));
        map.fitBounds(bounds, {
          paddingTopLeft: [40, 40],
          paddingBottomRight: [40, 40],
          maxZoom: 7,
          animate: true,
          duration: 0.6,
        });
      }
      return;
    }
    if (!selectedVehicle) {
      lastFittedVehicle.current = null;
      map.stop();
      map.flyTo([22.9937, 78.9629], 4, { duration: 0.6 });
    }
  }, [selectedVehicle, tripData, map]);

  return null;
}

function HealthGauge({
  value,
  color,
  formatter = "{value}%",
}: {
  value: number;
  color: string;
  formatter?: string;
}) {
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
        radius: "82%",
        center: ["50%", "68%"],
        progress: {
          show: true,
          width: 10,
          roundCap: true,
          itemStyle: { color },
        },
        itemStyle: { color },
        axisLine: {
          roundCap: true,
          lineStyle: {
            width: 10,
            color: [[1, isDark ? "#374151" : "#E5E7EB"]],
          },
        },
        detail: {
          fontSize: 24,
          fontWeight: 900,
          offsetCenter: [0, "4%"],
          color: isDark ? "#fff" : "#1f2937",
          formatter,
        },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        anchor: { show: false },
        title: { show: false },
        pointer: { show: false },
        data: [{ value: Math.round(value * 10) / 10 }],
      },
    ],
  };
  return (
    <Box sx={{ height: "100%", minHeight: 0, width: "100%" }}>
      <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
    </Box>
  );
}

function scoreTone(score: number) {
  if (score > 90) return "#16a34a";
  if (score > 80) return "#22c55e";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

function scoreLabel(score: number) {
  if (score >= 90) return "Excellent";
  if (score > 80) return "Good";
  if (score >= 60) return "Average";
  return "Poor";
}

function riskLabel(risk: number) {
  if (risk < 20) return "Low Risk";
  if (risk < 40) return "Watch";
  if (risk < 60) return "Elevated";
  return "High Risk";
}

function MiniSparkline({ values, color }: { values: number[]; color: string }) {
  const safe = values.length ? values : [0, 0, 0, 0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const span = Math.max(1, max - min);
  const points = safe
    .map((v, i) => {
      const x = (i / Math.max(1, safe.length - 1)) * 100;
      const y = 42 - ((v - min) / span) * 34;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <Box sx={{ width: "100%", height: 42, mt: 0.35 }}>
      <svg
        viewBox="0 0 100 44"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
      >
        <defs>
          <linearGradient id="cockpitSparkFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.34" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          points={`0,44 ${points} 100,44`}
          fill="url(#cockpitSparkFill)"
        />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Box>
  );
}

function getDriverInitials(name: string): string {
  if (!name || name === "Unassigned" || name === "Unknown") return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#f59e0b",
    "#10b981",
    "#06b6d4",
    "#f97316",
    "#6366f1",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function SpeedGauge({ speed, isDark }: { speed: number; isDark: boolean }) {
  const r = 15,
    cx = 19,
    cy = 19;
  const halfLen = Math.PI * r;
  const pct = Math.min(speed / 120, 1);
  const color = speed > 90 ? "#ef4444" : speed > 60 ? "#f59e0b" : "#22c55e";
  const trackColor = isDark ? "#1e293b" : "#e2e8f0";
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}
    >
      <svg
        width={38}
        height={22}
        style={{ display: "block", overflow: "visible" }}
      >
        <path
          d={arcPath}
          fill="none"
          stroke={trackColor}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${pct * halfLen} ${halfLen}`}
        />
      </svg>
      <Typography
        sx={{
          fontSize: "10px",
          fontWeight: 800,
          lineHeight: 1.1,
          color,
          mt: "-1px",
        }}
      >
        {speed}
      </Typography>
      <Typography
        sx={{ fontSize: "7px", color: "text.secondary", lineHeight: 1 }}
      >
        km/h
      </Typography>
    </Box>
  );
}

function HealthRing({ score, isDark }: { score: number; isDark: boolean }) {
  const r = 13,
    cx = 18,
    cy = 18;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / 100, 1);
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <Box
      sx={{
        position: "relative",
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={36}
        height={36}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          transform: "rotate(-90deg)",
        }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={isDark ? "#1e293b" : "#e2e8f0"}
          strokeWidth={3}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={`${pct * circ} ${(1 - pct) * circ}`}
          strokeLinecap="round"
        />
      </svg>
      <Typography
        sx={{
          fontSize: "9px",
          fontWeight: 800,
          zIndex: 1,
          color,
          lineHeight: 1,
        }}
      >
        {score}%
      </Typography>
    </Box>
  );
}

const FLEET_TABLE_COLUMNS = [
  { id: "name", label: "Vehicle Name", sortable: true },
  { id: "type", label: "Type", sortable: true },
  // { id: "status", label: "Status", sortable: true },
  // { id: "speed", label: "Speed", sortable: true },
  { id: "health_status", label: "Health Status", sortable: true },
  { id: "health", label: "Health Score", sortable: true },
  // { id: "driver", label: "Driver", sortable: true },
  { id: "driver_score", label: "Driver Score", sortable: true },
  // { id: "road_type", label: "Road Type", sortable: false },
  { id: "route_name", label: "Route", sortable: false },
] as const;

type FleetTableColId = (typeof FLEET_TABLE_COLUMNS)[number]["id"];

export default function CockpitView({
  isActive = true,
}: {
  isActive?: boolean;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const navigate = useNavigate();
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [vehiclePopoverAnchor, setVehiclePopoverAnchor] = useState(null);

  const [popoverPosition, setPopoverPosition] = useState(null);

  const [drawerTab, setDrawerTab] = useState(0);
  const [openFleetScatter, setOpenFleetScatter] = useState(false);
  const [openVehicleHealth, setOpenVehicleHealth] = useState(false);
  const [openFleetMap, setOpenFleetMap] = useState(false);
  const [showTopPerformers, setShowTopPerformers] = useState(false);
  const [topPerformerSort, setTopPerformerSort] = useState<
    "overall" | "health" | "driver"
  >("overall");
  const [hiddenSims, setHiddenSims] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<
    | "all"
    | "active"
    | "parked"
    | "in_service"
    | "healthy"
    | "warning"
    | "critical"
  >("critical");
  const [healthScoreFilter, setHealthScoreFilter] = useState("all");

  const [statusFilterMap, setStatusFilterMap] = useState("all");
  const [vehicleType, setVehicleType] = useState("all");
  const [selectedPlant, setSelectedPlant] = useState("all");

  const [search, setSearch] = useState("");
  const [alertTotal, setAlertTotal] = useState<number | null>(null);

  const autoRefresh = useStore((s) => s.autoRefresh);
  const queryClient = useQueryClient();
  const { vehicles: sseVehicles, ringBuffer } = useGoldStream();
  const wasActiveRef = useRef(false);

  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });

  const [orderBy, setOrderBy] = useState("vehicle_id");
  const [order, setOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [fleetFilter, setFleetFilter] = useState<FleetFilter>("ALL");

  const handleFleetFilter = (nextFilter: typeof statusFilter) => {
    setStatusFilter((current) =>
      current === nextFilter && nextFilter !== "all" ? "all" : nextFilter
    );
    setSelectedVehicle(null);
    setPopoverPosition(null);
    setVehiclePopoverAnchor(null);
    setPage(0);
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleTableSort = (colId: string) => {
    if (orderBy === colId) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setOrderBy(colId);
      setOrder("asc");
    }
    setPage(0);
  };

  const handleChangeRowsPerPage = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };

  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      start.current = {
        x: e.clientX - dragPos.x,
        y: e.clientY - dragPos.y,
      };
      document.body.style.cursor = "grabbing";
    },
    [dragPos]
  );

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    setDragPos({
      x: e.clientX - start.current.x,
      y: e.clientY - start.current.y,
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);

    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
    };
  }, [handleDragMove, handleDragEnd]);

  const handleOpenVehicle = (event, vehicle) => {
    setVehiclePopoverAnchor(event.currentTarget);
    setSelectedVehicle(vehicle);
    setDragPos({ x: 0, y: 0 });
  };

  const handleCloseVehicle = () => {
    setVehiclePopoverAnchor(null);
    setSelectedVehicle(null);
    setDragPos({ x: 0, y: 0 });
  };

  const { data: summary = {} as FleetSummary } = useQuery<FleetSummary>({
    queryKey: ["fleet-summary"],
    queryFn: () => axios.get(`${FLEET_API}/summary`).then((r) => r.data),
    retry: 1,
    refetchInterval: isActive && autoRefresh ? 10000 : false,
  });
  const { data: positions, refetch: refetchPositions } = useQuery<
    VehiclePosition[]
  >({
    queryKey: ["fleet-positions"],
    queryFn: () => axios.get(`${FLEET_API}/positions`).then((r) => r.data),
    refetchInterval: isActive && autoRefresh ? 3000 : false,
  });

  const rows =
    positions?.map((v, index) => ({
      id: index,
      ...v,
    })) ?? [];

  const columns = [
    { id: "name", label: "Vehicle Name", width: 80 },
    { id: "type", label: "Type", width: 100 },
    { id: "status", label: "Status", width: 85 },
    { id: "speed", label: "Speed", width: 75 },
    { id: "heading", label: "Health Status", width: 105 },
    { id: "health", label: "Health Score", width: 100 },
    // { id: "driver", label: "Driver", width: 80 },
    { id: "driver_score", label: "Driver Score", width: 130 },
    { id: "road_type", label: "Road Type", width: 95 },
    { id: "route_name", label: "Route", width: 260 },
  ];

  const getHealthChip = (health: number) => {
    if (health >= 80)
      return {
        color: "#2e7d32",
        bg: "#e8f5e9",
        label: "Healthy",
      };

    if (health >= 50)
      return {
        color: "#ed6c02",
        bg: "#fff3e0",
        label: "Warning",
      };

    return {
      color: "#d32f2f",
      bg: "#ffebee",
      label: "Critical",
    };
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "active":
        return "success";

      case "idle":
        return "warning";

      default:
        return "error";
    }
  };

  //   const vehicles = fleetData;

  const filteredVehicles = positions?.filter((v) => {
    const text = search.toLowerCase();

    return (
      v.vehicle_id.toLowerCase().includes(text) ||
      (v.driver ?? "").toLowerCase().includes(text) ||
      (v.route_name ?? "").toLowerCase().includes(text)
    );
  });

  const statusMetaTable = {
    active: {
      label: "Active",
      color: "#22c55e",
      bg: "#dcfce7",
    },

    parked: {
      label: "Parked",
      color: "#3b82f6",
      bg: "#dbeafe",
    },

    in_service: {
      label: "In Workshop",
      color: "#8b5cf6",
      bg: "#ede9fe",
    },

    critical: {
      label: "Critical",
      color: "#ef4444",
      bg: "#fee2e2",
    },

    warning: {
      label: "Warning",
      color: "#f59e0b",
      bg: "#fef3c7",
    },
  };

  const getHealthColor = (health: number) => {
    if (health >= 80)
      return {
        text: "Healthy",
        color: "#2e7d32",
        bg: "#e8f5e9",
      };

    if (health >= 60)
      return {
        text: "Warning",
        color: "#ed6c02",
        bg: "#fff3e0",
      };

    return {
      text: "Critical",
      color: "#d32f2f",
      bg: "#ffebee",
    };
  };

  const getBatteryColor = (battery: number) => {
    if (battery >= 50) return "#22c55e";
    if (battery >= 25) return "#f59e0b";
    return "#ef4444";
  };

  const { data: pipelineFleet, refetch: refetchPipelineFleet } =
    useQuery<PipelineFleetSummary>({
      queryKey: ["pipeline-fleet-summary"],
      queryFn: () =>
        axios
          .get(`${PIPELINE_API}/api/automotive/fleet-summary`)
          .then((r) => r.data),
      retry: 1,
      refetchInterval: isActive && autoRefresh ? 8000 : false,
    });

  const { data: alertsMetrics } = useQuery({
    queryKey: ["alertsMetrics"],
    queryFn: () => axios.get(`${PIPELINE_API}/api/alerts/metrics`).then((r) => r.data),
    refetchInterval: isActive && autoRefresh ? 20000 : false,
    staleTime: 8000,
  });

  useEffect(() => {
    const count = alertsMetrics?.active_alerts_count;
    if (count != null) setAlertTotal(count);
  }, [alertsMetrics]);

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      refetchPositions();
      refetchPipelineFleet();
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  const healthVehicleId =
    pipelineFleet?.vehicles?.[0]?.vehicle_id ||
    positions?.[0]?.vehicle_id ||
    null;

  const { data: healthHistory } = useQuery<HealthHistoryResponse>({
    queryKey: ["cockpit-health-history", healthVehicleId],
    queryFn: () =>
      axios
        .get(
          `${PIPELINE_API}/api/automotive/vehicle-health-history/${healthVehicleId}`
        )
        .then((r) => r.data),
    retry: 1,
    enabled: !!healthVehicleId,
    refetchInterval: isActive && autoRefresh ? 8000 : false,
  });

  const positionsUpdatedAt: number =
    queryClient.getQueryState(["fleet-positions"])?.dataUpdatedAt ?? 0;

  const vehicles = useMemo<CockpitVehicle[]>(() => {
    const updatedLabel = (() => {
      if (!positionsUpdatedAt) return "just now";
      const diffMs = Date.now() - positionsUpdatedAt;
      const secs = Math.floor(diffMs / 1000);
      if (secs < 10) return "just now";
      if (secs < 60) return `${secs}s ago`;
      return `${Math.floor(secs / 60)}m ago`;
    })();
    if (!positions?.length) return fallbackVehicles;
    return positions.map((v, index) => {
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
        updated: updatedLabel,
        lat: v.lat,
        lng: v.lng,
      };
    });
  }, [pipelineFleet?.vehicles, positions, positionsUpdatedAt]);

  //   const summary = useMemo<FleetSummary>(() => {
  //     const base = summary || fallbackSummary;
  //     const pipelineStats = pipelineFleet?.fleet_stats;
  //     return {
  //       ...base,
  //       total: pipelineStats?.total_vehicles || base.total || vehicles.length,
  //       avg_health: pipelineStats?.avg_health || base.avg_health,
  //       severity_counts: {
  //         normal:
  //           base.severity_counts?.normal ??
  //           vehicles.filter((v) => v.status === "active").length,
  //         warning:
  //           pipelineStats?.warning_count ??
  //           base.severity_counts?.warning ??
  //           vehicles.filter((v) => v.status === "warning").length,
  //         critical:
  //           pipelineStats?.critical_count ??
  //           base.severity_counts?.critical ??
  //           vehicles.filter((v) => v.status === "critical").length,
  //       },
  //     };
  //   }, [pipelineFleet?.fleet_stats, summary, vehicles]);

  const [healthTimelineVehicle, setHealthTimelineVehicle] =
    useState<string>("sim001");
  const [timelineXAxis, setTimelineXAxis] = useState<"timestamp" | "mileage">(
    "mileage"
  );

  const { data: healthScatterBatch } = useQuery<
    { vehicle_id: string; data: HealthHistoryRow[] }[]
  >({
    queryKey: ["fleet-health-scatter-batch"],
    queryFn: async () => {
      const r = await axios.get(
        `${PIPELINE_API}/api/automotive/fleet-health-scatter`
      );
      return r.data.vehicles ?? [];
    },
    enabled: isActive && sseVehicles.length === 0,
    refetchInterval:
      isActive && autoRefresh && sseVehicles.length === 0 ? 8000 : false,
    retry: 1,
  });

  const fleetHealthScatter = useMemo((): {
    vehicle_id: string;
    data: HealthHistoryRow[];
  }[] => {
    const cap = (arr: HealthHistoryRow[]): HealthHistoryRow[] => {
      if (arr.length <= SCATTER_CAP) return arr;
      const step = Math.floor(arr.length / SCATTER_CAP);
      return arr.filter((_, i) => i % step === 0).slice(-SCATTER_CAP);
    };
    if (sseVehicles.length > 0) {
      return sseVehicles.map((v) => ({
        vehicle_id: v.vehicle_id,
        data: cap((ringBuffer.get(v.vehicle_id) ?? []) as HealthHistoryRow[]),
      }));
    }
    return healthScatterBatch ?? [];
  }, [sseVehicles, ringBuffer, healthScatterBatch]);

  const avgBattery = Math.round(
    vehicles.reduce((sum, vehicle) => sum + vehicle.battery, 0) /
      vehicles.length
  );

  const pipelineHealthMap = useMemo(() => {
    const map: Record<string, PipelineVehicle> = {};
    if (pipelineFleet?.vehicles) {
      for (const v of pipelineFleet.vehicles) {
        map[v.vehicle_id] = v;
      }
    }
    return map;
  }, [pipelineFleet]);

  const liveAvgHealth = useMemo(() => {
    if (pipelineFleet?.fleet_stats?.avg_health)
      return pipelineFleet.fleet_stats.avg_health;
    return summary?.avg_health ?? 0;
  }, [pipelineFleet, summary]);

  const healthStatus = getHealthStatus(liveAvgHealth);

  const avgEngineHealth = useMemo(() => {
    const active = (positions ?? []).filter(
      (v) => v.status === "active" && v.engine_health != null
    );
    if (!active.length) return 0;
    return Math.round(
      active.reduce((s, v) => s + (v.engine_health ?? 0), 0) / active.length
    );
  }, [positions]);

  const getVehicleHealth = (vehicleId: string, fallback: number): number => {
    return pipelineHealthMap[vehicleId]?.health_score ?? fallback;
  };

  const allPositions = useMemo(() => positions ?? [], [positions]);

  const getLiveHealth = (vehicle: VehiclePosition) =>
    vehicle.status === "active"
      ? getVehicleHealth(vehicle.vehicle_id, vehicle.health)
      : vehicle.health;

  const activeCount = allPositions.filter((v) => v.status === "active").length;
  const parkedCount = allPositions.filter((v) => v.status === "parked").length;
  const serviceCount = allPositions.filter(
    (v) => v.status === "in_service"
  ).length;

  const activePositionIds = useMemo(
    () =>
      allPositions
        .filter((v) => v.status === "active")
        .map((v) => v.vehicle_id)
        .sort(),
    [allPositions]
  );

  const { data: allActiveTrips } = useQuery<TripData[]>({
    queryKey: ["cockpit-active-trips", activePositionIds.join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        activePositionIds.map((vid) =>
          axios
            .get(`${FLEET_API}/vehicle/${vid}/trip`)
            .then((r) => r.data as TripData)
            .catch(() => null)
        )
      );
      return results.filter((t): t is TripData => t !== null);
    },
    enabled: activePositionIds.length > 0,
    staleTime: 30000,
    gcTime: 300_000,
    refetchInterval: isActive && autoRefresh ? 15000 : false,
    retry: 1,
  });

  const ICE_FUEL_L_PER_KM = 0.12;

  const operationalMetrics = useMemo(() => {
    const activePosns = allPositions.filter((v) => v.status === "active");
    const totalDistanceKm = (allActiveTrips ?? []).reduce(
      (s, t) => s + (t.distance_completed_km ?? 0),
      0
    );
    const fuelConsumedL = totalDistanceKm * ICE_FUEL_L_PER_KM;
    const tripsInProgress = (allActiveTrips ?? []).filter(
      (t) => (t.progress_pct ?? 0) >= 5
    ).length;
    const avgSpeedKmh =
      activePosns.length > 0
        ? activePosns.reduce((s, v) => s + (v.speed ?? 0), 0) /
          activePosns.length
        : 0;
    const total = allPositions.length || 1;
    const fleetUtilPct = (activePosns.length / total) * 100;
    return {
      totalDistanceKm,
      fuelConsumedL,
      tripsInProgress,
      avgSpeedKmh,
      fleetUtilPct,
    };
  }, [allPositions, allActiveTrips]);

  const formatStatusLabel = (status: string) =>
    status?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
    "Unknown";

  const selectedFleetLabel =
    statusFilter === "all"
      ? "Total Fleet"
      : statusFilter === "in_service"
      ? "In Workshop"
      : formatStatusLabel(statusFilter);

  const liveSeverityCounts = useMemo(() => {
    const base = { normal: 0, warning: 0, critical: 0 };
    if (pipelineFleet?.vehicles) {
      for (const v of pipelineFleet.vehicles) {
        if (v.health_score >= 80) base.normal++;
        else if (v.health_score >= 60) base.warning++;
        else base.critical++;
      }
    }
    if (positions) {
      for (const v of positions) {
        if (v.status === "active") continue;
        if (v.health >= 80) base.normal++;
        else if (v.health >= 60) base.warning++;
        else base.critical++;
      }
    }
    return base;
  }, [pipelineFleet, positions]);

  const getModuleHealth = (
    vehicleId: string,
    fallbackModules: Record<string, number>
  ): Record<string, number> => {
    const pv = pipelineHealthMap[vehicleId];
    if (!pv) return fallbackModules;
    return {
      engine: Math.round(pv.engine_contrib ?? fallbackModules.engine ?? 0),
      transmission: Math.round(
        pv.transmission_contrib ?? fallbackModules.transmission ?? 0
      ),
      battery: Math.round(pv.battery_contrib ?? fallbackModules.battery ?? 0),
      body: Math.round(pv.body_contrib ?? fallbackModules.body ?? 0),
      tyre: Math.round(pv.tyre_contrib ?? fallbackModules.tyre ?? 0),
    };
  };

  const getVehicleTypeIcon = (type = "") => {
    const normalized = type.toLowerCase();
    if (normalized.includes("truck") || normalized.includes("lorry")) {
      return <LocalShippingOutlinedIcon sx={{ fontSize: 14 }} />;
    }
    if (normalized.includes("van") || normalized.includes("shuttle")) {
      return <AirportShuttleOutlinedIcon sx={{ fontSize: 14 }} />;
    }
    if (normalized.includes("bus")) {
      return <DirectionsBusFilledOutlinedIcon sx={{ fontSize: 14 }} />;
    }
    if (
      normalized.includes("bike") ||
      normalized.includes("scooter") ||
      normalized.includes("two")
    ) {
      return <TwoWheelerOutlinedIcon sx={{ fontSize: 14 }} />;
    }
    return <DirectionsCarFilledOutlinedIcon sx={{ fontSize: 14 }} />;
  };

  const bounds: [[number, number], [number, number]] = [
    [-90, -180],
    [90, 180],
  ];

  const commonAxisLabel = {
    fontSize: 10,
    fontFamily: CHART_FONT,
    color: isDark ? "#8a9bb0" : "#616161",
  };

  const commonXAxis = {
    type: "category",
    boundaryGap: true,

    axisLabel: {
      ...commonAxisLabel,
      margin: 14,
    },

    axisTick: {
      show: false,
    },

    axisLine: {
      lineStyle: {
        color: isDark ? "#2a3a4a" : "#c5c5c5",
        width: 1,
      },
    },

    splitLine: {
      show: true,
      lineStyle: {
        color: isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)",
        type: "solid",
      },
    },
  };

  const commonYAxis = {
    type: "value",

    min: 0,
    max: 100,
    interval: 20,

    axisLabel: {
      ...commonAxisLabel,
      formatter: "{value}%",
      margin: 10,
    },

    axisTick: {
      show: false,
    },

    axisLine: {
      show: false,
    },

    splitLine: {
      show: true,
      lineStyle: {
        color: isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.07)",
        type: "dashed",
      },
    },
  };

  const selectedIsActive = useMemo(() => {
    if (!selectedVehicle || !positions) return false;
    const v = positions.find((p) => p.vehicle_id === selectedVehicle);
    return v?.status === "active";
  }, [selectedVehicle, positions]);

  const { data: vehicleDetail } = useQuery<VehicleDetail>({
    queryKey: ["fleet-vehicle", selectedVehicle],
    queryFn: () =>
      axios.get(`${FLEET_API}/vehicle/${selectedVehicle}`).then((r) => r.data),
    enabled: !!selectedVehicle,
    staleTime: 30000,
  });

  const liveSelectedPosition = useMemo(
    () => positions?.find((p) => p.vehicle_id === selectedVehicle) ?? null,
    [positions, selectedVehicle]
  );

  const { data: tripData } = useQuery<TripData>({
    queryKey: ["fleet-trip", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${FLEET_API}/vehicle/${selectedVehicle}/trip`)
        .then((r) => r.data),
    enabled: !!selectedVehicle && selectedIsActive,
    staleTime: 8000,
    refetchInterval: isActive && autoRefresh ? 10000 : false,
  });

  const { data: behaviorData } = useQuery<BehaviorData>({
    queryKey: ["fleet-behavior", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${FLEET_API}/vehicle/${selectedVehicle}/behavior`)
        .then((r) => r.data),
    enabled: !!selectedVehicle && selectedIsActive,
    staleTime: 30000,
  });

  const { data: lastTripData } = useQuery<LastTripData>({
    queryKey: ["fleet-last-trip", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${FLEET_API}/vehicle/${selectedVehicle}/last-trip`)
        .then((r) => r.data),
    enabled: !!selectedVehicle && !selectedIsActive,
    staleTime: Infinity,
  });

  const SERVICE_INTERVAL_KM = 15000;

  const completedRoute = useMemo(() => {
    if (!tripData) return [];
    return tripData.route
      .slice(0, tripData.completed_index + 1)
      .map((p) => [p.lat, p.lng] as [number, number]);
  }, [tripData]);

  const remainingRoute = useMemo(() => {
    if (!tripData) return [];
    return tripData.route
      .slice(tripData.completed_index)
      .map((p) => [p.lat, p.lng] as [number, number]);
  }, [tripData]);

  const tileUrl =
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  const tileAttribution =
    '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/">OSM</a>';

  const healthColor = (h: number) =>
    h >= 80 ? "#22c55e" : h >= 60 ? "#eab308" : "#ef4444";

  const DraggablePaper = React.forwardRef(function DraggablePaper(props, ref) {
    return (
      <Draggable
        handle=".drag-header"
        cancel='[class*="MuiTabs-root"],[class*="MuiButtonBase-root"],input,textarea,.MuiTabs-scroller'
      >
        <Paper
          ref={ref}
          {...props}
          sx={{
            ...(props.sx || {}),
            cursor: "default",
          }}
        />
      </Draggable>
    );
  });

  const filteredPositions = positions?.filter((v) => {
    const liveHealth =
      v.status === "active"
        ? getVehicleHealth(v.vehicle_id, v.health)
        : v.health;

    switch (statusFilter) {
      case "active":
        return v.status === "active";

      case "parked":
        return v.status === "parked";

      case "in_service":
        return v.status === "in_service";

      case "critical":
        return liveHealth < 50;

      case "warning":
        return liveHealth >= 50 && liveHealth < 80;

      case "healthy":
        return liveHealth >= 80;

      default:
        return true;
    }
  });

  const selectedAvgHealth = useMemo(() => {
    const source = filteredPositions ?? [];
    if (!source.length) return statusFilter === "all" ? liveAvgHealth : 0;
    const total = source.reduce(
      (sum, vehicle) => sum + getLiveHealth(vehicle),
      0
    );
    return Math.round((total / source.length) * 10) / 10;
  }, [filteredPositions, liveAvgHealth, pipelineHealthMap, statusFilter]);

  const selectedHealthStatus = getHealthStatus(selectedAvgHealth);

  const timelineVehicleOptions = useMemo(() => {
    const pipelineVehicles = pipelineFleet?.vehicles || [];
    if (statusFilter === "all") return pipelineVehicles;
    const filteredIds = new Set(
      (filteredPositions ?? []).map((v) => v.vehicle_id)
    );
    const matched = pipelineVehicles.filter((v) =>
      filteredIds.has(v.vehicle_id)
    );
    if (matched.length) return matched;
    return (filteredPositions ?? []).map((v) => ({
      vehicle_id: v.vehicle_id,
      health_score: getLiveHealth(v),
    }));
  }, [filteredPositions, pipelineFleet?.vehicles, statusFilter]);

  const timelineVehicleIds = useMemo(
    () => timelineVehicleOptions.map((v) => v.vehicle_id),
    [timelineVehicleOptions]
  );

  useEffect(() => {
    if (!timelineVehicleIds.length) return;
    if (!timelineVehicleIds.includes(healthTimelineVehicle)) {
      setHealthTimelineVehicle(timelineVehicleIds[0]);
    }
  }, [healthTimelineVehicle, timelineVehicleIds]);

  const tableRows = useMemo(
    () =>
      (filteredPositions ?? []).filter((v) => {
        const liveHealth = getLiveHealth(v);
        if (healthScoreFilter === "excellent" && liveHealth < 90) return false;
        if (
          healthScoreFilter === "good" &&
          (liveHealth <= 80 || liveHealth >= 90)
        )
          return false;
        if (
          healthScoreFilter === "average" &&
          (liveHealth < 60 || liveHealth > 80)
        )
          return false;
        if (healthScoreFilter === "poor" && liveHealth >= 60) return false;
        const text = search.trim().toLowerCase();
        if (!text) return true;
        return (
          v.vehicle_id.toLowerCase().includes(text) ||
          (v.name ?? "").toLowerCase().includes(text) ||
          (v.type ?? "").toLowerCase().includes(text) ||
          (v.driver ?? "").toLowerCase().includes(text) ||
          (v.route_name ?? "").toLowerCase().includes(text) ||
          (v.road_type ?? "").toLowerCase().includes(text)
        );
      }),
    [filteredPositions, healthScoreFilter, pipelineHealthMap, search]
  );

  const mapVehicles = useMemo(
    () =>
      tableRows
        .filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng))
        .map((v) => ({
          ...v,
          liveHealth:
            v.status === "active"
              ? getVehicleHealth(v.vehicle_id, v.health)
              : v.health,
        })),
    [tableRows, pipelineHealthMap]
  );

  const handleVehicleMarkerClick = useCallback(
    (vehicleId: string, event?: L.LeafletMouseEvent) => {
      setSelectedVehicle(vehicleId);
      setDrawerTab(0);
      if (event?.originalEvent) {
        setPopoverPosition({
          top: event.originalEvent.clientY,
          left: event.originalEvent.clientX,
        });
      }
    },
    []
  );

  const sortedTableRows = useMemo(() => {
    const rows = [...tableRows];
    rows.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      switch (orderBy) {
        case "name":
          aVal = a.name ?? a.vehicle_id;
          bVal = b.name ?? b.vehicle_id;
          break;
        case "type":
          aVal = a.type ?? "";
          bVal = b.type ?? "";
          break;
        case "status":
          aVal = a.status ?? "";
          bVal = b.status ?? "";
          break;
        case "speed":
          aVal = a.speed ?? 0;
          bVal = b.speed ?? 0;
          break;
        case "health_status":
        case "health":
          aVal = getLiveHealth(a);
          bVal = getLiveHealth(b);
          break;
        case "driver":
          aVal = a.driver ?? "";
          bVal = b.driver ?? "";
          break;
        case "driver_score":
          aVal = a.driver_score ?? 0;
          bVal = b.driver_score ?? 0;
          break;
        default:
          aVal = a.vehicle_id;
          bVal = b.vehicle_id;
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return order === "asc" ? aVal - bVal : bVal - aVal;
      }
      return order === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return rows;
  }, [tableRows, orderBy, order]);

  const topPerformingRows = useMemo(() => {
    return [...allPositions]
      .filter((v) => {
        const text = search.trim().toLowerCase();
        if (!text) return true;
        return (
          v.vehicle_id.toLowerCase().includes(text) ||
          (v.name ?? "").toLowerCase().includes(text) ||
          (v.driver ?? "").toLowerCase().includes(text) ||
          (v.route_name ?? "").toLowerCase().includes(text)
        );
      })
      .sort((a, b) => {
        const aScore =
          topPerformerSort === "health"
            ? getLiveHealth(a)
            : topPerformerSort === "driver"
            ? a.driver_score ?? 0
            : getLiveHealth(a) * 0.65 + (a.driver_score ?? 0) * 0.35;
        const bScore =
          topPerformerSort === "health"
            ? getLiveHealth(b)
            : topPerformerSort === "driver"
            ? b.driver_score ?? 0
            : getLiveHealth(b) * 0.65 + (b.driver_score ?? 0) * 0.35;
        return bScore - aScore;
      });
  }, [allPositions, pipelineHealthMap, search, topPerformerSort]);

  const activeTableRows = showTopPerformers
    ? topPerformingRows
    : sortedTableRows;

  const criticalCount = allPositions.filter(
    (v) => getLiveHealth(v) < 50
  ).length;

  const warningCount = allPositions.filter((v) => {
    const h = getLiveHealth(v);
    return h >= 50 && h < 80;
  }).length;

  const openAlerts: any[] = alertsMetrics?.open_alerts ?? [];
  const criticalAlertCount = openAlerts.filter((a: any) => Number(a.max_composite_score) >= 0.8).length;
  const warningAlertCount = openAlerts.filter((a: any) => { const s = Number(a.max_composite_score); return s >= 0.5 && s < 0.8; }).length;

  const executiveMetrics = useMemo(() => {
    const total = allPositions.length || summary.total || 0;
    const available = activeCount + parkedCount;
    const availability = total ? Math.round((available / total) * 100) : 0;
    const utilization = Math.round(operationalMetrics.fleetUtilPct || 0);
    const riskIndex = total
      ? Math.round(((criticalCount * 1.8 + warningCount * 0.75) / total) * 100)
      : 0;
    const predictedFailures = criticalCount + Math.ceil(warningCount * 0.35);
    const maintenanceForecast = serviceCount + predictedFailures;
    const resolvedToday = 0;
    const backendSummaryDriver = Number(summary.avg_driver_score);
    const hasSummaryDriver =
      summary.avg_driver_score !== null &&
      summary.avg_driver_score !== undefined &&
      Number.isFinite(backendSummaryDriver);
    const scoredDrivers = allPositions
      .map((vehicle) => Number(vehicle.driver_score))
      .filter((score) => Number.isFinite(score));
    const avgDriver = hasSummaryDriver
      ? backendSummaryDriver
      : scoredDrivers.length
      ? scoredDrivers.reduce((sum, score) => sum + score, 0) / scoredDrivers.length
      : null;
    const driverScoreSource = hasSummaryDriver
      ? "Fleet summary from backend"
      : scoredDrivers.length
      ? `Average of ${scoredDrivers.length} scored vehicles from backend`
      : "No driver-score data returned by backend";

    return {
      total,
      availability,
      utilization,
      riskIndex,
      predictedFailures,
      maintenanceForecast,
      resolvedToday,
      avgDriver,
      driverScoreSource,
      atRisk: criticalCount + warningCount,
    };
  }, [
    activeCount,
    alertTotal,
    allPositions,
    criticalCount,
    operationalMetrics.fleetUtilPct,
    parkedCount,
    serviceCount,
    summary,
    warningCount,
  ]);

  const executiveTileData = [
    {
      label: "Overall Fleet Health",
      value: `${Math.round(liveAvgHealth || 0)}`,
      suffix: "/100",
      color: healthStatus.color,
      hint: healthStatus.label,
      type: "metric",
    },
    {
      label: "Fleet Availability",
      value: `${executiveMetrics.availability}%`,
      color: "#22c55e",
      hint: `${activeCount + parkedCount}/${
        executiveMetrics.total || 0
      } available`,
      type: "metric",
    },
    {
      label: "Utilization Score",
      value: `${executiveMetrics.utilization}%`,
      color: executiveMetrics.utilization >= 50 ? "#22c55e" : "#f59e0b",
      hint: `${activeCount} active now`,
      type: "metric",
    },
    {
      label: "At Risk Index",
      value: `${executiveMetrics.riskIndex}%`,
      color: executiveMetrics.riskIndex > 35 ? "#ef4444" : "#f59e0b",
      hint: `${executiveMetrics.atRisk} vehicles at risk`,
      type: "metric",
    },
    {
      label: "Predicted Failures",
      value: `${executiveMetrics.predictedFailures}`,
      color: "#fb7185",
      hint: "AI risk forecast",
      type: "metric",
    },
    {
      label: "Maintenance Forecast",
      value: `${executiveMetrics.maintenanceForecast}`,
      color: "#38bdf8",
      hint: "next service window",
      type: "metric",
    },
    {
      label: "Alerts Summary",
      value: `${alertTotal ?? 0}`,
      color: "#ef4444",
      hint: `${executiveMetrics.resolvedToday} resolved today`,
      type: "metric",
    },
    {
      label: "AI Recommendations",
      value:
        criticalCount > 0
          ? `Prioritize ${criticalCount} poor-health vehicle${
              criticalCount === 1 ? "" : "s"
            }`
          : warningCount > 0
          ? `Schedule checks for ${warningCount} average-risk vehicle${
              warningCount === 1 ? "" : "s"
            }`
          : "Keep current maintenance cadence",
      color: "#8b5cf6",
      hint: `${serviceCount} in workshop, ${activeCount} active`,
      type: "text",
    },
    {
      label: "AI Executive Summary",
      value: `${healthStatus.label} fleet health with ${executiveMetrics.availability}% availability and ${executiveMetrics.riskIndex}% risk index.`,
      color: "#06b6d4",
      hint: `${executiveMetrics.total || 0} vehicles monitored live`,
      type: "text",
    },
  ];

  const aiRecommendationItems = [
    criticalCount > 0
      ? `Prioritize ${criticalCount} poor-health vehicle${criticalCount === 1 ? "" : "s"} before dispatch; ${warningCount} more require preventive checks.`
      : warningCount > 0
      ? `Schedule preventive checks for ${warningCount} average-risk vehicle${warningCount === 1 ? "" : "s"} before the next route cycle.`
      : "No urgent repair queue is indicated by the current vehicle-health data.",
    serviceCount > 0
      ? `Review workshop turnaround for ${serviceCount} vehicle${serviceCount === 1 ? "" : "s"}; current fleet availability is ${executiveMetrics.availability}%.`
      : `Fleet availability is ${executiveMetrics.availability}% with no vehicles currently reported in the workshop.`,
    executiveMetrics.avgDriver !== null
      ? executiveMetrics.avgDriver < 80
        ? `Target driver coaching where scores are lowest; the backend fleet average is ${executiveMetrics.avgDriver.toFixed(1)}/100.`
        : `Maintain the current driver program; the backend fleet average is ${executiveMetrics.avgDriver.toFixed(1)}/100.`
      : `Balance dispatch capacity across ${activeCount} active and ${parkedCount} parked vehicles.`,
    (alertTotal ?? 0) > 0
      ? `Triage ${alertTotal ?? 0} open alert${(alertTotal ?? 0) === 1 ? "" : "s"}, starting with vehicles already in the risk queue.`
      : `Monitor utilization at ${executiveMetrics.utilization}% and adjust dispatch if active demand changes.`,
  ];

  const healthScoreValue = Math.round(liveAvgHealth || 0);
  const availabilityScore = executiveMetrics.availability;
  const utilizationScore = executiveMetrics.utilization;
  const riskScore = Math.min(100, Math.max(0, executiveMetrics.riskIndex));
  const topHealthColor = scoreTone(healthScoreValue);
  const topAvailabilityColor = scoreTone(availabilityScore);
  const topUtilizationColor = scoreTone(utilizationScore);
  const topRiskColor = scoreTone(100 - riskScore);
  const utilizationTrend = [
    Math.max(0, utilizationScore - 18),
    Math.max(0, utilizationScore - 7),
    Math.max(0, utilizationScore - 12),
    Math.min(100, utilizationScore + 4),
    Math.max(0, utilizationScore - 2),
    Math.max(0, utilizationScore - 16),
    Math.max(0, utilizationScore - 11),
    Math.max(0, utilizationScore - 15),
    Math.min(100, utilizationScore + 8),
    Math.min(100, utilizationScore + 4),
    Math.max(0, utilizationScore - 6),
    utilizationScore,
  ];
  const availabilityRows = [
    { label: "Available", value: activeCount + parkedCount, color: "#22c55e" },
    { label: "Under Maintenance", value: serviceCount, color: "#f59e0b" },
    { label: "Breakdown", value: criticalCount, color: "#f97316" },
    {
      label: "Offline",
      value: Math.max(
        0,
        executiveMetrics.total -
          activeCount -
          parkedCount -
          serviceCount -
          criticalCount
      ),
      color: "#94a3b8",
    },
  ];
  const topCardTitleSx = {
    fontSize: 10,
    fontWeight: 900,
    textAlign: "center" as const,
    color: isDark ? "#f8fafc" : "#0f172a",
    lineHeight: 1.1,
  };
  const topCardValueSx = {
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1,
  };
  const topCardSubSx = {
    fontSize: 10,
    fontWeight: 900,
    lineHeight: 1.15,
  };
  const topCardMetaSx = {
    fontSize: 9,
    fontWeight: 800,
    color: "text.secondary",
    lineHeight: 1.1,
  };

  const alertChartRows = [
    {
      label: "Critical Alerts",
      value: criticalAlertCount,
      color: "#ef4444",
      reason: `${criticalAlertCount} open alerts with anomaly score ≥ 0.8 require immediate triage.`,
    },
    {
      label: "Warning Alerts",
      value: warningAlertCount,
      color: "#f59e0b",
      reason: `${warningAlertCount} open alerts with anomaly score 0.5–0.8 have risk signals that can escalate.`,
    },
    {
      label: "Resolved Today",
      value: 0,
      color: "#3b82f6",
      reason: "Resolved-alert history is not yet tracked by the alerts backend.",
    },
  ];

  const predictedFailureRows = [
    {
      label: "Engine issues in next 7 days",
      value: criticalCount,
      color: "#ef4444",
      reason:
        "Poor health score vehicles can fail fastest because multiple module contributions are already outside target range.",
    },
    {
      label: "Battery issues in next 7 days",
      value: Math.ceil(warningCount * 0.55),
      color: "#f59e0b",
      reason:
        "Average health vehicles with warning severity are likely to need checks within the next service window.",
    },
    {
      label: "Brake issues in next 7 days",
      value: Math.max(0, executiveMetrics.predictedFailures - criticalCount),
      color: "#f97316",
      reason:
        "Remaining predicted failures are lower urgency and should be grouped into planned maintenance.",
    },
  ];

  const maintenanceRows = [
    {
      label: "0-5 Days",
      value: criticalCount,
      color: "#ef4444",
      reason:
        "Maintenance is due now for poor-health vehicles to reduce breakdown exposure.",
    },
    {
      label: "5-10 Days",
      value: serviceCount + Math.ceil(warningCount * 0.35),
      color: "#f59e0b",
      reason:
        "Workshop vehicles plus warning vehicles should be serviced before risk escalates.",
    },
    {
      label: "10-15 Days",
      value: Math.max(
        0,
        executiveMetrics.maintenanceForecast - criticalCount - serviceCount
      ),
      color: "#22c55e",
      reason:
        "Planned items can be scheduled with route and utilization windows to avoid downtime.",
    },
    {
      label: ">15 Days",
      value: Math.max(
        0,
        executiveMetrics.total - executiveMetrics.maintenanceForecast
      ),
      color: "#06b6d4",
      reason:
        "Healthy available vehicles can be grouped into later planned maintenance cycles.",
    },
  ];

  const chartCards = [
    {
      label: "Alerts Summary",
      value: `${alertTotal ?? 0}`,
      hint: `${executiveMetrics.resolvedToday} resolved today`,
      rows: alertChartRows,
      info: `Current alert pressure is driven by ${criticalCount} critical and ${warningCount} warning vehicles. Prioritize poor-health vehicles first.`,
    },
    {
      label: "Predicted Failures",
      value: `${executiveMetrics.predictedFailures}`,
      hint: "AI risk forecast",
      rows: predictedFailureRows,
      info: `Predicted failures are calculated from critical vehicles plus a weighted share of warning vehicles. Poor health should be maintained first because the failure window is shortest.`,
    },
    {
      label: "Maintenance Forecast",
      value: `${executiveMetrics.maintenanceForecast}`,
      hint: "service demand",
      rows: maintenanceRows,
      info: `Maintenance forecast combines vehicles already in workshop with predicted failures. Service before these windows to avoid route disruption and emergency repair cost.`,
    },
  ];

  const topDriverVehicle = topPerformingRows[0];
  const aiExecutiveStory = `Fleet performance is ${healthStatus.label.toLowerCase()} with a health score of ${healthScoreValue}/100 across ${
    executiveMetrics.total || 0
  } monitored vehicles. Availability is ${
    executiveMetrics.availability
  }% with ${activeCount} active units, ${parkedCount} parked, and ${serviceCount} in workshop; utilization is ${
    executiveMetrics.utilization
  }% right now. Driver behavior is averaging ${
    executiveMetrics.avgDriver !== null
      ? `${executiveMetrics.avgDriver.toFixed(1)}/100`
      : "not available"
  }${
    topDriverVehicle?.driver
      ? `, led by ${topDriverVehicle.driver} at ${
          topDriverVehicle.driver_score ?? 0
        }/100`
      : ""
  }. AI is tracking ${executiveMetrics.predictedFailures} predicted failure${
    executiveMetrics.predictedFailures === 1 ? "" : "s"
  }, ${executiveMetrics.maintenanceForecast} maintenance item${
    executiveMetrics.maintenanceForecast === 1 ? "" : "s"
  }, and ${alertTotal ?? 0} live alert${
    (alertTotal ?? 0) === 1 ? "" : "s"
  }. Current risk is ${
    executiveMetrics.riskIndex
  }% from ${criticalCount} critical and ${warningCount} warning vehicle${
    criticalCount + warningCount === 1 ? "" : "s"
  }.`;

  function AiSummary({ summary }: { summary: FleetSummary }) {
    const criticalCount = positions?.filter((v) => {
      const h =
        v.status === "active"
          ? getVehicleHealth(v.vehicle_id, v.health)
          : v.health;

      return h < 50;
    }).length;

    const warningCount = positions?.filter((v) => {
      const h =
        v.status === "active"
          ? getVehicleHealth(v.vehicle_id, v.health)
          : v.health;

      return h >= 40 && h < 70;
    }).length;

    const items = [
      [`Fleet health is stable at ${liveAvgHealth}%.`, "active"],
      [`${criticalCount} vehicles require immediate attention.`, "critical"],
      [
        "Vehicle SIM_008 is currently Active with a battery level of 71%. Schedule charging soon to avoid potential service disruption.",
        "warning",
      ],
      ["Tire pressure anomalies increased 12% vs yesterday.", "warning"],
      [
        "Recommend scheduling maintenance for 3 vehicles within 48 hours.",
        "parked",
      ],
    ] as const;

    return (
      <Card
        sx={{
          p: 1,
          height: "100%",
          minHeight: 0,
          bgcolor: isDark ? "#0f172a" : "#ffffff",
          display: "flex",
          flexDirection: "column",
          ...(isDark && {
            border: "1px solid #3a3c44",
            opacity: 0.85,
            filter: "grayscale(22%)",
          }),
        }}
      >
        <SectionTitle
          title="AI Fleet Summary"
          action={
            <Button
              size="small"
              variant="outlined"
              sx={{ fontSize: "8px", p: "0px" }}
            >
              View All
            </Button>
          }
        />
        <Stack
          spacing={0.45}
          sx={{ mt: 0.3, minHeight: 0, overflow: "hidden" }}
        >
          {items.map(([text, severity]) => (
            <Stack key={text} direction="row" spacing={1} alignItems="center">
              <Box
                sx={{
                  width: 7,
                  height: 7,
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
              <Typography
                sx={{
                  fontSize: { xs: "8px", lg: "9px", xl: "10px" },
                  lineHeight: 1.15,
                  color: "text.secondary",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {text}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Card>
    );
  }

  return (
    <Box
      sx={{
        height: "100%",
        minHeight: 0,
        p: 0,
        color: "text.primary",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: isDark
          ? "radial-gradient(circle at 12% 0%, rgba(56,189,248,0.08), transparent 28%), linear-gradient(145deg, #050d17 0%, #07111e 52%, #091522 100%)"
          : "transparent",
      }}
    >
      <Stack
        spacing="var(--app-gap)"
        sx={{
          flex: {
            xs: "0 0 auto",
            lg: "0 0 auto",
            xl: "0 0 auto",
          },
          height: "auto",
          minHeight: 0,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <Stack
          direction={{ xs: "column", lg: "row" }}
          justifyContent="space-between"
          alignItems="center"
          spacing={{ xs: 0.5, lg: 2 }}
          sx={{ display: "none" }}
        >
          {/* Left */}
          <Box sx={{ minWidth: 220 }}>
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
              FLEET OVERVIEW
            </Typography>

            <Typography
              sx={{
                fontSize: "var(--app-font-sm)",
                color: "text.secondary",
                my: 0.3,
              }}
            >
              Real-time overview of your entire fleet
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            {/* Right */}
            <Stack
              direction="row"
              spacing={1}
              alignItems="center"
              justifyContent="flex-end"
            >
              <Tooltip title="Notifications">
                <IconButton
                  size="small"
                  sx={{
                    width: "var(--app-control-h)",
                    height: "var(--app-control-h)",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                  }}
                >
                  <NotificationsNoneOutlinedIcon
                    sx={{ fontSize: "var(--app-icon-md)" }}
                  />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              lg: "repeat(8, 1fr)",
              xl: "repeat(8, 1fr)",
            },
            gap: "var(--app-gap)",
            flexShrink: 0,
          }}
        >
          <KpiCard
            label="Total Fleet"
            value={allPositions.length || summary.total}
            delta="Registered Vehicles"
            icon={<LocalShippingOutlinedIcon />}
            color="#3b82f6"
            iconLogo={false}
            trend="down"
            selected={statusFilter === "all"}
            onClick={() => {
              setStatusFilter("all");
              setSelectedVehicle(null);
              setPopoverPosition(null);
              setVehiclePopoverAnchor(null);
              setPage(0);
            }}
          />
          <KpiCard
            label="Active Vehicles"
            value={allPositions.length ? activeCount : summary.active}
            delta="6 vs Yesterday"
            icon={<HealthAndSafetyOutlinedIcon />}
            color="#22c55e"
            iconLogo={true}
            trend="down"
            selected={statusFilter === "active"}
            onClick={() => {
              setStatusFilter(statusFilter === "active" ? "all" : "active");
              setSelectedVehicle(null);
              setPopoverPosition(null);
              setVehiclePopoverAnchor(null);
              setPage(0);
            }}
          />
          <KpiCard
            label="Parked"
            value={allPositions.length ? parkedCount : summary.parked}
            delta="6 vs Yesterday"
            icon={<TimelineOutlinedIcon />}
            color="#0ea5e9"
            iconLogo={true}
            trend="up"
            selected={statusFilter === "parked"}
            onClick={() => {
              setStatusFilter(statusFilter === "parked" ? "all" : "parked");
              setSelectedVehicle(null);
              setPopoverPosition(null);
              setVehiclePopoverAnchor(null);
              setPage(0);
            }}
          />
          <KpiCard
            label="Due for Service"
            value={allPositions.length ? serviceCount : summary.in_service}
            delta="Within 48 Hours"
            icon={<SettingsOutlinedIcon />}
            color="#8b5cf6"
            iconLogo={false}
            trend="up"
            selected={statusFilter === "in_service"}
            onClick={() => {
              setStatusFilter(
                statusFilter === "in_service" ? "all" : "in_service"
              );
              setSelectedVehicle(null);
              setPopoverPosition(null);
              setVehiclePopoverAnchor(null);
              setPage(0);
            }}
          />
          <KpiCard
            label="Critical Vehicles"
            value={criticalCount}
            delta="1 vs yesterday"
            icon={<ShieldOutlinedIcon />}
            color="#ef4444"
            trend="up"
            iconLogo={true}
            selected={statusFilter === "critical"}
            onClick={() => {
              setStatusFilter(statusFilter === "critical" ? "all" : "critical");
              setSelectedVehicle(null);
              setPopoverPosition(null);
              setVehiclePopoverAnchor(null);
              setPage(0);
            }}
          />
          <KpiCard
            label="Warning Vehicles"
            value={warningCount}
            delta="2 vs yesterday"
            icon={<WarningAmberOutlinedIcon />}
            color="#f59e0b"
            trend="down"
            iconLogo={true}
            selected={statusFilter === "warning"}
            onClick={() => {
              setStatusFilter(statusFilter === "warning" ? "all" : "warning");
              setSelectedVehicle(null);
              setPopoverPosition(null);
              setVehiclePopoverAnchor(null);
              setPage(0);
            }}
          />

          <KpiCard
            label="Avg Engine Health"
            value={`${avgEngineHealth}%`}
            delta="by 2% in 24 hours"
            icon={<SpeedOutlinedIcon />}
            color="#f97316"
            trend="up"
            iconLogo={true}
            // iconLogo={false}
          />

          <KpiCard
            label="Active Alerts"
            value={alertTotal !== null ? String(alertTotal) : "—"}
            delta={
              alertTotal !== null
                ? `${Math.max(
                    1,
                    Math.round(alertTotal * 0.18 + 1)
                  )} fewer than yesterday`
                : "fewer than yesterday"
            }
            icon={<ErrorOutlineOutlinedIcon />}
            color="#ef4444"
            trend="down"
            iconLogo={true}
            onClick={() => navigate("/fleet-health#alerts-feed")}
          />
        </Box>

        <Box
          sx={{
            display: "grid",
            // gridTemplateColumns: { xs: "1fr", xl: "1.9fr 1fr 0.8fr" },
            gap: "var(--app-gap)",
            // alignItems: "stretch",
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
          }}
        >
          <Box sx={{ flexGrow: 1, minHeight: 0, height: "100%" }}>
            <Grid
              container
              spacing={1}
              sx={{
                height: "28vh",
                minHeight: 300,
                maxHeight: 430,
              }}
            >
              {/* MAP */}
              <Grid item xs={12} sm={4} sx={{ minHeight: 0, height: "100%" }}>
                <Paper
                  sx={{
                    height: "100%",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}
                >
                  <Box
                    sx={{
                      flex: 1,
                      position: "relative",
                      minHeight: 0,
                      height: "100%",
                      ...(isDark && {
                        "& .leaflet-tile-pane": {
                          filter:
                            "invert(1) hue-rotate(180deg) contrast(0.82) brightness(1.45) saturate(1.15)",
                        },
                        "& .leaflet-control-zoom": {
                          border: "1px solid #1e293b !important",
                        },
                        "& .leaflet-control-zoom a": {
                          background: "#0f172a !important",
                          color: "#94a3b8 !important",
                          borderBottom: "1px solid #1e293b !important",
                        },
                        "& .leaflet-control-zoom a:hover": {
                          background: "#1e293b !important",
                          color: "#e2e8f0 !important",
                        },
                        "& .leaflet-control-attribution": {
                          background: "rgba(15,23,42,0.85) !important",
                          color: "#64748b !important",
                        },
                        "& .leaflet-control-attribution a": {
                          color: "#38bdf8 !important",
                        },
                      }),
                    }}
                  >
                    <MapContainer
                      center={[22.9937, 78.9629]}
                      zoom={4}
                      minZoom={2}
                      maxBounds={bounds}
                      maxBoundsViscosity={1.0}
                      worldCopyJump={false}
                      zoomControl={false}
                      attributionControl={false}
                      preferCanvas={true}
                      style={{ width: "100%", height: "100%" }}
                    >
                      <ZoomControl position="topright" />
                      <TileLayer
                        url={tileUrl}
                        attribution={tileAttribution}
                        keepBuffer={6}
                        updateWhenZooming={false}
                        updateWhenIdle={true}
                        maxNativeZoom={19}
                        maxZoom={19}
                      />
                      <MapController
                        selectedVehicle={selectedVehicle}
                        tripData={tripData ?? null}
                        isActive={isActive}
                      />

                      {mapVehicles.map((v) => (
                        <Marker
                          key={v.vehicle_id}
                          position={[v.lat, v.lng]}
                          icon={createVehicleIcon(
                            v.status,
                            v.liveHealth,
                            v.heading,
                            isDark
                          )}
                          eventHandlers={{
                            click: (e) =>
                              handleVehicleMarkerClick(v.vehicle_id, e),
                          }}
                        >
                          <LeafletTooltip
                            direction="top"
                            offset={[0, -12]}
                            opacity={0.96}
                            sticky
                          >
                            <Box sx={{ minWidth: 150 }}>
                              <Typography
                                sx={{ fontSize: 11, fontWeight: 900 }}
                              >
                                {v.name || v.vehicle_id}
                              </Typography>
                              <Typography sx={{ fontSize: 10 }}>
                                Health {Math.round(v.liveHealth)}% • Driver{" "}
                                {v.driver_score ?? 0}
                              </Typography>
                              <Typography sx={{ fontSize: 10 }}>
                                {formatStatusLabel(v.status)} •{" "}
                                {Math.round(v.speed ?? 0)} km/h
                              </Typography>
                              <Typography sx={{ fontSize: 10 }}>
                                {v.route_name || v.road_type || "No route"}
                              </Typography>
                            </Box>
                          </LeafletTooltip>
                        </Marker>
                      ))}

                      {selectedVehicle && completedRoute.length > 1 && (
                        <Polyline
                          positions={completedRoute}
                          pathOptions={{
                            color: "#22c55e",
                            weight: 4,
                            opacity: 0.9,
                          }}
                        />
                      )}
                      {selectedVehicle && remainingRoute.length > 1 && (
                        <Polyline
                          positions={remainingRoute}
                          pathOptions={{
                            color: "#6b7280",
                            weight: 2,
                            opacity: 0.5,
                            dashArray: "8 6",
                          }}
                        />
                      )}

                      {selectedVehicle && tripData?.events && (
                        <EventMarkers events={tripData.events} />
                      )}
                    </MapContainer>
                    <Tooltip title="Expand map" arrow>
                      <IconButton
                        size="small"
                        onClick={() => setOpenFleetMap(true)}
                        sx={{
                          position: "absolute",
                          top: 82,
                          right: 10,
                          zIndex: 1001,
                          width: 32,
                          height: 32,
                          borderRadius: 1,
                          bgcolor: isDark ? "#0f172a" : "#ffffff",
                          color: isDark ? "#e2e8f0" : "#0f172a",
                          border: `1px solid ${isDark ? "#1e293b" : "#cbd5e1"}`,
                          boxShadow: `0 8px 20px ${alpha(
                            "#000",
                            isDark ? 0.28 : 0.12
                          )}`,
                          "&:hover": {
                            bgcolor: isDark ? "#1e293b" : "#f8fafc",
                          },
                        }}
                      >
                        <OpenInFullIcon sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                    {/* Fleet Legend */}
                    <Paper
                      elevation={0}
                      sx={{
                        position: "absolute",
                        bottom: 16,
                        left: 16,
                        zIndex: 1000,
                        px: 1,
                        py: 0.75,
                        borderRadius: 1.5,
                        bgcolor: isDark ? "#0f172a" : "#ffffff",
                        backgroundImage: "none",
                        border: `1px solid ${
                          isDark ? "#1e293b" : theme.palette.divider
                        }`,
                        minWidth: 148,
                        isolation: "isolate",
                        filter: "none",
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
                        <Typography sx={{ fontSize: 11, fontWeight: 600 }}>
                          Fleet Status
                        </Typography>
                        <Tooltip title="Reset Filters">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setStatusFilterMap("all");
                              setVehicleType("all");
                              setSelectedPlant("all");
                              handleFleetFilter("all");
                            }}
                            sx={{
                              width: 20,
                              height: 20,
                              color:
                                statusFilter === "all"
                                  ? "text.disabled"
                                  : "primary.main",
                              "&:hover": { bgcolor: "action.hover" },
                            }}
                          >
                            <RestartAltOutlinedIcon sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>

                      <Stack spacing={0.3}>
                        <LegendItem
                          color="#22c55e"
                          label="Active"
                          value={summary.active}
                          selected={statusFilter === "active"}
                          onClick={() =>
                            setStatusFilter(
                              statusFilter === "active" ? "all" : "active"
                            )
                          }
                        />

                        <LegendItem
                          color="#3b82f6"
                          label="Parked"
                          value={summary.parked}
                          selected={statusFilter === "parked"}
                          onClick={() =>
                            setStatusFilter(
                              statusFilter === "parked" ? "all" : "parked"
                            )
                          }
                        />

                        <LegendItem
                          color="#8b5cf6"
                          label="In Workshop"
                          value={summary?.in_service ?? 0}
                          selected={statusFilter === "in_service"}
                          onClick={() =>
                            setStatusFilter(
                              statusFilter === "in_service"
                                ? "all"
                                : "in_service"
                            )
                          }
                        />

                        <LegendItem
                          color="#ef4444"
                          label="Critical"
                          value={criticalCount}
                          selected={statusFilter === "critical"}
                          onClick={() =>
                            setStatusFilter(
                              statusFilter === "critical" ? "all" : "critical"
                            )
                          }
                        />

                        <LegendItem
                          color="#f59e0b"
                          label="Warning"
                          value={warningCount}
                          selected={statusFilter === "warning"}
                          onClick={() =>
                            setStatusFilter(
                              statusFilter === "warning" ? "all" : "warning"
                            )
                          }
                        />
                      </Stack>
                    </Paper>
                  </Box>
                </Paper>
              </Grid>

              {/* KPI */}
              <Grid
                item
                xs={12}
                sm={8}
                md={8}
                lg={8}
                sx={{ minHeight: 0, height: "100%" }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gap: 0.75,
                    width: "100%",
                    height: "100%",
                    minHeight: 0,
                    gridTemplateColumns: "repeat(20, minmax(0, 1fr))",
                    gridTemplateRows: "repeat(2, minmax(0, 1fr))",
                    gridAutoRows: "minmax(0, 1fr)",
                  }}
                >
                  <Card
                    sx={{
                      p: 1,
                      minHeight: 0,
                      height: "100%",
                      display: "grid",
                      gridTemplateRows: "auto 1fr auto",
                      gap: 0.25,
                      gridColumn: { xs: "span 20", sm: "span 5" },
                      overflow: "hidden",
                      border: `1px solid ${alpha(topHealthColor, 0.28)}`,
                      background: isDark
                        ? `linear-gradient(145deg, ${alpha(
                            topHealthColor,
                            0.14
                          )}, rgba(15,23,42,0.92))`
                        : `linear-gradient(145deg, ${alpha(
                            topHealthColor,
                            0.08
                          )}, #ffffff)`,
                    }}
                  >
                    <Typography sx={topCardTitleSx}>
                      Fleet Health Score
                    </Typography>
                    <Box sx={{ minHeight: 0 }}>
                      <HealthGauge
                        value={healthScoreValue}
                        color={topHealthColor}
                        formatter="{value}"
                      />
                    </Box>
                    <Box sx={{ textAlign: "center", mt: -1 }}>
                      <Typography sx={topCardMetaSx}>/100</Typography>
                      <Typography
                        sx={{ ...topCardSubSx, color: topHealthColor }}
                      >
                        {scoreLabel(healthScoreValue)}
                      </Typography>
                    </Box>
                  </Card>
                  <Card
                    sx={{
                      p: 1,
                      minHeight: 0,
                      height: "100%",
                      display: "grid",
                      gridTemplateRows: "auto auto 1fr",
                      alignItems: "start",
                      gap: 0.55,
                      gridColumn: { xs: "span 20", sm: "span 5" },
                      overflow: "hidden",
                      border: `1px solid ${alpha(topAvailabilityColor, 0.28)}`,
                      background: isDark
                        ? `linear-gradient(145deg, ${alpha(
                            topAvailabilityColor,
                            0.12
                          )}, rgba(15,23,42,0.92))`
                        : `linear-gradient(145deg, ${alpha(
                            topAvailabilityColor,
                            0.08
                          )}, #ffffff)`,
                    }}
                  >
                    <Typography sx={topCardTitleSx}>
                      Fleet Availability
                    </Typography>
                    <Box sx={{ minHeight: 0 }}>
                      <Typography
                        sx={{ ...topCardValueSx, color: topAvailabilityColor }}
                      >
                        {availabilityScore}%
                      </Typography>
                      <Typography sx={{ ...topCardMetaSx, mt: 0.2 }}>
                        {activeCount + parkedCount}/
                        {executiveMetrics.total || 0} Vehicles
                      </Typography>
                    </Box>
                    <Stack spacing={0.25} sx={{ minHeight: 0 }}>
                      {availabilityRows.map((row) => (
                        <Box
                          key={row.label}
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "10px 1fr auto",
                            alignItems: "center",
                            gap: 0.5,
                          }}
                        >
                          <Box
                            sx={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              bgcolor: row.color,
                            }}
                          />
                          <Typography sx={topCardMetaSx} noWrap>
                            {row.label}
                          </Typography>
                          <Typography
                            sx={{
                              ...topCardMetaSx,
                              color: isDark ? "#e2e8f0" : "#0f172a",
                            }}
                          >
                            {row.value}
                          </Typography>
                        </Box>
                      ))}
                    </Stack>
                  </Card>
                  <Card
                    sx={{
                      p: 1,
                      minHeight: 0,
                      height: "100%",
                      display: "grid",
                      gridTemplateRows: "auto auto auto 1fr",
                      alignItems: "start",
                      gap: 0.4,
                      gridColumn: { xs: "span 20", sm: "span 5" },
                      overflow: "hidden",
                      border: `1px solid ${alpha(topUtilizationColor, 0.28)}`,
                      background: isDark
                        ? `linear-gradient(145deg, ${alpha(
                            topUtilizationColor,
                            0.12
                          )}, rgba(15,23,42,0.92))`
                        : `linear-gradient(145deg, ${alpha(
                            topUtilizationColor,
                            0.08
                          )}, #ffffff)`,
                    }}
                  >
                    <Typography sx={topCardTitleSx}>
                      Utilization Score
                    </Typography>
                    <Typography
                      sx={{
                        ...topCardValueSx,
                        color: topUtilizationColor,
                        textAlign: "center",
                      }}
                    >
                      {utilizationScore}%
                    </Typography>
                    <Typography
                      sx={{
                        ...topCardSubSx,
                        color: topUtilizationColor,
                        textAlign: "center",
                      }}
                    >
                      {activeCount} active now
                    </Typography>
                    <Box sx={{ alignSelf: "end", minHeight: 0 }}>
                      <MiniSparkline
                        values={utilizationTrend}
                        color={topUtilizationColor}
                      />
                    </Box>
                  </Card>
                  <Card
                    sx={{
                      p: 1,
                      minHeight: 0,
                      height: "100%",
                      display: "grid",
                      gridTemplateRows: "auto 1fr auto",
                      gap: 0.25,
                      gridColumn: { xs: "span 20", sm: "span 5" },
                      overflow: "hidden",
                      border: `1px solid ${alpha(topRiskColor, 0.28)}`,
                      background: isDark
                        ? `linear-gradient(145deg, ${alpha(
                            topRiskColor,
                            0.12
                          )}, rgba(15,23,42,0.92))`
                        : `linear-gradient(145deg, ${alpha(
                            topRiskColor,
                            0.08
                          )}, #ffffff)`,
                    }}
                  >
                    <Typography sx={topCardTitleSx}>AI Risk Index</Typography>
                    <Box sx={{ minHeight: 0 }}>
                      <HealthGauge
                        value={riskScore}
                        color={topRiskColor}
                        formatter="{value}%"
                      />
                    </Box>
                    <Box sx={{ textAlign: "center", mt: -0.5 }}>
                      <Typography sx={{ ...topCardSubSx, color: topRiskColor }}>
                        {riskLabel(riskScore)}
                      </Typography>
                      <Typography sx={topCardMetaSx}>
                        {executiveMetrics.atRisk} vehicles at risk
                      </Typography>
                    </Box>
                  </Card>
                  {chartCards.map((card) => {
                    const maxValue = Math.max(
                      1,
                      ...card.rows.map((row) => row.value)
                    );
                    const isAlerts = card.label === "Alerts Summary";
                    const isPredictions = card.label === "Predicted Failures";
                    const isMaintenance = card.label === "Maintenance Forecast";
                    return (
                      <React.Fragment key={card.label}>
                        <Card
                          sx={{
                            p: 1,
                            minHeight: 0,
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            gap: 0.5,
                            gridColumn: { xs: "span 20", sm: "span 5" },
                            overflow: "hidden",
                            border: `1px solid ${alpha(
                              card.rows[0].color,
                              0.22
                            )}`,
                            background: isDark
                              ? `linear-gradient(145deg, ${alpha(
                                  card.rows[0].color,
                                  0.12
                                )}, rgba(15,23,42,0.92))`
                              : `linear-gradient(145deg, ${alpha(
                                  card.rows[0].color,
                                  0.07
                                )}, #ffffff)`,
                          }}
                        >
                          <Stack
                            direction="row"
                            alignItems="center"
                            justifyContent="space-between"
                            spacing={0.5}
                          >
                            <Typography
                              sx={{
                                fontSize: 10,
                                fontWeight: 900,
                                color: "text.secondary",
                                textTransform: "none",
                                lineHeight: 1.1,
                              }}
                            >
                              {card.label}
                            </Typography>
                            <Stack
                              direction="row"
                              spacing={0.6}
                              alignItems="center"
                            >
                              {isMaintenance && (
                                <Box sx={{ textAlign: "right" }}>
                                  <Typography
                                    sx={{
                                      fontSize: 15,
                                      fontWeight: 900,
                                      color: "#22c55e",
                                      lineHeight: 1,
                                    }}
                                  >
                                    {card.value} Vehicles
                                  </Typography>
                                  <Typography
                                    sx={{
                                      fontSize: 8,
                                      color: "text.secondary",
                                      fontWeight: 700,
                                    }}
                                  >
                                    Need service soon
                                  </Typography>
                                </Box>
                              )}
                              <Tooltip title={card.info} arrow>
                                <InfoOutlinedIcon
                                  sx={{
                                    fontSize: 14,
                                    color: "text.secondary",
                                    flexShrink: 0,
                                  }}
                                />
                              </Tooltip>
                            </Stack>
                          </Stack>
                          {isAlerts && (
                            <Stack
                              spacing={0.55}
                              sx={{ mt: 0.25, minHeight: 0 }}
                            >
                              {card.rows.map((row) => (
                                <Tooltip
                                  key={row.label}
                                  title={row.reason}
                                  arrow
                                  placement="top"
                                >
                                  <Box
                                    sx={{
                                      display: "grid",
                                      gridTemplateColumns: "24px 1fr auto",
                                      alignItems: "center",
                                      gap: 0.65,
                                      px: 0.65,
                                      py: 0.55,
                                      borderRadius: 1,
                                      bgcolor: alpha(
                                        row.color,
                                        isDark ? 0.13 : 0.08
                                      ),
                                      border: `1px solid ${alpha(
                                        row.color,
                                        0.12
                                      )}`,
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: "50%",
                                        bgcolor: alpha(row.color, 0.15),
                                        display: "grid",
                                        placeItems: "center",
                                      }}
                                    >
                                      <WarningAmberOutlinedIcon
                                        sx={{ fontSize: 14, color: row.color }}
                                      />
                                    </Box>
                                    <Typography
                                      sx={{
                                        fontSize: 9,
                                        fontWeight: 900,
                                        color: row.color,
                                        lineHeight: 1.1,
                                      }}
                                    >
                                      {row.label}
                                    </Typography>
                                    <Typography
                                      sx={{
                                        fontSize: 13,
                                        fontWeight: 900,
                                        color: isDark ? "#f8fafc" : "#0f172a",
                                      }}
                                    >
                                      {row.value}
                                    </Typography>
                                  </Box>
                                </Tooltip>
                              ))}
                            </Stack>
                          )}
                          {isPredictions && (
                            <Stack
                              spacing={0.65}
                              sx={{ mt: 0.25, minHeight: 0 }}
                            >
                              {card.rows.map((row) => (
                                <Tooltip
                                  key={row.label}
                                  title={row.reason}
                                  arrow
                                  placement="top"
                                >
                                  <Box
                                    sx={{
                                      display: "grid",
                                      gridTemplateColumns: "24px 1fr",
                                      gap: 0.7,
                                      alignItems: "center",
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: "50%",
                                        bgcolor: alpha(row.color, 0.16),
                                        display: "grid",
                                        placeItems: "center",
                                      }}
                                    >
                                      <ErrorOutlineOutlinedIcon
                                        sx={{ fontSize: 13, color: row.color }}
                                      />
                                    </Box>
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography
                                        sx={{
                                          fontSize: 10,
                                          fontWeight: 900,
                                          color: isDark ? "#e2e8f0" : "#0f172a",
                                          lineHeight: 1.05,
                                        }}
                                      >
                                        {row.value} Vehicles
                                      </Typography>
                                      <Typography
                                        sx={{
                                          fontSize: 8.5,
                                          fontWeight: 700,
                                          color: "text.secondary",
                                          lineHeight: 1.15,
                                        }}
                                        noWrap
                                      >
                                        {row.label}
                                      </Typography>
                                    </Box>
                                  </Box>
                                </Tooltip>
                              ))}
                            </Stack>
                          )}
                          {isMaintenance && (
                            <Box
                              sx={{
                                flex: 1,
                                minHeight: 0,
                                display: "grid",
                                gridTemplateColumns: "20px 1fr",
                                gap: 0.5,
                                alignItems: "end",
                                mt: 0.2,
                              }}
                            >
                              <Box
                                sx={{
                                  height: "100%",
                                  display: "grid",
                                  gridTemplateRows: "repeat(4, 1fr)",
                                  color: "text.secondary",
                                }}
                              >
                                {[30, 20, 10, 0].map((tick) => (
                                  <Typography
                                    key={tick}
                                    sx={{
                                      fontSize: 7.5,
                                      lineHeight: 1,
                                      alignSelf: "end",
                                    }}
                                  >
                                    {tick}
                                  </Typography>
                                ))}
                              </Box>
                              <Box
                                sx={{
                                  height: "100%",
                                  display: "grid",
                                  gridTemplateColumns: `repeat(${card.rows.length}, 1fr)`,
                                  alignItems: "end",
                                  gap: 0.8,
                                }}
                              >
                                {card.rows.map((row) => (
                                  <Tooltip
                                    key={row.label}
                                    title={row.reason}
                                    arrow
                                    placement="top"
                                  >
                                    <Box
                                      sx={{
                                        height: "100%",
                                        display: "grid",
                                        gridTemplateRows: "1fr auto",
                                        alignItems: "end",
                                        minWidth: 0,
                                      }}
                                    >
                                      <Box
                                        sx={{
                                          height: "100%",
                                          display: "flex",
                                          alignItems: "end",
                                          justifyContent: "center",
                                          position: "relative",
                                        }}
                                      >
                                        <Typography
                                          sx={{
                                            position: "absolute",
                                            bottom: `${Math.max(
                                              14,
                                              (row.value / maxValue) * 100
                                            )}%`,
                                            mb: 0.25,
                                            fontSize: 8,
                                            fontWeight: 900,
                                            color: isDark
                                              ? "#e2e8f0"
                                              : "#0f172a",
                                          }}
                                        >
                                          {row.value}
                                        </Typography>
                                        <Box
                                          sx={{
                                            width: "55%",
                                            height: `${Math.max(
                                              12,
                                              (row.value / maxValue) * 82
                                            )}%`,
                                            minHeight: 12,
                                            bgcolor: row.color,
                                            borderRadius: "3px 3px 0 0",
                                            boxShadow: `0 0 14px ${alpha(
                                              row.color,
                                              0.28
                                            )}`,
                                          }}
                                        />
                                      </Box>
                                      <Typography
                                        sx={{
                                          fontSize: 7.5,
                                          fontWeight: 800,
                                          color: "text.secondary",
                                          lineHeight: 1.05,
                                          textAlign: "center",
                                        }}
                                      >
                                        {row.label}
                                      </Typography>
                                    </Box>
                                  </Tooltip>
                                ))}
                              </Box>
                            </Box>
                          )}
                        </Card>
                        {isAlerts && (
                          <Box
                            sx={{
                              gridColumn: { xs: "span 20", sm: "span 5" },
                              minHeight: 0,
                            }}
                          >
                            <Card
                              sx={{
                                p: 1,
                                width: "100%",
                                height: "100%",
                                display: "grid",
                                gridTemplateRows: "auto 1fr auto",
                                gap: 0.45,
                                overflow: "hidden",
                                border: `1px solid ${alpha(
                                  executiveMetrics.avgDriver !== null &&
                                    executiveMetrics.avgDriver >= 85
                                    ? "#22c55e"
                                    : executiveMetrics.avgDriver !== null &&
                                      executiveMetrics.avgDriver >= 70
                                    ? "#f59e0b"
                                    : "#ef4444",
                                  0.28
                                )}`,
                              }}
                            >
                              <Stack
                                direction="row"
                                alignItems="center"
                                justifyContent="space-between"
                              >
                                <Typography sx={{ fontSize: 10, fontWeight: 900 }}>
                                  Overall Driver Score
                                </Typography>
                                <Tooltip
                                  title="Uses avg_driver_score from the backend fleet summary. If that field is absent, the card calculates the arithmetic mean of available vehicle driver_score values and excludes vehicles without a score."
                                  arrow
                                >
                                  <InfoOutlinedIcon
                                    aria-label="Overall Driver Score calculation"
                                    sx={{ fontSize: 14, color: "text.secondary" }}
                                  />
                                </Tooltip>
                              </Stack>
                              {executiveMetrics.avgDriver !== null ? (
                                <Stack justifyContent="center" spacing={0.75} sx={{ px: 0.8 }}>
                                  <Box sx={{ textAlign: "center" }}>
                                    <Typography
                                      sx={{
                                        fontSize: 27,
                                        lineHeight: 1,
                                        fontWeight: 950,
                                        color:
                                          executiveMetrics.avgDriver >= 85
                                            ? "#22c55e"
                                            : executiveMetrics.avgDriver >= 70
                                            ? "#f59e0b"
                                            : "#ef4444",
                                      }}
                                    >
                                      {executiveMetrics.avgDriver.toFixed(1)}
                                      <Box component="span" sx={{ fontSize: 11, color: "text.secondary" }}>
                                        /100
                                      </Box>
                                    </Typography>
                                    <Typography sx={{ mt: 0.35, fontSize: 9, fontWeight: 800, color: "text.secondary" }}>
                                      {executiveMetrics.avgDriver >= 85
                                        ? "Strong performance"
                                        : executiveMetrics.avgDriver >= 70
                                        ? "Coaching opportunity"
                                        : "Needs attention"}
                                    </Typography>
                                  </Box>
                                  <LinearProgress
                                    variant="determinate"
                                    value={Math.max(0, Math.min(100, executiveMetrics.avgDriver))}
                                    sx={{
                                      height: 6,
                                      borderRadius: 999,
                                      bgcolor: alpha("#94a3b8", 0.18),
                                      "& .MuiLinearProgress-bar": {
                                        borderRadius: 999,
                                        bgcolor:
                                          executiveMetrics.avgDriver >= 85
                                            ? "#22c55e"
                                            : executiveMetrics.avgDriver >= 70
                                            ? "#f59e0b"
                                            : "#ef4444",
                                      },
                                    }}
                                  />
                                </Stack>
                              ) : (
                                <Stack alignItems="center" justifyContent="center">
                                  <Typography sx={{ fontSize: 13, fontWeight: 900 }}>No data</Typography>
                                </Stack>
                              )}
                              <Typography sx={{ fontSize: 8.5, color: "text.secondary", textAlign: "center" }} noWrap>
                                {executiveMetrics.driverScoreSource}
                              </Typography>
                            </Card>
                          </Box>
                        )}
                      </React.Fragment>
                    );
                  })}
                </Box>
              </Grid>
            </Grid>

            <Dialog
              open={openFleetMap}
              onClose={() => setOpenFleetMap(false)}
              fullWidth
              maxWidth="xl"
            >
              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
                  bgcolor: isDark ? "#0f172a" : "#ffffff",
                }}
              >
                <Typography sx={{ fontSize: 14, fontWeight: 800 }}>
                  Fleet Map
                </Typography>
                <IconButton size="small" onClick={() => setOpenFleetMap(false)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
              <DialogContent
                sx={{
                  p: 0,
                  height: "82vh",
                  position: "relative",
                  ...(isDark && {
                    "& .leaflet-tile-pane": {
                      filter:
                        "invert(1) hue-rotate(180deg) contrast(0.82) brightness(1.45) saturate(1.15)",
                    },
                    "& .leaflet-control-zoom": {
                      border: "1px solid #1e293b !important",
                    },
                    "& .leaflet-control-zoom a": {
                      background: "#0f172a !important",
                      color: "#94a3b8 !important",
                      borderBottom: "1px solid #1e293b !important",
                    },
                  }),
                }}
              >
                <MapContainer
                  center={[22.9937, 78.9629]}
                  zoom={5}
                  minZoom={2}
                  maxBounds={bounds}
                  maxBoundsViscosity={1.0}
                  worldCopyJump={false}
                  zoomControl={false}
                  attributionControl={false}
                  preferCanvas={true}
                  style={{ width: "100%", height: "100%" }}
                >
                  <ZoomControl position="topright" />
                  <TileLayer
                    url={tileUrl}
                    attribution={tileAttribution}
                    keepBuffer={6}
                    updateWhenZooming={false}
                    updateWhenIdle={true}
                    maxNativeZoom={19}
                    maxZoom={19}
                  />
                  <MapController
                    selectedVehicle={selectedVehicle}
                    tripData={tripData ?? null}
                    isActive={isActive}
                  />
                  {mapVehicles.map((v) => (
                    <Marker
                      key={`expanded-${v.vehicle_id}`}
                      position={[v.lat, v.lng]}
                      icon={createVehicleIcon(
                        v.status,
                        v.liveHealth,
                        v.heading,
                        isDark
                      )}
                      eventHandlers={{
                        click: (e) => handleVehicleMarkerClick(v.vehicle_id, e),
                      }}
                    >
                      <LeafletTooltip
                        direction="top"
                        offset={[0, -12]}
                        opacity={0.96}
                        sticky
                      >
                        <Box sx={{ minWidth: 150 }}>
                          <Typography sx={{ fontSize: 11, fontWeight: 900 }}>
                            {v.name || v.vehicle_id}
                          </Typography>
                          <Typography sx={{ fontSize: 10 }}>
                            Health {Math.round(v.liveHealth)}% • Driver{" "}
                            {v.driver_score ?? 0}
                          </Typography>
                          <Typography sx={{ fontSize: 10 }}>
                            {formatStatusLabel(v.status)} •{" "}
                            {Math.round(v.speed ?? 0)} km/h
                          </Typography>
                          <Typography sx={{ fontSize: 10 }}>
                            {v.route_name || v.road_type || "No route"}
                          </Typography>
                        </Box>
                      </LeafletTooltip>
                    </Marker>
                  ))}
                  {selectedVehicle && completedRoute.length > 1 && (
                    <Polyline
                      positions={completedRoute}
                      pathOptions={{
                        color: "#22c55e",
                        weight: 4,
                        opacity: 0.9,
                      }}
                    />
                  )}
                  {selectedVehicle && remainingRoute.length > 1 && (
                    <Polyline
                      positions={remainingRoute}
                      pathOptions={{
                        color: "#6b7280",
                        weight: 2,
                        opacity: 0.5,
                        dashArray: "8 6",
                      }}
                    />
                  )}
                  {selectedVehicle && tripData?.events && (
                    <EventMarkers events={tripData.events} />
                  )}
                </MapContainer>
                <Paper
                  elevation={0}
                  sx={{
                    position: "absolute",
                    bottom: 18,
                    left: 18,
                    zIndex: 1000,
                    px: 1,
                    py: 0.75,
                    borderRadius: 1.5,
                    bgcolor: isDark ? "#0f172a" : "#ffffff",
                    backgroundImage: "none",
                    border: `1px solid ${
                      isDark ? "#1e293b" : theme.palette.divider
                    }`,
                    minWidth: 160,
                    isolation: "isolate",
                    filter: "none",
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
                    <Typography sx={{ fontSize: 11, fontWeight: 700 }}>
                      Fleet Status
                    </Typography>
                    <Tooltip title="Reset Filters">
                      <IconButton
                        size="small"
                        onClick={() => {
                          setStatusFilterMap("all");
                          setVehicleType("all");
                          setSelectedPlant("all");
                          handleFleetFilter("all");
                        }}
                        sx={{
                          width: 20,
                          height: 20,
                          color:
                            statusFilter === "all"
                              ? "text.disabled"
                              : "primary.main",
                          "&:hover": { bgcolor: "action.hover" },
                        }}
                      >
                        <RestartAltOutlinedIcon sx={{ fontSize: 13 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Stack spacing={0.3}>
                    <LegendItem
                      color="#22c55e"
                      label="Active"
                      value={summary.active}
                      selected={statusFilter === "active"}
                      onClick={() =>
                        setStatusFilter(
                          statusFilter === "active" ? "all" : "active"
                        )
                      }
                    />
                    <LegendItem
                      color="#3b82f6"
                      label="Parked"
                      value={summary.parked}
                      selected={statusFilter === "parked"}
                      onClick={() =>
                        setStatusFilter(
                          statusFilter === "parked" ? "all" : "parked"
                        )
                      }
                    />
                    <LegendItem
                      color="#8b5cf6"
                      label="In Workshop"
                      value={summary?.in_service ?? 0}
                      selected={statusFilter === "in_service"}
                      onClick={() =>
                        setStatusFilter(
                          statusFilter === "in_service" ? "all" : "in_service"
                        )
                      }
                    />
                    <LegendItem
                      color="#ef4444"
                      label="Critical"
                      value={criticalCount}
                      selected={statusFilter === "critical"}
                      onClick={() =>
                        setStatusFilter(
                          statusFilter === "critical" ? "all" : "critical"
                        )
                      }
                    />
                    <LegendItem
                      color="#f59e0b"
                      label="Warning"
                      value={warningCount}
                      selected={statusFilter === "warning"}
                      onClick={() =>
                        setStatusFilter(
                          statusFilter === "warning" ? "all" : "warning"
                        )
                      }
                    />
                  </Stack>
                </Paper>
              </DialogContent>
            </Dialog>

            <Popover
              open={Boolean(selectedVehicle && popoverPosition)}
              onClose={handleCloseVehicle}
              onMouseDown={handleDragStart}
              anchorReference="anchorPosition"
              anchorPosition={
                popoverPosition
                  ? {
                      top: popoverPosition.top - 170,
                      left: popoverPosition.left + 80,
                    }
                  : undefined
              }
              transformOrigin={{
                vertical: "top",
                horizontal: "left",
              }}
              sx={{ pointerEvents: "none" }}
              disableScrollLock
              disableEnforceFocus
              disableAutoFocus
              BackdropProps={{ invisible: true, sx: { pointerEvents: "none" } }}
              slotProps={{
                paper: {
                  sx: {
                    pointerEvents: "auto",
                    width: selectedIsActive ? "36%" : 310,
                    maxWidth: selectedIsActive ? "36%" : 310,

                    minHeight: selectedIsActive ? 380 : "auto",
                    maxHeight: "95vh",

                    overflow: "auto",

                    borderRadius: 3,
                    boxShadow: 12,

                    display: "flex",
                    flexDirection: "column",

                    bgcolor: "background.paper",

                    transform: `translate(${dragPos.x}px, ${dragPos.y}px) !important`,

                    /* ---------- GLOBAL TYPOGRAPHY ---------- */

                    /* Default text */
                    "& .MuiTypography-root": {
                      fontSize: "10px",
                    },

                    /* Headings */
                    "& h1, & h2, & h3, & h4, & h5, & h6": {
                      fontSize: "16px !important",
                      fontWeight: 700,
                    },

                    /* Explicit heading typography */
                    '& .MuiTypography-root[font-weight="700"]': {
                      fontSize: "16px",
                    },

                    /* Numeric values */
                    "& .metric-value, & .number-value": {
                      fontSize: "18px !important",
                      fontWeight: 800,
                    },

                    /* Tabs */
                    "& .MuiTab-root": {
                      fontSize: "10px !important",
                    },

                    /* Chips */
                    "& .MuiChip-label": {
                      fontSize: "10px",
                    },

                    /* Buttons */
                    "& .MuiButtonBase-root": {
                      fontSize: "10px",
                    },

                    /* Captions */
                    "& .MuiTypography-caption": {
                      fontSize: "10px",
                    },

                    /* Graph text */
                    "& .recharts-text": {
                      fontSize: "10px !important",
                    },

                    "& .recharts-cartesian-axis-tick-value": {
                      fontSize: "10px !important",
                    },

                    "& .recharts-legend-item-text": {
                      fontSize: "10px !important",
                    },

                    "& svg text": {
                      fontSize: "10px !important",
                    },
                  },
                },
              }}
            >
              {selectedIsActive && (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    px: 1,
                    pt: 0.5,
                    alignItems: "center",
                    borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
                  }}
                >
                  <Box>
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 700,
                        fontSize: "14px !important",
                      }}
                    >
                      Vehicle Insights
                    </Typography>
                  </Box>

                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Button
                      size="small"
                      variant="outlined"
                      sx={{
                        fontSize: "8px",
                        py: "1px",
                        px: "6px",
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => {
                        setSelectedVehicle(null);
                        navigate(
                          `/automotive?vehicle=${encodeURIComponent(
                            selectedVehicle ?? ""
                          )}`
                        );
                      }}
                    >
                      Deep Dive →
                    </Button>
                    <IconButton
                      size="small"
                      onClick={() => setSelectedVehicle(null)}
                      sx={{ alignSelf: "flex-start", p: 0.5 }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>
              )}
              {vehicleDetail && (
                <Box
                  sx={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {(() => {
                    const h =
                      vehicleDetail.status === "active"
                        ? getVehicleHealth(
                            vehicleDetail.vehicle_id,
                            vehicleDetail.health
                          )
                        : vehicleDetail.health;

                    const mods =
                      vehicleDetail.status === "active"
                        ? getModuleHealth(
                            vehicleDetail.vehicle_id,
                            vehicleDetail.module_health || {}
                          )
                        : vehicleDetail.module_health || {};

                    // ── INACTIVE VEHICLE CARD ──────────────────────────────
                    if (vehicleDetail.status !== "active") {
                      const inactiveStatusMeta: Record<
                        string,
                        { color: string; label: string }
                      > = {
                        parked: { color: "#3b82f6", label: "Parked" },
                        in_service: { color: "#8b5cf6", label: "In Workshop" },
                        warning: { color: "#f59e0b", label: "Warning" },
                        critical: { color: "#ef4444", label: "Critical" },
                      };
                      const st = inactiveStatusMeta[vehicleDetail.status] ?? {
                        color: "#64748b",
                        label: vehicleDetail.status,
                      };
                      const hColor = healthColor(h);
                      const dScore = vehicleDetail.driver_score ?? 0;
                      const dScoreColor =
                        dScore >= 80
                          ? "#22c55e"
                          : dScore >= 60
                          ? "#f59e0b"
                          : "#ef4444";
                      const ringR = 22,
                        ringCx = 26,
                        ringCy = 26,
                        ringCirc = 2 * Math.PI * 22;
                      const hPct = Math.min(h / 100, 1);
                      const dividerColor = isDark ? "#1e293b" : "#e2e8f0";
                      const trackBg = isDark ? "#1e293b" : "#e2e8f0";

                      return (
                        <>
                          {/* ── DRAG HEADER ─────────────────────── */}
                          <Box
                            onMouseDown={handleDragStart}
                            sx={{
                              px: 1.5,
                              py: 1.25,
                              borderBottom: `1px solid ${dividerColor}`,
                              cursor: "grab",
                              userSelect: "none",
                              bgcolor: isDark ? "#0f172a" : "#f8fafc",
                              "&:active": { cursor: "grabbing" },
                            }}
                          >
                            <Stack
                              direction="row"
                              justifyContent="space-between"
                              alignItems="flex-start"
                            >
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Box
                                  sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                    px: 0.8,
                                    py: 0.2,
                                    borderRadius: 5,
                                    bgcolor: alpha(st.color, 0.12),
                                    border: `1px solid ${alpha(
                                      st.color,
                                      0.25
                                    )}`,
                                    mb: 0.6,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      bgcolor: st.color,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <Typography
                                    sx={{
                                      fontSize: "9px !important",
                                      fontWeight: 700,
                                      color: st.color,
                                      textTransform: "uppercase",
                                      letterSpacing: ".06em",
                                    }}
                                  >
                                    {st.label}
                                  </Typography>
                                </Box>
                                <Typography
                                  sx={{
                                    fontSize: "15px !important",
                                    fontWeight: 800,
                                    lineHeight: 1.2,
                                    color: isDark ? "#f1f5f9" : "#0f172a",
                                  }}
                                >
                                  {vehicleDetail.name.toUpperCase()}
                                </Typography>
                                <Typography
                                  sx={{
                                    fontSize: "10px !important",
                                    color: "text.secondary",
                                    mt: 0.25,
                                  }}
                                >
                                  {vehicleDetail.vehicle_id} ·{" "}
                                  {vehicleDetail.type}
                                </Typography>
                              </Box>
                              <Stack
                                direction="row"
                                spacing={0.5}
                                alignItems="center"
                                sx={{ ml: 1, flexShrink: 0 }}
                              >
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={() => {
                                    setSelectedVehicle(null);
                                    navigate(
                                      `/automotive?vehicle=${encodeURIComponent(
                                        vehicleDetail.vehicle_id
                                      )}`
                                    );
                                  }}
                                  sx={{
                                    fontSize: "7px",
                                    py: "1px",
                                    px: "5px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Deep Dive →
                                </Button>
                                <IconButton
                                  size="small"
                                  onClick={() => setSelectedVehicle(null)}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  sx={{ p: 0.4, flexShrink: 0 }}
                                >
                                  <CloseIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Stack>
                            </Stack>
                            <Stack
                              direction="row"
                              spacing={0.75}
                              alignItems="center"
                              sx={{ mt: 0.9 }}
                            >
                              <Box
                                sx={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: "50%",
                                  bgcolor: getAvatarColor(
                                    vehicleDetail.driver ?? ""
                                  ),
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontSize: "8px !important",
                                    fontWeight: 700,
                                    color: "#fff",
                                    lineHeight: 1,
                                  }}
                                >
                                  {getDriverInitials(
                                    vehicleDetail.driver ?? ""
                                  )}
                                </Typography>
                              </Box>
                              <Typography
                                sx={{
                                  fontSize: "10px !important",
                                  fontWeight: 600,
                                }}
                              >
                                {vehicleDetail.driver || "Unassigned"}
                              </Typography>
                              {vehicleDetail.city && (
                                <>
                                  <Box
                                    sx={{
                                      width: 3,
                                      height: 3,
                                      borderRadius: "50%",
                                      bgcolor: "text.disabled",
                                      flexShrink: 0,
                                    }}
                                  />
                                  <Typography
                                    sx={{
                                      fontSize: "10px !important",
                                      color: "text.secondary",
                                    }}
                                  >
                                    {vehicleDetail.city}
                                  </Typography>
                                </>
                              )}
                            </Stack>
                          </Box>

                          {/* ── HEALTH + DRIVER SCORE ───────────── */}
                          <Box
                            sx={{
                              px: 1.5,
                              py: 1.25,
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 1.5,
                              borderBottom: `1px solid ${dividerColor}`,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 0.5,
                              }}
                            >
                              <Box
                                sx={{
                                  position: "relative",
                                  width: 52,
                                  height: 52,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <svg
                                  width={52}
                                  height={52}
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    transform: "rotate(-90deg)",
                                  }}
                                >
                                  <circle
                                    cx={ringCx}
                                    cy={ringCy}
                                    r={ringR}
                                    fill="none"
                                    stroke={trackBg}
                                    strokeWidth={4}
                                  />
                                  <circle
                                    cx={ringCx}
                                    cy={ringCy}
                                    r={ringR}
                                    fill="none"
                                    stroke={hColor}
                                    strokeWidth={4}
                                    strokeDasharray={`${hPct * ringCirc} ${
                                      (1 - hPct) * ringCirc
                                    }`}
                                    strokeLinecap="round"
                                  />
                                </svg>
                                <Typography
                                  sx={{
                                    fontSize: "10px !important",
                                    fontWeight: 800,
                                    color: hColor,
                                    zIndex: 1,
                                    lineHeight: 1,
                                  }}
                                >
                                  {h.toFixed(0)}%
                                </Typography>
                              </Box>
                              <Typography
                                sx={{
                                  fontSize: "9px !important",
                                  color: "text.secondary",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: ".06em",
                                }}
                              >
                                Health
                              </Typography>
                            </Box>

                            <Box
                              sx={{
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                gap: 0.75,
                              }}
                            >
                              <Typography
                                sx={{
                                  fontSize: "9px !important",
                                  color: "text.secondary",
                                  fontWeight: 600,
                                  textTransform: "uppercase",
                                  letterSpacing: ".06em",
                                }}
                              >
                                Driver Score
                              </Typography>
                              <Stack
                                direction="row"
                                spacing={0.5}
                                alignItems="baseline"
                              >
                                <Typography
                                  sx={{
                                    fontSize: "22px !important",
                                    fontWeight: 800,
                                    color: dScoreColor,
                                    lineHeight: 1,
                                  }}
                                >
                                  {dScore}
                                </Typography>
                                <Typography
                                  sx={{
                                    fontSize: "10px !important",
                                    color: "text.secondary",
                                  }}
                                >
                                  /100
                                </Typography>
                              </Stack>
                              <LinearProgress
                                variant="determinate"
                                value={dScore}
                                sx={{
                                  height: 5,
                                  borderRadius: 3,
                                  bgcolor: trackBg,
                                  "& .MuiLinearProgress-bar": {
                                    bgcolor: dScoreColor,
                                    borderRadius: 3,
                                  },
                                }}
                              />
                            </Box>
                          </Box>

                          {/* ── MODULE HEALTH BARS ──────────────── */}
                          {Object.keys(mods).length > 0 && (
                            <Box
                              sx={{
                                px: 1.5,
                                py: 1.25,
                                borderBottom: `1px solid ${dividerColor}`,
                              }}
                            >
                              <Typography
                                sx={{
                                  fontSize: "9px !important",
                                  fontWeight: 700,
                                  color: "text.secondary",
                                  textTransform: "uppercase",
                                  letterSpacing: ".06em",
                                  mb: 1,
                                }}
                              >
                                Module Health
                              </Typography>
                              <Stack spacing={0.85}>
                                {Object.entries(mods).map(([mod, val]) => {
                                  const mc = healthColor(val as number);
                                  return (
                                    <Box key={mod}>
                                      <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="center"
                                        sx={{ mb: 0.35 }}
                                      >
                                        <Typography
                                          sx={{
                                            fontSize: "10px !important",
                                            fontWeight: 600,
                                            textTransform: "capitalize",
                                          }}
                                        >
                                          {mod}
                                        </Typography>
                                        <Stack
                                          direction="row"
                                          spacing={0.4}
                                          alignItems="center"
                                        >
                                          {(val as number) < 60 && (
                                            <WarningAmberOutlinedIcon
                                              sx={{
                                                fontSize: 10,
                                                color: "#f59e0b",
                                              }}
                                            />
                                          )}
                                          <Typography
                                            sx={{
                                              fontSize: "10px !important",
                                              fontWeight: 700,
                                              color: mc,
                                            }}
                                          >
                                            {(val as number).toFixed(0)}%
                                          </Typography>
                                        </Stack>
                                      </Stack>
                                      <LinearProgress
                                        variant="determinate"
                                        value={val as number}
                                        sx={{
                                          height: 4,
                                          borderRadius: 3,
                                          bgcolor: trackBg,
                                          "& .MuiLinearProgress-bar": {
                                            bgcolor: mc,
                                            borderRadius: 3,
                                          },
                                        }}
                                      />
                                    </Box>
                                  );
                                })}
                              </Stack>
                            </Box>
                          )}

                          {/* ── LAST KNOWN LOCATION ─────────────── */}
                          {(vehicleDetail.road_type ||
                            vehicleDetail.route_name) && (
                            <Box sx={{ px: 1.5, py: 1.25 }}>
                              <Typography
                                sx={{
                                  fontSize: "9px !important",
                                  fontWeight: 700,
                                  color: "text.secondary",
                                  textTransform: "uppercase",
                                  letterSpacing: ".06em",
                                  mb: 0.75,
                                }}
                              >
                                Last Known Location
                              </Typography>
                              <Stack spacing={0.5}>
                                {vehicleDetail.road_type && (
                                  <Stack
                                    direction="row"
                                    spacing={0.75}
                                    alignItems="center"
                                  >
                                    <RouteIcon
                                      sx={{
                                        fontSize: 13,
                                        color: "text.secondary",
                                        flexShrink: 0,
                                      }}
                                    />
                                    <Typography
                                      sx={{
                                        fontSize: "10px !important",
                                        color: isDark ? "#cbd5e1" : "#475569",
                                      }}
                                    >
                                      {vehicleDetail.road_type
                                        .replace(/_/g, " ")
                                        .replace(/\b\w/g, (c) =>
                                          c.toUpperCase()
                                        )}
                                    </Typography>
                                  </Stack>
                                )}
                                {vehicleDetail.route_name && (
                                  <Stack
                                    direction="row"
                                    spacing={0.75}
                                    alignItems="center"
                                  >
                                    <LocationOnIcon
                                      sx={{
                                        fontSize: 13,
                                        color: "#3b82f6",
                                        flexShrink: 0,
                                      }}
                                    />
                                    <Typography
                                      sx={{ fontSize: "10px !important" }}
                                      noWrap
                                      title={vehicleDetail.route_name}
                                    >
                                      {vehicleDetail.route_name}
                                    </Typography>
                                  </Stack>
                                )}
                              </Stack>
                            </Box>
                          )}

                          {/* ── LAST TRIP SUMMARY ───────────────── */}
                          {lastTripData?.last_trip && (
                            <Box
                              sx={{
                                px: 1.5,
                                py: 1.25,
                                borderTop: `1px solid ${dividerColor}`,
                              }}
                            >
                              <Typography
                                sx={{
                                  fontSize: "9px !important",
                                  fontWeight: 700,
                                  color: "text.secondary",
                                  textTransform: "uppercase",
                                  letterSpacing: ".06em",
                                  mb: 0.75,
                                }}
                              >
                                Last Trip
                              </Typography>
                              <Stack spacing={0.6}>
                                <Stack
                                  direction="row"
                                  justifyContent="space-between"
                                >
                                  <Typography
                                    sx={{
                                      fontSize: "10px !important",
                                      color: "text.secondary",
                                    }}
                                  >
                                    {new Date(
                                      lastTripData.last_trip.end_time
                                    ).toLocaleDateString("en-IN", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </Typography>
                                  <Typography
                                    sx={{
                                      fontSize: "10px !important",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {lastTripData.last_trip.distance_km.toFixed(
                                      1
                                    )}{" "}
                                    km
                                  </Typography>
                                </Stack>
                                <Stack
                                  direction="row"
                                  justifyContent="space-between"
                                >
                                  <Typography
                                    sx={{
                                      fontSize: "10px !important",
                                      color: "text.secondary",
                                    }}
                                  >
                                    {Math.floor(
                                      lastTripData.last_trip.duration_secs /
                                        3600
                                    )}
                                    h{" "}
                                    {Math.round(
                                      (lastTripData.last_trip.duration_secs %
                                        3600) /
                                        60
                                    )}
                                    m ·{" "}
                                    {lastTripData.last_trip.avg_speed_kmh.toFixed(
                                      0
                                    )}{" "}
                                    km/h avg
                                  </Typography>
                                </Stack>
                                {lastTripData.last_trip.event_count > 0 && (
                                  <Stack
                                    direction="row"
                                    spacing={1}
                                    sx={{ mt: 0.25 }}
                                  >
                                    {[
                                      [
                                        "Brake",
                                        lastTripData.last_trip
                                          .harsh_braking_count,
                                        "#ef4444",
                                      ],
                                      [
                                        "Accel",
                                        lastTripData.last_trip
                                          .harsh_accel_count,
                                        "#f59e0b",
                                      ],
                                      [
                                        "Corner",
                                        lastTripData.last_trip
                                          .harsh_cornering_count,
                                        "#3b82f6",
                                      ],
                                    ].map(([label, count, color]) => (
                                      <Box
                                        key={label as string}
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 0.3,
                                          px: 0.6,
                                          py: 0.2,
                                          borderRadius: 1,
                                          bgcolor: alpha(
                                            color as string,
                                            0.1
                                          ),
                                        }}
                                      >
                                        <Typography
                                          sx={{
                                            fontSize: "9px !important",
                                            fontWeight: 700,
                                            color: color as string,
                                          }}
                                        >
                                          {count as number}
                                        </Typography>
                                        <Typography
                                          sx={{
                                            fontSize: "9px !important",
                                            color: "text.secondary",
                                          }}
                                        >
                                          {label as string}
                                        </Typography>
                                      </Box>
                                    ))}
                                  </Stack>
                                )}
                              </Stack>
                            </Box>
                          )}

                          {/* ── FLEET TOTALS (driver summary) ───── */}
                          {lastTripData?.driver_summary && (
                            <Box
                              sx={{
                                px: 1.5,
                                py: 1.25,
                                borderTop: `1px solid ${dividerColor}`,
                              }}
                            >
                              <Typography
                                sx={{
                                  fontSize: "9px !important",
                                  fontWeight: 700,
                                  color: "text.secondary",
                                  textTransform: "uppercase",
                                  letterSpacing: ".06em",
                                  mb: 0.75,
                                }}
                              >
                                Lifetime Stats
                              </Typography>
                              <Stack
                                direction="row"
                                justifyContent="space-between"
                              >
                                <Box sx={{ textAlign: "center" }}>
                                  <Typography
                                    sx={{
                                      fontSize: "14px !important",
                                      fontWeight: 800,
                                      lineHeight: 1,
                                    }}
                                  >
                                    {lastTripData.driver_summary.total_km.toFixed(
                                      0
                                    )}
                                  </Typography>
                                  <Typography
                                    sx={{
                                      fontSize: "8px !important",
                                      color: "text.secondary",
                                      mt: 0.25,
                                    }}
                                  >
                                    km
                                  </Typography>
                                </Box>
                                <Box sx={{ textAlign: "center" }}>
                                  <Typography
                                    sx={{
                                      fontSize: "14px !important",
                                      fontWeight: 800,
                                      lineHeight: 1,
                                    }}
                                  >
                                    {lastTripData.driver_summary.total_hours.toFixed(
                                      1
                                    )}
                                  </Typography>
                                  <Typography
                                    sx={{
                                      fontSize: "8px !important",
                                      color: "text.secondary",
                                      mt: 0.25,
                                    }}
                                  >
                                    hrs
                                  </Typography>
                                </Box>
                                <Box sx={{ textAlign: "center" }}>
                                  <Typography
                                    sx={{
                                      fontSize: "14px !important",
                                      fontWeight: 800,
                                      lineHeight: 1,
                                    }}
                                  >
                                    {lastTripData.driver_summary
                                      .harsh_braking_count +
                                      lastTripData.driver_summary
                                        .harsh_accel_count +
                                      lastTripData.driver_summary
                                        .harsh_cornering_count}
                                  </Typography>
                                  <Typography
                                    sx={{
                                      fontSize: "8px !important",
                                      color: "text.secondary",
                                      mt: 0.25,
                                    }}
                                  >
                                    events
                                  </Typography>
                                </Box>
                              </Stack>
                            </Box>
                          )}
                        </>
                      );
                    }
                    // ── END INACTIVE CARD ──────────────────────────────────

                    return (
                      <>
                        {/* HEADER */}
                        <Box
                          onMouseDown={handleDragStart}
                          sx={{
                            width: "100%",

                            px: 0.8,
                            py: 0.5,

                            borderBottom: `1px solid ${theme.palette.divider}`,

                            display: "flex",
                            alignItems: "stretch",

                            gap: 1,

                            cursor: "grab",
                            userSelect: "none",

                            "&:active": {
                              cursor: "grabbing",
                            },
                          }}
                        >
                          {/* LEFT INFO */}
                          <Box
                            sx={{
                              minWidth: 170,
                              maxWidth: 170,

                              bgcolor: "#005071",
                              color: "#fff",

                              px: 1,
                              py: 0.8,

                              borderRadius: 2,

                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "center",

                              gap: 0.15,
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "14px !important",
                                fontWeight: 800,
                                mb: 0.4,
                                whiteSpace: "nowrap",
                              }}
                            >
                              {vehicleDetail.name.toUpperCase()}
                            </Typography>

                            {[
                              ["Vehicle ID", vehicleDetail.vehicle_id],
                              ["Type", vehicleDetail.type],
                              ["Driver", vehicleDetail.driver],
                              [
                                "Status",
                                (vehicleDetail.status as string) ===
                                "in_service"
                                  ? "In Workshop"
                                  : vehicleDetail.status
                                      ?.replace(/_/g, " ")
                                      .replace(/\b\w/g, (c) => c.toUpperCase()),
                              ],
                            ].map(([label, value]) => (
                              <Box
                                key={label}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  minHeight: 14,
                                }}
                              >
                                <Typography
                                  sx={{
                                    width: 75,
                                    fontWeight: 800,
                                    fontSize: "10px",
                                  }}
                                >
                                  {label}:
                                </Typography>

                                <Typography
                                  sx={{
                                    flex: 1,
                                    fontSize: "10px",

                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {value}
                                </Typography>
                              </Box>
                            ))}
                          </Box>

                          {/* RIGHT GRID */}
                          <Box
                            sx={{
                              flex: 1,

                              display: "grid",

                              gridTemplateColumns: "repeat(3,minmax(70px,1fr))",

                              gridAutoRows: "44px",

                              gap: 0.6,
                            }}
                          >
                            <Paper
                              elevation={0}
                              sx={{
                                borderRadius: 2,

                                bgcolor: alpha(healthColor(h), 0.08),

                                display: "flex",
                                flexDirection: "column",

                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              <Typography
                                // className="number-value"
                                sx={{
                                  color: healthColor(h),
                                  lineHeight: 1,
                                  fontSize: "18px !important",
                                  fontWeight: 800,
                                }}
                              >
                                {h.toFixed(1)}
                              </Typography>

                              <Typography sx={{ fontSize: "8px", mt: 0.4 }}>
                                HEALTH
                              </Typography>
                            </Paper>

                            {Object.entries(mods)
                              .slice(0, 5)
                              .map(([mod, val]) => (
                                <Paper
                                  key={mod}
                                  elevation={0}
                                  sx={{
                                    borderRadius: 2,

                                    border: `1px solid ${alpha(
                                      healthColor(val),
                                      0.25
                                    )}`,

                                    display: "flex",
                                    flexDirection: "column",

                                    justifyContent: "center",
                                    alignItems: "center",
                                  }}
                                >
                                  <Typography
                                    // className="number-value"
                                    sx={{
                                      color: healthColor(val),
                                      lineHeight: 1,
                                      fontSize: "14px !important",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {val.toFixed(0)}
                                  </Typography>

                                  <Typography
                                    sx={{
                                      fontSize: "8px !important",
                                      mt: 1,
                                    }}
                                  >
                                    {mod.toUpperCase()}
                                  </Typography>
                                </Paper>
                              ))}
                          </Box>
                        </Box>
                        {/* TABS */}
                        {vehicleDetail.status === "active" && (
                          <>
                            <Tabs
                              value={drawerTab}
                              onChange={(_, v) => setDrawerTab(v)}
                              variant="fullWidth"
                              sx={{
                                minHeight: 25,
                                height: 25,
                                // mt: 1,
                                bgcolor: isDark ? "#0f172a" : "#EEF9FD",

                                borderBottom: `1px solid ${
                                  isDark ? "#1e293b" : "#CDECF5"
                                }`,

                                "& .MuiTabs-flexContainer": {
                                  height: 30,
                                },

                                "& .MuiTab-root": {
                                  flex: 1,

                                  minHeight: 25,
                                  height: 25,

                                  minWidth: 0,

                                  py: 0,
                                  px: 1,

                                  fontSize: "10px",
                                  fontWeight: 700,

                                  color: isDark ? "#64748b" : "#4A6B77",

                                  bgcolor: isDark ? "#111827" : "#EAF7FB",

                                  transition: "all .2s ease",

                                  textTransform: "none",
                                },

                                "& .MuiTab-root:not(:last-child)": {
                                  borderRight: `1px solid ${
                                    isDark ? "#1e293b" : "#D6EEF6"
                                  }`,
                                },

                                "& .Mui-selected": {
                                  bgcolor: isDark ? "#1e293b" : "#DCF3FA",
                                  color: isDark ? "#38bdf8" : "#005071",
                                },

                                "& .MuiTabs-indicator": {
                                  height: 3,
                                  backgroundColor: isDark
                                    ? "#0ea5e9"
                                    : "#8FCFE3",
                                },
                              }}
                            >
                              <Tab label="TRIP" />
                              <Tab label="BEHAVIOR" />
                              <Tab label="ROAD" />
                            </Tabs>

                            <Box
                              sx={{
                                p: 1,
                                overflow: "auto",
                                flex: 0,
                              }}
                            >
                              {/* ================= TRIP ================= */}
                              {drawerTab === 0 && tripData && (
                                <>
                                  <Box
                                    sx={{
                                      display: "flex",
                                      gap: 1,
                                      alignItems: "stretch",
                                      mb: 2,
                                    }}
                                  >
                                    {/* Trip */}
                                    <Paper
                                      variant="outlined"
                                      sx={{
                                        flex: 1,
                                        p: 1,
                                        borderRadius: 3,
                                      }}
                                    >
                                      {/* Route */}
                                      <Box
                                        sx={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: 1,
                                          mb: 4,
                                          mt: 1,
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                          }}
                                        >
                                          <LocationOnIcon
                                            sx={{
                                              color: "#2563EB",
                                              fontSize: 15,
                                            }}
                                          />

                                          <Typography fontWeight={700}>
                                            {tripData.origin}
                                          </Typography>
                                        </Box>

                                        <Typography color="text.secondary">
                                          →
                                        </Typography>

                                        <Box
                                          sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                          }}
                                        >
                                          <LocationOnIcon
                                            sx={{
                                              color: "#F97316",
                                              fontSize: 15,
                                            }}
                                          />

                                          <Typography fontWeight={700}>
                                            {tripData.destination}
                                          </Typography>
                                        </Box>
                                      </Box>

                                      {/* Distance */}
                                      <Box
                                        sx={{
                                          display: "flex",
                                          justifyContent: "space-between",
                                          mb: 1,
                                        }}
                                      >
                                        <Box>
                                          <Typography
                                            sx={{
                                              fontWeight: 700,
                                              fontSize: "14px !important",
                                              lineHeight: "1px",
                                            }}
                                          >
                                            {tripData.distance_completed_km} km
                                          </Typography>

                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ fontSize: "8px !important" }}
                                          >
                                            DISTANCE COVERED
                                          </Typography>
                                        </Box>

                                        <Box sx={{ textAlign: "right" }}>
                                          <Typography
                                            sx={{
                                              fontWeight: 700,
                                              fontSize: "14px !important",
                                              lineHeight: "1px",
                                            }}
                                          >
                                            {tripData.distance_total_km} km
                                          </Typography>

                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                            sx={{ fontSize: "8px !important" }}
                                          >
                                            TOTAL DISTANCE
                                          </Typography>
                                        </Box>
                                      </Box>

                                      {/* Progress */}
                                      <LinearProgress
                                        variant="determinate"
                                        value={tripData.progress_pct}
                                        sx={{
                                          height: 10,
                                          borderRadius: 10,

                                          bgcolor: isDark
                                            ? "#1e293b"
                                            : "#DCEEFF",

                                          "& .MuiLinearProgress-bar": {
                                            backgroundColor: "#2563EB",
                                            borderRadius: 10,
                                          },
                                        }}
                                      />

                                      <Typography
                                        mt={1}
                                        variant="caption"
                                        color="text.secondary"
                                      >
                                        {tripData.progress_pct.toFixed(1)}%
                                        complete
                                      </Typography>
                                    </Paper>

                                    {/* Current */}
                                    <Paper
                                      variant="outlined"
                                      sx={{
                                        width: 170,

                                        p: 0.8,

                                        borderRadius: 3,

                                        display: "flex",
                                        flexDirection: "column",

                                        alignItems: "center",
                                        justifyContent: "center",

                                        gap: 0.8,
                                      }}
                                    >
                                      {/* Title */}
                                      <Typography
                                        sx={{
                                          fontSize: "10px",
                                          fontWeight: 700,
                                          color: isDark ? "#38bdf8" : "#005071",
                                          letterSpacing: 0.5,
                                        }}
                                      >
                                        CURRENT
                                      </Typography>

                                      {/* Semi Gauge */}
                                      <Box
                                        sx={{
                                          position: "relative",
                                          width: 120,
                                          height: 60,
                                          overflow: "hidden",
                                        }}
                                      >
                                        {(() => {
                                          const speed = Math.min(
                                            liveSelectedPosition?.speed ??
                                              vehicleDetail.speed ??
                                              0,
                                            120
                                          );
                                          const percentage = speed / 120;
                                          const angle = percentage * 180;

                                          return (
                                            <>
                                              {/* Track */}
                                              <Box
                                                sx={{
                                                  position: "absolute",
                                                  width: 120,
                                                  height: 120,
                                                  borderRadius: "50%",
                                                  background: isDark
                                                    ? "#1e293b"
                                                    : "#DCEEFF",
                                                  clipPath: "inset(0 0 50% 0)",
                                                }}
                                              />

                                              {/* Progress */}
                                              <Box
                                                sx={{
                                                  position: "absolute",
                                                  width: 120,
                                                  height: 120,
                                                  borderRadius: "50%",
                                                  background: `conic-gradient(
                                                    from 270deg,
                                                    #2563EB ${angle}deg,
                                                    ${
                                                      isDark
                                                        ? "#1e293b"
                                                        : "#DCEEFF"
                                                    } ${angle}deg
                                                  )`,
                                                  clipPath: "inset(0 0 50% 0)",
                                                  transition: "all .5s ease",
                                                }}
                                              />

                                              {/* Inner Circle */}
                                              <Box
                                                sx={{
                                                  position: "absolute",
                                                  top: 10,
                                                  left: 10,
                                                  width: 100,
                                                  height: 100,
                                                  borderRadius: "50%",
                                                  bgcolor: isDark
                                                    ? "#0f172a"
                                                    : "#fff",
                                                  clipPath: "inset(0 0 50% 0)",
                                                }}
                                              />

                                              {/* Value */}
                                              <Box
                                                sx={{
                                                  position: "absolute",
                                                  inset: 0,
                                                  display: "flex",
                                                  flexDirection: "column",
                                                  justifyContent: "center",
                                                  alignItems: "center",
                                                  pt: 1.5,
                                                }}
                                              >
                                                <Typography
                                                  sx={{
                                                    fontSize: 16,
                                                    fontWeight: 700,
                                                    color: isDark
                                                      ? "#38bdf8"
                                                      : "#005071",
                                                    lineHeight: 1,
                                                  }}
                                                >
                                                  {speed.toFixed(0)}
                                                </Typography>

                                                <Typography
                                                  sx={{
                                                    fontSize: 9,
                                                    color: "text.secondary",
                                                  }}
                                                >
                                                  km/h
                                                </Typography>
                                              </Box>
                                            </>
                                          );
                                        })()}
                                      </Box>

                                      {/* Bottom Pills */}
                                      <Box
                                        sx={{
                                          display: "flex",
                                          flexDirection: "column",

                                          gap: 0.6,

                                          width: "60%",
                                        }}
                                      >
                                        {/* Road Type */}
                                        <Box
                                          sx={{
                                            display: "flex",

                                            justifyContent: "center",
                                            alignItems: "center",

                                            py: 0.4,

                                            border: `1px solid ${
                                              isDark ? "#1e40af" : "#2563EB"
                                            }`,

                                            bgcolor: isDark
                                              ? "#0f172a"
                                              : "#EEF5FF",

                                            borderRadius: "50px",
                                          }}
                                        >
                                          <Typography
                                            sx={{
                                              fontSize: "8px",

                                              fontWeight: 700,

                                              color: isDark
                                                ? "#38bdf8"
                                                : "#005071",

                                              textTransform: "uppercase",
                                            }}
                                          >
                                            {vehicleDetail.road_type}
                                          </Typography>
                                        </Box>

                                        {/* Heading */}
                                        <Box
                                          sx={{
                                            display: "flex",

                                            justifyContent: "center",
                                            alignItems: "center",

                                            gap: 0.5,

                                            py: 0.4,

                                            border: `1px solid ${
                                              isDark ? "#1e40af" : "#2563EB"
                                            }`,

                                            borderRadius: "50px",

                                            bgcolor: isDark
                                              ? "#0f172a"
                                              : "#EEF5FF",
                                          }}
                                        >
                                          <ExploreIcon
                                            sx={{
                                              color: "#2563EB",

                                              fontSize: 10,

                                              transform: `rotate(${
                                                liveSelectedPosition?.heading ??
                                                vehicleDetail.heading ??
                                                0
                                              }deg)`,
                                            }}
                                          />

                                          <Typography
                                            sx={{
                                              fontSize: "8px",

                                              fontWeight: 700,

                                              color: isDark
                                                ? "#38bdf8"
                                                : "#005071",
                                            }}
                                          >
                                            HDG{" "}
                                            {(
                                              liveSelectedPosition?.heading ??
                                              vehicleDetail.heading ??
                                              0
                                            ).toFixed(0)}
                                            °
                                          </Typography>
                                        </Box>
                                      </Box>
                                    </Paper>
                                  </Box>

                                  {/* Events */}
                                  <Paper
                                    variant="outlined"
                                    sx={{
                                      borderRadius: 3,
                                      p: 1,
                                    }}
                                  >
                                    <Typography fontWeight={700}>
                                      EVENTS ON ROUTE ({tripData.events.length})
                                    </Typography>

                                    <Box
                                      sx={{
                                        mt: 1,
                                        maxHeight: 170,
                                        overflow: "auto",
                                      }}
                                    >
                                      {tripData.events
                                        .slice(-20)
                                        .reverse()
                                        .map((e, i) => (
                                          <Box
                                            key={i}
                                            sx={{
                                              display: "flex",
                                              gap: 1,
                                              py: 1,
                                              borderBottom: `1px solid ${
                                                isDark ? "#1e293b" : "#eee"
                                              }`,
                                              alignItems: "center",
                                            }}
                                          >
                                            <Box
                                              sx={{
                                                width: 18,
                                                height: 18,
                                                bgcolor: EVENT_COLORS[e.type],
                                                color: "#fff",
                                                display: "flex",
                                                justifyContent: "center",
                                                alignItems: "center",
                                                fontWeight: 700,
                                              }}
                                            >
                                              {EVENT_LABELS[e.type]}
                                            </Box>

                                            <Typography
                                              variant="body2"
                                              sx={{
                                                fontSize: "10px !important",
                                              }}
                                            >
                                              {e.type.toUpperCase()} •{" "}
                                              {e.distance_km} km • {e.speed}{" "}
                                              km/h • G(
                                              {e.acc_x.toFixed(2)})
                                            </Typography>
                                          </Box>
                                        ))}
                                    </Box>
                                  </Paper>
                                </>
                              )}

                              {/* ================= BEHAVIOR ================= */}

                              {drawerTab === 1 && behaviorData && (
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                      }}
                                    >
                                      <Typography
                                        sx={{
                                          fontSize: "10px !important",
                                          mr: 1,
                                        }}
                                      >
                                        Total Events:
                                      </Typography>

                                      <Typography
                                        variant="h6"
                                        sx={{
                                          fontSize: "12px",
                                          color: "#FB4E0B",
                                        }}
                                      >
                                        {behaviorData.event_summary.total}
                                      </Typography>
                                    </Box>

                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                      }}
                                    >
                                      <Typography
                                        sx={{
                                          fontSize: "10px !important",
                                          mr: 1,
                                        }}
                                      >
                                        Distance:
                                      </Typography>

                                      <Typography
                                        variant="h6"
                                        sx={{
                                          fontSize: "12px",
                                          color: "#FB4E0B",
                                        }}
                                      >
                                        {behaviorData.trip_distance_km} km
                                      </Typography>
                                    </Box>
                                  </Box>

                                  <Box
                                    sx={{
                                      display: "flex",
                                      gap: 1,
                                      height: "60%",
                                      // alignItems: "stretch",
                                    }}
                                  >
                                    {/* DRIVER SCORE */}
                                    <Paper
                                      variant="outlined"
                                      sx={{
                                        flex: 0,
                                        p: 1,
                                        borderRadius: 3,
                                        height: "70%",
                                        display: "flex",
                                        flexDirection: "column",

                                        alignItems: "center",
                                      }}
                                    >
                                      <Typography
                                        sx={{
                                          fontWeight: 700,
                                          mb: 1,
                                        }}
                                      >
                                        DRIVER SCORE
                                      </Typography>

                                      <ScoreGauge
                                        score={behaviorData.current_score}
                                        label=""
                                      />
                                    </Paper>

                                    {/* RISK PROFILE */}
                                    <Paper
                                      variant="outlined"
                                      sx={{
                                        flex: 1,
                                        p: 1,
                                        borderRadius: 3,
                                        height: "70%",
                                        display: "flex",
                                        flexDirection: "column",
                                      }}
                                    >
                                      <Typography
                                        sx={{
                                          fontWeight: 700,
                                          mb: 1,
                                        }}
                                      >
                                        RISK PROFILE
                                      </Typography>

                                      <RiskRadar data={behaviorData} />
                                    </Paper>
                                  </Box>

                                  <Paper
                                    variant="outlined"
                                    sx={{
                                      p: 1,
                                      borderRadius: 3,
                                    }}
                                  >
                                    <Typography fontWeight={700} mb={2}>
                                      SCORE TIMELINE
                                    </Typography>

                                    <ScoreTimeline data={behaviorData} />
                                  </Paper>

                                  <Box
                                    sx={{
                                      display: "flex",
                                      gap: 2,
                                    }}
                                  >
                                    <Paper
                                      variant="outlined"
                                      sx={{
                                        flex: 1,
                                        p: 1,
                                        borderRadius: 3,
                                      }}
                                    >
                                      <Typography fontWeight={700} mb={2}>
                                        TRACTION
                                      </Typography>

                                      <TractionCircle data={behaviorData} />
                                    </Paper>
                                  </Box>
                                </Box>
                              )}

                              {/* ================= ROAD ================= */}

                              {drawerTab === 2 && behaviorData && (
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexDirection: "column",

                                    gap: 1,

                                    width: "100%",
                                    minWidth: 0,
                                  }}
                                >
                                  {/* SPEED */}
                                  <Paper
                                    variant="outlined"
                                    sx={{
                                      width: "100%",
                                      minWidth: 0,

                                      p: 1,

                                      borderRadius: 3,

                                      overflow: "hidden",
                                    }}
                                  >
                                    <Typography fontWeight={700} mb={1}>
                                      SPEED BY ROAD
                                    </Typography>

                                    <SpeedByRoad data={behaviorData} />
                                  </Paper>

                                  {tripData && (
                                    <>
                                      {/* ROAD BREAKDOWN */}
                                      <Paper
                                        variant="outlined"
                                        sx={{
                                          width: "100%",
                                          minWidth: 0,

                                          p: 1,

                                          borderRadius: 3,

                                          overflow: "hidden",
                                        }}
                                      >
                                        <Typography fontWeight={700} mb={1}>
                                          ROAD TYPE BREAKDOWN
                                        </Typography>

                                        {(() => {
                                          const counts = {};

                                          tripData.route
                                            .slice(
                                              0,
                                              tripData.completed_index + 1
                                            )
                                            .forEach((p) => {
                                              counts[p.road_type] =
                                                (counts[p.road_type] || 0) + 1;
                                            });

                                          const total =
                                            Object.values(counts).reduce(
                                              (a, b) => a + b,
                                              0
                                            ) || 1;

                                          const colors = {
                                            highway: "#2563eb",
                                            primary: "#9333ea",
                                            urban: "#f59e0b",
                                          };

                                          return (
                                            <>
                                              {/* BAR */}
                                              <Box
                                                sx={{
                                                  width: "100%",

                                                  display: "flex",

                                                  height: 10,

                                                  borderRadius: 20,

                                                  overflow: "hidden",
                                                }}
                                              >
                                                {Object.entries(counts).map(
                                                  ([rt, c]) => (
                                                    <Box
                                                      key={rt}
                                                      sx={{
                                                        width: `${
                                                          (c / total) * 100
                                                        }%`,
                                                        bgcolor:
                                                          colors[rt] || "#999",
                                                      }}
                                                    />
                                                  )
                                                )}
                                              </Box>

                                              {/* LABELS */}
                                              <Box
                                                sx={{
                                                  width: "100%",

                                                  display: "flex",

                                                  mt: 0.8,
                                                }}
                                              >
                                                {Object.entries(counts).map(
                                                  ([rt, c]) => (
                                                    <Box
                                                      key={rt}
                                                      sx={{
                                                        width: `${
                                                          (c / total) * 100
                                                        }%`,

                                                        minWidth: 0,

                                                        textAlign: "center",
                                                      }}
                                                    >
                                                      <Typography
                                                        sx={{
                                                          fontSize: "8px",
                                                          fontWeight: 700,

                                                          textTransform:
                                                            "uppercase",

                                                          overflow: "hidden",
                                                          textOverflow:
                                                            "ellipsis",
                                                        }}
                                                      >
                                                        {rt}
                                                      </Typography>

                                                      <Typography
                                                        sx={{
                                                          fontSize: "8px",
                                                          color:
                                                            "text.secondary",
                                                        }}
                                                      >
                                                        {(
                                                          (c / total) *
                                                          100
                                                        ).toFixed(0)}
                                                        %
                                                      </Typography>
                                                    </Box>
                                                  )
                                                )}
                                              </Box>
                                            </>
                                          );
                                        })()}
                                      </Paper>

                                      {/* THRESHOLDS */}
                                      <Paper
                                        variant="outlined"
                                        sx={{
                                          width: "100%",
                                          minWidth: 0,

                                          p: 1,

                                          borderRadius: 3,

                                          overflow: "hidden",
                                        }}
                                      >
                                        <Typography
                                          sx={{
                                            fontWeight: 700,
                                            mb: 1,
                                          }}
                                        >
                                          ADAPTIVE THRESHOLDS
                                        </Typography>

                                        <Box
                                          sx={{
                                            display: "flex",

                                            flexWrap: "wrap",

                                            rowGap: 0.5,
                                            columnGap: 0.8,
                                          }}
                                        >
                                          {[
                                            "Highway cornering: 0.25g",
                                            "Urban cornering: 0.45g",
                                            "Harsh braking: -0.35g",
                                            "Harsh acceleration: 0.25g",
                                          ].map((item, idx, arr) => (
                                            <React.Fragment key={item}>
                                              <Typography
                                                sx={{
                                                  fontSize: "10px",

                                                  color: isDark
                                                    ? "#38bdf8"
                                                    : "#005071",

                                                  whiteSpace: "normal",
                                                }}
                                              >
                                                {item}
                                              </Typography>

                                              {idx !== arr.length - 1 && (
                                                <Typography
                                                  sx={{
                                                    color: "#90A4AE",
                                                    fontSize: "10px",
                                                  }}
                                                >
                                                  |
                                                </Typography>
                                              )}
                                            </React.Fragment>
                                          ))}
                                        </Box>
                                      </Paper>
                                    </>
                                  )}
                                </Box>
                              )}
                            </Box>
                          </>
                        )}
                      </>
                    );
                  })()}
                </Box>
              )}
            </Popover>
          </Box>
          {/* <RecentAlerts /> */}
        </Box>
      </Stack>

      <Box
        sx={{
          display: "grid",
          // gridTemplateColumns: { xs: "1fr", xl: "1.9fr 1fr 0.8fr" },
          gap: "var(--app-gap)",
          alignItems: "stretch",
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          mt: 0,
        }}
      >
        <Box sx={{ flexGrow: 1, minHeight: 0, height: "100%" }}>
          <Grid container spacing={0.5} sx={{ height: "100%", my: 0 }}>
            {false && (
              <Grid
                item
                xs={12}
                sm={5}
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    sm: "repeat(2, minmax(0, 1fr))",
                  },
                  gridTemplateRows: {
                    xs: "repeat(2, minmax(0, 1fr))",
                    sm: "minmax(0, 1fr)",
                  },
                  gap: "var(--app-gap)",
                  minHeight: 0,
                  height: "100%",
                }}
              >
                <Card sx={{ p: 0, minHeight: 0, overflow: "hidden" }}>
                  {(() => {
                    const hasData =
                      fleetHealthScatter &&
                      fleetHealthScatter.some((v) => v.data.length > 0);

                    let fleetScatterOption = {};

                    if (hasData) {
                      const allTs = new Set();

                      fleetHealthScatter.forEach((vh) =>
                        vh.data.forEach((r) =>
                          allTs.add(r.ts || r.timestamp || "")
                        )
                      );

                      const sortedTs = Array.from(allTs).sort();

                      const series = fleetHealthScatter
                        .map((vehicle, originalIdx) => {
                          if (hiddenSims.has(vehicle.vehicle_id)) return null;
                          const c =
                            VEHICLE_COLORS[originalIdx % VEHICLE_COLORS.length];
                          return {
                            name: vehicle.vehicle_id,
                            type: "scatter",
                            symbol: "circle",
                            z: 1,
                            zlevel: 1,
                            data: vehicle.data.map((r) => [
                              r.ts || r.timestamp,
                              r.health ?? 0,
                            ]),
                            symbolSize: 4,
                            itemStyle: {
                              color: c,
                              opacity: 0.85,
                              borderWidth: 0,
                            },
                            emphasis: { scale: 1.3, itemStyle: { opacity: 1 } },
                          };
                        })
                        .filter(Boolean);

                      fleetScatterOption = {
                        animation: false,

                        tooltip: {
                          trigger: "item",
                          backgroundColor: isDark ? "#0f1f31" : "#ffffff",
                          borderColor: isDark ? "#334155" : "#e2e8f0",
                          borderWidth: 1,
                          borderRadius: 8,
                          padding: [8, 12],
                          textStyle: {
                            fontSize: 10,
                            color: isDark ? "#e2e8f0" : "#1e293b",
                            fontFamily: CHART_FONT,
                          },
                          formatter: (p) => {
                            const originalIdx = fleetHealthScatter.findIndex(
                              (v) => v.vehicle_id === p.seriesName
                            );
                            const c =
                              VEHICLE_COLORS[
                                originalIdx % VEHICLE_COLORS.length
                              ];
                            const ts = String(p.data[0])
                              .slice(5, 16)
                              .replace("T", " ");
                            const health = Math.round(Number(p.data[1]));
                            return `<div style="line-height:1.7">
                        <div style="font-weight:700;font-size:10px;color:${c};margin-bottom:2px">${p.seriesName}</div>
                        <div style="font-size:10px;opacity:.65">${ts}</div>
                        <div style="font-size:10px;margin-top:3px">Health&nbsp;<b>${health}%</b></div>
                      </div>`;
                          },
                        },

                        grid: commonGrid,

                        xAxis: {
                          ...commonXAxis,
                          nameGap: 45,
                          data: sortedTs,

                          axisLabel: {
                            ...commonXAxis.axisLabel,

                            formatter: (v) =>
                              String(v).slice(5, 16).replace("T", " "),
                          },
                        },

                        yAxis: {
                          ...commonYAxis,
                        },

                        dataZoom: [
                          { type: "inside" },
                          {
                            type: "slider",
                            height: 22,
                            bottom: 10,
                            moveHandleSize: 8,
                            handleSize: "90%",
                            showDetail: false,
                            borderColor: "transparent",
                            fillerColor: alpha("#3b82f6", 0.12),
                            backgroundColor: "transparent",
                            textStyle: { fontSize: 10, fontFamily: CHART_FONT },
                          },
                        ],

                        series: [
                          ...series,

                          {
                            type: "line",

                            data: [[]],

                            silent: true,

                            lineStyle: {
                              opacity: 0,
                            },

                            markLine: {
                              silent: true,
                              symbol: ["none", "none"],
                              lineStyle: {
                                width: 1.5,
                                type: "dashed",
                                opacity: 0.7,
                              },
                              label: {
                                fontSize: 10,
                                fontFamily: CHART_FONT,
                                fontWeight: 600,
                              },
                              data: [
                                {
                                  yAxis: 60,
                                  label: {
                                    formatter: "CRITICAL",
                                    color: "#ef4444",
                                    position: "insideStartTop",
                                  },
                                  lineStyle: { color: "#ef4444" },
                                },
                                {
                                  yAxis: 80,
                                  label: {
                                    formatter: "WARNING",
                                    color: "#f59e0b",
                                    position: "insideStartTop",
                                  },
                                  lineStyle: { color: "#f59e0b" },
                                },
                              ],
                            },
                          },
                        ],
                      };
                    }

                    return (
                      <>
                        <Box
                          sx={{
                            p: 1,
                            height: "100%",
                            minHeight: 0,
                            display: "flex",
                            flexDirection: "column",
                          }}
                        >
                          {/* HEADER */}
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              mb: 0.75,
                            }}
                          >
                            <SectionTitle title="Fleet Health Scatter" />
                            <Tooltip title="Expand">
                              <IconButton
                                size="small"
                                onClick={() => setOpenFleetScatter(true)}
                                sx={{ p: 0.5 }}
                              >
                                <AspectRatioOutlinedIcon
                                  sx={{ fontSize: 15 }}
                                />
                              </IconButton>
                            </Tooltip>
                          </Box>

                          {/* LEGEND — clickable filter pills */}
                          <Box
                            sx={{
                              display: "flex",
                              gap: 0.5,
                              flexWrap: "wrap",
                              mb: 0.75,
                            }}
                          >
                            {fleetHealthScatter?.map((v, i) => {
                              const c =
                                VEHICLE_COLORS[i % VEHICLE_COLORS.length];
                              const hidden = hiddenSims.has(v.vehicle_id);
                              const toggle = () =>
                                setHiddenSims((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(v.vehicle_id))
                                    next.delete(v.vehicle_id);
                                  else next.add(v.vehicle_id);
                                  return next;
                                });
                              return (
                                <Box
                                  key={v.vehicle_id}
                                  onClick={toggle}
                                  sx={{
                                    cursor: "pointer",
                                    userSelect: "none",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.5,
                                    px: 0.8,
                                    py: 0.2,
                                    borderRadius: 5,
                                    bgcolor: hidden
                                      ? "transparent"
                                      : alpha(c, isDark ? 0.18 : 0.1),
                                    border: `1px solid ${alpha(
                                      c,
                                      hidden ? 0.2 : 0.4
                                    )}`,
                                    opacity: hidden ? 0.4 : 1,
                                    transition:
                                      "opacity 0.15s, background 0.15s",
                                  }}
                                >
                                  <Box
                                    sx={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      bgcolor: hidden ? "transparent" : c,
                                      border: `1.5px solid ${c}`,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <Typography
                                    sx={{
                                      fontSize: "9px",
                                      fontWeight: 600,
                                      color: hidden ? "text.disabled" : c,
                                      lineHeight: 1,
                                    }}
                                  >
                                    {v.vehicle_id}
                                  </Typography>
                                </Box>
                              );
                            })}
                          </Box>

                          {/* CHART */}
                          <Box sx={{ flex: 1, minHeight: 0 }}>
                            {hasData ? (
                              <ReactECharts
                                option={fleetScatterOption}
                                style={{ width: "100%", height: "100%" }}
                              />
                            ) : (
                              <Box
                                sx={{
                                  height: "100%",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 0.5,
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontSize: "12px",
                                    color: "text.secondary",
                                    fontWeight: 500,
                                  }}
                                >
                                  No pipeline data yet
                                </Typography>
                                <Typography
                                  sx={{
                                    fontSize: "10px",
                                    color: "text.disabled",
                                  }}
                                >
                                  GOLD stream will appear once the pipeline is
                                  active
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        </Box>

                        {/* EXPANDED MODAL */}
                        <Dialog
                          open={openFleetScatter}
                          onClose={() => setOpenFleetScatter(false)}
                          fullWidth
                          maxWidth="xl"
                        >
                          <Box
                            sx={{
                              px: 2,
                              py: 1.5,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              borderBottom: `1px solid ${
                                isDark ? "#1e293b" : "#e2e8f0"
                              }`,
                            }}
                          >
                            <Typography
                              sx={{ fontSize: "14px", fontWeight: 700 }}
                            >
                              Fleet Health Scatter
                            </Typography>
                            <IconButton
                              onClick={() => setOpenFleetScatter(false)}
                              size="small"
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Box>
                          <DialogContent sx={{ height: "85vh" }}>
                            {hasData && (
                              <ReactECharts
                                option={fleetScatterOption}
                                style={{ width: "100%", height: "100%" }}
                              />
                            )}
                          </DialogContent>
                        </Dialog>
                      </>
                    );
                  })()}
                </Card>

                <Card sx={{ p: 0, minHeight: 0, overflow: "hidden" }}>
                  {(() => {
                    const rows = healthHistory?.data || [];

                    const factor = Math.max(1, Math.floor(rows.length / 500));

                    const sampled =
                      factor === 1
                        ? rows
                        : rows.filter((_, i) => i % factor === 0);

                    const xKey = timelineXAxis === "mileage" ? "mileage" : "ts";

                    const xData = sampled.map((r) =>
                      xKey === "mileage" ? r.mileage : r.ts || r.timestamp || ""
                    );

                    const yData = sampled.map((r) => r.health);

                    const lastMileage = rows[rows.length - 1]?.mileage ?? 0;

                    const kmSinceService = lastMileage % SERVICE_INTERVAL_KM;

                    const nextServiceKm =
                      lastMileage + (SERVICE_INTERVAL_KM - kmSinceService);
                    const navigate = useNavigate();
                    const chartOption = {
                      tooltip: {
                        trigger: "axis",
                        backgroundColor: isDark ? "#0f1f31" : "#ffffff",
                        borderColor: isDark ? "#334155" : "#e2e8f0",
                        borderWidth: 1,
                        borderRadius: 8,
                        padding: [8, 12],
                        textStyle: {
                          fontSize: 10,
                          color: isDark ? "#e2e8f0" : "#1e293b",
                          fontFamily: CHART_FONT,
                        },
                        formatter: (params: any) => {
                          const p = Array.isArray(params) ? params[0] : params;
                          if (!p) return "";
                          const rawX = p.axisValue ?? p.name ?? "";
                          const xLabel =
                            timelineXAxis === "mileage"
                              ? `${Math.round(
                                  Number(rawX)
                                ).toLocaleString()} km`
                              : String(rawX).slice(5, 16).replace("T", " ");
                          const health = Math.round(Number(p.value));
                          const axisName =
                            timelineXAxis === "mileage" ? "Mileage" : "Time";
                          return `<div style="line-height:1.7">
                      <div style="font-weight:700;font-size:10px;color:#3b82f6;margin-bottom:2px">${healthTimelineVehicle}</div>
                      <div style="font-size:10px;opacity:.65">${axisName}&nbsp;${xLabel}</div>
                      <div style="font-size:10px;margin-top:3px">Health&nbsp;<b>${health}%</b></div>
                    </div>`;
                        },
                      },

                      dataZoom: [
                        {
                          type: "inside",
                          filterMode: "none",
                        },
                        {
                          type: "slider",
                          bottom: 10,
                          height: 22,
                          filterMode: "none",
                          showDetail: false,
                          moveHandleSize: 8,
                          handleSize: "90%",
                          textStyle: {
                            fontSize: 10,
                            fontFamily: CHART_FONT,
                          },
                          borderColor: "transparent",
                          fillerColor: "rgba(25,118,210,.08)",
                          backgroundColor: "transparent",
                        },
                      ],

                      grid: commonGrid,

                      xAxis: {
                        ...commonXAxis,

                        nameGap: 45,
                        data: xData,

                        boundaryGap: true,

                        scale: false,

                        axisLabel: {
                          ...commonXAxis.axisLabel,

                          interval: 16,

                          hideOverlap: true,

                          margin: 14,

                          fontSize: 10,

                          fontFamily: CHART_FONT,

                          formatter: (v: any) => {
                            if (timelineXAxis === "mileage") {
                              const km = Math.round(Number(v));
                              return km >= 1000 ? `${(km / 1000).toFixed(1)}k` : `${km}`;
                            }
                            return String(v).slice(5, 16).replace("T", " ");
                          },
                        },

                        axisTick: { show: false },

                        splitLine: {
                          show: false,
                          lineStyle: {
                            color: isDark
                              ? "rgba(255,255,255,.06)"
                              : "rgba(0,0,0,.06)",
                          },
                        },
                      },

                      yAxis: {
                        ...commonYAxis,
                      },

                      series: [
                        {
                          type: "line",

                          data: yData,

                          symbol: "none",

                          lineStyle: { color: "#3b82f6", width: 2 },
                          itemStyle: { color: "#3b82f6" },
                          areaStyle: {
                            color: {
                              type: "linear",
                              x: 0,
                              y: 0,
                              x2: 0,
                              y2: 1,
                              colorStops: [
                                { offset: 0, color: "rgba(59,130,246,0.18)" },
                                { offset: 1, color: "rgba(59,130,246,0.02)" },
                              ],
                            },
                          },
                          markLine: {
                            silent: true,
                            symbol: ["none", "none"],
                            lineStyle: {
                              width: 1.5,
                              type: "dashed",
                              opacity: 0.7,
                            },
                            label: {
                              fontSize: 10,
                              fontFamily: CHART_FONT,
                              fontWeight: 600,
                            },
                            data: [
                              {
                                yAxis: 60,
                                label: {
                                  formatter: "CRITICAL",
                                  color: "#ef4444",
                                  position: "insideStartTop",
                                },
                                lineStyle: { color: "#ef4444" },
                              },
                              {
                                yAxis: 80,
                                label: {
                                  formatter: "WARNING",
                                  color: "#f59e0b",
                                  position: "insideStartTop",
                                },
                                lineStyle: { color: "#f59e0b" },
                              },
                              ...(timelineXAxis === "mileage"
                                ? [
                                    {
                                      xAxis: nextServiceKm,
                                      label: {
                                        formatter: `NEXT SVC\n+${Math.round(
                                          SERVICE_INTERVAL_KM - kmSinceService
                                        ).toLocaleString()} km`,
                                        color: isDark ? "#60a5fa" : "#2563eb",
                                        position: "insideStartTop",
                                        fontSize: 9,
                                        fontFamily: CHART_FONT,
                                        fontWeight: 700,
                                      },
                                      lineStyle: {
                                        color: isDark ? "#60a5fa" : "#2563eb",
                                        width: 1.5,
                                        type: "dashed",
                                      },
                                    },
                                  ]
                                : []),
                            ],
                          },

                          markArea: {
                            silent: true,
                            data: [
                              [
                                {
                                  yAxis: 0,
                                  itemStyle: {
                                    color: isDark
                                      ? "rgba(239,68,68,.03)"
                                      : "rgba(239,68,68,.025)",
                                  },
                                },
                                { yAxis: 60 },
                              ],
                              [
                                {
                                  yAxis: 60,
                                  itemStyle: {
                                    color: isDark
                                      ? "rgba(245,158,11,.025)"
                                      : "rgba(245,158,11,.02)",
                                  },
                                },
                                { yAxis: 80 },
                              ],
                            ],
                          },
                        },
                      ],
                    };

                    return (
                      <>
                        <Box
                          sx={{
                            p: 1,
                            height: "100%",
                            minHeight: 0,
                            display: "flex",
                            flexDirection: "column",
                          }}
                        >
                          {/* HEADER */}
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              mb: 1,
                              // flexWrap: "wrap",
                              gap: 0.5,
                            }}
                          >
                            <SectionTitle title="Vehicle Health Timeline" />
                            <Box
                              sx={{
                                display: "flex",
                                gap: 0.75,
                                alignItems: "center",
                              }}
                            >
                              {timelineXAxis === "mileage" &&
                                rows.length > 0 && (
                                  <Box
                                    sx={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 0.5,
                                      px: 1,
                                      height: 28,
                                      borderRadius: 1,
                                      bgcolor: alpha(
                                        "#3b82f6",
                                        isDark ? 0.15 : 0.08
                                      ),
                                      border: `1px solid ${alpha(
                                        "#3b82f6",
                                        isDark ? 0.3 : 0.2
                                      )}`,
                                    }}
                                  >
                                    <Typography
                                      sx={{
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        color: isDark ? "#60a5fa" : "#2563eb",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Next Service in{" "}
                                      {Math.round(
                                        SERVICE_INTERVAL_KM - kmSinceService
                                      ).toLocaleString()}{" "}
                                      km
                                    </Typography>
                                  </Box>
                                )}
                              <Select
                                value={healthTimelineVehicle}
                                onChange={(e) =>
                                  setHealthTimelineVehicle(e.target.value)
                                }
                                size="small"
                                sx={{
                                  height: 28,
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  borderRadius: 1,
                                  minWidth: 120,
                                  "& .MuiSelect-select": { py: "4px" },
                                }}
                              >
                                {timelineVehicleOptions.map((v) => (
                                  <MenuItem
                                    key={v.vehicle_id}
                                    value={v.vehicle_id}
                                    sx={{ fontSize: "10px" }}
                                  >
                                    {v.vehicle_id}
                                  </MenuItem>
                                ))}
                              </Select>

                              <Tooltip title="Expand">
                                <IconButton
                                  size="small"
                                  onClick={() => setOpenVehicleHealth(true)}
                                  sx={{ p: 0.5 }}
                                >
                                  <AspectRatioOutlinedIcon
                                    sx={{ fontSize: 15 }}
                                  />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </Box>

                          <ToggleButtonGroup
                            value={timelineXAxis}
                            exclusive
                            onChange={(_, v) => v && setTimelineXAxis(v)}
                            size="small"
                            sx={{
                              display: "grid",
                              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                              width: "100%",
                              maxWidth: 240,
                              p: "3px",
                              borderRadius: 2,
                              bgcolor: isDark
                                ? "rgba(15,31,49,0.72)"
                                : "rgba(255,247,243,0.92)",
                              border: `1px solid ${
                                isDark
                                  ? "rgba(125,211,252,0.12)"
                                  : "rgba(251,78,11,0.14)"
                              }`,
                              gap: 0.35,
                              "& .MuiToggleButtonGroup-grouped": {
                                border: "0 !important",
                                margin: "0 !important",
                              },
                            }}
                          >
                            <ToggleButton
                              value="mileage"
                              sx={{
                                fontWeight: 700,
                                px: 1,
                                fontSize: "9px",
                                height: 28,
                                py: 0,
                                borderRadius: "6px !important",
                                color:
                                  timelineXAxis === "mileage"
                                    ? isDark
                                      ? "#edf5ff"
                                      : "#FB4E0B"
                                    : "text.secondary",
                                bgcolor:
                                  timelineXAxis === "mileage"
                                    ? isDark
                                      ? "rgba(56,189,248,.16) !important"
                                      : "rgba(251,78,11,.12) !important"
                                    : "transparent",
                                boxShadow:
                                  timelineXAxis === "mileage"
                                    ? isDark
                                      ? "inset 0 0 0 1px rgba(56,189,248,0.2)"
                                      : "inset 0 0 0 1px rgba(251,78,11,0.16)"
                                    : "none",
                              }}
                            >
                              MILEAGE
                            </ToggleButton>
                            <ToggleButton
                              value="timestamp"
                              sx={{
                                fontWeight: 700,
                                px: 1,
                                fontSize: "9px",
                                height: 28,
                                py: 0,
                                borderRadius: "6px !important",
                                color:
                                  timelineXAxis === "timestamp"
                                    ? isDark
                                      ? "#edf5ff"
                                      : "#FB4E0B"
                                    : "text.secondary",
                                bgcolor:
                                  timelineXAxis === "timestamp"
                                    ? isDark
                                      ? "rgba(56,189,248,.16) !important"
                                      : "rgba(251,78,11,.12) !important"
                                    : "transparent",
                                boxShadow:
                                  timelineXAxis === "timestamp"
                                    ? isDark
                                      ? "inset 0 0 0 1px rgba(56,189,248,0.2)"
                                      : "inset 0 0 0 1px rgba(251,78,11,0.16)"
                                    : "none",
                              }}
                            >
                              TIMESTAMP
                            </ToggleButton>
                          </ToggleButtonGroup>

                          <Box
                            sx={{
                              flex: 1,
                              minHeight: 0,
                            }}
                          >
                            {rows.length > 0 ? (
                              <ReactECharts
                                style={{ height: "100%", width: "100%" }}
                                option={chartOption}
                              />
                            ) : (
                              <Box
                                sx={{
                                  height: "100%",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 0.5,
                                }}
                              >
                                <Typography
                                  sx={{
                                    fontSize: "12px",
                                    color: "text.secondary",
                                    fontWeight: 500,
                                  }}
                                >
                                  No health history yet
                                </Typography>
                                <Typography
                                  sx={{
                                    fontSize: "10px",
                                    color: "text.disabled",
                                  }}
                                >
                                  Select a vehicle and wait for GOLD data to
                                  arrive
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        </Box>

                        {/* EXPAND DIALOG */}

                        <Dialog
                          open={openVehicleHealth}
                          onClose={() => setOpenVehicleHealth(false)}
                          fullWidth
                          maxWidth="xl"
                        >
                          <Box
                            sx={{
                              px: 2,
                              py: 1.5,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              borderBottom: `1px solid ${
                                isDark ? "#1e293b" : "#e2e8f0"
                              }`,
                            }}
                          >
                            <Typography
                              sx={{ fontSize: "14px", fontWeight: 700 }}
                            >
                              Vehicle Health Timeline
                            </Typography>
                            <IconButton
                              onClick={() => setOpenVehicleHealth(false)}
                              size="small"
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Box>
                          <DialogContent sx={{ height: "85vh" }}>
                            <ReactECharts
                              style={{ width: "100%", height: "100%" }}
                              option={chartOption}
                            />
                          </DialogContent>
                        </Dialog>
                      </>
                    );
                  })()}
                </Card>
              </Grid>
            )}

            <Grid
              item
              xs={12}
              sm={4}
              sx={{
                minHeight: 0,
                height: "100%",
                display: "grid",
                gridTemplateRows: "repeat(2, minmax(0, 1fr))",
                gap: 0.75,
              }}
            >
              <Card
                sx={{
                  p: 1,
                  minHeight: 0,
                  overflow: "hidden",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) 86px",
                  alignItems: "center",
                  gap: 1,
                  border: `1px solid ${alpha("#06b6d4", 0.28)}`,
                  background: isDark
                    ? `linear-gradient(145deg, ${alpha(
                        "#06b6d4",
                        0.12
                      )}, rgba(15,23,42,0.9))`
                    : `linear-gradient(145deg, ${alpha(
                        "#06b6d4",
                        0.08
                      )}, #ffffff)`,
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" alignItems="center" spacing={0.75}>
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        color: "#8b5cf6",
                        bgcolor: alpha("#8b5cf6", 0.14),
                        border: `1px solid ${alpha("#8b5cf6", 0.25)}`,
                      }}
                    >
                      <AutoAwesomeOutlinedIcon sx={{ fontSize: 14 }} />
                    </Box>
                    <Typography
                      sx={{
                        fontSize: 10,
                        fontWeight: 900,
                        color: isDark ? "#f8fafc" : "#0f172a",
                        textTransform: "uppercase",
                      }}
                    >
                      AI Executive Summary
                    </Typography>
                  </Stack>
                  <Typography
                    sx={{
                      mt: 0.7,
                      fontSize: 11,
                      lineHeight: 1.35,
                      color: "text.secondary",
                      display: "-webkit-box",
                      WebkitLineClamp: 7,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {aiExecutiveStory}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 78,
                    height: 78,
                    borderRadius: "50%",
                    justifySelf: "center",
                    display: "grid",
                    placeItems: "center",
                    color: "#3b82f6",
                    background: `radial-gradient(circle, ${alpha(
                      "#3b82f6",
                      0.28
                    )} 0%, ${alpha("#06b6d4", 0.14)} 42%, transparent 72%)`,
                    border: `1px solid ${alpha("#3b82f6", 0.24)}`,
                    boxShadow: `0 0 24px ${alpha(
                      "#3b82f6",
                      isDark ? 0.28 : 0.18
                    )}`,
                    position: "relative",
                    "&:before": {
                      content: '""',
                      position: "absolute",
                      inset: 7,
                      borderRadius: "50%",
                      border: `1px dashed ${alpha("#3b82f6", 0.36)}`,
                    },
                  }}
                >
                  <PsychologyOutlinedIcon sx={{ fontSize: 38 }} />
                  <Typography
                    sx={{
                      position: "absolute",
                      fontSize: 10,
                      fontWeight: 900,
                      color: "#60a5fa",
                      mt: 3.6,
                    }}
                  >
                    AI
                  </Typography>
                </Box>
              </Card>
              <Card
                sx={{
                  p: 1,
                  minHeight: 0,
                  overflow: "hidden",
                  border: `1px solid ${alpha("#8b5cf6", 0.28)}`,
                  background: isDark
                    ? `linear-gradient(145deg, ${alpha(
                        "#8b5cf6",
                        0.14
                      )}, rgba(15,23,42,0.9))`
                    : `linear-gradient(145deg, ${alpha(
                        "#8b5cf6",
                        0.08
                      )}, #ffffff)`,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <Box
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      color: "#8b5cf6",
                      bgcolor: alpha("#8b5cf6", 0.14),
                      border: `1px solid ${alpha("#8b5cf6", 0.25)}`,
                    }}
                  >
                    <TipsAndUpdatesOutlinedIcon sx={{ fontSize: 14 }} />
                  </Box>
                  <Typography
                    sx={{
                      fontSize: 10,
                      fontWeight: 900,
                      color: "#8b5cf6",
                      textTransform: "uppercase",
                    }}
                  >
                    AI Recommendations
                  </Typography>
                </Stack>
                <Stack
                  component="ul"
                  sx={{
                    mt: 0.55,
                    mb: 0,
                    pl: 2,
                    gap: 0.32,
                    overflow: "hidden",
                  }}
                >
                  {aiRecommendationItems.map((recommendation) => (
                    <Typography
                      component="li"
                      key={recommendation}
                      sx={{
                        fontSize: 9.7,
                        lineHeight: 1.25,
                        color: "text.secondary",
                        pl: 0.1,
                        "&::marker": { color: "#8b5cf6" },
                      }}
                    >
                      {recommendation}
                    </Typography>
                  ))}
                </Stack>
              </Card>
            </Grid>

            <Grid item xs={12} sm={8} sx={{ minHeight: 0, height: "100%" }}>
              <Paper
                elevation={0}
                sx={{
                  border: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
                  borderRadius: 2,
                  overflow: "hidden",
                  bgcolor: isDark ? "#0f172a" : "#ffffff",
                  height: "100%",
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    px: 1,
                    py: 1,
                    borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
                    flexShrink: 0,
                  }}
                >
                  <Box>
                    <SectionTitle
                      title={
                        showTopPerformers
                          ? "Top Performing Vehicles"
                          : "Fleet Table"
                      }
                    />
                    <Typography
                      sx={{
                        fontSize: "10px",
                        color: "text.secondary",
                        mt: 0.15,
                      }}
                    >
                      {showTopPerformers
                        ? "Best vehicles by live health and driver score"
                        : "Real-time overview"}
                    </Typography>
                  </Box>
                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{
                      flexWrap: "wrap",
                      justifyContent: "flex-end",
                      ml: "auto",
                    }}
                  >
                    <Box
                      sx={{
                        px: 1.25,
                        py: 0.4,
                        borderRadius: 5,
                        bgcolor: alpha("#3b82f6", isDark ? 0.15 : 0.08),
                        border: `1px solid ${alpha("#3b82f6", 0.25)}`,
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: "10px",
                          fontWeight: 700,
                          color: "#3b82f6",
                        }}
                      >
                        {activeTableRows.length} Vehicles
                      </Typography>
                    </Box>
                    {showTopPerformers ? (
                      <FormControl size="small" sx={{ minWidth: 142 }}>
                        <InputLabel sx={{ fontSize: "10px" }}>
                          Top By
                        </InputLabel>
                        <Select
                          label="Top By"
                          value={topPerformerSort}
                          onChange={(e) => {
                            setTopPerformerSort(
                              e.target.value as typeof topPerformerSort
                            );
                            setPage(0);
                          }}
                          sx={{
                            height: 32,
                            fontSize: "10px",
                            bgcolor: isDark ? "#1e293b" : "#f8fafc",
                          }}
                        >
                          <MenuItem value="overall">Overall Score</MenuItem>
                          <MenuItem value="health">Health Score</MenuItem>
                          <MenuItem value="driver">Driver Score</MenuItem>
                        </Select>
                      </FormControl>
                    ) : (
                      <>
                        <FormControl size="small" sx={{ minWidth: 132 }}>
                          <InputLabel sx={{ fontSize: "10px" }}>
                            Status
                          </InputLabel>
                          <Select
                            label="Status"
                            value={statusFilter}
                            onChange={(e) => {
                              setStatusFilter(
                                e.target.value as typeof statusFilter
                              );
                              setPage(0);
                            }}
                            sx={{
                              height: 32,
                              fontSize: "10px",
                              bgcolor: isDark ? "#1e293b" : "#f8fafc",
                            }}
                          >
                            <MenuItem value="all">All Vehicles</MenuItem>
                            <MenuItem value="critical">Critical</MenuItem>
                            <MenuItem value="active">Active</MenuItem>
                            <MenuItem value="warning">Warning</MenuItem>
                            <MenuItem value="healthy">Healthy</MenuItem>
                            <MenuItem value="parked">Parked</MenuItem>
                            <MenuItem value="in_service">In Workshop</MenuItem>
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth: 118 }}>
                          <InputLabel sx={{ fontSize: "10px" }}>
                            Health
                          </InputLabel>
                          <Select
                            label="Health"
                            value={healthScoreFilter}
                            onChange={(e) => {
                              setHealthScoreFilter(e.target.value);
                              setPage(0);
                            }}
                            sx={{
                              height: 32,
                              fontSize: "10px",
                              bgcolor: isDark ? "#1e293b" : "#f8fafc",
                            }}
                          >
                            <MenuItem value="all">All Health</MenuItem>
                            <MenuItem value="excellent">Excellent</MenuItem>
                            <MenuItem value="good">Good</MenuItem>
                            <MenuItem value="average">Average</MenuItem>
                            <MenuItem value="poor">Poor</MenuItem>
                          </Select>
                        </FormControl>
                      </>
                    )}
                    <TextField
                      size="small"
                      placeholder="Search vehicle / driver / route…"
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(0);
                      }}
                      InputProps={{
                        startAdornment: (
                          <SearchOutlinedIcon
                            sx={{
                              fontSize: 16,
                              mr: 0.8,
                              color: "text.secondary",
                            }}
                          />
                        ),
                      }}
                      sx={{
                        width: 230,
                        "& .MuiOutlinedInput-root": {
                          height: 32,
                          borderRadius: 2,
                          fontSize: "12px",
                          bgcolor: isDark ? "#1e293b" : "#f8fafc",
                          "& fieldset": {
                            borderColor: isDark ? "#334155" : "#e2e8f0",
                          },
                          "&:hover fieldset": {
                            borderColor: isDark ? "#475569" : "#cbd5e1",
                          },
                          "&.Mui-focused fieldset": { borderColor: "#3b82f6" },
                        },
                        "& .MuiOutlinedInput-input": {
                          py: 0,
                          px: 0,
                          fontSize: "12px",
                        },
                        "& input::placeholder": {
                          fontSize: "12px",
                          opacity: 1,
                        },
                      }}
                    />
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={0.75}
                      sx={{ ml: "auto", minWidth: "fit-content" }}
                    >
                      <Typography
                        sx={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: showTopPerformers
                            ? "#22c55e"
                            : "text.secondary",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Switch to Top Performing Vehicles
                      </Typography>
                      <Switch
                        size="small"
                        checked={showTopPerformers}
                        onChange={(e) => {
                          setShowTopPerformers(e.target.checked);
                          setPage(0);
                        }}
                      />
                    </Stack>
                  </Stack>
                </Box>
                <TableContainer
                  sx={{ flex: 1, minHeight: 0, overflow: "auto" }}
                >
                  <Table stickyHeader>
                    <TableHead>
                      <TableRow>
                        {(showTopPerformers
                          ? [
                              {
                                id: "vehicle",
                                label: "Vehicle",
                                sortable: false,
                              },
                              {
                                id: "driver",
                                label: "Driver",
                                sortable: false,
                              },
                              {
                                id: "mileage",
                                label: "Mileage",
                                sortable: false,
                              },
                              {
                                id: "driver_score",
                                label: "Driver Score",
                                sortable: false,
                              },
                              {
                                id: "health",
                                label: "Health",
                                sortable: false,
                              },
                            ]
                          : FLEET_TABLE_COLUMNS
                        ).map((col) => (
                          <TableCell
                            key={col.id}
                            onClick={() =>
                              !showTopPerformers &&
                              col.sortable &&
                              handleTableSort(col.id as FleetTableColId)
                            }
                            sx={{
                              bgcolor: isDark ? "#1e293b" : "#f8fafc",
                              color: isDark ? "#94a3b8" : "#64748b",
                              fontWeight: 600,
                              fontSize: "10px",
                              letterSpacing: ".04em",
                              borderBottom: `2px solid ${
                                isDark ? "#334155" : "#e2e8f0"
                              }`,
                              py: 0.25,
                              px: 1.5,
                              whiteSpace: "nowrap",
                              cursor:
                                !showTopPerformers && col.sortable
                                  ? "pointer"
                                  : "default",
                              userSelect: "none",
                              "&:hover":
                                !showTopPerformers && col.sortable
                                  ? { bgcolor: isDark ? "#263044" : "#f1f5f9" }
                                  : {},
                            }}
                          >
                            <Stack
                              direction="row"
                              alignItems="center"
                              spacing={0.4}
                            >
                              <span>{col.label}</span>
                              {!showTopPerformers && col.sortable && (
                                <Box
                                  component="span"
                                  sx={{
                                    fontSize: "10px",
                                    opacity: orderBy === col.id ? 1 : 0.45,
                                    color:
                                      orderBy === col.id
                                        ? isDark
                                          ? "#60a5fa"
                                          : "#3b82f6"
                                        : "inherit",
                                  }}
                                >
                                  {orderBy === col.id ? (
                                    order === "asc" ? (
                                      "↑"
                                    ) : (
                                      "↓"
                                    )
                                  ) : (
                                    <UnfoldMoreIcon
                                      sx={{
                                        fontSize: 12,
                                        verticalAlign: "middle",
                                      }}
                                    />
                                  )}
                                </Box>
                              )}
                            </Stack>
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {activeTableRows
                        .slice(
                          page * rowsPerPage,
                          page * rowsPerPage + rowsPerPage
                        )
                        .map((row, rowIdx) => {
                          const liveHealth = getLiveHealth(row);
                          const hs = getHealthStatus(liveHealth);
                          const statusColorMap: Record<string, string> = {
                            active: "#22c55e",
                            parked: "#3b82f6",
                            in_service: "#f59e0b",
                            critical: "#ef4444",
                            warning: "#eab308",
                          };
                          const statusColor =
                            statusColorMap[row.status] || "#6b7280";
                          const driverScore = row.driver_score ?? 0;
                          const scoreColor =
                            driverScore >= 80
                              ? "#22c55e"
                              : driverScore >= 60
                              ? "#f59e0b"
                              : "#ef4444";
                          const avatarBg = getAvatarColor(row.driver ?? "");
                          const initials = getDriverInitials(row.driver ?? "");
                          const rowBg = isDark
                            ? rowIdx % 2 === 0
                              ? "#0f172a"
                              : "#111827"
                            : rowIdx % 2 === 0
                            ? "#ffffff"
                            : "#f8fafc";

                          if (showTopPerformers) {
                            const mileage = Math.max(
                              4.8,
                              Math.min(
                                9.8,
                                liveHealth * 0.055 + driverScore * 0.045
                              )
                            ).toFixed(1);
                            return (
                              <TableRow
                                key={`top-${row.vehicle_id}`}
                                hover
                                sx={{
                                  bgcolor: rowBg,
                                  "&:hover": {
                                    bgcolor: isDark
                                      ? alpha("#22c55e", 0.08)
                                      : alpha("#22c55e", 0.06),
                                  },
                                }}
                              >
                                <TableCell
                                  sx={{
                                    py: 0.75,
                                    px: 1.5,
                                    fontSize: 11,
                                    fontWeight: 800,
                                  }}
                                >
                                  {row.name || row.vehicle_id}
                                </TableCell>
                                <TableCell
                                  sx={{
                                    py: 0.75,
                                    px: 1.5,
                                    fontSize: 11,
                                    color: "text.secondary",
                                    fontWeight: 700,
                                  }}
                                >
                                  {row.driver || "Unassigned"}
                                </TableCell>
                                <TableCell
                                  sx={{
                                    py: 0.75,
                                    px: 1.5,
                                    fontSize: 11,
                                    color: "text.secondary",
                                    fontWeight: 800,
                                  }}
                                >
                                  {mileage} km/L
                                </TableCell>
                                <TableCell
                                  sx={{
                                    py: 0.75,
                                    px: 1.5,
                                    fontSize: 11,
                                    color: scoreColor,
                                    fontWeight: 900,
                                  }}
                                >
                                  {driverScore}
                                </TableCell>
                                <TableCell
                                  sx={{
                                    py: 0.75,
                                    px: 1.5,
                                    fontSize: 11,
                                    color: hs.color,
                                    fontWeight: 900,
                                  }}
                                >
                                  {Math.round(liveHealth)}%
                                </TableCell>
                              </TableRow>
                            );
                          }

                          let HealthIcon: React.ElementType =
                            HealthAndSafetyOutlinedIcon;
                          if (hs.label === "Good")
                            HealthIcon = ThumbUpOutlinedIcon;
                          else if (hs.label === "Average")
                            HealthIcon = WarningAmberOutlinedIcon;
                          else if (hs.label === "Poor")
                            HealthIcon = ErrorOutlineOutlinedIcon;

                          const getRoadTypeIcon = (rt: string) => {
                            const n = (rt ?? "").toLowerCase();
                            if (n.includes("highway") || n.includes("motorway"))
                              return (
                                <SpeedOutlinedIcon
                                  sx={{
                                    fontSize: 13,
                                    color: "text.secondary",
                                    flexShrink: 0,
                                  }}
                                />
                              );
                            if (n.includes("urban") || n.includes("city"))
                              return (
                                <RouteIcon
                                  sx={{
                                    fontSize: 13,
                                    color: "text.secondary",
                                    flexShrink: 0,
                                  }}
                                />
                              );
                            return (
                              <RouteIcon
                                sx={{
                                  fontSize: 13,
                                  color: "text.secondary",
                                  flexShrink: 0,
                                }}
                              />
                            );
                          };

                          return (
                            <TableRow
                              hover
                              key={row.vehicle_id}
                              sx={{
                                bgcolor: rowBg,
                                borderBottom: `1px solid ${
                                  isDark ? "#1e293b" : "#e2e8f0"
                                }`,
                                "&:hover": {
                                  bgcolor: `${alpha(
                                    "#3b82f6",
                                    isDark ? 0.1 : 0.05
                                  )} !important`,
                                },
                                transition: "background-color 0.15s",
                              }}
                            >
                              {/* Vehicle Name */}
                              <TableCell
                                sx={{
                                  py: 1,
                                  px: 1.5,
                                  height: 58,
                                  minWidth: 85,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <Box>
                                  <Typography
                                    onClick={() => {
                                      if (
                                        row.status?.toLowerCase() === "active"
                                      ) {
                                        navigate(
                                          `/automotive?vehicle=${encodeURIComponent(
                                            row.vehicle_id
                                          )}`
                                        );
                                      }
                                    }}
                                    sx={{
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color:
                                        row.status?.toLowerCase() === "active"
                                          ? isDark
                                            ? "#22d3ee"
                                            : "#0891b2"
                                          : "text.disabled",
                                      lineHeight: 1.25,
                                      cursor:
                                        row.status?.toLowerCase() === "active"
                                          ? "pointer"
                                          : "default",
                                      textDecoration:
                                        row.status?.toLowerCase() === "active"
                                          ? "underline"
                                          : "none",
                                      "&:hover": {
                                        color:
                                          row.status?.toLowerCase() === "active"
                                            ? "#1976d2"
                                            : "text.disabled",
                                      },
                                    }}
                                  >
                                    {(row.name ?? row.vehicle_id)
                                      .toLowerCase()
                                      .replace(/\b\w/g, (char) =>
                                        char.toUpperCase()
                                      )}
                                  </Typography>

                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                    sx={{ mt: 0.3 }}
                                  >
                                    <Box
                                      sx={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        bgcolor: statusColor,
                                        flexShrink: 0,
                                      }}
                                    />
                                    <Typography
                                      sx={{
                                        fontSize: "9px",
                                        color: "text.secondary",
                                      }}
                                    >
                                      {row.status === "in_service"
                                        ? "In Workshop"
                                        : formatStatusLabel(row.status)}
                                    </Typography>
                                  </Stack>
                                </Box>
                              </TableCell>

                              {/* Type */}
                              <TableCell
                                sx={{
                                  py: 1,
                                  px: 1.5,
                                  height: 58,
                                  minWidth: 75,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <Stack
                                  direction="row"
                                  spacing={0.75}
                                  alignItems="center"
                                >
                                  <Box
                                    sx={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: 2.5,
                                      display: "grid",
                                      placeItems: "center",
                                      bgcolor: alpha(
                                        "#64748b",
                                        isDark ? 0.2 : 0.1
                                      ),
                                      border: `1px solid ${alpha(
                                        "#64748b",
                                        0.2
                                      )}`,
                                      flexShrink: 0,
                                      color: isDark ? "#94a3b8" : "#475569",
                                    }}
                                  >
                                    {getVehicleTypeIcon(row.type)}
                                  </Box>
                                  <Typography
                                    sx={{
                                      fontSize: "10px",
                                      fontWeight: 500,
                                      textTransform: "capitalize",
                                    }}
                                    noWrap
                                  >
                                    {row.type || "Vehicle"}
                                  </Typography>
                                </Stack>
                              </TableCell>

                              {/* Status */}
                              {/* <TableCell
                                sx={{
                                  py: 1,
                                  px: 1.5,
                                  height: 58,
                                  minWidth: 90,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <Box
                                  sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 0.6,
                                    px: 0.7,
                                    py: 0.4,
                                    borderRadius: 5,
                                    bgcolor: alpha(
                                      statusColor,
                                      isDark ? 0.18 : 0.1
                                    ),
                                    border: `1px solid ${alpha(
                                      statusColor,
                                      0.25
                                    )}`,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      bgcolor: statusColor,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <Typography
                                    sx={{
                                      fontSize: "9px",
                                      fontWeight: 700,
                                      color: statusColor,
                                    }}
                                  >
                                    {row.status === "in_service"
                                      ? "In Workshop"
                                      : formatStatusLabel(row.status)}
                                  </Typography>
                                </Box>
                              </TableCell> */}

                              {/* Speed */}
                              {/* <TableCell
                        sx={{
                          py: 1,
                          px: 1.5,
                          height: 58,
                          minWidth: 72,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <SpeedGauge
                          speed={Math.round(row.speed ?? 0)}
                          isDark={isDark}
                        />
                      </TableCell> */}

                              {/* Health Status */}
                              <TableCell
                                sx={{
                                  py: 1,
                                  px: 1.5,
                                  height: 58,
                                  minWidth: 82,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <Box
                                  sx={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 0.6,
                                    px: 0.8,
                                    py: 0.4,
                                    borderRadius: 2,
                                    bgcolor: alpha(
                                      hs.color,
                                      isDark ? 0.15 : 0.1
                                    ),
                                    border: `1px solid ${alpha(
                                      hs.color,
                                      0.25
                                    )}`,
                                  }}
                                >
                                  <HealthIcon
                                    sx={{
                                      fontSize: 12,
                                      color: hs.color,
                                      flexShrink: 0,
                                    }}
                                  />
                                  <Typography
                                    sx={{
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      color: hs.color,
                                    }}
                                  >
                                    {hs.label}
                                  </Typography>
                                </Box>
                              </TableCell>

                              {/* Health Score */}
                              <TableCell
                                sx={{
                                  py: 1,
                                  px: 1.5,
                                  height: 58,
                                  minWidth: 70,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <HealthRing
                                  score={Math.round(liveHealth)}
                                  isDark={isDark}
                                />
                              </TableCell>

                              {/* Driver */}
                              {/* <TableCell
                        sx={{
                          py: 1,
                          px: 1.5,
                          height: 58,
                          minWidth: 140,
                          whiteSpace: "nowrap",
                        }}
                      >
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box
                            sx={{
                              width: 30,
                              height: 30,
                              borderRadius: "50%",
                              bgcolor: avatarBg,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <Typography
                              sx={{
                                fontSize: "10px",
                                fontWeight: 700,
                                color: "#fff",
                                lineHeight: 1,
                              }}
                            >
                              {initials}
                            </Typography>
                          </Box>
                          <Typography
                            sx={{
                              fontSize: "10px",
                              fontWeight: 500,
                              color: isDark ? "#e2e8f0" : "#1e293b",
                            }}
                            noWrap
                          >
                            {row.driver || "Unassigned"}
                          </Typography>
                        </Stack>
                      </TableCell> */}

                              {/* Driver Score */}
                              <TableCell
                                sx={{
                                  py: 1,
                                  px: 1.5,
                                  height: 58,
                                  minWidth: 90,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <Box sx={{ width: 70 }}>
                                  <Box
                                    sx={{
                                      width: "100%",
                                      height: "5px",
                                      borderRadius: "999px",
                                      overflow: "hidden",
                                      bgcolor: isDark ? "#1e293b" : "#e2e8f0",
                                    }}
                                  >
                                    <Box
                                      sx={{
                                        width: `${driverScore}%`,
                                        height: "100%",
                                        borderRadius: "999px",
                                        bgcolor: scoreColor,
                                      }}
                                    />
                                  </Box>
                                  <Typography
                                    sx={{
                                      fontSize: "10px",
                                      fontWeight: 700,
                                      color: scoreColor,
                                      mt: 0.4,
                                    }}
                                  >
                                    {driverScore}
                                  </Typography>
                                </Box>
                              </TableCell>

                              {/* Road Type */}
                              {/* <TableCell
                                sx={{
                                  py: 1,
                                  px: 1.5,
                                  height: 58,
                                  minWidth: 80,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                <Stack
                                  direction="row"
                                  spacing={0.5}
                                  alignItems="center"
                                >
                                  {getRoadTypeIcon(row.road_type ?? "")}
                                  <Typography
                                    sx={{
                                      fontSize: "10px",
                                      color: isDark ? "#cbd5e1" : "#475569",
                                    }}
                                    noWrap
                                  >
                                    {(row.road_type ?? "")
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (c) =>
                                        c.toUpperCase()
                                      ) || "—"}
                                  </Typography>
                                </Stack>
                              </TableCell> */}

                              {/* Route */}
                              <TableCell
                                sx={{
                                  py: 1,
                                  px: 1.5,
                                  height: 58,
                                  maxWidth: 220,
                                }}
                              >
                                <Stack spacing={0.8}>
                                  {/* Route */}
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 0.8,
                                    }}
                                  >
                                    <LocationOnIcon
                                      sx={{
                                        fontSize: 18,
                                        color: "#3b82f6",
                                        flexShrink: 0,
                                      }}
                                    />

                                    <Typography
                                      sx={{
                                        fontSize: "10px",
                                        fontWeight: 600,
                                        color: "text.secondary",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Route:
                                    </Typography>

                                    <Typography
                                      sx={{
                                        fontSize: "10px",
                                        color: isDark ? "#cbd5e1" : "#475569",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        flex: 1,
                                      }}
                                      title={row.route_name ?? ""}
                                    >
                                      {row.route_name || "—"}
                                    </Typography>
                                  </Box>

                                  {/* Road Type */}
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 1,
                                      px: 0.5,
                                    }}
                                  >
                                    {getRoadTypeIcon(row.road_type ?? "")}

                                    <Typography
                                      sx={{
                                        fontSize: "10px",
                                        fontWeight: 600,
                                        color: "text.secondary",
                                        whiteSpace: "nowrap",
                                        // ml: "2px",
                                      }}
                                    >
                                      Road Type:
                                    </Typography>

                                    <Typography
                                      sx={{
                                        fontSize: "10px",
                                        color: isDark ? "#cbd5e1" : "#475569",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        flex: 1,
                                      }}
                                    >
                                      {(row.road_type ?? "")
                                        .replace(/_/g, " ")
                                        .replace(/\b\w/g, (c) =>
                                          c.toUpperCase()
                                        ) || "—"}
                                    </Typography>
                                  </Box>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto 1fr",
                    alignItems: "center",
                    px: 2,
                    py: 1.25,
                    borderTop: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
                    bgcolor: isDark ? "#0f172a" : "#ffffff",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "12px",
                      color: "text.secondary",
                      fontWeight: 500,
                    }}
                  >
                    Showing{" "}
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 700,
                        color: isDark ? "#e2e8f0" : "#1e293b",
                      }}
                    >
                      {Math.min(
                        rowsPerPage,
                        Math.max(0, activeTableRows.length - page * rowsPerPage)
                      )}
                    </Box>
                    {" of "}
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 700,
                        color: isDark ? "#e2e8f0" : "#1e293b",
                      }}
                    >
                      {activeTableRows.length}
                    </Box>
                    {showTopPerformers ? " top vehicles" : " active vehicles"}
                  </Typography>

                  <Pagination
                    count={Math.max(
                      1,
                      Math.ceil(activeTableRows.length / rowsPerPage)
                    )}
                    page={page + 1}
                    onChange={(_, value) => handleChangePage(null, value - 1)}
                    shape="rounded"
                    siblingCount={1}
                    boundaryCount={1}
                    sx={{
                      "& .MuiPaginationItem-root": {
                        fontSize: "12px",
                        color: isDark ? "#94a3b8" : "#64748b",
                        backgroundColor: isDark ? "#0f1f31" : "transparent",
                        border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                        "&:hover": {
                          backgroundColor: isDark ? "#102235" : undefined,
                          color: isDark ? "#e2e8f0" : undefined,
                        },
                        "&.Mui-selected": {
                          backgroundColor: isDark ? "#38bdf8" : "#005071",
                          color: isDark ? "#04131f" : "#fff",
                          borderColor: isDark ? "#38bdf8" : "#005071",
                          "&:hover": {
                            backgroundColor: isDark ? "#0ea5e9" : "#003e59",
                          },
                        },
                        "&.MuiPaginationItem-ellipsis": {
                          backgroundColor: "transparent",
                          border: "none",
                        },
                      },
                    }}
                  />

                  <Stack
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    justifyContent="flex-end"
                  >
                    <Typography
                      sx={{
                        fontSize: "10px",
                        color: "text.secondary",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Rows per page
                    </Typography>
                    <Select
                      size="small"
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setPage(0);
                      }}
                      sx={{
                        fontSize: "10px",
                        height: 28,
                        "& .MuiOutlinedInput-notchedOutline": {
                          borderColor: isDark ? "#334155" : "#e2e8f0",
                        },
                        "& .MuiSelect-select": {
                          py: 0,
                          px: 1,
                          fontSize: "10px",
                        },
                        bgcolor: isDark ? "#1e293b" : "#f8fafc",
                        color: isDark ? "#e2e8f0" : "#1e293b",
                      }}
                    >
                      <MenuItem value={5}>5</MenuItem>
                      <MenuItem value={10}>10</MenuItem>
                      <MenuItem value={25}>25</MenuItem>
                      <MenuItem value={50}>50</MenuItem>
                    </Select>
                  </Stack>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Box>

      {/* <FleetTable vehicles={vehicles} /> */}
    </Box>
  );
}
