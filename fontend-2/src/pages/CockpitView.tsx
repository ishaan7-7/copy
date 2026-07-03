import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
} from "@mui/material";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";

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
import Draggable from "react-draggable";
import { useStore } from "../store";
import { useGoldStream } from "../contexts/GoldStreamContext";
const FLEET_API = "http://127.0.0.1:8009/api/fleet";
const PIPELINE_API = "http://127.0.0.1:8005";
const _eventIconCache: Record<string, L.DivIcon> = {};
const SCATTER_CAP = 300;
const VEHICLE_COLORS = [
  "#e57373", "#ffb74d", "#81c784", "#ba68c8", "#4dd0e1",
  "#42a5f5", "#ff8a65", "#90a4ae", "#f48fb1", "#aed581",
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
      px: 1,
      py: 0.7,
      borderRadius: 1,
      cursor: "pointer",
      transition: "all .2s",

      bgcolor: selected ? "action.selected" : "transparent",

      "&:hover": {
        bgcolor: "action.hover",
      },
    }}
  >
    <Stack direction="row" spacing={1} alignItems="center">
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: color,
        }}
      />

      <Typography fontSize={12}>{label}</Typography>
    </Stack>

    <Typography fontWeight={600} fontSize={12}>
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

function createVehicleIcon(
  status: string,
  health: number,
  heading: number
): L.DivIcon {
  let color = "#3b82f6";
  if (status === "active") {
    color = "#22c55e";
  } else if (status === "in_service") {
    color = "#f59e0b";
  } else if (health < 60) {
    color = "#ef4444";
  } else if (health < 80) {
    color = "#eab308";
  }

  const hdgBucket = status === "active" ? Math.round(heading / 15) * 15 : 0;
  const cacheKey = `${status}_${color}_${hdgBucket}`;
  if (_iconCache[cacheKey]) return _iconCache[cacheKey];

  const size = status === "active" ? 14 : 10;
  const arrow =
    status === "active"
      ? `<div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%) rotate(${hdgBucket}deg);font-size:9px;color:${color};">▲</div>`
      : "";

  const icon = L.divIcon({
    className: "",
    iconSize: [size + 6, size + 6],
    iconAnchor: [(size + 6) / 2, (size + 6) / 2],
    html: `<div style="position:relative;width:${size + 6}px;height:${size + 6}px;display:flex;align-items:center;justify-content:center;">${arrow}<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div></div>`,
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
    <Card
      onClick={onClick}
      sx={{
        p: 1,
        minHeight: 80,
        cursor: "pointer",
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
  );
}

function DistributionChart({ summary }: { summary: FleetSummary }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const option = {
    tooltip: {
      trigger: "item",

      textStyle: {
        fontSize: 11,
        whiteSpace: "nowrap",
      },
      radius: ["55%", "80%"],
      center: ["50%", "50%"],
      avoidLabelOverlap: false,
      // confine: true,

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
              color:#111827;
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
        axisLine: { lineStyle: { width: 10, color: [[1, "#333"]] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { show: false },
        title: {
          show: true,
          offsetCenter: [0, "65%"],
          fontSize: 10,
          color: "#999",
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
    tooltip: { trigger: "axis" as const, textStyle: { fontSize: 10 } },
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
  const pts = data.traction_circle;
  const option = {
    grid: { top: 10, right: 10, bottom: 30, left: 40 },
    tooltip: {
      trigger: "item" as const,
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
  const roads = Object.entries(data.speed_by_road);
  if (roads.length === 0)
    return (
      <Typography variant="caption" color="text.secondary">
        Insufficient data
      </Typography>
    );

  const option = {
    grid: { top: 10, right: 10, bottom: 30, left: 60 },
    tooltip: { trigger: "item" as const, textStyle: { fontSize: 10 } },
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
    ["SIM_004 Engine Temperature High", "2 min ago", "critical"],
    ["SIM_008 Tire Pressure Low", "5 min ago", "warning"],
    ["SIM_009 Back Online", "8 min ago", "active"],
    ["SIM_005 Battery below 50%", "12 min ago", "critical"],
  ] as const;
  return (
    <Card sx={{ p: 1, height: "100%" }}>
      <SectionTitle
        title="Recent Alerts *"
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
                py: 0.3,
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
                  sx={{ fontSize: "10px", color: meta.color }}
                />
                <Typography
                  sx={{ fontSize: "10px", lineHeight: "12px", fontWeight: 700 }}
                  noWrap
                >
                  {label}
                </Typography>
              </Stack>
              <Typography
                sx={{ fontSize: "10px", color: "text.secondary", ml: 1 }}
                noWrap
              >
                {time}
              </Typography>
            </Stack>
          );
        })}
      </Stack>
      <Typography sx={{ fontSize: "8px", color: "text.secondary", mt: 1 }}>
        8 Unread Alerts
      </Typography>
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
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:2px;background:${c};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
        <span style="color:white;font-size:11px;font-weight:700;font-family:Inter, Segoe UI, Roboto, Arial, sans-serif;">${label}</span>
      </div>`,
  });
  return _eventIconCache[type];
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
        progress: { show: true, width: 10, roundCap: true, color },
        itemStyle: { color },
        axisLine: { lineStyle: { width: 10, color: [[1, isDark ? "#374151" : "#E5E7EB"]] } },
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

export default function CockpitView({ isActive = true }: { isActive?: boolean }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [vehiclePopoverAnchor, setVehiclePopoverAnchor] = useState(null);

  const [popoverPosition, setPopoverPosition] = useState(null);

  const [drawerTab, setDrawerTab] = useState(0);
  const [openFleetScatter, setOpenFleetScatter] = useState(false);
  const [openVehicleHealth, setOpenVehicleHealth] = useState(false);
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

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
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
  };

  const handleCloseVehicle = () => {
    setVehiclePopoverAnchor(null);
    setSelectedVehicle(null);
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
    { id: "vehicle_id", label: "Vehicle", width: 90 },
    { id: "name", label: "Name", width: 90 },
    { id: "type", label: "Type", width: 70 },
    { id: "status", label: "Status", width: 85 },
    { id: "speed", label: "Speed", width: 75 },
    { id: "heading", label: "Health Status", width: 75 },
    { id: "health", label: "Health Score", width: 90 },
    { id: "driver", label: "Driver", width: 110 },
    { id: "driver_score", label: "Driver Score", width: 120 },
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

  const getVehicleHealth = (vehicleId: string, fallback: number): number => {
    return pipelineHealthMap[vehicleId]?.health_score ?? fallback;
  };

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
    staleTime: 60000,
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

  const tileUrl = isDark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
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
      <Card sx={{ p: 1, height: "100%" }}>
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
            {/* Center */}
            <Typography
              sx={{
                flex: 1,
                textAlign: "center",
                fontSize: "11px",
                color: "text.secondary",
                fontStyle: "italic",
                whiteSpace: "nowrap",
                mr: 3,
              }}
            >
              <Box
                component="span"
                sx={{
                  color: "#FF9800",
                  fontWeight: 700,
                }}
              >
                *
              </Box>{" "}
              Wherever <b>*</b> appears, the displayed values represent mock
              data.
            </Typography>

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
            value={summary.total}
            delta="Registered Vehicles"
            icon={<LocalShippingOutlinedIcon />}
            color="#3b82f6"
            iconLogo={false}
            trend="down"
            selected={fleetFilter === "ALL"}
            onClick={() => setFleetFilter("ALL")}
          />
          <KpiCard
            label="Active Vehicles"
            value={summary.active}
            delta="3 vs yesterday"
            icon={<HealthAndSafetyOutlinedIcon />}
            color="#22c55e"
            iconLogo={false}
            trend="down"
            selected={fleetFilter === "ACTIVE"}
            onClick={() =>
              setFleetFilter((prev) => (prev === "ACTIVE" ? "ALL" : "ACTIVE"))
            }
          />
          <KpiCard
            label="Parked"
            value={summary.parked}
            delta="Today"
            icon={<TimelineOutlinedIcon />}
            color="#0ea5e9"
            iconLogo={false}
            trend="down"
            selected={fleetFilter === "PARKED"}
            onClick={() =>
              setFleetFilter((prev) => (prev === "PARKED" ? "ALL" : "PARKED"))
            }
          />
          <KpiCard
            label="Due for Service"
            value={summary.in_service}
            delta="Within 48 Hours"
            icon={<SettingsOutlinedIcon />}
            color="#8b5cf6"
            iconLogo={false}
            trend="up"
            selected={fleetFilter === "SERVICE"}
            onClick={() =>
              setFleetFilter((prev) => (prev === "SERVICE" ? "ALL" : "SERVICE"))
            }
          />
          <KpiCard
            label="Critical Vehicles"
            value={criticalCount}
            delta="1 vs yesterday"
            icon={<ShieldOutlinedIcon />}
            color="#ef4444"
            trend="up"
            iconLogo={true}
            selected={fleetFilter === "CRITICAL"}
            onClick={() =>
              setFleetFilter((prev) =>
                prev === "CRITICAL" ? "ALL" : "CRITICAL"
              )
            }
          />
          <KpiCard
            label="Warning Vehicles"
            value={warningCount}
            delta="2 vs yesterday"
            icon={<WarningAmberOutlinedIcon />}
            color="#f59e0b"
            trend="down"
            iconLogo={true}
            selected={fleetFilter === "WARNING"}
            onClick={() =>
              setFleetFilter((prev) => (prev === "WARNING" ? "ALL" : "WARNING"))
            }
          />

          <KpiCard
            label="Avg. Battery SOC"
            value={`${avgBattery}%`}
            delta="Down by 4%"
            icon={<ElectricBoltOutlinedIcon />}
            color="#14b8a6"
            trend="up"
            iconLogo={false}
          />

          <KpiCard
            label="Alerts (Last 1 Hr)"
            value="12 *"
            delta="4 vs yesterday"
            icon={<ErrorOutlineOutlinedIcon />}
            color="#ef4444"
            trend="up"
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
                      //   p: 1,
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

                      {positions?.filter((v) => Number.isFinite(v.lat) && Number.isFinite(v.lng)).map((v) => {
                        const liveH =
                          v.status === "active"
                            ? getVehicleHealth(v.vehicle_id, v.health)
                            : v.health;
                        return (
                          <Marker
                            key={v.vehicle_id}
                            position={[v.lat, v.lng]}
                            icon={createVehicleIcon(v.status, liveH, v.heading)}
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

                      {selectedVehicle &&
                        tripData?.events.map((evt, i) => (
                          <Marker
                            key={`evt-${i}`}
                            position={[evt.lat, evt.lng]}
                            icon={createEventIcon(evt.type)}
                          >
                            <Popup>
                              <strong>{evt.type.toUpperCase()}</strong>
                              <br />
                              G-force: X={evt.acc_x.toFixed(2)}, Y=
                              {evt.acc_y.toFixed(2)}
                              <br />
                              Speed: {evt.speed} km/h
                            </Popup>
                          </Marker>
                        ))}
                    </MapContainer>
                    {/* Fleet Legend */}
                    <Paper
                      elevation={3}
                      sx={{
                        position: "absolute",
                        bottom: 16,
                        left: 16,
                        zIndex: 1000,
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        bgcolor: "background.paper",
                        border: `1px solid ${theme.palette.divider}`,
                        minWidth: 180,
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
                          sx={{
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          Fleet Status
                        </Typography>

                        <Tooltip title="Reset Filters">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setStatusFilterMap("all");
                              setVehicleType("all");
                              setSelectedPlant("all");
                              setStatusFilter("all");
                            }}
                            sx={{
                              width: 24,
                              height: 24,
                              color:
                                statusFilter === "all"
                                  ? "text.disabled"
                                  : "primary.main",

                              "&:hover": {
                                bgcolor: "action.hover",
                              },
                            }}
                          >
                            <RestartAltOutlinedIcon sx={{ fontSize: 16 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>

                      <Stack spacing={0.8}>
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
                    gridTemplateColumns: "repeat(2, minmax(0,1fr))",
                    gridAutoRows: "168px",
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
                            bgcolor: `${healthStatus.color}20`,
                            border: `1px solid ${healthStatus.color}40`,
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: healthStatus.color,
                              lineHeight: 1,
                              m: 0,
                            }}
                          >
                            {healthStatus.label}
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
                        <HealthGauge value={liveAvgHealth} color={healthStatus.color} />
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
                          background:
                            "linear-gradient(135deg,#FFF8D6 0%,#FFE082 100%)",
                          border: "1px solid #FBC02D",
                        }}
                      >
                        <Box>
                          <Typography
                            sx={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: "#8A6D00",
                              lineHeight: 1,
                              letterSpacing: 0.3,
                              textTransform: "uppercase",
                            }}
                          >
                            Active Vehicles
                          </Typography>

                          <Typography
                            sx={{
                              mt: 0.2,
                              fontSize: 16,
                              fontWeight: 800,
                              color: "#7A5600",
                              lineHeight: 1,
                            }}
                          >
                            {summary?.active ?? 0}
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
                    }}
                  >
                    <RecentAlerts />
                  </Card>

                  {/* Card 4 */}
                  <Card
                    sx={{
                      height: "100%",
                      p: 0,
                      display: "flex",
                    }}
                  >
                    <Card sx={{ p: 1 }}>
                      <SectionTitle title="Operational Metrics (Today) *" />
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "repeat(2, 1fr)",
                            md: "repeat(3, 1fr)",
                            xl: "repeat(6, 1fr)",
                          },
                          gap: 0.4,
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
                              p: 0.5,
                              textAlign: "center",
                              borderRadius: 1,
                              border: (t) => `1px solid ${t.palette.divider}`,
                              bgcolor: alpha(String(color), 0.05),
                            }}
                          >
                            <Typography
                              sx={{ fontSize: "10px", fontWeight: 900 }}
                            >
                              {value}
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "8px",
                                color: "text.secondary",
                                mt: 0.3,
                                // lineHeight: "10px",
                              }}
                            >
                              {label}
                            </Typography>
                            <Typography
                              sx={{
                                fontSize: "10px",
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
              slotProps={{
                paper: {
                  sx: {
                    width: "36%",
                    maxWidth: "36%",

                    minHeight: 380,
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
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  px: 1,
                  pt: 0.5,
                  alignItems: "center",
                  borderBottom: "1px solid lightgrey",
                }}
              >
                <Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 700,
                      fontSize: "14px !important",
                      // color: "text.secondary",
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
                                vehicleDetail.status === "in_service"
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
                                bgcolor: "#EEF9FD", // overall light background

                                borderBottom: `1px solid #CDECF5`,

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

                                  color: "#4A6B77",

                                  bgcolor: "#EAF7FB", // lighter shade for inactive tabs

                                  transition: "all .2s ease",

                                  textTransform: "none",
                                },

                                "& .MuiTab-root:not(:last-child)": {
                                  borderRight: "1px solid #D6EEF6",
                                },

                                "& .Mui-selected": {
                                  bgcolor: "#DCF3FA",
                                  color: "#005071",
                                },

                                "& .MuiTabs-indicator": {
                                  height: 3,
                                  backgroundColor: "#8FCFE3",
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

                                          bgcolor: "#DCEEFF",

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
                                          color: "#005071",
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
                                                  background: "#DCEEFF",
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
                                                    #DCEEFF ${angle}deg
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
                                                  bgcolor: "#fff",
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
                                                    color: "#005071",
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

                                            border: "1px solid #2563EB",

                                            bgcolor: "#EEF5FF",

                                            borderRadius: "50px",
                                          }}
                                        >
                                          <Typography
                                            sx={{
                                              fontSize: "8px",

                                              fontWeight: 700,

                                              color: "#005071",

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

                                            border: "1px solid #2563EB",

                                            borderRadius: "50px",

                                            bgcolor: "#EEF5FF",
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

                                              color: "#005071",
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
                                              borderBottom: "1px solid #eee",
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

                                                  color: "#005071",

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
      <Grid container spacing={1} my={1}>
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

                const series = fleetHealthScatter.map((vehicle, idx) => ({
                  name: vehicle.vehicle_id,
                  type: "scatter",
                  large: true,
                  largeThreshold: 100,
                  symbol: "circle",
                  z: 1,
                  zlevel: 1,
                  data: vehicle.data.map((r) => [
                    r.ts || r.timestamp,
                    r.health ?? 0,
                  ]),
                  symbolSize: (val) => Math.max(8, (val[1] / 100) * 14),
                  itemStyle: {
                    color: VEHICLE_COLORS[idx % VEHICLE_COLORS.length],
                    opacity: 0.72,
                    borderWidth: 1,
                    borderColor: "#fff",
                  },
                  emphasis: {
                    scale: 1.15,
                  },
                }));

                fleetScatterOption = {
                  animation: false,

                  tooltip: {
                    trigger: "item",

                    textStyle: {
                      fontSize: 10,
                    },

                    formatter: (p) => `
            <b>${p.seriesName}</b>
            <br/>
            ${p.data[0]}
            <br/>
            Health: ${p.data[1]}%
          `,
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
                    {
                      type: "inside",
                    },

                    {
                      type: "slider",

                      height: 22,

                      bottom: 10,

                      moveHandleSize: 8,

                      handleSize: "90%",
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

                        data: [
                          {
                            yAxis: 60,

                            label: {
                              formatter: "CRITICAL",

                              color: "#d32f2f",

                              position: "insideStartBottom",

                              offset: [12, 10],

                              fontSize: "10px",
                            },

                            position: "insideStartBottom",

                            lineStyle: {
                              color: "#d32f2f",

                              width: 5,

                              type: "dotted",
                            },
                          },

                          {
                            yAxis: 80,

                            label: {
                              formatter: "WARNING",

                              color: "#ed6c02",

                              position: "insideStartBottom",

                              offset: [12, 10],

                              fontSize: "10px",
                            },

                            position: "insideStartBottom",

                            lineStyle: {
                              color: "#ed6c02",

                              width: 7,

                              type: "dotted",
                            },
                          },
                        ],
                      },
                    },
                  ],
                };
              }

              return (
                <>
                  <Paper
                    sx={{
                      p: 1,
                      height: 370,
                      display: "flex",
                      flexDirection: "column",
                      backgroundColor: "transparent",
                    }}
                  >
                    {/* HEADER */}
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 1,
                      }}
                    >
                      <SectionTitle title="Fleet Health Scatter — All Vehicles Over Time (GOLD)" />
                      <Tooltip title="Expand">
                        <IconButton
                          size="small"
                          onClick={() => setOpenFleetScatter(true)}
                        >
                          <AspectRatioOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>

                    {/* LEGEND */}
                    <Box
                      sx={{
                        display: "flex",
                        gap: 1,
                        flexWrap: "wrap",
                        justifyContent: "center",
                        mb: 1,
                      }}
                    >
                      {fleetHealthScatter?.map((v, i) => (
                        <Box
                          key={v.vehicle_id}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                          }}
                        >
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",

                              bgcolor: VEHICLE_COLORS[i % 10],
                            }}
                          />

                          <Typography
                            sx={{
                              fontSize: 10,
                            }}
                          >
                            {v.vehicle_id}
                          </Typography>
                        </Box>
                      ))}
                    </Box>

                    {/* GRAPH */}
                    <Box
                      sx={{
                        flex: 1,
                        minHeight: 0,
                      }}
                    >
                      {hasData ? (
                        <ReactECharts
                          option={fleetScatterOption}
                          style={{
                            width: "100%",
                            height: "100%",
                          }}
                        />
                      ) : (
                        <Box
                          sx={{
                            height: "100%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Typography variant="caption">
                            Waiting for pipeline backend
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Paper>

                  {/* EXPANDED MODAL */}
                  <Dialog
                    open={openFleetScatter}
                    onClose={() => setOpenFleetScatter(false)}
                    fullWidth
                    maxWidth="xl"
                  >
                    <Box
                      sx={{
                        p: 1.5,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderBottom: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Typography fontWeight={700}>
                        Fleet Health Scatter — Expanded View
                      </Typography>

                      <IconButton onClick={() => setOpenFleetScatter(false)}>
                        <CloseIcon />
                      </IconButton>
                    </Box>

                    <DialogContent
                      sx={{
                        height: "85vh",
                      }}
                    >
                      {hasData && (
                        <ReactECharts
                          option={fleetScatterOption}
                          style={{
                            width: "100%",
                            height: "100%",
                          }}
                        />
                      )}
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
                  backgroundColor: isDark ? "#1a2535" : "#fff",
                  borderColor: isDark ? "#2a3a4a" : "#e0e0e0",
                  borderWidth: 1,
                  textStyle: {
                    fontSize: 10,
                    color: isDark ? "#e8ecf0" : "#212121",
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

                  axisTick: {
                    alignWithLabel: true,
                    show: true,
                    interval: 0,
                  },

                  splitLine: {
                    show: true,

                    interval: 0,

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

                    lineStyle: {
                      color: "#1976d2",
                      width: 2,
                    },

                    itemStyle: {
                      color: "#1976d2",
                    },

                    areaStyle: {
                      color: {
                        type: "linear",

                        x: 0,

                        y: 0,

                        x2: 0,

                        y2: 1,

                        colorStops: [
                          {
                            offset: 0,
                            color: "rgba(25,118,210,0.15)",
                          },
                          {
                            offset: 1,
                            color: "rgba(25,118,210,0.02)",
                          },
                        ],
                      },
                    },

                    markLine: {
                      silent: true,

                      symbol: ["none", "none"],

                      data: [
                        {
                          yAxis: 60,

                          label: {
                            formatter: "CRITICAL",

                            color: "#d32f2f",

                            position: "insideStartBottom",

                            offset: [2, 10],

                            fontSize: "10px",
                          },

                          position: "insideStartBottom",

                          lineStyle: {
                            color: "#d32f2f",

                            width: 5,

                            type: "dotted",
                          },
                        },

                        {
                          yAxis: 80,

                          label: {
                            formatter: "WARNING",

                            color: "#ed6c02",

                            position: "insideStartBottom",

                            offset: [2, 10],

                            fontSize: "10px",
                          },

                          position: "insideStartBottom",

                          lineStyle: {
                            color: "#ed6c02",

                            width: 7,

                            type: "dotted",
                          },
                        },
                      ],
                    },

                    markArea: {
                      silent: true,

                      data: [
                        [
                          {
                            yAxis: 0,

                            itemStyle: {
                              color: "rgba(211,47,47,.04)",
                            },
                          },

                          {
                            yAxis: 60,
                          },
                        ],

                        [
                          {
                            yAxis: 60,

                            itemStyle: {
                              color: "rgba(237,108,2,.03)",
                            },
                          },

                          {
                            yAxis: 80,
                          },
                        ],
                      ],
                    },
                  },
                ],
              };

              return (
                <>
                  <Paper
                    sx={{
                      p: 1,
                      height: 370,
                      display: "flex",
                      flexDirection: "column",
                      backgroundColor: "transparent",
                    }}
                  >
                    {/* HEADER */}

                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        mb: 2.5,
                        flexWrap: "wrap",
                        gap: 0.8,
                      }}
                    >
                      <SectionTitle title="Vehicle Health Timeline (GOLD)" />
                      <Box
                        sx={{ display: "flex", gap: 1.5, alignItems: "center" }}
                      >
                        <FormControl
                          size="small"
                          sx={{
                            minWidth: 140,

                            "& .MuiInputLabel-root": {
                              fontSize: "10px",
                            },

                            "& .MuiSelect-select": {
                              fontSize: "10px",
                            },
                          }}
                        >
                          <InputLabel sx={{ fontSize: "0.8rem" }}>
                            Vehicle
                          </InputLabel>
                          <Select
                            value={healthTimelineVehicle}
                            onChange={(e) =>
                              setHealthTimelineVehicle(e.target.value)
                            }
                            label="Vehicle"
                            sx={{
                              borderRadius: 0,
                              height: 32,
                              fontSize: "10px",
                              fontWeight: 700,
                            }}
                          >
                            {(pipelineFleet?.vehicles || []).map((v) => (
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
                          value={timelineXAxis}
                          exclusive
                          onChange={(_, v) => v && setTimelineXAxis(v)}
                          size="small"
                          sx={{ bgcolor: "background.paper" }}
                        >
                          <ToggleButton
                            value="mileage"
                            sx={{
                              fontWeight: 700,
                              px: 1.5,
                              borderRadius: 0,
                              fontSize: "10px",
                              minHeight: 32,
                            }}
                          >
                            MILEAGE
                          </ToggleButton>
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
                        </ToggleButtonGroup>
                      </Box>

                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                        }}
                      >
                        {/* KEEP YOUR SELECT */}

                        {/* KEEP YOUR TOGGLE */}

                        <Tooltip title="Expand">
                          <IconButton
                            size="small"
                            onClick={() => setOpenVehicleHealth(true)}
                          >
                            <AspectRatioOutlinedIcon fontSize="small" />
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
                        <ReactECharts
                          style={{
                            height: "100%",
                            width: "100%",
                          }}
                          option={chartOption}
                        />
                      ) : (
                        <Box
                          sx={{
                            height: "100%",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Typography variant="caption">
                            No Gold health history
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Paper>

                  {/* EXPAND DIALOG */}

                  <Dialog
                    open={openVehicleHealth}
                    onClose={() => setOpenVehicleHealth(false)}
                    fullWidth
                    maxWidth="xl"
                  >
                    <DialogTitle
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      VEHICLE HEALTH TIMELINE (GOLD)
                      <IconButton onClick={() => setOpenVehicleHealth(false)}>
                        <CloseIcon />
                      </IconButton>
                    </DialogTitle>

                    <DialogContent
                      sx={{
                        height: "85vh",
                      }}
                    >
                      <ReactECharts
                        style={{
                          width: "100%",
                          height: "100%",
                        }}
                        option={chartOption}
                      />
                    </DialogContent>
                  </Dialog>
                </>
              );
            })()}
          </Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 1 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 1,
            backgroundColor: "transparent",
          }}
        >
          <SectionTitle title="Fleet Table" />

          <Typography
            sx={{
              fontSize: "10px",
              fontWeight: 700,
              color: "text.secondary",
            }}
          >
            {positions?.length ?? 0} Vehicles
          </Typography>
        </Box>
        <Paper sx={{ width: "100%" }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      align={column.align}
                      sx={{
                        width: column.width,
                        minWidth: column.width,
                        maxWidth: column.width,
                        py: 0.5,
                        px: 1,
                        fontSize: "10px",
                        fontWeight: 700,
                        bgcolor: "primary.main",
                        color: "#fff",
                        whiteSpace: "nowrap",
                        height: 36,
                        // width: "fit-content",
                      }}
                    >
                      {column.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {positions
                  ?.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((row) => {
                    const health = getHealthChip(row.health);

                    return (
                      <TableRow
                        hover
                        key={row.vehicle_id}
                        sx={{
                          "&:nth-of-type(odd)": {
                            bgcolor: "action.hover",
                          },
                        }}
                      >
                        <TableCell
                          sx={{
                            width: 90,
                            minWidth: 90,
                            maxWidth: 90,
                            py: 0.4,
                            px: 1,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.vehicle_id}
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 90,
                            minWidth: 90,
                            maxWidth: 90,
                            py: 0.4,
                            px: 1,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                            width: 10,
                          }}
                        >
                          {row.name}
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 90,
                            minWidth: 90,
                            maxWidth: 90,
                            py: 0.4,
                            px: 1,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.type}
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 90,
                            minWidth: 90,
                            maxWidth: 90,
                            py: 0.4,
                            px: 1,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Chip
                            size="small"
                            label={row.status
                              .replace(/_/g, " ")
                              .replace(/\b\w/g, (c) => c.toUpperCase())}
                            color={getStatusColor(row.status)}
                            sx={{
                              height: 20,
                              fontSize: "10px",
                              fontWeight: 500,
                              "& .MuiChip-label": {
                                px: 1,
                                fontSize: "10px",
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell
                          sx={{
                            width: 90,
                            minWidth: 90,
                            maxWidth: 90,
                            py: 0.4,
                            px: 1,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.speed} km/h
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 90,
                            minWidth: 90,
                            maxWidth: 90,
                            py: 0.4,
                            px: 1,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {(() => {
                            const healthStatus = getHealthStatus(row.health);

                            return (
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.6,
                                }}
                              >
                                <Box
                                  sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    bgcolor: healthStatus.color,
                                    flexShrink: 0,
                                  }}
                                />

                                <Typography
                                  sx={{
                                    fontSize: "10px",
                                    fontWeight: 500,
                                    color: healthStatus.color,
                                  }}
                                >
                                  {healthStatus.label}
                                </Typography>
                              </Box>
                            );
                          })()}
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 90,
                            minWidth: 90,
                            maxWidth: 90,
                            py: 0.4,
                            px: 0,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Chip
                            size="small"
                            label={`${row.health}%`}
                            sx={{
                              bgcolor: health.bg,
                              color: health.color,
                              fontWeight: 700,
                              minWidth: 85,
                              fontSize: "10px",
                            }}
                          />
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 90,
                            minWidth: 90,
                            maxWidth: 90,
                            py: 0.4,
                            px: 1,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.driver}
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 90,
                            minWidth: 90,
                            maxWidth: 90,
                            py: 0.4,
                            px: 1,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <LinearProgress
                              variant="determinate"
                              value={row.driver_score}
                              sx={{
                                flex: 1,
                                height: 8,
                                borderRadius: 5,
                              }}
                            />

                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: 700,
                              }}
                            >
                              {row.driver_score}
                            </Typography>
                          </Box>
                        </TableCell>

                        <TableCell
                          sx={{
                            width: 90,
                            minWidth: 90,
                            maxWidth: 90,
                            py: 0.4,
                            px: 1,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.road_type
                            ?.replace(/_/g, " ")
                            .replace(/\b\w/g, (char) => char.toUpperCase())}
                        </TableCell>

                        <TableCell
                          sx={{
                            py: 0.4,
                            px: 1,
                            fontSize: "10px",
                            height: 34,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {row.route_name}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[10, 20, 50]}
            component="div"
            count={positions?.length ?? 0}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
          />
        </Paper>
      </Paper>

      {/* <FleetTable vehicles={vehicles} /> */}
    </Box>
  );
}
