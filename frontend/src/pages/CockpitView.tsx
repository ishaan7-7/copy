import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Pagination from "@mui/material/Pagination";

import { alpha, useTheme } from "@mui/material/styles";
import CalendarTodayOutlinedIcon from "@mui/icons-material/CalendarTodayOutlined";
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
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
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
  "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981",
  "#06b6d4", "#f97316", "#6366f1", "#14b8a6", "#a855f7",
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
      fontSize: "14px",
    }}
  >
    <Typography sx={{ fontSize: "12px", fontWeight: 800 }}>{title}</Typography>
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

  const cacheKey = `${status}_${outerColor}_${innerColor}_${hdgBucket}_${isDark ? "d" : "l"}`;

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
        ${status === "active" ? `<div class="${isDark ? "vc-pulse-dark" : "vc-pulse"}" style="width:${outerSize}px;height:${outerSize}px;border:${isDark ? `1.5px solid #4ade80` : `1.5px solid ${outerColor}`};"></div>` : ""}
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
  const trendColor = trend === "up" ? "#ef4444" : "#22c55e";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick?.(); }}
      style={{ cursor: "pointer", borderRadius: 12 }}
    >
    <Card
      sx={{
        p: 1,
        minHeight: 80,
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
          <Typography sx={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>
            {value}
          </Typography>
          <Typography
            sx={{ fontSize: 10, color: "text.secondary", mt: 0.5 }}
            noWrap
          >
            {label}
          </Typography>
          <Stack direction="row" spacing={0.4} alignItems="center" mt={0.7}>
            {iconLogo === true ? (
              <>
                {trend === "up" ? (
                  <TrendingUpOutlinedIcon
                    sx={{ fontSize: 10, color: trendColor }}
                  />
                ) : (
                  <TrendingDownOutlinedIcon
                    sx={{ fontSize: 14, color: trendColor }}
                  />
                )}
              </>
            ) : (
              ""
            )}
            <Typography
              sx={{ fontSize: 8, color: trendColor, fontWeight: 700 }}
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
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
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
          borderColor: isDark ? "#1a2535" : "#fff",
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
            name: "In Service",
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

  if (health >= 75) {
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
        axisLine: { lineStyle: { width: 10, color: [[1, isDark ? "#1e293b" : "#e5e7eb"]] } },
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
    tooltip: { trigger: "axis" as const, textStyle: { fontSize: 10, color: isDark ? "#e2e8f0" : "#111827" }, backgroundColor: isDark ? "#1e293b" : "#fff", borderColor: isDark ? "#334155" : "#e2e8f0" },
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
      backgroundColor: isDark ? "#1e293b" : "#fff",
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
    tooltip: { trigger: "item" as const, textStyle: { fontSize: 10, color: isDark ? "#e2e8f0" : "#111827" }, backgroundColor: isDark ? "#1e293b" : "#fff", borderColor: isDark ? "#334155" : "#e2e8f0" },
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
      backgroundColor: isDark ? "#1e293b" : "#ffffff",
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

type OpenAlert = { source_id: string; module: string; peak_anomaly_ts: string; last_updated_ts?: string; max_composite_score?: number; severity?: string };

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

function RecentAlerts({ onTotalChange }: { onTotalChange: (n: number) => void }) {
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
      if (!open.length) { setDisplayed([]); return; }

      const moduleLatestPeak = new Map<string, string>();
      for (const a of open) {
        const mod = a.module.toLowerCase();
        const prev = moduleLatestPeak.get(mod);
        if (!prev || a.peak_anomaly_ts > prev) moduleLatestPeak.set(mod, a.peak_anomaly_ts);
      }

      const sorted = [...open].sort((a, b) => (b.max_composite_score ?? 0) - (a.max_composite_score ?? 0));
      const vehicleBest = new Map<string, OpenAlert>();
      for (const a of sorted) {
        if (!vehicleBest.has(a.source_id)) vehicleBest.set(a.source_id, a);
      }
      const candidates = Array.from(vehicleBest.values());

      type PoolItem = { source_id: string; module: string; msg: string; alert: OpenAlert };

      const pickFour = (p: PoolItem[]): DisplayAlert[] => {
        const out: DisplayAlert[] = [];
        const usedSimMod = new Set<string>();
        const usedSims = new Set<string>();
        const usedMods = new Set<string>();
        const usedMsgs = new Set<string>();
        const add = (item: PoolItem) => {
          out.push({
            source_id: item.alert.source_id, module: item.alert.module,
            peak_anomaly_ts: item.alert.peak_anomaly_ts,
            severity: (item.alert.severity ?? "warning").toLowerCase(),
            dtcMessage: item.msg,
            relativeTime: alertRelativeTime(item.alert.last_updated_ts ?? item.alert.peak_anomaly_ts),
          });
          usedSimMod.add(`${item.source_id}|${item.module}`);
          usedSims.add(item.source_id); usedMods.add(item.module); usedMsgs.add(item.msg);
        };
        for (const item of p) {
          if (out.length >= 4) break;
          if (!usedSims.has(item.source_id) && !usedMods.has(item.module) && !usedMsgs.has(item.msg)) add(item);
        }
        if (out.length < 4) {
          for (const item of p) {
            if (out.length >= 4) break;
            if (!usedSims.has(item.source_id) && !usedMods.has(item.module) && !usedSimMod.has(`${item.source_id}|${item.module}`)) add(item);
          }
        }
        if (out.length < 4) {
          for (const item of p) {
            if (out.length >= 4) break;
            if (!usedSims.has(item.source_id) && !usedSimMod.has(`${item.source_id}|${item.module}`)) add(item);
          }
        }
        if (out.length < 4) {
          const full = new Set(out.map((r) => `${r.source_id}|${r.module}|${r.dtcMessage}`));
          for (const item of p) {
            if (out.length >= 4) break;
            const key = `${item.source_id}|${item.module}|${item.msg}`;
            if (!full.has(key)) { out.push({ source_id: item.alert.source_id, module: item.alert.module, peak_anomaly_ts: item.alert.peak_anomaly_ts, severity: (item.alert.severity ?? "warning").toLowerCase(), dtcMessage: item.msg, relativeTime: alertRelativeTime(item.alert.last_updated_ts ?? item.alert.peak_anomaly_ts) }); full.add(key); }
          }
        }
        return out;
      };

      const DTC_PER_CALL_TIMEOUT_MS = 15_000;

      const pool: PoolItem[] = [];
      for (let i = 0; i < candidates.length; i++) {
        const a = candidates[i];
        setPhase(`DTC ${i + 1}/${candidates.length}…`);
        try {
          const r = await axios.get(`${PIPELINE_API}/api/dtc/analyze`, {
            params: {
              source_id: a.source_id,
              module: a.module,
              peak_ts: moduleLatestPeak.get(a.module.toLowerCase()) ?? a.peak_anomaly_ts,
            },
            timeout: DTC_PER_CALL_TIMEOUT_MS,
          });
          const data = r.data as { success?: boolean; error?: string; triggers?: { message?: string }[] };
          if (!data?.success || data.error) continue;
          const triggers = data.triggers ?? [];
          const usable = triggers.filter((t) => t.message);
          if (!usable.length) continue;
          for (const t of usable) {
            pool.push({ source_id: a.source_id, module: a.module.toLowerCase(), msg: t.message!, alert: a });
          }
        } catch {
          continue;
        }
        if (pickFour(pool).length >= 4) break;
      }

      setDisplayed(pickFour(pool));
    } catch {
      // Retain previous displayed on error
    } finally {
      setLoading(false);
      setPhase("");
    }
  };

  useEffect(() => { handleRefresh(); }, []);

  return (
    <Card sx={{ p: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <SectionTitle
        title="Recent Alerts"
        action={
          <Stack direction="row" spacing={0.5} alignItems="center">
            <IconButton size="small" onClick={handleRefresh} disabled={loading} sx={{ p: 0.2 }}>
              <RestartAltOutlinedIcon sx={{ fontSize: 14 }} />
            </IconButton>
            <Button
              size="small"
              variant="outlined"
              sx={{ fontSize: "8px", py: "1px", px: "6px" }}
              onClick={() => navigate("/alerts")}
            >
              View All
            </Button>
          </Stack>
        }
      />

      {loading ? (
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.5 }}>
          <CircularProgress size={12} />
          <Typography sx={{ fontSize: "9px", color: "text.secondary" }}>{phase}</Typography>
        </Stack>
      ) : displayed.length === 0 ? (
        <Stack alignItems="center" justifyContent="center" flex={1}>
          <Typography sx={{ fontSize: "10px", color: "text.secondary" }}>No alerts available</Typography>
        </Stack>
      ) : (
        <Stack spacing={0.2} sx={{ mt: 0.3, overflow: "hidden" }}>
          {displayed.map((a) => {
            const sevColor =
              a.severity === "critical" ? "#ef4444" :
              a.severity === "active"   ? "#22c55e" : "#f59e0b";
            return (
              <Stack
                key={`${a.source_id}-${a.module}`}
                direction="row"
                alignItems="center"
                spacing={0.75}
                sx={{
                  pl: 1,
                  pr: 0.75,
                  py: 0.2,
                  borderRadius: 1,
                  borderLeft: `3px solid ${sevColor}`,
                  bgcolor: alpha(sevColor, 0.06),
                  minWidth: 0,
                }}
              >
                <Box sx={{ width: 5, height: 5, borderRadius: "50%", bgcolor: sevColor, flexShrink: 0 }} />
                <Box minWidth={0} flex={1}>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography sx={{ fontSize: "10px", fontWeight: 700, lineHeight: 1.15 }} noWrap>
                      {a.source_id.toUpperCase()}
                    </Typography>
                    <Box sx={{ px: 0.5, py: "1px", borderRadius: 0.5, bgcolor: alpha(sevColor, 0.18), flexShrink: 0 }}>
                      <Typography sx={{ fontSize: "8px", fontWeight: 600, color: sevColor, textTransform: "uppercase", letterSpacing: "0.04em", lineHeight: 1.2 }}>
                        {a.module}
                      </Typography>
                    </Box>
                  </Stack>
                  <Typography sx={{ fontSize: "9px", color: "text.secondary", lineHeight: "11px" }} noWrap title={a.dtcMessage ?? ""}>
                    {a.dtcMessage ?? "—"}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: "9px", color: "text.secondary", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {a.relativeTime}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      )}
      {!loading && total > displayed.length && displayed.length > 0 && (
        <Box
          onClick={() => navigate("/alerts")}
          sx={{ mt: 0.4, textAlign: "center", cursor: "pointer", flexShrink: 0 }}
        >
          <Typography sx={{ fontSize: "8px", color: "text.secondary", fontWeight: 600, "&:hover": { color: "text.primary" } }}>
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
      zoom >= 12 ? 200 :
      zoom >= 10 ? 80 :
      zoom >= 9  ? 30 :
      zoom >= 8  ? 15 :
                   7;
    const seen = new Set<string>();
    return events.filter((evt) => {
      const key = `${(evt.lat * precision).toFixed(0)}_${(evt.lng * precision).toFixed(0)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [events, zoom]);

  return (
    <>
      {sampled.map((evt, i) => (
        <Marker key={`evt-${i}`} position={[evt.lat, evt.lng]} icon={createEventIcon(evt.type)}>
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

function HealthGauge({ value, color }: { value: number; color: string }) {
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
        progress: { show: true, width: 10, roundCap: true, itemStyle: { color } },
        itemStyle: { color },
        axisLine: { roundCap: true, lineStyle: { width: 10, color: [[1, isDark ? "#374151" : "#E5E7EB"]] } },
        detail: { fontSize: 14, fontWeight: 700, offsetCenter: [0, "8%"], color: isDark ? "#fff" : "#1f2937", formatter: "{value}%" },
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
    <Box sx={{ height: 110, mt: 0.5, mb: 1 }}>
      <ReactECharts option={option} style={{ height: "100%", width: "100%" }} />
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
  const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#f97316", "#6366f1"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function SpeedGauge({ speed, isDark }: { speed: number; isDark: boolean }) {
  const r = 15, cx = 19, cy = 19;
  const halfLen = Math.PI * r;
  const pct = Math.min(speed / 120, 1);
  const color = speed > 90 ? "#ef4444" : speed > 60 ? "#f59e0b" : "#22c55e";
  const trackColor = isDark ? "#1e293b" : "#e2e8f0";
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={38} height={22} style={{ display: "block", overflow: "visible" }}>
        <path d={arcPath} fill="none" stroke={trackColor} strokeWidth={3} strokeLinecap="round" />
        <path d={arcPath} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={`${pct * halfLen} ${halfLen}`} />
      </svg>
      <Typography sx={{ fontSize: "10px", fontWeight: 800, lineHeight: 1.1, color, mt: "-1px" }}>{speed}</Typography>
      <Typography sx={{ fontSize: "7px", color: "text.secondary", lineHeight: 1 }}>km/h</Typography>
    </Box>
  );
}

function HealthRing({ score, isDark }: { score: number; isDark: boolean }) {
  const r = 13, cx = 18, cy = 18;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(score / 100, 1);
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <Box sx={{ position: "relative", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={36} height={36} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={isDark ? "#1e293b" : "#e2e8f0"} strokeWidth={3} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={`${pct * circ} ${(1 - pct) * circ}`} strokeLinecap="round" />
      </svg>
      <Typography sx={{ fontSize: "9px", fontWeight: 800, zIndex: 1, color, lineHeight: 1 }}>{score}%</Typography>
    </Box>
  );
}

const FLEET_TABLE_COLUMNS = [
  { id: "name",         label: "Vehicle Name",  sortable: true  },
  { id: "type",         label: "Type",          sortable: true  },
  { id: "status",       label: "Status",        sortable: true  },
  { id: "speed",        label: "Speed",         sortable: true  },
  { id: "health_status",label: "Health Status", sortable: true  },
  { id: "health",       label: "Health Score",  sortable: true  },
  { id: "driver",       label: "Driver",        sortable: true  },
  { id: "driver_score", label: "Driver Score",  sortable: true  },
  { id: "road_type",    label: "Road Type",     sortable: false },
  { id: "route_name",   label: "Route",         sortable: false },
] as const;

type FleetTableColId = (typeof FLEET_TABLE_COLUMNS)[number]["id"];

export default function CockpitView({ isActive = true }: { isActive?: boolean }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [vehiclePopoverAnchor, setVehiclePopoverAnchor] = useState(null);

  const [popoverPosition, setPopoverPosition] = useState(null);

  const [drawerTab, setDrawerTab] = useState(0);
  const [openFleetScatter, setOpenFleetScatter] = useState(false);
  const [openVehicleHealth, setOpenVehicleHealth] = useState(false);
  const [hiddenSims, setHiddenSims] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<
    | "all"
    | "active"
    | "parked"
    | "in_service"
    | "healthy"
    | "warning"
    | "critical"
  >("all");

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
  const [rowsPerPage, setRowsPerPage] = useState(10);
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

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    start.current = {
      x: e.clientX - dragPos.x,
      y: e.clientY - dragPos.y,
    };
    document.body.style.cursor = "grabbing";
  }, [dragPos]);

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
  const { data: positions, refetch: refetchPositions } = useQuery<VehiclePosition[]>({
    queryKey: ["fleet-positions"],
    queryFn: () => axios.get(`${FLEET_API}/positions`).then((r) => r.data),
    refetchInterval: isActive && autoRefresh ? 8000 : false,
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
    { id: "driver", label: "Driver", width: 80 },
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
      (v.driver_name ?? "").toLowerCase().includes(text) ||
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
      label: "In Service",
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

  const { data: pipelineFleet, refetch: refetchPipelineFleet } = useQuery<PipelineFleetSummary>({
    queryKey: ["pipeline-fleet-summary"],
    queryFn: () =>
      axios
        .get(`${PIPELINE_API}/api/automotive/fleet-summary`)
        .then((r) => r.data),
    retry: 1,
    refetchInterval: isActive && autoRefresh ? 8000 : false,
  });

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

  const vehicles = useMemo<CockpitVehicle[]>(() => {
    if (!positions?.length) return fallbackVehicles;
    return positions.slice(0, 12).map((v, index) => {
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
  }, [pipelineFleet?.vehicles, positions]);

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
      const r = await axios.get(`${PIPELINE_API}/api/automotive/fleet-health-scatter`);
      return r.data.vehicles ?? [];
    },
    enabled: isActive && sseVehicles.length === 0,
    refetchInterval: isActive && autoRefresh && sseVehicles.length === 0 ? 8000 : false,
    retry: 1,
  });

  const fleetHealthScatter = useMemo((): { vehicle_id: string; data: HealthHistoryRow[] }[] => {
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
    () => allPositions.filter((v) => v.status === "active").map((v) => v.vehicle_id),
    [allPositions]
  );

  const { data: allActiveTrips } = useQuery<TripData[]>({
    queryKey: ["cockpit-active-trips", activePositionIds.join(",")],
    queryFn: async () => {
      const results = await Promise.all(
        activePositionIds.map((vid) =>
          axios.get(`${FLEET_API}/vehicle/${vid}/trip`)
            .then((r) => r.data as TripData)
            .catch(() => null)
        )
      );
      return results.filter((t): t is TripData => t !== null);
    },
    enabled: activePositionIds.length > 0,
    staleTime: 30000,
    refetchInterval: isActive && autoRefresh ? 15000 : false,
    retry: 1,
  });

  const ICE_FUEL_L_PER_KM = 0.12;

  const operationalMetrics = useMemo(() => {
    const activePosns = allPositions.filter((v) => v.status === "active");
    const totalDistanceKm = (allActiveTrips ?? []).reduce((s, t) => s + (t.distance_completed_km ?? 0), 0);
    const fuelConsumedL = totalDistanceKm * ICE_FUEL_L_PER_KM;
    const tripsInProgress = (allActiveTrips ?? []).filter((t) => (t.progress_pct ?? 0) >= 5).length;
    const avgSpeedKmh = activePosns.length > 0
      ? activePosns.reduce((s, v) => s + (v.speed ?? 0), 0) / activePosns.length
      : 0;
    const total = allPositions.length || 1;
    const fleetUtilPct = (activePosns.length / total) * 100;
    return { totalDistanceKm, fuelConsumedL, tripsInProgress, avgSpeedKmh, fleetUtilPct };
  }, [allPositions, allActiveTrips]);

  const formatStatusLabel = (status: string) =>
    status?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) ||
    "Unknown";

  const selectedFleetLabel =
    statusFilter === "all" ? "Total Fleet" : formatStatusLabel(statusFilter);

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
      engine: Math.round(pv.engine_contrib),
      transmission: Math.round(pv.transmission_contrib),
      battery: Math.round(pv.battery_contrib),
      body: Math.round(pv.body_contrib),
      tyre: Math.round(pv.tyre_contrib),
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

  const bounds: [[number, number], [number, number]] = [[-90, -180], [90, 180]];

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

  const tileUrl = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
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

  const tableRows = (filteredPositions ?? []).filter((v) => {
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
  });

  const sortedTableRows = useMemo(() => {
    const rows = [...tableRows];
    rows.sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      switch (orderBy) {
        case "name":       aVal = a.name ?? a.vehicle_id; bVal = b.name ?? b.vehicle_id; break;
        case "type":       aVal = a.type ?? ""; bVal = b.type ?? ""; break;
        case "status":     aVal = a.status ?? ""; bVal = b.status ?? ""; break;
        case "speed":      aVal = a.speed ?? 0; bVal = b.speed ?? 0; break;
        case "health_status":
        case "health":     aVal = getLiveHealth(a); bVal = getLiveHealth(b); break;
        case "driver":     aVal = a.driver ?? ""; bVal = b.driver ?? ""; break;
        case "driver_score": aVal = a.driver_score ?? 0; bVal = b.driver_score ?? 0; break;
        default:           aVal = a.vehicle_id; bVal = b.vehicle_id;
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

  const criticalCount = allPositions.filter(
    (v) => getLiveHealth(v) < 50
  ).length;

  const warningCount = allPositions.filter((v) => {
    const h = getLiveHealth(v);
    return h >= 50 && h < 80;
  }).length;

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
      <Card sx={{ p: 1, height: "100%", bgcolor: isDark ? "#2c2e35" : "#eef0f4", ...(isDark && { border: "1px solid #3a3c44", opacity: 0.85, filter: "grayscale(22%)" }) }}>
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
        <Stack spacing={0.5} sx={{ mt: 0.3 }}>
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
                  fontSize: "10px",
                  lineHeight: "12px",
                  color: "text.secondary",
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
          alignItems="center"
          spacing={2}
        >
          {/* Left */}
          <Box sx={{ minWidth: 220 }}>
            <Typography
              sx={{
                fontWeight: 600,
                color: "text.secondary",
                letterSpacing: "-0.3px",
                fontSize: "14px",
                lineHeight: 1.2,
              }}
            >
              Fleet Overview
            </Typography>

            <Typography
              sx={{
                fontSize: "10px",
                color: "text.secondary",
                mt: 0.3,
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
              <TextField
                size="small"
                placeholder="Search Vehicle / Driver / Location"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
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
                  width: { xs: "100%", sm: 320 },

                  "& .MuiOutlinedInput-root": {
                    height: 28, // reduced height
                    borderRadius: 2,
                    fontSize: "12px",
                  },

                  "& .MuiOutlinedInput-input": {
                    py: 0.7,
                    px: 0,
                    fontSize: "12px",
                  },

                  "& input::placeholder": {
                    fontSize: "12px",
                    opacity: 1,
                  },
                }}
              />

              <Tooltip title="Notifications">
                <IconButton
                  size="small"
                  sx={{
                    width: 28,
                    height: 28,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 2,
                  }}
                >
                  <NotificationsNoneOutlinedIcon sx={{ fontSize: 20 }} />
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
            gap: 1,
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
            onClick={() => { setStatusFilter("all"); setSelectedVehicle(null); setPopoverPosition(null); setVehiclePopoverAnchor(null); setPage(0); }}
          />
          <KpiCard
            label="Active Vehicles"
            value={allPositions.length ? activeCount : summary.active}
            delta="13 vs yesterday"
            icon={<HealthAndSafetyOutlinedIcon />}
            color="#22c55e"
            iconLogo={false}
            trend="down"
            selected={statusFilter === "active"}
            onClick={() => { setStatusFilter(statusFilter === "active" ? "all" : "active"); setSelectedVehicle(null); setPopoverPosition(null); setVehiclePopoverAnchor(null); setPage(0); }}
          />
          <KpiCard
            label="Parked"
            value={allPositions.length ? parkedCount : summary.parked}
            delta="Today"
            icon={<TimelineOutlinedIcon />}
            color="#0ea5e9"
            iconLogo={false}
            trend="down"
            selected={statusFilter === "parked"}
            onClick={() => { setStatusFilter(statusFilter === "parked" ? "all" : "parked"); setSelectedVehicle(null); setPopoverPosition(null); setVehiclePopoverAnchor(null); setPage(0); }}
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
            onClick={() => { setStatusFilter(statusFilter === "in_service" ? "all" : "in_service"); setSelectedVehicle(null); setPopoverPosition(null); setVehiclePopoverAnchor(null); setPage(0); }}
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
            onClick={() => { setStatusFilter(statusFilter === "critical" ? "all" : "critical"); setSelectedVehicle(null); setPopoverPosition(null); setVehiclePopoverAnchor(null); setPage(0); }}
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
            onClick={() => { setStatusFilter(statusFilter === "warning" ? "all" : "warning"); setSelectedVehicle(null); setPopoverPosition(null); setVehiclePopoverAnchor(null); setPage(0); }}
          />

          <KpiCard
            label="Avg Engine Health"
            value={`${avgEngineHealth}%`}
            delta="Up by 2%"
            icon={<SpeedOutlinedIcon />}
            color="#f97316"
            trend="down"
            iconLogo={false}
          />

          <KpiCard
            label="Active Alerts"
            value={alertTotal !== null ? String(alertTotal) : "—"}
            delta={alertTotal !== null
              ? `${Math.max(1, Math.round(alertTotal * 0.18 + 1))} fewer than yesterday`
              : "fewer than yesterday"}
            icon={<ErrorOutlineOutlinedIcon />}
            color="#ef4444"
            trend="down"
            iconLogo={true}
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
          <Box sx={{ flexGrow: 0 }}>
            <Grid container spacing={1}>
              {/* MAP */}
              <Grid item xs={12} sm={7}>
                <Paper
                  sx={{
                    height: "345px",
                    overflow: "hidden",
                    position: "relative", // <-- change from static
                    border: `1px solid ${theme.palette.divider}`,
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: "10px",
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
                          filter: "invert(1) hue-rotate(180deg) contrast(0.82) brightness(1.45) saturate(1.15)",
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
                      zoomControl={true}
                      attributionControl={false}
                      preferCanvas={true}
                      style={{ width: "100%", height: "100%" }}
                    >
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

                      {filteredPositions?.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng)).map((v) => {
                        const liveH =
                          v.status === "active"
                            ? getVehicleHealth(v.vehicle_id, v.health)
                            : v.health;
                        return (
                          <Marker
                            key={v.vehicle_id}
                            position={[v.lat, v.lng]}
                            icon={createVehicleIcon(v.status, liveH, v.heading, isDark)}
                            eventHandlers={{
                              click: (e) => {
                                setSelectedVehicle(v.vehicle_id);
                                setDrawerTab(0);

                                setPopoverPosition({
                                  top: e.originalEvent.clientY,
                                  left: e.originalEvent.clientX,
                                });
                              },
                            }}
                          >
                            {/* <Popup>
                          <strong>{v.name}</strong> ({v.vehicle_id})<br />
                          {v.status === "active"
                            ? `${v.speed.toFixed(0)} km/h • ${v.road_type}`
                            : v.route_name}
                          <br />
                          Health: {liveH.toFixed(1)}% • Driver: {v.driver_score}
                        </Popup> */}
                          </Marker>
                        );
                      })}

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
                        border: `1px solid ${isDark ? "#1e293b" : theme.palette.divider}`,
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
                          label="In Service"
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
              {/* KPI */}
              <Grid item xs={12} sm={5}>
                <Box
                  sx={{
                    display: "grid",
                    gap: 1,
                    width: "100%",
                    height: "345px",
                    gridTemplateColumns: "repeat(2, minmax(0,1fr))",
                    gridTemplateRows: "165px 1fr",
                  }}
                >
                  {/* Card 1 */}
                  <Card
                    sx={{
                      minWidth: 0,
                      height: 165,
                    }}
                  >
                    <Card
                      sx={{
                        p: 1,
                        height: 165,
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          //   mb: 0.5,
                        }}
                      >
                        <SectionTitle title="Overall Fleet Health" />

                        <Box
                          sx={{
                            px: 1,
                            // py: "2px",
                            minHeight: 20,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "999px",
                            bgcolor: `${selectedHealthStatus.color}20`,
                            border: `1px solid ${selectedHealthStatus.color}40`,
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: selectedHealthStatus.color,
                              lineHeight: 1,
                              m: 0,
                            }}
                          >
                            {selectedHealthStatus.label}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Gauge */}
                      <Box
                        sx={{
                          height: 72,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          mt: -2.5,
                          mb: 0.5,
                        }}
                      >
                        <HealthGauge value={selectedAvgHealth} color={selectedHealthStatus.color} />
                      </Box>

                      {/* Active Vehicles */}
                      <Box
                        sx={{
                          px: 1.2,
                          py: 0.7,
                          borderRadius: 2,
                          minHeight: 42,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          background: isDark
                            ? "linear-gradient(135deg,#2d1f00 0%,#3d2900 100%)"
                            : "linear-gradient(135deg,#FFF8D6 0%,#FFE082 100%)",
                          border: isDark ? "1px solid #7a5200" : "1px solid #FBC02D",
                        }}
                      >
                        <Box>
                          <Typography
                            sx={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: isDark ? "#fbbf24" : "#8A6D00",
                              lineHeight: 1,
                              letterSpacing: 0.3,
                              textTransform: "uppercase",
                            }}
                          >
                            {selectedFleetLabel}
                          </Typography>

                          <Typography
                            sx={{
                              mt: 0.2,
                              fontSize: 16,
                              fontWeight: 800,
                              color: isDark ? "#fcd34d" : "#7A5600",
                              lineHeight: 1,
                            }}
                          >
                            {statusFilter === "all"
                              ? allPositions.length || summary.total || 0
                              : filteredPositions?.length ?? 0}
                          </Typography>
                        </Box>

                        <Box
                          sx={{
                            width: 30,
                            height: 30,
                            borderRadius: "50%",
                            bgcolor: "#FBC02D",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#fff",
                          }}
                        >
                          <LocalShippingOutlinedIcon sx={{ fontSize: 16 }} />
                        </Box>
                      </Box>
                    </Card>
                  </Card>

                  {/* Card 2 */}
                  <Card
                    sx={{
                      height: "100%",
                      p: 0,
                      display: "flex",
                    }}
                  >
                    <AiSummary summary={summary} />
                  </Card>

                  {/* Card 3 */}
                  <Card
                    sx={{
                      height: "100%",
                      p: 0,
                      display: "flex",
                      overflow: "hidden",
                    }}
                  >
                    <RecentAlerts onTotalChange={setAlertTotal} />
                  </Card>

                  {/* Card 4 */}
                  <Card
                    sx={{
                      height: "100%",
                      p: 0,
                      display: "flex",
                      overflow: "hidden",
                    }}
                  >
                    <Card sx={{ p: 1, width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
                      <SectionTitle title="Operational Metrics (Today)" />
                      <Box
                        sx={{
                          flex: 1,
                          overflow: "hidden",
                          display: "grid",
                          gridTemplateColumns: "repeat(3, 1fr)",
                          gridTemplateRows: "repeat(2, 1fr)",
                          gap: 0.5,
                        }}
                      >
                        {((): [string, string, string, string, React.ReactNode][] => {
                          const { totalDistanceKm, fuelConsumedL, tripsInProgress, avgSpeedKmh, fleetUtilPct } = operationalMetrics;
                          const speedColor = avgSpeedKmh > 90 ? "#ef4444" : avgSpeedKmh > 60 ? "#f59e0b" : "#22c55e";
                          const utilColor = fleetUtilPct >= 50 ? "#22c55e" : fleetUtilPct >= 25 ? "#f59e0b" : "#ef4444";
                          return [
                            [`${Math.round(totalDistanceKm).toLocaleString()} km`, "Distance Traveled", `${activePositionIds.length} active`, "#22c55e", <TimelineOutlinedIcon sx={{ fontSize: 12 }} />],
                            [`${Math.round(fuelConsumedL).toLocaleString()} L`, "Est. Fuel Consumed", "@ 12 L/100km", "#f59e0b", <LocalGasStationOutlinedIcon sx={{ fontSize: 12 }} />],
                            [`${parkedCount}`, "Vehicles Idle", "parked now", "#94a3b8", <LocalShippingOutlinedIcon sx={{ fontSize: 12 }} />],
                            [`${tripsInProgress}`, "Trips in Progress", "active routes", "#3b82f6", <RouteIcon sx={{ fontSize: 12 }} />],
                            [`${Math.round(avgSpeedKmh)} km/h`, "Avg. Speed", "active fleet", speedColor, <SpeedOutlinedIcon sx={{ fontSize: 12 }} />],
                            [`${Math.round(fleetUtilPct)}%`, "Fleet Utilization", "of fleet active", utilColor, <DonutSmallIcon sx={{ fontSize: 12 }} />],
                          ];
                        })().map(([value, label, delta, color, icon]) => (
                          <Box
                            key={String(label)}
                            sx={{
                              p: 0.6,
                              borderRadius: 1.5,
                              border: `1px solid ${alpha(String(color), isDark ? 0.22 : 0.18)}`,
                              bgcolor: alpha(String(color), isDark ? 0.07 : 0.05),
                              display: "flex",
                              flexDirection: "column",
                              gap: 0.25,
                              position: "relative",
                              overflow: "hidden",
                              "&::before": {
                                content: '""',
                                position: "absolute",
                                top: 0, left: 0,
                                width: "3px", height: "100%",
                                bgcolor: String(color),
                              },
                            }}
                          >
                            <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                              <Typography sx={{ fontSize: "11px", fontWeight: 900, color: isDark ? "#f1f5f9" : "#0f172a", lineHeight: 1, pl: 0.5, whiteSpace: "nowrap" }}>
                                {value}
                              </Typography>
                              <Box sx={{ width: 20, height: 20, borderRadius: "6px", bgcolor: alpha(String(color), isDark ? 0.2 : 0.12), display: "flex", alignItems: "center", justifyContent: "center", color: String(color), flexShrink: 0 }}>
                                {icon}
                              </Box>
                            </Box>
                            <Typography sx={{ fontSize: "8px", fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.5px", pl: 0.5, lineHeight: 1 }}>
                              {String(label)}
                            </Typography>
                            <Typography sx={{ fontSize: "9px", color: String(color), fontWeight: 700, pl: 0.5, lineHeight: 1 }}>
                              {String(delta)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Card>
                  </Card>
                </Box>
              </Grid>
            </Grid>

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

                  {/* CLOSE */}
                  <IconButton
                    size="small"
                    onClick={() => setSelectedVehicle(null)}
                    sx={{
                      alignSelf: "flex-start",
                      p: 0.5,
                    }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
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
                      const inactiveStatusMeta: Record<string, { color: string; label: string }> = {
                        parked:     { color: "#3b82f6", label: "Parked" },
                        in_service: { color: "#8b5cf6", label: "In Service" },
                        warning:    { color: "#f59e0b", label: "Warning" },
                        critical:   { color: "#ef4444", label: "Critical" },
                      };
                      const st = inactiveStatusMeta[vehicleDetail.status] ?? { color: "#64748b", label: vehicleDetail.status };
                      const hColor = healthColor(h);
                      const dScore = vehicleDetail.driver_score ?? 0;
                      const dScoreColor = dScore >= 80 ? "#22c55e" : dScore >= 60 ? "#f59e0b" : "#ef4444";
                      const ringR = 22, ringCx = 26, ringCy = 26, ringCirc = 2 * Math.PI * 22;
                      const hPct = Math.min(h / 100, 1);
                      const dividerColor = isDark ? "#1e293b" : "#e2e8f0";
                      const trackBg = isDark ? "#1e293b" : "#e2e8f0";

                      return (
                        <>
                          {/* ── DRAG HEADER ─────────────────────── */}
                          <Box
                            onMouseDown={handleDragStart}
                            sx={{
                              px: 1.5, py: 1.25,
                              borderBottom: `1px solid ${dividerColor}`,
                              cursor: "grab",
                              userSelect: "none",
                              bgcolor: isDark ? "#0f172a" : "#f8fafc",
                              "&:active": { cursor: "grabbing" },
                            }}
                          >
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                              <Box sx={{ minWidth: 0, flex: 1 }}>
                                <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, px: 0.8, py: 0.2, borderRadius: 5, bgcolor: alpha(st.color, 0.12), border: `1px solid ${alpha(st.color, 0.25)}`, mb: 0.6 }}>
                                  <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: st.color, flexShrink: 0 }} />
                                  <Typography sx={{ fontSize: "9px !important", fontWeight: 700, color: st.color, textTransform: "uppercase", letterSpacing: ".06em" }}>
                                    {st.label}
                                  </Typography>
                                </Box>
                                <Typography sx={{ fontSize: "15px !important", fontWeight: 800, lineHeight: 1.2, color: isDark ? "#f1f5f9" : "#0f172a" }}>
                                  {vehicleDetail.name.toUpperCase()}
                                </Typography>
                                <Typography sx={{ fontSize: "10px !important", color: "text.secondary", mt: 0.25 }}>
                                  {vehicleDetail.vehicle_id} · {vehicleDetail.type}
                                </Typography>
                              </Box>
                              <IconButton
                                size="small"
                                onClick={() => setSelectedVehicle(null)}
                                onMouseDown={(e) => e.stopPropagation()}
                                sx={{ p: 0.4, ml: 1, flexShrink: 0 }}
                              >
                                <CloseIcon sx={{ fontSize: 16 }} />
                              </IconButton>
                            </Stack>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.9 }}>
                              <Box sx={{ width: 22, height: 22, borderRadius: "50%", bgcolor: getAvatarColor(vehicleDetail.driver ?? ""), display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <Typography sx={{ fontSize: "8px !important", fontWeight: 700, color: "#fff", lineHeight: 1 }}>
                                  {getDriverInitials(vehicleDetail.driver ?? "")}
                                </Typography>
                              </Box>
                              <Typography sx={{ fontSize: "11px !important", fontWeight: 600 }}>
                                {vehicleDetail.driver || "Unassigned"}
                              </Typography>
                              {vehicleDetail.city && (
                                <>
                                  <Box sx={{ width: 3, height: 3, borderRadius: "50%", bgcolor: "text.disabled", flexShrink: 0 }} />
                                  <Typography sx={{ fontSize: "10px !important", color: "text.secondary" }}>{vehicleDetail.city}</Typography>
                                </>
                              )}
                            </Stack>
                          </Box>

                          {/* ── HEALTH + DRIVER SCORE ───────────── */}
                          <Box sx={{ px: 1.5, py: 1.25, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, borderBottom: `1px solid ${dividerColor}` }}>
                            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.5 }}>
                              <Box sx={{ position: "relative", width: 52, height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width={52} height={52} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
                                  <circle cx={ringCx} cy={ringCy} r={ringR} fill="none" stroke={trackBg} strokeWidth={4} />
                                  <circle cx={ringCx} cy={ringCy} r={ringR} fill="none" stroke={hColor} strokeWidth={4}
                                    strokeDasharray={`${hPct * ringCirc} ${(1 - hPct) * ringCirc}`} strokeLinecap="round" />
                                </svg>
                                <Typography sx={{ fontSize: "11px !important", fontWeight: 800, color: hColor, zIndex: 1, lineHeight: 1 }}>
                                  {h.toFixed(0)}%
                                </Typography>
                              </Box>
                              <Typography sx={{ fontSize: "9px !important", color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                                Health
                              </Typography>
                            </Box>

                            <Box sx={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 0.75 }}>
                              <Typography sx={{ fontSize: "9px !important", color: "text.secondary", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em" }}>
                                Driver Score
                              </Typography>
                              <Stack direction="row" spacing={0.5} alignItems="baseline">
                                <Typography sx={{ fontSize: "22px !important", fontWeight: 800, color: dScoreColor, lineHeight: 1 }}>
                                  {dScore}
                                </Typography>
                                <Typography sx={{ fontSize: "10px !important", color: "text.secondary" }}>/100</Typography>
                              </Stack>
                              <LinearProgress variant="determinate" value={dScore}
                                sx={{ height: 5, borderRadius: 3, bgcolor: trackBg,
                                  "& .MuiLinearProgress-bar": { bgcolor: dScoreColor, borderRadius: 3 } }} />
                            </Box>
                          </Box>

                          {/* ── MODULE HEALTH BARS ──────────────── */}
                          {Object.keys(mods).length > 0 && (
                            <Box sx={{ px: 1.5, py: 1.25, borderBottom: `1px solid ${dividerColor}` }}>
                              <Typography sx={{ fontSize: "9px !important", fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: ".06em", mb: 1 }}>
                                Module Health
                              </Typography>
                              <Stack spacing={0.85}>
                                {Object.entries(mods).map(([mod, val]) => {
                                  const mc = healthColor(val as number);
                                  return (
                                    <Box key={mod}>
                                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.35 }}>
                                        <Typography sx={{ fontSize: "10px !important", fontWeight: 600, textTransform: "capitalize" }}>{mod}</Typography>
                                        <Stack direction="row" spacing={0.4} alignItems="center">
                                          {(val as number) < 60 && <WarningAmberOutlinedIcon sx={{ fontSize: 10, color: "#f59e0b" }} />}
                                          <Typography sx={{ fontSize: "10px !important", fontWeight: 700, color: mc }}>{(val as number).toFixed(0)}%</Typography>
                                        </Stack>
                                      </Stack>
                                      <LinearProgress variant="determinate" value={val as number}
                                        sx={{ height: 4, borderRadius: 3, bgcolor: trackBg,
                                          "& .MuiLinearProgress-bar": { bgcolor: mc, borderRadius: 3 } }} />
                                    </Box>
                                  );
                                })}
                              </Stack>
                            </Box>
                          )}

                          {/* ── LAST KNOWN LOCATION ─────────────── */}
                          {(vehicleDetail.road_type || vehicleDetail.route_name) && (
                            <Box sx={{ px: 1.5, py: 1.25 }}>
                              <Typography sx={{ fontSize: "9px !important", fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: ".06em", mb: 0.75 }}>
                                Last Known Location
                              </Typography>
                              <Stack spacing={0.5}>
                                {vehicleDetail.road_type && (
                                  <Stack direction="row" spacing={0.75} alignItems="center">
                                    <RouteIcon sx={{ fontSize: 13, color: "text.secondary", flexShrink: 0 }} />
                                    <Typography sx={{ fontSize: "10px !important", color: isDark ? "#cbd5e1" : "#475569" }}>
                                      {vehicleDetail.road_type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                    </Typography>
                                  </Stack>
                                )}
                                {vehicleDetail.route_name && (
                                  <Stack direction="row" spacing={0.75} alignItems="center">
                                    <LocationOnIcon sx={{ fontSize: 13, color: "#3b82f6", flexShrink: 0 }} />
                                    <Typography sx={{ fontSize: "10px !important" }} noWrap title={vehicleDetail.route_name}>
                                      {vehicleDetail.route_name}
                                    </Typography>
                                  </Stack>
                                )}
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
                                (vehicleDetail.status as string) === "in_service"
                                  ? "In Service"
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

                                borderBottom: `1px solid ${isDark ? "#1e293b" : "#CDECF5"}`,

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
                                  borderRight: `1px solid ${isDark ? "#1e293b" : "#D6EEF6"}`,
                                },

                                "& .Mui-selected": {
                                  bgcolor: isDark ? "#1e293b" : "#DCF3FA",
                                  color: isDark ? "#38bdf8" : "#005071",
                                },

                                "& .MuiTabs-indicator": {
                                  height: 3,
                                  backgroundColor: isDark ? "#0ea5e9" : "#8FCFE3",
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

                                          bgcolor: isDark ? "#1e293b" : "#DCEEFF",

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
                                            vehicleDetail.speed ?? 0,
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
                                                  background: isDark ? "#1e293b" : "#DCEEFF",
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
                                                    ${isDark ? "#1e293b" : "#DCEEFF"} ${angle}deg
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
                                                  bgcolor: isDark ? "#0f172a" : "#fff",
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
                                                    color: isDark ? "#38bdf8" : "#005071",
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

                                            border: `1px solid ${isDark ? "#1e40af" : "#2563EB"}`,

                                            bgcolor: isDark ? "#0f172a" : "#EEF5FF",

                                            borderRadius: "50px",
                                          }}
                                        >
                                          <Typography
                                            sx={{
                                              fontSize: "8px",

                                              fontWeight: 700,

                                              color: isDark ? "#38bdf8" : "#005071",

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

                                            border: `1px solid ${isDark ? "#1e40af" : "#2563EB"}`,

                                            borderRadius: "50px",

                                            bgcolor: isDark ? "#0f172a" : "#EEF5FF",
                                          }}
                                        >
                                          <ExploreIcon
                                            sx={{
                                              color: "#2563EB",

                                              fontSize: 10,

                                              transform: `rotate(${
                                                vehicleDetail.heading || 0
                                              }deg)`,
                                            }}
                                          />

                                          <Typography
                                            sx={{
                                              fontSize: "8px",

                                              fontWeight: 700,

                                              color: isDark ? "#38bdf8" : "#005071",
                                            }}
                                          >
                                            HDG{" "}
                                            {vehicleDetail.heading?.toFixed(0)}°
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
                                              borderBottom: `1px solid ${isDark ? "#1e293b" : "#eee"}`,
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

                                                  color: isDark ? "#38bdf8" : "#005071",

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
      <Box sx={{ mt: 1, mb: 1 }}>
      <Grid container spacing={1}>
        <Grid item xs={12} md={6}>
          <Card sx={{ p: 0 }}>
            {(() => {
              const hasData =
                fleetHealthScatter &&
                fleetHealthScatter.some((v) => v.data.length > 0);

              let fleetScatterOption = {};

              if (hasData) {
                const allTs = new Set();

                fleetHealthScatter.forEach((vh) =>
                  vh.data.forEach((r) => allTs.add(r.ts || r.timestamp || ""))
                );

                const sortedTs = Array.from(allTs).sort();

                const series = fleetHealthScatter
                  .map((vehicle, originalIdx) => {
                    if (hiddenSims.has(vehicle.vehicle_id)) return null;
                    const c = VEHICLE_COLORS[originalIdx % VEHICLE_COLORS.length];
                    return {
                      name: vehicle.vehicle_id,
                      type: "scatter",
                      symbol: "circle",
                      z: 1,
                      zlevel: 1,
                      data: vehicle.data.map((r) => [r.ts || r.timestamp, r.health ?? 0]),
                      symbolSize: 4,
                      itemStyle: { color: c, opacity: 0.85, borderWidth: 0 },
                      emphasis: { scale: 1.3, itemStyle: { opacity: 1 } },
                    };
                  })
                  .filter(Boolean);

                fleetScatterOption = {
                  animation: false,

                  tooltip: {
                    trigger: "item",
                    backgroundColor: isDark ? "#1e293b" : "#ffffff",
                    borderColor: isDark ? "#334155" : "#e2e8f0",
                    borderWidth: 1,
                    borderRadius: 8,
                    padding: [8, 12],
                    textStyle: { fontSize: 10, color: isDark ? "#e2e8f0" : "#1e293b", fontFamily: CHART_FONT },
                    formatter: (p) => {
                      const originalIdx = fleetHealthScatter.findIndex((v) => v.vehicle_id === p.seriesName);
                      const c = VEHICLE_COLORS[originalIdx % VEHICLE_COLORS.length];
                      const ts = String(p.data[0]).slice(5, 16).replace("T", " ");
                      const health = Math.round(Number(p.data[1]));
                      return `<div style="line-height:1.7">
                        <div style="font-weight:700;font-size:11px;color:${c};margin-bottom:2px">${p.seriesName}</div>
                        <div style="font-size:10px;opacity:.65">${ts}</div>
                        <div style="font-size:11px;margin-top:3px">Health&nbsp;<b>${health}%</b></div>
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
                        lineStyle: { width: 1.5, type: "dashed", opacity: 0.7 },
                        label: { fontSize: 10, fontFamily: CHART_FONT, fontWeight: 600 },
                        data: [
                          {
                            yAxis: 60,
                            label: { formatter: "CRITICAL", color: "#ef4444", position: "insideStartTop" },
                            lineStyle: { color: "#ef4444" },
                          },
                          {
                            yAxis: 80,
                            label: { formatter: "WARNING", color: "#f59e0b", position: "insideStartTop" },
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
                  <Box sx={{ p: 1, height: 370, display: "flex", flexDirection: "column" }}>
                    {/* HEADER */}
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
                      <SectionTitle title="Fleet Health Scatter" />
                      <Tooltip title="Expand">
                        <IconButton size="small" onClick={() => setOpenFleetScatter(true)} sx={{ p: 0.5 }}>
                          <AspectRatioOutlinedIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>

                    {/* LEGEND — clickable filter pills */}
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mb: 0.75 }}>
                      {fleetHealthScatter?.map((v, i) => {
                        const c = VEHICLE_COLORS[i % VEHICLE_COLORS.length];
                        const hidden = hiddenSims.has(v.vehicle_id);
                        const toggle = () => setHiddenSims((prev) => {
                          const next = new Set(prev);
                          if (next.has(v.vehicle_id)) next.delete(v.vehicle_id);
                          else next.add(v.vehicle_id);
                          return next;
                        });
                        return (
                          <Box key={v.vehicle_id} onClick={toggle} sx={{
                            cursor: "pointer", userSelect: "none",
                            display: "flex", alignItems: "center", gap: 0.5,
                            px: 0.8, py: 0.2, borderRadius: 5,
                            bgcolor: hidden ? "transparent" : alpha(c, isDark ? 0.18 : 0.1),
                            border: `1px solid ${alpha(c, hidden ? 0.2 : 0.4)}`,
                            opacity: hidden ? 0.4 : 1,
                            transition: "opacity 0.15s, background 0.15s",
                          }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: hidden ? "transparent" : c, border: `1.5px solid ${c}`, flexShrink: 0 }} />
                            <Typography sx={{ fontSize: "9px", fontWeight: 600, color: hidden ? "text.disabled" : c, lineHeight: 1 }}>{v.vehicle_id}</Typography>
                          </Box>
                        );
                      })}
                    </Box>

                    {/* CHART */}
                    <Box sx={{ flex: 1, minHeight: 0 }}>
                      {hasData ? (
                        <ReactECharts option={fleetScatterOption} style={{ width: "100%", height: "100%" }} />
                      ) : (
                        <Box sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
                          <Typography sx={{ fontSize: "12px", color: "text.secondary", fontWeight: 500 }}>No pipeline data yet</Typography>
                          <Typography sx={{ fontSize: "10px", color: "text.disabled" }}>GOLD stream will appear once the pipeline is active</Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>

                  {/* EXPANDED MODAL */}
                  <Dialog open={openFleetScatter} onClose={() => setOpenFleetScatter(false)} fullWidth maxWidth="xl">
                    <Box sx={{ px: 2, py: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}` }}>
                      <Typography sx={{ fontSize: "14px", fontWeight: 700 }}>Fleet Health Scatter</Typography>
                      <IconButton onClick={() => setOpenFleetScatter(false)} size="small"><CloseIcon fontSize="small" /></IconButton>
                    </Box>
                    <DialogContent sx={{ height: "85vh" }}>
                      {hasData && <ReactECharts option={fleetScatterOption} style={{ width: "100%", height: "100%" }} />}
                    </DialogContent>
                  </Dialog>
                </>
              );
            })()}
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ p: 0 }}>
            {(() => {
              const rows = healthHistory?.data || [];

              const factor = Math.max(1, Math.floor(rows.length / 500));

              const sampled =
                factor === 1 ? rows : rows.filter((_, i) => i % factor === 0);

              const xKey = timelineXAxis === "mileage" ? "mileage" : "ts";

              const xData = sampled.map((r) =>
                xKey === "mileage" ? r.mileage : r.ts || r.timestamp || ""
              );

              const yData = sampled.map((r) => r.health);

              const lastMileage = rows[rows.length - 1]?.mileage ?? 0;

              const kmSinceService = lastMileage % SERVICE_INTERVAL_KM;

              const nextServiceKm =
                lastMileage + (SERVICE_INTERVAL_KM - kmSinceService);

              const chartOption = {
                tooltip: {
                  trigger: "axis",
                  backgroundColor: isDark ? "#1e293b" : "#ffffff",
                  borderColor: isDark ? "#334155" : "#e2e8f0",
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: [8, 12],
                  textStyle: { fontSize: 10, color: isDark ? "#e2e8f0" : "#1e293b", fontFamily: CHART_FONT },
                  formatter: (params: any) => {
                    const p = Array.isArray(params) ? params[0] : params;
                    if (!p) return "";
                    const rawX = p.axisValue ?? p.name ?? "";
                    const xLabel = timelineXAxis === "mileage"
                      ? `${Math.round(Number(rawX)).toLocaleString()} km`
                      : String(rawX).slice(5, 16).replace("T", " ");
                    const health = Math.round(Number(p.value));
                    const axisName = timelineXAxis === "mileage" ? "Mileage" : "Time";
                    return `<div style="line-height:1.7">
                      <div style="font-weight:700;font-size:11px;color:#3b82f6;margin-bottom:2px">${healthTimelineVehicle}</div>
                      <div style="font-size:10px;opacity:.65">${axisName}&nbsp;${xLabel}</div>
                      <div style="font-size:11px;margin-top:3px">Health&nbsp;<b>${health}%</b></div>
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

                    formatter: (v: any) =>
                      timelineXAxis === "mileage"
                        ? Math.round(Number(v)).toLocaleString()
                        : String(v).slice(5, 16).replace("T", " "),
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
                        type: "linear", x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                          { offset: 0, color: "rgba(59,130,246,0.18)" },
                          { offset: 1, color: "rgba(59,130,246,0.02)" },
                        ],
                      },
                    },
                    markLine: {
                      silent: true,
                      symbol: ["none", "none"],
                      lineStyle: { width: 1.5, type: "dashed", opacity: 0.7 },
                      label: { fontSize: 10, fontFamily: CHART_FONT, fontWeight: 600 },
                      data: [
                        {
                          yAxis: 60,
                          label: { formatter: "CRITICAL", color: "#ef4444", position: "insideStartTop" },
                          lineStyle: { color: "#ef4444" },
                        },
                        {
                          yAxis: 80,
                          label: { formatter: "WARNING", color: "#f59e0b", position: "insideStartTop" },
                          lineStyle: { color: "#f59e0b" },
                        },
                        ...(timelineXAxis === "mileage"
                          ? [{
                              xAxis: nextServiceKm,
                              label: {
                                formatter: `NEXT SVC\n+${Math.round(SERVICE_INTERVAL_KM - kmSinceService).toLocaleString()} km`,
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
                            }]
                          : []),
                      ],
                    },

                    markArea: {
                      silent: true,
                      data: [
                        [{ yAxis: 0, itemStyle: { color: isDark ? "rgba(239,68,68,.03)" : "rgba(239,68,68,.025)" } }, { yAxis: 60 }],
                        [{ yAxis: 60, itemStyle: { color: isDark ? "rgba(245,158,11,.025)" : "rgba(245,158,11,.02)" } }, { yAxis: 80 }],
                      ],
                    },
                  },
                ],
              };

              return (
                <>
                  <Box sx={{ p: 1, height: 370, display: "flex", flexDirection: "column" }}>
                    {/* HEADER */}
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, flexWrap: "wrap", gap: 0.5 }}>
                      <SectionTitle title="Vehicle Health Timeline" />
                      <Box sx={{ display: "flex", gap: 0.75, alignItems: "center" }}>
                        {timelineXAxis === "mileage" && rows.length > 0 && (
                          <Box sx={{
                            display: "inline-flex", alignItems: "center", gap: 0.5,
                            px: 1, height: 28, borderRadius: 1,
                            bgcolor: alpha("#3b82f6", isDark ? 0.15 : 0.08),
                            border: `1px solid ${alpha("#3b82f6", isDark ? 0.3 : 0.2)}`,
                          }}>
                            <Typography sx={{ fontSize: "10px", fontWeight: 700, color: isDark ? "#60a5fa" : "#2563eb", whiteSpace: "nowrap" }}>
                              Next Service in {Math.round(SERVICE_INTERVAL_KM - kmSinceService).toLocaleString()} km
                            </Typography>
                          </Box>
                        )}
                        <Select
                          value={healthTimelineVehicle}
                          onChange={(e) => setHealthTimelineVehicle(e.target.value)}
                          size="small"
                          sx={{ height: 28, fontSize: "10px", fontWeight: 700, borderRadius: 1, minWidth: 120, "& .MuiSelect-select": { py: "4px" } }}
                        >
                          {timelineVehicleOptions.map((v) => (
                            <MenuItem key={v.vehicle_id} value={v.vehicle_id} sx={{ fontSize: "10px" }}>{v.vehicle_id}</MenuItem>
                          ))}
                        </Select>
                        <ToggleButtonGroup
                          value={timelineXAxis}
                          exclusive
                          onChange={(_, v) => v && setTimelineXAxis(v)}
                          size="small"
                        >
                          <ToggleButton value="mileage" sx={{ fontWeight: 700, px: 1.25, fontSize: "9px", height: 28, py: 0 }}>MILEAGE</ToggleButton>
                          <ToggleButton value="timestamp" sx={{ fontWeight: 700, px: 1.25, fontSize: "9px", height: 28, py: 0 }}>TIMESTAMP</ToggleButton>
                        </ToggleButtonGroup>
                        <Tooltip title="Expand">
                          <IconButton size="small" onClick={() => setOpenVehicleHealth(true)} sx={{ p: 0.5 }}>
                            <AspectRatioOutlinedIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>

                    <Box
                      sx={{
                        flex: 1,
                        minHeight: 0,
                      }}
                    >
                      {rows.length > 0 ? (
                        <ReactECharts style={{ height: "100%", width: "100%" }} option={chartOption} />
                      ) : (
                        <Box sx={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0.5 }}>
                          <Typography sx={{ fontSize: "12px", color: "text.secondary", fontWeight: 500 }}>No health history yet</Typography>
                          <Typography sx={{ fontSize: "10px", color: "text.disabled" }}>Select a vehicle and wait for GOLD data to arrive</Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>

                  {/* EXPAND DIALOG */}

                  <Dialog open={openVehicleHealth} onClose={() => setOpenVehicleHealth(false)} fullWidth maxWidth="xl">
                    <Box sx={{ px: 2, py: 1.5, display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}` }}>
                      <Typography sx={{ fontSize: "14px", fontWeight: 700 }}>Vehicle Health Timeline</Typography>
                      <IconButton onClick={() => setOpenVehicleHealth(false)} size="small"><CloseIcon fontSize="small" /></IconButton>
                    </Box>
                    <DialogContent sx={{ height: "85vh" }}>
                      <ReactECharts style={{ width: "100%", height: "100%" }} option={chartOption} />
                    </DialogContent>
                  </Dialog>
                </>
              );
            })()}
          </Card>
        </Grid>
      </Grid>
      </Box>

      <Paper
        elevation={0}
        sx={{
          border: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: isDark ? "#0f172a" : "#ffffff",
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            px: 2,
            py: 1.5,
            borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: "14px", fontWeight: 700, lineHeight: 1.3 }}>Fleet Table</Typography>
            <Typography sx={{ fontSize: "11px", color: "text.secondary", mt: 0.25 }}>
              Real-time overview of all active and in-service vehicles
            </Typography>
          </Box>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ px: 1.25, py: 0.4, borderRadius: 5, bgcolor: alpha("#3b82f6", isDark ? 0.15 : 0.08), border: `1px solid ${alpha("#3b82f6", 0.25)}` }}>
              <Typography sx={{ fontSize: "11px", fontWeight: 700, color: "#3b82f6" }}>
                {sortedTableRows.length} Vehicles
              </Typography>
            </Box>
            <TextField
              size="small"
              placeholder="Search vehicle / driver / route…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              InputProps={{
                startAdornment: (
                  <SearchOutlinedIcon sx={{ fontSize: 16, mr: 0.8, color: "text.secondary" }} />
                ),
              }}
              sx={{
                width: 260,
                "& .MuiOutlinedInput-root": {
                  height: 32,
                  borderRadius: 2,
                  fontSize: "12px",
                  bgcolor: isDark ? "#1e293b" : "#f8fafc",
                  "& fieldset": { borderColor: isDark ? "#334155" : "#e2e8f0" },
                  "&:hover fieldset": { borderColor: isDark ? "#475569" : "#cbd5e1" },
                  "&.Mui-focused fieldset": { borderColor: "#3b82f6" },
                },
                "& .MuiOutlinedInput-input": { py: 0, px: 0, fontSize: "12px" },
                "& input::placeholder": { fontSize: "12px", opacity: 1 },
              }}
            />
          </Stack>
        </Box>
        <TableContainer>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                {FLEET_TABLE_COLUMNS.map((col) => (
                  <TableCell
                    key={col.id}
                    onClick={() => col.sortable && handleTableSort(col.id)}
                    sx={{
                      bgcolor: isDark ? "#1e293b" : "#f8fafc",
                      color: isDark ? "#94a3b8" : "#64748b",
                      fontWeight: 600,
                      fontSize: "11px",
                      letterSpacing: ".04em",
                      borderBottom: `2px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                      py: 1.25,
                      px: 1.5,
                      whiteSpace: "nowrap",
                      cursor: col.sortable ? "pointer" : "default",
                      userSelect: "none",
                      "&:hover": col.sortable
                        ? { bgcolor: isDark ? "#263044" : "#f1f5f9" }
                        : {},
                    }}
                  >
                    <Stack direction="row" alignItems="center" spacing={0.4}>
                      <span>{col.label}</span>
                      {col.sortable && (
                        <Box component="span" sx={{ fontSize: "10px", opacity: orderBy === col.id ? 1 : 0.45, color: orderBy === col.id ? (isDark ? "#60a5fa" : "#3b82f6") : "inherit" }}>
                          {orderBy === col.id ? (order === "asc" ? "↑" : "↓") : <UnfoldMoreIcon sx={{ fontSize: 12, verticalAlign: "middle" }} />}
                        </Box>
                      )}
                    </Stack>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedTableRows
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
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
                  const statusColor = statusColorMap[row.status] || "#6b7280";
                  const driverScore = row.driver_score ?? 0;
                  const scoreColor = driverScore >= 80 ? "#22c55e" : driverScore >= 60 ? "#f59e0b" : "#ef4444";
                  const avatarBg = getAvatarColor(row.driver ?? "");
                  const initials = getDriverInitials(row.driver ?? "");
                  const rowBg = isDark
                    ? rowIdx % 2 === 0 ? "#0f172a" : "#111827"
                    : rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc";

                  let HealthIcon: React.ElementType = HealthAndSafetyOutlinedIcon;
                  if (hs.label === "Good") HealthIcon = ThumbUpOutlinedIcon;
                  else if (hs.label === "Average") HealthIcon = WarningAmberOutlinedIcon;
                  else if (hs.label === "Poor") HealthIcon = ErrorOutlineOutlinedIcon;

                  const getRoadTypeIcon = (rt: string) => {
                    const n = (rt ?? "").toLowerCase();
                    if (n.includes("highway") || n.includes("motorway")) return <SpeedOutlinedIcon sx={{ fontSize: 13, color: "text.secondary", flexShrink: 0 }} />;
                    if (n.includes("urban") || n.includes("city")) return <RouteIcon sx={{ fontSize: 13, color: "text.secondary", flexShrink: 0 }} />;
                    return <RouteIcon sx={{ fontSize: 13, color: "text.secondary", flexShrink: 0 }} />;
                  };

                  return (
                    <TableRow
                      hover
                      key={row.vehicle_id}
                      sx={{
                        bgcolor: rowBg,
                        borderBottom: `1px solid ${isDark ? "#1e293b" : "#e2e8f0"}`,
                        "&:hover": {
                          bgcolor: `${alpha("#3b82f6", isDark ? 0.1 : 0.05)} !important`,
                        },
                        transition: "background-color 0.15s",
                      }}
                    >
                      {/* Vehicle Name */}
                      <TableCell sx={{ py: 1, px: 1.5, height: 58, minWidth: 120, whiteSpace: "nowrap" }}>
                        <Box>
                          <Typography sx={{ fontSize: "12px", fontWeight: 700, color: isDark ? "#22d3ee" : "#0891b2", lineHeight: 1.25 }}>
                            {(row.name ?? row.vehicle_id).toUpperCase()}
                          </Typography>
                          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.3 }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: statusColor, flexShrink: 0 }} />
                            <Typography sx={{ fontSize: "9px", color: "text.secondary" }}>
                              {formatStatusLabel(row.status)}
                            </Typography>
                          </Stack>
                        </Box>
                      </TableCell>

                      {/* Type */}
                      <TableCell sx={{ py: 1, px: 1.5, height: 58, minWidth: 110, whiteSpace: "nowrap" }}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Box sx={{ width: 28, height: 26, borderRadius: 1.5, display: "grid", placeItems: "center", bgcolor: alpha("#64748b", isDark ? 0.2 : 0.1), border: `1px solid ${alpha("#64748b", 0.2)}`, flexShrink: 0, color: isDark ? "#94a3b8" : "#475569" }}>
                            {getVehicleTypeIcon(row.type)}
                          </Box>
                          <Typography sx={{ fontSize: "11px", fontWeight: 500, textTransform: "capitalize" }} noWrap>
                            {row.type || "Vehicle"}
                          </Typography>
                        </Stack>
                      </TableCell>

                      {/* Status */}
                      <TableCell sx={{ py: 1, px: 1.5, height: 58, minWidth: 100, whiteSpace: "nowrap" }}>
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.6, px: 1, py: 0.4, borderRadius: 5, bgcolor: alpha(statusColor, isDark ? 0.18 : 0.1), border: `1px solid ${alpha(statusColor, 0.25)}` }}>
                          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: statusColor, flexShrink: 0 }} />
                          <Typography sx={{ fontSize: "10px", fontWeight: 700, color: statusColor }}>
                            {formatStatusLabel(row.status)}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Speed */}
                      <TableCell sx={{ py: 1, px: 1.5, height: 58, minWidth: 72, whiteSpace: "nowrap" }}>
                        <SpeedGauge speed={Math.round(row.speed ?? 0)} isDark={isDark} />
                      </TableCell>

                      {/* Health Status */}
                      <TableCell sx={{ py: 1, px: 1.5, height: 58, minWidth: 120, whiteSpace: "nowrap" }}>
                        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.6, px: 1, py: 0.4, borderRadius: 2, bgcolor: alpha(hs.color, isDark ? 0.15 : 0.1), border: `1px solid ${alpha(hs.color, 0.25)}` }}>
                          <HealthIcon sx={{ fontSize: 12, color: hs.color, flexShrink: 0 }} />
                          <Typography sx={{ fontSize: "10px", fontWeight: 700, color: hs.color }}>{hs.label}</Typography>
                        </Box>
                      </TableCell>

                      {/* Health Score */}
                      <TableCell sx={{ py: 1, px: 1.5, height: 58, minWidth: 70, whiteSpace: "nowrap" }}>
                        <HealthRing score={Math.round(liveHealth)} isDark={isDark} />
                      </TableCell>

                      {/* Driver */}
                      <TableCell sx={{ py: 1, px: 1.5, height: 58, minWidth: 140, whiteSpace: "nowrap" }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Box sx={{ width: 30, height: 30, borderRadius: "50%", bgcolor: avatarBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Typography sx={{ fontSize: "10px", fontWeight: 700, color: "#fff", lineHeight: 1 }}>{initials}</Typography>
                          </Box>
                          <Typography sx={{ fontSize: "11px", fontWeight: 500, color: isDark ? "#e2e8f0" : "#1e293b" }} noWrap>
                            {row.driver || "Unassigned"}
                          </Typography>
                        </Stack>
                      </TableCell>

                      {/* Driver Score */}
                      <TableCell sx={{ py: 1, px: 1.5, height: 58, minWidth: 120, whiteSpace: "nowrap" }}>
                        <Box sx={{ width: 90 }}>
                          <Box sx={{ width: "100%", height: "5px", borderRadius: "999px", overflow: "hidden", bgcolor: isDark ? "#1e293b" : "#e2e8f0" }}>
                            <Box sx={{ width: `${driverScore}%`, height: "100%", borderRadius: "999px", bgcolor: scoreColor }} />
                          </Box>
                          <Typography sx={{ fontSize: "10px", fontWeight: 700, color: scoreColor, mt: 0.4 }}>
                            {driverScore}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* Road Type */}
                      <TableCell sx={{ py: 1, px: 1.5, height: 58, minWidth: 120, whiteSpace: "nowrap" }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          {getRoadTypeIcon(row.road_type ?? "")}
                          <Typography sx={{ fontSize: "10px", color: isDark ? "#cbd5e1" : "#475569" }} noWrap>
                            {(row.road_type ?? "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "—"}
                          </Typography>
                        </Stack>
                      </TableCell>

                      {/* Route */}
                      <TableCell sx={{ py: 1, px: 1.5, height: 58, whiteSpace: "nowrap", maxWidth: 220 }}>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <LocationOnIcon sx={{ fontSize: 13, color: "#3b82f6", flexShrink: 0 }} />
                          <Typography sx={{ fontSize: "10px", color: isDark ? "#cbd5e1" : "#475569" }} noWrap title={row.route_name ?? ""}>
                            {row.route_name || "—"}
                          </Typography>
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
          <Typography sx={{ fontSize: "12px", color: "text.secondary", fontWeight: 500 }}>
            Showing{" "}
            <Box component="span" sx={{ fontWeight: 700, color: isDark ? "#e2e8f0" : "#1e293b" }}>
              {Math.min(rowsPerPage, Math.max(0, sortedTableRows.length - page * rowsPerPage))}
            </Box>
            {" of "}
            <Box component="span" sx={{ fontWeight: 700, color: isDark ? "#e2e8f0" : "#1e293b" }}>
              {sortedTableRows.length}
            </Box>
            {" active vehicles"}
          </Typography>

          <Pagination
            count={Math.ceil(sortedTableRows.length / rowsPerPage)}
            page={page + 1}
            onChange={(_, value) => handleChangePage(null, value - 1)}
            shape="rounded"
            siblingCount={1}
            boundaryCount={1}
            sx={{
              "& .MuiPaginationItem-root": {
                fontSize: "12px",
                color: isDark ? "#94a3b8" : "#64748b",
                backgroundColor: isDark ? "#1e293b" : "transparent",
                border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}`,
                "&:hover": {
                  backgroundColor: isDark ? "#334155" : undefined,
                  color: isDark ? "#e2e8f0" : undefined,
                },
                "&.Mui-selected": {
                  backgroundColor: "#3b82f6",
                  color: "#fff",
                  borderColor: "#3b82f6",
                  "&:hover": { backgroundColor: "#2563eb" },
                },
                "&.MuiPaginationItem-ellipsis": {
                  backgroundColor: "transparent",
                  border: "none",
                },
              },
            }}
          />

          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
            <Typography sx={{ fontSize: "11px", color: "text.secondary", whiteSpace: "nowrap" }}>
              Rows per page
            </Typography>
            <Select
              size="small"
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
              sx={{
                fontSize: "11px",
                height: 28,
                "& .MuiOutlinedInput-notchedOutline": { borderColor: isDark ? "#334155" : "#e2e8f0" },
                "& .MuiSelect-select": { py: 0, px: 1, fontSize: "11px" },
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

      {/* <FleetTable vehicles={vehicles} /> */}
    </Box>
  );
}
