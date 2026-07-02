import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGoldStream } from "../contexts/GoldStreamContext";
import axios from "axios";
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
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import CloseIcon from "@mui/icons-material/Close";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import FavoriteIcon from "@mui/icons-material/Favorite";
import DonutSmallIcon from "@mui/icons-material/DonutSmall";
import DirectionsCarFilledIcon from "@mui/icons-material/DirectionsCarFilled";
import RouteIcon from "@mui/icons-material/Route";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import AspectRatioOutlinedIcon from "@mui/icons-material/AspectRatioOutlined";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ExploreIcon from "@mui/icons-material/Explore";
import Draggable from "react-draggable";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ReactECharts from "echarts-for-react";
import { useStore } from "../store";

const FLEET_API = "http://127.0.0.1:8009/api/fleet";
const PIPELINE_API = "http://127.0.0.1:8005";

interface FleetSummary {
  total: number;
  active: number;
  in_service: number;
  parked: number;
  avg_health: number;
  severity_counts: { normal: number; warning: number; critical: number };
  avg_driver_score: number;
}

interface PipelineVehicle {
  vehicle_id: string;
  health_score: number;
  data_source: string;
  engine_contrib: number;
  transmission_contrib: number;
  battery_contrib: number;
  body_contrib: number;
  tyre_contrib: number;
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
  ts: string;
  timestamp: string;
  health: number;
  mileage: number;
}

interface HealthHistoryResponse {
  data: HealthHistoryRow[];
  data_source: string;
  vehicle_id: string;
  count: number;
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

const DRAWER_W = 420;

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
    html: `<div style="position:relative;width:${size + 6}px;height:${
      size + 6
    }px;display:flex;align-items:center;justify-content:center;">
      ${arrow}
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>
    </div>`,
  });

  _iconCache[cacheKey] = icon;
  return icon;
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
  const c = EVENT_COLORS[type] || "#888";
  const label = EVENT_LABELS[type] || "?";
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:2px;background:${c};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
      <span style="color:white;font-size:11px;font-weight:700;font-family:Roboto,sans-serif;">${label}</span>
    </div>`,
  });
}

function MapController({
  selectedVehicle,
  tripData,
}: {
  selectedVehicle: string | null;
  tripData: TripData | null;
}) {
  const map = useMap();
  const lastFittedVehicle = useRef<string | null>(null);

  useEffect(() => {
    if (
      selectedVehicle &&
      tripData?.route?.length > 0 &&
      lastFittedVehicle.current !== selectedVehicle
    ) {
      lastFittedVehicle.current = selectedVehicle;

      const bounds = L.latLngBounds(tripData.route.map((p) => [p.lat, p.lng]));

      map.fitBounds(bounds, {
        paddingTopLeft: [40, 40],
        paddingBottomRight: [40, 40],
        maxZoom: 7,
        animate: true,
        duration: 1.2,
      });
    }

    if (!selectedVehicle) {
      lastFittedVehicle.current = null;

      map.flyTo(
        [22.9937, 78.9629], // India center
        4,
        {
          duration: 0.8,
        }
      );
    }
  }, [selectedVehicle, tripData, map]);

  return null;
}

//   useEffect(() => {
//     if (
//       selectedVehicle &&
//       tripData &&
//       tripData.route.length > 0 &&
//       lastFittedVehicle.current !== selectedVehicle
//     ) {
//       lastFittedVehicle.current = selectedVehicle;
//       const bounds = L.latLngBounds(tripData.route.map((p) => [p.lat, p.lng]));
//       map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 7, duration: 1.2 });
//     }
//     if (!selectedVehicle) {
//       lastFittedVehicle.current = null;
//       map.flyTo([39.8, -98.5], 4, { duration: 0.8 });
//     }
//   }, [selectedVehicle, tripData, map]);
//   return null;
// }

const CHART_FONT = `"Inter", "Roboto", "Helvetica", sans-serif`;

const commonGrid = {
  top: 24,
  left: 52,
  right: 20,
  bottom: 72,
  containLabel: true,
};

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1,
        minWidth: "fit-content",
        borderRadius: 3,
        bgcolor: alpha(color, 0.08), // entire card background
        border: `1px solid ${alpha(color, 0.15)}`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 0.7,
        transition: "0.2s ease",

        // "&:hover": {
        //   transform: "translateY(-2px)",
        //   boxShadow: 3,
        //   bgcolor: alpha(color, 0.12),
        // },
      }}
    >
      {/* Top Row → Icon + Title */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            color: color,
          }}
        >
          {icon}
        </Box>

        <Typography
          sx={{
            fontSize: "11px",
            fontWeight: 700,
            color: alpha(color, 0.9),
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {title}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          color: color,
        }}
      >
        <Typography
          sx={{
            fontSize: "16px",
            fontWeight: 800,
            color: "text.primary",
            lineHeight: 1, // important
            display: "flex",
            alignItems: "center",
          }}
        >
          {value}
        </Typography>

        {subtitle && (
          <Typography
            sx={{
              fontSize: "10px",
              color: "text.secondary",
              lineHeight: 1, // important
              display: "flex",
              alignItems: "center",
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
    </Paper>
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
              (summary.severity_counts.warning +
                summary.severity_counts.critical -
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
            value: summary.severity_counts.warning,
            name: "Warning",
            itemStyle: { color: "#eab308" },
          },
          {
            value: summary.severity_counts.critical,
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
              (summary.severity_counts.warning +
                summary.severity_counts.critical -
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
            count: summary.severity_counts.warning,
            color: "#eab308",
          },
          {
            label: "Critical",
            count: summary.severity_counts.critical,
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

export default function FleetCenter({ isActive = true }: { isActive?: boolean }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  const autoRefresh = useStore((s) => s.autoRefresh);
  const queryClient = useQueryClient();
  const { vehicles: sseVehicles, connected: sseConnected, ringBuffer } = useGoldStream();
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState(0);
  const [openFleetScatter, setOpenFleetScatter] = useState(false);
  const [openVehicleHealth, setOpenVehicleHealth] = useState(false);

  const [vehiclePopoverAnchor, setVehiclePopoverAnchor] = useState(null);

  const [popoverPosition, setPopoverPosition] = useState(null);

  // const handleCloseVehicle = () => {
  //   setSelectedVehicle(null);
  //   setPopoverPosition(null);
  // };

  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const handleDragStart = (e) => {
    dragging.current = true;

    start.current = {
      x: e.clientX - dragPos.x,
      y: e.clientY - dragPos.y,
    };

    document.body.style.cursor = "grabbing";
  };

  const handleDragMove = (e) => {
    if (!dragging.current) return;

    setDragPos({
      x: e.clientX - start.current.x,
      y: e.clientY - start.current.y,
    });
  };

  const handleDragEnd = () => {
    dragging.current = false;
    document.body.style.cursor = "";
  };

  useEffect(() => {
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);

    return () => {
      window.removeEventListener("mousemove", handleDragMove);
      window.removeEventListener("mouseup", handleDragEnd);
    };
  }, [dragPos]);

  const handleOpenVehicle = (event, vehicle) => {
    setVehiclePopoverAnchor(event.currentTarget);
    if (vehicle !== selectedVehicle) setDrawerTab(0);
    setSelectedVehicle(vehicle);
  };

  const handleCloseVehicle = () => {
    setVehiclePopoverAnchor(null);
    setSelectedVehicle(null);
  };

  const popoverOpen = Boolean(vehiclePopoverAnchor);

  const { data: summary } = useQuery<FleetSummary>({
    queryKey: ["fleet-summary"],
    queryFn: () => axios.get(`${FLEET_API}/summary`).then((r) => r.data),
    refetchInterval: isActive && autoRefresh ? 10000 : false,
  });

  const { data: positions } = useQuery<VehiclePosition[]>({
    queryKey: ["fleet-positions"],
    queryFn: () => axios.get(`${FLEET_API}/positions`).then((r) => r.data),
    refetchInterval: isActive && autoRefresh ? 8000 : false,
  });

  const activeIds = useMemo(
    () =>
      (positions || [])
        .filter((v) => v.status === "active")
        .map((v) => v.vehicle_id),
    [positions]
  );

  const selectedIsActive = useMemo(() => {
    if (!selectedVehicle || !positions) return false;
    const v = positions.find((p) => p.vehicle_id === selectedVehicle);
    return v?.status === "active";
  }, [selectedVehicle, positions]);

  useQuery({
    queryKey: ['fleet-all'],
    queryFn: async () => {
      const r = await axios.get(`${FLEET_API}/all`);
      const batch = r.data.vehicles as Record<string, { detail: any; trip: any; behavior: any }>;
      for (const [vid, d] of Object.entries(batch)) {
        if (d.detail) queryClient.setQueryData(['fleet-vehicle', vid], d.detail);
        if (d.trip) queryClient.setQueryData(['fleet-trip', vid], d.trip);
        if (d.behavior) queryClient.setQueryData(['fleet-behavior', vid], d.behavior);
      }
      return batch;
    },
    staleTime: 60000,
    refetchInterval: isActive && autoRefresh ? 20000 : false,
  });

  const { data: vehicleDetail } = useQuery<VehicleDetail>({
    queryKey: ["fleet-vehicle", selectedVehicle],
    queryFn: () =>
      axios.get(`${FLEET_API}/vehicle/${selectedVehicle}`).then((r) => r.data),
    enabled: !!selectedVehicle,
    staleTime: 30000,
    placeholderData: undefined,
  });

  const { data: tripData } = useQuery<TripData>({
    queryKey: ["fleet-trip", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${FLEET_API}/vehicle/${selectedVehicle}/trip`)
        .then((r) => r.data),
    enabled: !!selectedVehicle && selectedIsActive,
    staleTime: 60000,
    placeholderData: undefined,
  });

  const { data: behaviorData } = useQuery<BehaviorData>({
    queryKey: ["fleet-behavior", selectedVehicle],
    queryFn: () =>
      axios
        .get(`${FLEET_API}/vehicle/${selectedVehicle}/behavior`)
        .then((r) => r.data),
    enabled: !!selectedVehicle && selectedIsActive,
    staleTime: 30000,
    placeholderData: undefined,
  });

  const { data: pipelineFleet, refetch: refetchPipelineFleet } = useQuery<PipelineFleetSummary>({
    queryKey: ["pipeline-fleet-summary"],
    queryFn: () =>
      axios
        .get(`${PIPELINE_API}/api/automotive/fleet-summary`)
        .then((r) => r.data),
    refetchInterval: isActive && autoRefresh ? 8000 : false,
    retry: 1,
  });

  const [healthTimelineVehicle, setHealthTimelineVehicle] =
    useState<string>("");
  const [timelineXAxis, setTimelineXAxis] = useState<"timestamp" | "mileage">(
    "timestamp"
  );

  useEffect(() => {
    if (!healthTimelineVehicle && pipelineFleet?.vehicles?.length) {
      setHealthTimelineVehicle(pipelineFleet.vehicles[0].vehicle_id);
    }
  }, [pipelineFleet, healthTimelineVehicle]);

  const { data: healthHistory, refetch: refetchHealthHistory } = useQuery<HealthHistoryResponse>({
    queryKey: ["pipeline-health-history", healthTimelineVehicle],
    queryFn: () =>
      axios
        .get(
          `${PIPELINE_API}/api/automotive/vehicle-health-history/${healthTimelineVehicle}`
        )
        .then((r) => r.data),
    refetchInterval: isActive && autoRefresh ? 8000 : false,
    retry: 1,
    placeholderData: undefined,
  });

  const activeVehicleIds = useMemo(
    () => (pipelineFleet?.vehicles || []).map((v) => v.vehicle_id),
    [pipelineFleet]
  );

  const { data: healthScatterBatch } = useQuery<
    { vehicle_id: string; data: HealthHistoryRow[] }[]
  >({
    queryKey: ['fleet-health-scatter-batch'],
    queryFn: async () => {
      const r = await axios.get(`${PIPELINE_API}/api/automotive/fleet-health-scatter`);
      return r.data.vehicles ?? [];
    },
    enabled: sseVehicles.length === 0,
    refetchInterval: isActive && autoRefresh && sseVehicles.length === 0 ? 8000 : false,
    retry: 1,
    placeholderData: undefined,
  });

  const fleetHealthScatter = useMemo(() => {
    if (sseVehicles.length > 0) {
      return sseVehicles.map(v => ({
        vehicle_id: v.vehicle_id,
        data: ringBuffer.get(v.vehicle_id) ?? [],
      }));
    }
    return healthScatterBatch ?? [];
  }, [sseVehicles, ringBuffer, healthScatterBatch]);

  const wasActiveRef = useRef(isActive);
  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      refetchPipelineFleet();
      refetchHealthHistory();
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

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

  const SERVICE_INTERVAL_KM = 15000;
  const LAST_SERVICE_BASE = 8500;

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

  const bounds = [
    [-90, -180], // southwest
    [90, 180], // northeast
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
  return (
    <Box
      sx={{
        height: "calc(100vh - 48px - 48px)",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        // overflow: "auto",
      }}
    >
      <style>{`
        .leaflet-container { background: ${
          isDark ? "#0f1923" : "#f0efe9"
        } !important; font-family: Roboto, Helvetica, Arial, sans-serif !important; }
        .leaflet-popup-content { font-family: Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; }
        .leaflet-popup-content strong { font-weight: 700; }
        .leaflet-popup-content-wrapper { border-radius: 0 !important; box-shadow: 0 2px 8px rgba(0,0,0,${
          isDark ? "0.5" : "0.15"
        }) !important; ${
        isDark
          ? "background:#1a2535 !important;color:#e8ecf0 !important;border:1px solid #2a3a4a;"
          : ""
      } }
        ${
          isDark ? ".leaflet-popup-tip { background: #1a2535 !important; }" : ""
        }
      `}</style>

      <Box sx={{ flexGrow: 0 }}>
        <Grid container spacing={2}>
          {/* MAP */}
          <Grid item xs={12} md={10}>
            <Paper
              sx={{
                height: "445px",
                overflow: "hidden",
                position: "static",
                border: `1px solid ${theme.palette.divider}`,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Box
                sx={{
                  flex: 1,
                  // position: "relative",
                  minHeight: 0,
                  p: 1,
                }}
              >
                <MapContainer
                  center={[20, 0]}
                  zoom={2}
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
                  />
                  <MapController
                    selectedVehicle={selectedVehicle}
                    tripData={tripData ?? null}
                  />

                  {positions?.map((v) => {
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
              </Box>
            </Paper>
          </Grid>

          {/* KPI */}
          <Grid item xs={12} md={2}>
            <Paper
              sx={{
                height: "445px",
                // overflow: "hidden",
                // position: "relative",
                border: `1px solid ${theme.palette.divider}`,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {summary && (
                <Box
                  sx={{
                    height: 700,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    p: 1,
                  }}
                >
                  <KpiCard
                    title="Total Fleet"
                    value={40}
                    subtitle="Registered vehicles"
                    icon={<DirectionsCarFilledIcon fontSize="small" />}
                    color="#2563eb"
                  />

                  <KpiCard
                    title="Active Vehicles"
                    value={7}
                    subtitle="Currently on route"
                    icon={<RouteIcon fontSize="small" />}
                    color="#16a34a"
                  />

                  <KpiCard
                    title="Fleet Avg Health"
                    value={`${liveAvgHealth}%`}
                    subtitle="Active vehicles (Gold)"
                    icon={<MonitorHeartIcon fontSize="small" />}
                    color={healthColor(liveAvgHealth)}
                  />

                  <Box sx={{ flexGrow: 1 }}>
                    <DistributionChart
                      summary={{
                        ...summary,
                        severity_counts: liveSeverityCounts,
                      }}
                    />
                  </Box>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Box>

      <Grid container spacing={1} alignItems="stretch">
        <Grid item xs={12} md={6}>
          {(() => {
            const VEHICLE_COLORS = [
              "#e57373",
              "#ffb74d",
              "#81c784",
              "#ba68c8",
              "#4dd0e1",
              "#42a5f5",
              "#ff8a65",
              "#90a4ae",
              "#f48fb1",
              "#aed581",
            ];

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

                  shadowBlur: 3,

                  shadowColor: VEHICLE_COLORS[idx % VEHICLE_COLORS.length],
                },

                emphasis: {
                  scale: 1.15,
                },
              }));

              fleetScatterOption = {
                animation: false,
                largeThreshold: 100,

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

                  data: sortedTs,

                  axisLabel: {
                    ...commonXAxis.axisLabel,

                    formatter: (v) => String(v).slice(5, 16).replace("T", " "),
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
                    p: 1.5,
                    height: 470,
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
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        color: "text.secondary",
                      }}
                    >
                      FLEET HEALTH SCATTER — ALL VEHICLES OVER TIME (GOLD)
                    </Typography>

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
        </Grid>

        <Grid item xs={12} md={6}>
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
                trigger: "item",
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

                type: "category",

                data: xData,

                boundaryGap: true,

                scale: false,

                axisLabel: {
                  ...commonXAxis.axisLabel,

                  interval: 0,

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
                    color: isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)",
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

                    z: 9999,

                    zlevel: 9999,

                    animation: false,

                    data: [
                      {
                        yAxis: 60,

                        label: {
                          formatter: "CRITICAL",

                          color: "#d32f2f",

                          position: "insideStartBottom",

                          offset: [-7, 9],
                        },

                        lineStyle: {
                          color: "#d32f2f",

                          width: 3,

                          type: "dotted",
                        },
                      },

                      {
                        yAxis: 80,

                        label: {
                          formatter: "WARNING",

                          color: "#ed6c02",

                          position: "insideStartBottom",

                          offset: [-7, 11],
                        },

                        lineStyle: {
                          color: "#ed6c02",

                          width: 3,

                          type: "dotted",
                        },
                      },

                      ...(timelineXAxis === "mileage"
                        ? [
                            {
                              xAxis: nextServiceKm,

                              label: {
                                formatter: `SERVICE\n${Math.round(
                                  SERVICE_INTERVAL_KM - kmSinceService
                                )} km`,

                                color: "#1976d2",

                                position: "insideMiddleTop",
                              },

                              lineStyle: {
                                color: "#1976d2",

                                width: 2,
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
                    p: 1.5,
                    height: 470,
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
                      mb: 2.5,
                      flexWrap: "wrap",
                      gap: 0.8,
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{
                        fontWeight: 700,
                        color: "text.secondary",
                      }}
                    >
                      VEHICLE HEALTH TIMELINE (GOLD)
                    </Typography>

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
                        gap: 1.5,
                      }}
                    >
                      {/* KEEP YOUR SELECT */}

                      {/* KEEP YOUR TOGGLE */}

                      <Tooltip title="Expand">
                        <IconButton onClick={() => setOpenVehicleHealth(true)}>
                          <AspectRatioOutlinedIcon />
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
            sx={{ height: "100%", display: "flex", flexDirection: "column" }}
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
                                  {tripData.progress_pct.toFixed(1)}% complete
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

                                    width: 110,
                                    height: 58,

                                    overflow: "hidden",
                                  }}
                                >
                                  {/* Gauge Wrapper */}
                                  <Box
                                    sx={{
                                      position: "absolute",

                                      width: 110,
                                      height: 110,

                                      top: 0,
                                      left: "50%",

                                      transform: "translateX(-50%)",
                                    }}
                                  >
                                    {/* Base Track */}
                                    <Box
                                      sx={{
                                        position: "absolute",

                                        inset: 0,

                                        borderRadius: "50%",

                                        border: "8px solid #DCEEFF",

                                        boxSizing: "border-box",
                                      }}
                                    />

                                    {/* Progress */}
                                    <Box
                                      sx={{
                                        position: "absolute",

                                        inset: 0,

                                        borderRadius: "50%",

                                        background: `conic-gradient(
            from 180deg,
            #2563EB 0deg,
            #2563EB ${(Math.min(vehicleDetail.speed || 0, 100) / 100) * 180}deg,
            transparent ${
              (Math.min(vehicleDetail.speed || 0, 100) / 100) * 180
            }deg,
            transparent 360deg
          )`,

                                        clipPath: "inset(0 0 50% 0)",

                                        transition: "all .4s ease",
                                      }}
                                    />

                                    {/* Inner Cut */}
                                    <Box
                                      sx={{
                                        position: "absolute",

                                        inset: 8,

                                        bgcolor: "#fff",

                                        borderRadius: "50%",
                                      }}
                                    />
                                  </Box>

                                  {/* Center Value */}
                                  <Box
                                    sx={{
                                      position: "absolute",

                                      inset: 0,

                                      display: "flex",
                                      flexDirection: "column",

                                      alignItems: "center",
                                      justifyContent: "center",

                                      transform: "translateY(6px)",
                                    }}
                                  >
                                    <Typography
                                      sx={{
                                        fontSize: "14px !important",
                                        fontWeight: 800,

                                        lineHeight: 1,

                                        color: "#005071",
                                      }}
                                    >
                                      {vehicleDetail.speed?.toFixed(0)}
                                    </Typography>

                                    <Typography
                                      sx={{
                                        fontSize: "8px",

                                        color: "text.secondary",
                                      }}
                                    >
                                      km/h
                                    </Typography>
                                  </Box>
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
                                      HDG {vehicleDetail.heading?.toFixed(0)}°
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
                                        sx={{ fontSize: "10px !important" }}
                                      >
                                        {e.type.toUpperCase()} • {e.distance_km}{" "}
                                        km • {e.speed} km/h • G(
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
                                sx={{ display: "flex", alignItems: "center" }}
                              >
                                <Typography
                                  sx={{ fontSize: "10px !important", mr: 1 }}
                                >
                                  Total Events:
                                </Typography>

                                <Typography
                                  variant="h6"
                                  sx={{ fontSize: "12px", color: "#FB4E0B" }}
                                >
                                  {behaviorData.event_summary.total}
                                </Typography>
                              </Box>

                              <Box
                                sx={{ display: "flex", alignItems: "center" }}
                              >
                                <Typography
                                  sx={{ fontSize: "10px !important", mr: 1 }}
                                >
                                  Distance:
                                </Typography>

                                <Typography
                                  variant="h6"
                                  sx={{ fontSize: "12px", color: "#FB4E0B" }}
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
                                      .slice(0, tripData.completed_index + 1)
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
                                                  bgcolor: colors[rt] || "#999",
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

                                                    textTransform: "uppercase",

                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                  }}
                                                >
                                                  {rt}
                                                </Typography>

                                                <Typography
                                                  sx={{
                                                    fontSize: "8px",
                                                    color: "text.secondary",
                                                  }}
                                                >
                                                  {((c / total) * 100).toFixed(
                                                    0
                                                  )}
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

      {/* <Drawer
        anchor="right"
        open={!!selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        variant="persistent"
        sx={{
          "& .MuiDrawer-paper": {
            width: DRAWER_W,
            mt: "48px",
            height: "calc(100vh - 48px)",
            bgcolor: "background.paper",
            borderLeft: `1px solid ${theme.palette.divider}`,
          },
        }}
      >
        {vehicleDetail && (
          <Box
            sx={{ height: "100%", display: "flex", flexDirection: "column" }}
          >
            <Box
              sx={{
                p: 1.5,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Box>
                <Typography variant="body1" sx={{ fontWeight: "bold" }}>
                  {vehicleDetail.name.toUpperCase()}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary", fontSize: "0.75rem" }}
                >
                  {vehicleDetail.vehicle_id} • {vehicleDetail.type} •{" "}
                  {vehicleDetail.driver}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setSelectedVehicle(null)}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>

            <Box
              sx={{
                px: 1.5,
                py: 1,
                display: "flex",
                gap: 2,
                alignItems: "center",
                borderBottom: `1px solid ${theme.palette.divider}`,
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
                    <Box sx={{ textAlign: "center" }}>
                      <Typography
                        variant="h4"
                        sx={{ fontWeight: "bold", color: healthColor(h) }}
                      >
                        {h.toFixed(1)}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: "bold", color: "text.secondary" }}
                      >
                        HEALTH
                      </Typography>
                    </Box>
                    {Object.entries(mods).map(([mod, val]) => (
                      <Box key={mod} sx={{ textAlign: "center" }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: "bold", color: healthColor(val) }}
                        >
                          {val.toFixed(0)}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            fontWeight: "bold",
                            color: "text.secondary",
                            fontSize: "0.65rem",
                          }}
                        >
                          {mod.slice(0, 4).toUpperCase()}
                        </Typography>
                      </Box>
                    ))}
                  </>
                );
              })()}
            </Box>

            {vehicleDetail.status === "active" ? (
              <>
                <Tabs
                  value={drawerTab}
                  onChange={(_, v) => setDrawerTab(v)}
                  variant="fullWidth"
                  sx={{
                    minHeight: 36,
                    "& .MuiTab-root": {
                      minHeight: 36,
                      fontSize: "0.75rem",
                      fontWeight: "bold",
                      letterSpacing: "0.5px",
                    },
                  }}
                >
                  <Tab label="Trip" />
                  <Tab label="Behavior" />
                  <Tab label="Road" />
                </Tabs>
                <Box sx={{ flex: 1, overflow: "auto", p: 1.5 }}>
                  {drawerTab === 0 && tripData && (
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: "bold" }}>
                        {tripData.origin} → {tripData.destination}
                      </Typography>
                      <Box sx={{ mt: 1 }}>
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            mb: 0.5,
                          }}
                        >
                          <Typography variant="caption">
                            {tripData.distance_completed_km} km
                          </Typography>
                          <Typography variant="caption">
                            {tripData.distance_total_km} km
                          </Typography>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={tripData.progress_pct}
                          sx={{
                            height: 6,
                            borderRadius: 0,
                            bgcolor: alpha("#22c55e", 0.15),
                            "& .MuiLinearProgress-bar": {
                              bgcolor: "#22c55e",
                              borderRadius: 0,
                            },
                          }}
                        />
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ mt: 0.5, display: "block" }}
                        >
                          {tripData.progress_pct.toFixed(1)}% complete
                        </Typography>
                      </Box>
                      <Divider sx={{ my: 1.5 }} />
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: "bold", color: "text.secondary" }}
                      >
                        Current
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          mt: 0.5,
                          flexWrap: "wrap",
                        }}
                      >
                        <Chip
                          size="small"
                          label={`${vehicleDetail.speed?.toFixed(0)} km/h`}
                          sx={{
                            borderRadius: "2px",
                            fontWeight: "bold",
                            fontSize: "0.75rem",
                          }}
                        />
                        <Chip
                          size="small"
                          label={vehicleDetail.road_type?.toUpperCase()}
                          variant="outlined"
                          sx={{
                            borderRadius: "2px",
                            fontWeight: "bold",
                            fontSize: "0.75rem",
                          }}
                        />
                        <Chip
                          size="small"
                          label={`HDG ${vehicleDetail.heading?.toFixed(0)}°`}
                          variant="outlined"
                          sx={{
                            borderRadius: "2px",
                            fontWeight: "bold",
                            fontSize: "0.75rem",
                          }}
                        />
                      </Box>
                      <Divider sx={{ my: 1.5 }} />
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: "bold", color: "text.secondary" }}
                      >
                        EVENTS ON ROUTE ({tripData.events.length})
                      </Typography>
                      <Box sx={{ mt: 0.5, maxHeight: 200, overflow: "auto" }}>
                        {tripData.events
                          .slice(-20)
                          .reverse()
                          .map((e, i) => (
                            <Box
                              key={i}
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 0.75,
                                py: 0.3,
                              }}
                            >
                              <Box
                                sx={{
                                  width: 18,
                                  height: 18,
                                  flexShrink: 0,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  bgcolor: EVENT_COLORS[e.type] || "#888",
                                  color: "#fff",
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                }}
                              >
                                {EVENT_LABELS[e.type] || "?"}
                              </Box>
                              <Typography
                                variant="caption"
                                sx={{ fontSize: "0.7rem" }}
                              >
                                {e.type.toUpperCase()} — {e.distance_km} km —{" "}
                                {e.speed} km/h (G: {e.acc_x.toFixed(2)})
                              </Typography>
                            </Box>
                          ))}
                      </Box>
                    </Box>
                  )}

                  {drawerTab === 1 && behaviorData && (
                    <Box>
                      <Box sx={{ display: "flex", justifyContent: "center" }}>
                        <ScoreGauge
                          score={behaviorData.current_score}
                          label="Driver Score"
                        />
                      </Box>
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        sx={{ mt: 1, display: "block" }}
                      >
                        Score Timeline
                      </Typography>
                      <ScoreTimeline data={behaviorData} />
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        sx={{ mt: 1, display: "block" }}
                      >
                        Traction Circle (G-G Diagram)
                      </Typography>
                      <TractionCircle data={behaviorData} />
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        sx={{ mt: 1, display: "block" }}
                      >
                        Risk Profile (Events per 100km)
                      </Typography>
                      <RiskRadar data={behaviorData} />
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ display: "flex", gap: 2 }}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Total Events
                          </Typography>
                          <Typography variant="body2" fontWeight={600}>
                            {behaviorData.event_summary.total}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">
                            Trip Distance
                          </Typography>
                          <Typography variant="body2" fontWeight={600}>
                            {behaviorData.trip_distance_km} km
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  )}

                  {drawerTab === 2 && behaviorData && (
                    <Box>
                      <Typography
                        variant="caption"
                        sx={{ fontWeight: "bold", color: "text.secondary" }}
                      >
                        Speed Distribution by Road Type
                      </Typography>
                      <SpeedByRoad data={behaviorData} />
                      {tripData && (
                        <>
                          <Divider sx={{ my: 1.5 }} />
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: "bold", color: "text.secondary" }}
                          >
                            Road Type Breakdown
                          </Typography>
                          <Box sx={{ mt: 1 }}>
                            {(() => {
                              const counts: Record<string, number> = {};
                              tripData.route
                                .slice(0, tripData.completed_index + 1)
                                .forEach((p) => {
                                  counts[p.road_type] =
                                    (counts[p.road_type] || 0) + 1;
                                });
                              const total =
                                Object.values(counts).reduce(
                                  (a, b) => a + b,
                                  0
                                ) || 1;
                              const colors: Record<string, string> = {
                                highway: "#3b82f6",
                                primary: "#8b5cf6",
                                urban: "#f59e0b",
                              };
                              return (
                                <>
                                  <Box
                                    sx={{
                                      display: "flex",
                                      height: 12,
                                      borderRadius: 2,
                                      overflow: "hidden",
                                    }}
                                  >
                                    {Object.entries(counts).map(([rt, c]) => (
                                      <Box
                                        key={rt}
                                        sx={{
                                          width: `${(c / total) * 100}%`,
                                          bgcolor: colors[rt] || "#888",
                                        }}
                                      />
                                    ))}
                                  </Box>
                                  <Box
                                    sx={{ display: "flex", gap: 2, mt: 0.5 }}
                                  >
                                    {Object.entries(counts).map(([rt, c]) => (
                                      <Box
                                        key={rt}
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
                                            bgcolor: colors[rt] || "#888",
                                          }}
                                        />
                                        <Typography variant="caption">
                                          {rt} {((c / total) * 100).toFixed(0)}%
                                        </Typography>
                                      </Box>
                                    ))}
                                  </Box>
                                </>
                              );
                            })()}
                          </Box>
                          <Divider sx={{ my: 1.5 }} />
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: "bold", color: "text.secondary" }}
                          >
                            Adaptive Thresholds
                          </Typography>
                          <Box sx={{ mt: 0.5 }}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Highway cornering: 0.25g (strict — swerving on
                              highway is dangerous)
                            </Typography>
                            <br />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Urban cornering: 0.45g (loose — sharp turns in
                              city are expected)
                            </Typography>
                            <br />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Harsh braking: -0.35g (all roads)
                            </Typography>
                            <br />
                            <Typography
                              variant="caption"
                              color="text.secondary"
                            >
                              Harsh acceleration: 0.25g (all roads)
                            </Typography>
                          </Box>
                        </>
                      )}
                    </Box>
                  )}
                </Box>
              </>
            ) : (
              <Box sx={{ p: 2 }}>
                <Chip
                  label={
                    vehicleDetail.status === "in_service"
                      ? "IN SERVICE"
                      : "PARKED"
                  }
                  color={
                    vehicleDetail.status === "in_service"
                      ? "warning"
                      : "default"
                  }
                  size="small"
                  sx={{ borderRadius: "2px", fontWeight: "bold" }}
                />
                <Typography variant="body2" sx={{ mt: 1, fontWeight: "bold" }}>
                  {vehicleDetail.city}
                </Typography>
                {vehicleDetail.module_health && (
                  <Box sx={{ mt: 2 }}>
                    <Typography
                      variant="caption"
                      sx={{ fontWeight: "bold", color: "text.secondary" }}
                    >
                      MODULE HEALTH
                    </Typography>
                    {Object.entries(vehicleDetail.module_health).map(
                      ([mod, val]) => (
                        <Box key={mod} sx={{ mt: 0.5 }}>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{ fontWeight: "bold" }}
                            >
                              {mod.toUpperCase()}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                fontWeight: "bold",
                                color: healthColor(val),
                              }}
                            >
                              {val.toFixed(0)}%
                            </Typography>
                          </Box>
                          <LinearProgress
                            variant="determinate"
                            value={val}
                            sx={{
                              height: 4,
                              borderRadius: 0,
                              bgcolor: alpha(healthColor(val), 0.15),
                              "& .MuiLinearProgress-bar": {
                                bgcolor: healthColor(val),
                                borderRadius: 0,
                              },
                            }}
                          />
                        </Box>
                      )
                    )}
                  </Box>
                )}
              </Box>
            )}<popover
          </Box>
        )}
      </Drawer>  */}
    </Box>
  );
}
