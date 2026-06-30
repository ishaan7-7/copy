import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import axios from 'axios';
import { fetchApi, fetchFleet, liveInterval, useRefetchOnActivate } from '../hooks/useApi';
import {
  Box, Paper, Typography, Drawer, IconButton, Tabs, Tab, LinearProgress,
  Chip, Divider, Select, MenuItem, FormControl, InputLabel,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import GpsFixedIcon from '@mui/icons-material/GpsFixed';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import ReactECharts from 'echarts-for-react';
import { useStore } from '../store';

const FLEET_API = 'http://127.0.0.1:8009/api/fleet';
const PIPELINE_API = 'http://127.0.0.1:8005';

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
  fleet_stats: { total_vehicles: number; avg_health: number; critical_count: number; warning_count: number };
}

interface HealthHistoryRow {
  ts: string;
  timestamp: string;
  health: number;
  mileage: number;
  mileage_rel?: number;
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
  vehicle_id: string; name: string; type: string; status: string;
  health: number; composite: number; driver: string;
  module_health: Record<string, number>;
  lat: number; lng: number; heading: number; speed: number;
  driver_score: number; road_type: string;
  route_name?: string; route_origin?: string; route_destination?: string;
  elapsed_km?: number; total_km?: number; city?: string;
}

interface TripData {
  route: { lat: number; lng: number; road_type: string }[];
  completed_index: number;
  progress_pct: number;
  distance_completed_km: number;
  distance_total_km: number;
  events: { lat: number; lng: number; type: string; acc_x: number; acc_y: number; speed: number; distance_km: number }[];
  origin: string; destination: string; route_name: string;
}

interface BehaviorData {
  current_score: number;
  score_timeline: { distance_km: number; score: number; event_type: string | null }[];
  traction_circle: { acc_x: number; acc_y: number; speed: number }[];
  risk_radar: { braking_per_100km: number; accel_per_100km: number; cornering_per_100km: number };
  speed_by_road: Record<string, { min: number; q1: number; median: number; q3: number; max: number; mean: number }>;
  event_summary: { braking: number; accel: number; cornering: number; total: number };
  trip_distance_km: number;
}

const DRAWER_W = 420;

const _iconCache: Record<string, L.DivIcon> = {};

function createVehicleIcon(status: string, health: number, heading: number): L.DivIcon {
  let color = '#3b82f6';
  if (status === 'active') { color = '#22c55e'; }
  else if (status === 'in_service') { color = '#f59e0b'; }
  else if (health < 60) { color = '#ef4444'; }
  else if (health < 80) { color = '#eab308'; }

  const hdgBucket = status === 'active' ? Math.round(heading / 15) * 15 : 0;
  const cacheKey = `${status}_${color}_${hdgBucket}`;
  if (_iconCache[cacheKey]) return _iconCache[cacheKey];

  const size = status === 'active' ? 14 : 10;
  const arrow = status === 'active'
    ? `<div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%) rotate(${hdgBucket}deg);font-size:9px;color:${color};">▲</div>`
    : '';

  const icon = L.divIcon({
    className: '',
    iconSize: [size + 6, size + 6],
    iconAnchor: [(size + 6) / 2, (size + 6) / 2],
    html: `<div style="position:relative;width:${size + 6}px;height:${size + 6}px;display:flex;align-items:center;justify-content:center;">
      ${arrow}
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>
    </div>`,
  });

  _iconCache[cacheKey] = icon;
  return icon;
}

const EVENT_LABELS: Record<string, string> = { braking: 'B', accel: 'A', cornering: 'C' };
const EVENT_COLORS: Record<string, string> = { braking: '#ef4444', accel: '#22c55e', cornering: '#f59e0b' };

function createEventIcon(type: string): L.DivIcon {
  const c = EVENT_COLORS[type] || '#888';
  const label = EVENT_LABELS[type] || '?';
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div style="width:22px;height:22px;border-radius:2px;background:${c};border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
      <span style="color:white;font-size:11px;font-weight:700;font-family:Roboto,sans-serif;">${label}</span>
    </div>`,
  });
}

function MapVisibilityHandler() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      if (container.offsetWidth > 0 && container.offsetHeight > 0) {
        map.invalidateSize();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function MapController({ selectedVehicle, tripData }: {
  selectedVehicle: string | null;
  tripData: TripData | null;
}) {
  const map = useMap();
  const lastFittedVehicle = useRef<string | null>(null);

  useEffect(() => {
    if (selectedVehicle && tripData && tripData.route.length > 0 && lastFittedVehicle.current !== selectedVehicle) {
      lastFittedVehicle.current = selectedVehicle;
      const bounds = L.latLngBounds(tripData.route.map(p => [p.lat, p.lng]));
      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 7, duration: 1.2 });
    }
    if (!selectedVehicle) {
      lastFittedVehicle.current = null;
      map.flyTo([27.5, 78.5], 5, { duration: 0.8 });
    }
  }, [selectedVehicle, tripData, map]);
  return null;
}

function KpiCard({ title, value, subtitle, icon, color }: {
  title: string; value: string | number; subtitle?: string; icon: React.ReactNode; color: string;
}) {
  return (
    <Paper sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 180 }}>
      <Box sx={{
        width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: alpha(color, 0.10), color: color,
      }}>
        {icon}
      </Box>
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
          {title.toUpperCase()}
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'text.primary' }}>{value}</Typography>
        {subtitle && <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>{subtitle}</Typography>}
      </Box>
    </Paper>
  );
}

function DistributionChart({ summary }: { summary: FleetSummary }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const option = {
    tooltip: { trigger: 'item' as const, textStyle: { fontSize: 11 } },
    legend: { show: false },
    series: [{
      type: 'pie' as const,
      radius: ['55%', '80%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: { borderRadius: 0, borderColor: isDark ? '#1a2535' : '#fff', borderWidth: 2 },
      label: { show: false },
      data: [
        { value: summary.active, name: 'Active', itemStyle: { color: '#22c55e' } },
        { value: summary.parked - (summary.severity_counts.warning + summary.severity_counts.critical - summary.in_service), name: 'Parked', itemStyle: { color: '#3b82f6' } },
        { value: summary.in_service, name: 'In Service', itemStyle: { color: '#f59e0b' } },
        { value: summary.severity_counts.warning, name: 'Warning', itemStyle: { color: '#eab308' } },
        { value: summary.severity_counts.critical, name: 'Critical', itemStyle: { color: '#ef4444' } },
      ],
    }],
  };
  return (
    <Paper sx={{ p: 1.5, flex: 1.5, minWidth: 240, display: 'flex', alignItems: 'center' }}>
      <Box sx={{ width: 100, height: 100, flexShrink: 0 }}>
        <ReactECharts option={option} style={{ width: 100, height: 100 }} />
      </Box>
      <Box sx={{ ml: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
          FLEET DISTRIBUTION
        </Typography>
        {[
          { label: 'Active', count: summary.active, color: '#22c55e' },
          { label: 'Parked', count: summary.parked, color: '#3b82f6' },
          { label: 'In Service', count: summary.in_service, color: '#f59e0b' },
          { label: 'Warning', count: summary.severity_counts.warning, color: '#eab308' },
          { label: 'Critical', count: summary.severity_counts.critical, color: '#ef4444' },
        ].map(item => (
          <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color, flexShrink: 0 }} />
            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{item.label}: {item.count}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : '#ef4444';
  const option = {
    series: [{
      type: 'gauge' as const,
      startAngle: 220, endAngle: -40,
      min: 0, max: 100,
      pointer: { show: false },
      progress: { show: true, overlap: false, roundCap: true, width: 10, itemStyle: { color } },
      axisLine: { lineStyle: { width: 10, color: [[1, '#333']] } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      title: { show: true, offsetCenter: [0, '65%'], fontSize: 10, color: '#999' },
      detail: { valueAnimation: true, fontSize: 22, fontWeight: 700, offsetCenter: [0, '15%'], color },
      data: [{ value: Math.round(score), name: label }],
    }],
  };
  return <ReactECharts option={option} style={{ width: 140, height: 120 }} lazyUpdate notMerge={false} />;
}

function ScoreTimeline({ data }: { data: BehaviorData }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const timeline = data.score_timeline;

  const factor = Math.max(1, Math.floor(timeline.length / 300));
  const sampled = factor === 1 ? timeline : timeline.filter((_, i) => i % factor === 0);

  const eventScatter: [number, number][] = [];
  sampled.forEach((t, idx) => {
    if (t.event_type) eventScatter.push([idx, t.score]);
  });

  const option = {
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'axis' as const, textStyle: { fontSize: 10 } },
    xAxis: { type: 'category' as const, data: sampled.map(t => t.distance_km), name: 'km', nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9, color: isDark ? '#8a9bb0' : '#666', interval: Math.max(0, Math.floor(sampled.length / 6)) } },
    yAxis: { type: 'value' as const, min: 0, max: 105, name: 'Score', nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9, color: isDark ? '#8a9bb0' : '#666' } },
    series: [
      { type: 'line' as const, data: sampled.map(t => t.score), smooth: true, lineStyle: { width: 2, color: '#3b82f6' }, symbol: 'none', areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: alpha('#3b82f6', 0.3) }, { offset: 1, color: alpha('#3b82f6', 0.02) }] } } },
      { type: 'scatter' as const, data: eventScatter, symbol: 'circle', symbolSize: 8, itemStyle: { color: '#ef4444', borderColor: '#fff', borderWidth: 1 }, z: 10 },
    ],
  };
  return <ReactECharts option={option} style={{ height: 180 }} lazyUpdate notMerge={false} />;
}

function TractionCircle({ data }: { data: BehaviorData }) {
  const pts = data.traction_circle;
  const option = {
    grid: { top: 10, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'item' as const, formatter: (p: { data: number[] }) => `Lat: ${p.data[0]}g  Lon: ${p.data[1]}g  Spd: ${p.data[2]} km/h` },
    xAxis: { type: 'value' as const, min: -1.2, max: 1.2, name: 'Lateral G', nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 8 } },
    yAxis: { type: 'value' as const, min: -1.2, max: 1.2, name: 'Longitudinal G', nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 8 } },
    visualMap: { show: true, dimension: 2, min: 0, max: 140, inRange: { color: ['#440154', '#31688e', '#35b779', '#fde725'] }, textStyle: { fontSize: 9 }, right: 0, top: 'center', itemHeight: 80 },
    series: [{
      type: 'scatter' as const,
      data: pts.map(p => [p.acc_y, p.acc_x, p.speed]),
      symbolSize: 4,
      itemStyle: { opacity: 0.6 },
    }],
    graphic: [{
      type: 'circle' as const,
      shape: { cx: 0, cy: 0, r: 0 },
      style: { stroke: '#ef4444', lineDash: [4, 4], fill: 'none', lineWidth: 1 },
      position: ['50%', '50%'],
    }],
  };
  return <ReactECharts option={option} style={{ height: 220 }} lazyUpdate notMerge={false} />;
}

function RiskRadar({ data }: { data: BehaviorData }) {
  const r = data.risk_radar;
  const maxVal = Math.max(r.braking_per_100km, r.accel_per_100km, r.cornering_per_100km, 10);
  const option = {
    radar: { indicator: [
      { name: 'Braking', max: maxVal * 1.2 },
      { name: 'Acceleration', max: maxVal * 1.2 },
      { name: 'Cornering', max: maxVal * 1.2 },
    ], radius: 60, name: { textStyle: { fontSize: 10 } } },
    series: [{ type: 'radar' as const, data: [{ value: [r.braking_per_100km, r.accel_per_100km, r.cornering_per_100km], areaStyle: { color: alpha('#ef4444', 0.2) }, lineStyle: { color: '#ef4444' }, itemStyle: { color: '#ef4444' } }] }],
  };
  return <ReactECharts option={option} style={{ height: 180 }} lazyUpdate notMerge={false} />;
}

function SpeedByRoad({ data }: { data: BehaviorData }) {
  const roads = Object.entries(data.speed_by_road);
  if (roads.length === 0) return <Typography variant="caption" color="text.secondary">Insufficient data</Typography>;

  const option = {
    grid: { top: 10, right: 10, bottom: 30, left: 60 },
    tooltip: { trigger: 'item' as const, textStyle: { fontSize: 10 } },
    xAxis: { type: 'value' as const, name: 'km/h', nameTextStyle: { fontSize: 9 }, axisLabel: { fontSize: 9 } },
    yAxis: { type: 'category' as const, data: roads.map(([r]) => r.charAt(0).toUpperCase() + r.slice(1)), axisLabel: { fontSize: 10 } },
    series: [{
      type: 'boxplot' as const,
      data: roads.map(([, s]) => [s.min, s.q1, s.median, s.q3, s.max]),
      itemStyle: { color: '#3b82f6', borderColor: '#2563eb' },
    }],
  };
  return <ReactECharts option={option} style={{ height: 160 }} lazyUpdate notMerge={false} />;
}

export default function FleetCenter({ isActive = true }: { isActive?: boolean }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const autoRefresh = useStore((s) => s.autoRefresh);
  const queryClient = useQueryClient();
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState(0);

  const { data: summary, refetch: refetchSummary } = useQuery<FleetSummary>({
    queryKey: ['fleet-summary'],
    queryFn: fetchFleet('/api/fleet/summary'),
    refetchInterval: liveInterval(10000, isActive, autoRefresh),
  });

  const { data: positions, refetch: refetchPositions } = useQuery<VehiclePosition[]>({
    queryKey: ['fleet-positions'],
    queryFn: fetchFleet('/api/fleet/positions'),
    refetchInterval: liveInterval(8000, isActive, autoRefresh),
  });

  const activeIds = useMemo(() => (positions || []).filter(v => v.status === 'active').map(v => v.vehicle_id), [positions]);

  const selectedIsActive = useMemo(() => {
    if (!selectedVehicle || !positions) return false;
    const v = positions.find(p => p.vehicle_id === selectedVehicle);
    return v?.status === 'active';
  }, [selectedVehicle, positions]);

  useQuery({
    queryKey: ['fleet-prefetch-all', activeIds],
    queryFn: async ({ signal }) => {
      await Promise.all(activeIds.flatMap(vid => [
        axios.get(`${FLEET_API}/vehicle/${vid}`, { signal }).then(r => { queryClient.setQueryData(['fleet-vehicle', vid], r.data); }).catch(() => {}),
        axios.get(`${FLEET_API}/vehicle/${vid}/trip`, { signal }).then(r => { queryClient.setQueryData(['fleet-trip', vid], r.data); }).catch(() => {}),
        axios.get(`${FLEET_API}/vehicle/${vid}/behavior`, { signal }).then(r => { queryClient.setQueryData(['fleet-behavior', vid], r.data); }).catch(() => {}),
      ]));
      return true;
    },
    enabled: activeIds.length > 0,
    staleTime: 60000,
    refetchInterval: liveInterval(20000, isActive, autoRefresh),
  });

  const { data: vehicleDetail } = useQuery<VehicleDetail>({
    queryKey: ['fleet-vehicle', selectedVehicle],
    queryFn: fetchFleet(`/api/fleet/vehicle/${selectedVehicle}`),
    enabled: !!selectedVehicle,
    placeholderData: keepPreviousData,
    staleTime: 30000,
  });

  const { data: tripData } = useQuery<TripData>({
    queryKey: ['fleet-trip', selectedVehicle],
    queryFn: fetchFleet(`/api/fleet/vehicle/${selectedVehicle}/trip`),
    enabled: !!selectedVehicle && selectedIsActive,
    placeholderData: keepPreviousData,
    staleTime: 60000,
  });

  const { data: behaviorData } = useQuery<BehaviorData>({
    queryKey: ['fleet-behavior', selectedVehicle],
    queryFn: fetchFleet(`/api/fleet/vehicle/${selectedVehicle}/behavior`),
    enabled: !!selectedVehicle && selectedIsActive,
    placeholderData: keepPreviousData,
    staleTime: 30000,
  });

  const { data: pipelineFleet, refetch: refetchPipelineFleet } = useQuery<PipelineFleetSummary>({
    queryKey: ['pipeline-fleet-summary'],
    queryFn: fetchApi('/api/automotive/fleet-summary'),
    refetchInterval: liveInterval(8000, isActive, autoRefresh),
    retry: 1,
  });

  const [healthTimelineVehicle, setHealthTimelineVehicle] = useState<string>('sim001');
  const [timelineXAxis, setTimelineXAxis] = useState<'timestamp' | 'mileage'>('mileage');
  const scatterReady = true;

  const { data: healthHistory, refetch: refetchHealthHistory } = useQuery<HealthHistoryResponse>({
    queryKey: ['pipeline-health-history', healthTimelineVehicle],
    queryFn: fetchApi(`/api/automotive/vehicle-health-history/${healthTimelineVehicle}`),
    placeholderData: keepPreviousData,
    refetchInterval: liveInterval(8000, isActive, autoRefresh),
    retry: 1,
  });

  const activeVehicleIds = useMemo(() => (pipelineFleet?.vehicles || []).map(v => v.vehicle_id), [pipelineFleet]);

  const { data: fleetHealthScatter, refetch: refetchScatter } = useQuery<{ vehicle_id: string; data: HealthHistoryRow[] }[]>({
    queryKey: ['fleet-health-scatter', activeVehicleIds],
    queryFn: async ({ signal }) => {
      const results = await Promise.all(
        activeVehicleIds.map(vid =>
          axios.get(`${PIPELINE_API}/api/automotive/vehicle-health-history/${vid}`, { signal })
            .then(r => ({ vehicle_id: vid, data: (r.data.data || []) as HealthHistoryRow[] }))
            .catch(() => ({ vehicle_id: vid, data: [] as HealthHistoryRow[] }))
        )
      );
      return results;
    },
    enabled: scatterReady && activeVehicleIds.length > 0,
    placeholderData: keepPreviousData,
    refetchInterval: liveInterval(8000, isActive, autoRefresh),
    retry: 1,
  });

  useRefetchOnActivate(isActive, [
    refetchSummary, refetchPositions, refetchPipelineFleet, refetchHealthHistory, refetchScatter,
  ]);

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
    if (pipelineFleet?.fleet_stats?.avg_health) return pipelineFleet.fleet_stats.avg_health;
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
        if (v.status === 'active') continue;
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

  const getModuleHealth = (vehicleId: string, fallbackModules: Record<string, number>): Record<string, number> => {
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
    return tripData.route.slice(0, tripData.completed_index + 1).map(p => [p.lat, p.lng] as [number, number]);
  }, [tripData]);

  const remainingRoute = useMemo(() => {
    if (!tripData) return [];
    return tripData.route.slice(tripData.completed_index).map(p => [p.lat, p.lng] as [number, number]);
  }, [tripData]);

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  const tileAttribution = '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/">OSM</a>';

  const healthColor = (h: number) => h >= 80 ? '#22c55e' : h >= 60 ? '#eab308' : '#ef4444';

  return (
    <Box sx={{ height: 'calc(100vh - 48px - 48px)', display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'auto' }}>
      <style>{`
        .leaflet-container { background: ${isDark ? '#0f1923' : '#f0efe9'} !important; font-family: Roboto, Helvetica, Arial, sans-serif !important; }
        .leaflet-popup-content { font-family: Roboto, Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; }
        .leaflet-popup-content strong { font-weight: 700; }
        .leaflet-popup-content-wrapper { border-radius: 0 !important; box-shadow: 0 2px 8px rgba(0,0,0,${isDark ? '0.5' : '0.15'}) !important; ${isDark ? 'background:#1a2535 !important;color:#e8ecf0 !important;border:1px solid #2a3a4a;' : ''} }
        ${isDark ? '.leaflet-popup-tip { background: #1a2535 !important; }' : ''}
      `}</style>

      {summary && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <KpiCard title="Total Fleet" value={40} subtitle="registered vehicles" icon={<LocalShippingIcon />} color="#3b82f6" />
          <KpiCard title="Active Vehicles" value={7} subtitle="currently on route" icon={<GpsFixedIcon />} color="#22c55e" />
          <KpiCard title="Fleet Avg Health" value={`${liveAvgHealth}%`} subtitle="active vehicles (Gold)" icon={<FavoriteIcon />} color={healthColor(liveAvgHealth)} />
          <DistributionChart summary={{ ...summary, severity_counts: liveSeverityCounts }} />
        </Box>
      )}

      <Paper sx={{
        minHeight: 700, overflow: 'hidden', position: 'relative',
        border: `1px solid ${theme.palette.divider}`, flexShrink: 0,
      }}>
        <MapContainer
          center={[27.5, 78.5]}
          zoom={5}
          minZoom={5}
          maxZoom={15}
          maxBounds={[[8, 65], [38, 100]]}
          maxBoundsViscosity={1.0}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          preferCanvas={true}
        >
          <TileLayer url={tileUrl} attribution={tileAttribution} keepBuffer={6} updateWhenZooming={false} updateWhenIdle={true} />
          <MapController selectedVehicle={selectedVehicle} tripData={tripData ?? null} />
          <MapVisibilityHandler />

          {positions?.map(v => {
            const liveH = v.status === 'active' ? getVehicleHealth(v.vehicle_id, v.health) : v.health;
            return (
              <Marker
                key={v.vehicle_id}
                position={[v.lat, v.lng]}
                icon={createVehicleIcon(v.status, liveH, v.heading)}
                eventHandlers={{ click: () => { setSelectedVehicle(v.vehicle_id); setDrawerTab(0); } }}
              >
                <Popup>
                  <strong>{v.name}</strong> ({v.vehicle_id})<br />
                  {v.status === 'active' ? `${v.speed.toFixed(0)} km/h • ${v.road_type}` : v.route_name}<br />
                  Health: {liveH.toFixed(1)}% • Driver: {v.driver_score}
                </Popup>
              </Marker>
            );
          })}

          {selectedVehicle && completedRoute.length > 1 && (
            <Polyline positions={completedRoute} pathOptions={{ color: '#22c55e', weight: 4, opacity: 0.9 }} />
          )}
          {selectedVehicle && remainingRoute.length > 1 && (
            <Polyline positions={remainingRoute} pathOptions={{ color: '#6b7280', weight: 2, opacity: 0.5, dashArray: '8 6' }} />
          )}

          {selectedVehicle && tripData?.events.map((evt, i) => (
            <Marker key={`evt-${i}`} position={[evt.lat, evt.lng]} icon={createEventIcon(evt.type)}>
              <Popup>
                <strong>{evt.type.toUpperCase()}</strong><br />
                G-force: X={evt.acc_x.toFixed(2)}, Y={evt.acc_y.toFixed(2)}<br />
                Speed: {evt.speed} km/h
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </Paper>

      {/* ── POINT 7: Fleet Scatter Plot ── */}
      <Paper sx={{ p: 1.5, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
            FLEET HEALTH SCATTER — ALL VEHICLES OVER TIME (GOLD)
          </Typography>
        </Box>
        <Box sx={{ height: 320 }}>
          {fleetHealthScatter && fleetHealthScatter.some(v => v.data.length > 0) ? (() => {
            const VID_COLORS = ['#e57373', '#ffb74d', '#81c784', '#ba68c8', '#4dd0e1', '#42a5f5', '#ff8a65', '#90a4ae', '#f48fb1', '#aed581'];
            const series = fleetHealthScatter.map((vh, idx) => {
              const color = VID_COLORS[idx % VID_COLORS.length];
              return {
                name: vh.vehicle_id,
                type: 'scatter' as const,
                data: vh.data.map(r => [r.ts || r.timestamp || '', r.health ?? 0]),
                symbolSize: 4,
                itemStyle: { color, opacity: 0.6 },
                emphasis: { itemStyle: { opacity: 1, borderColor: '#fff', borderWidth: 1 } },
                large: true,
                largeThreshold: 500,
              };
            });

            if (series.length > 0) {
              (series[0] as Record<string, unknown>).markLine = {
                silent: true,
                symbol: 'none',
                data: [
                  { yAxis: 60, lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 }, label: { formatter: 'CRITICAL', fontSize: 9, color: '#d32f2f', fontFamily: 'monospace', position: 'insideStartTop' } },
                  { yAxis: 80, lineStyle: { color: '#ed6c02', type: 'dashed', width: 1 }, label: { formatter: 'WARNING', fontSize: 9, color: '#ed6c02', fontFamily: 'monospace', position: 'insideStartTop' } },
                ],
              };
            }

            return (
              <ReactECharts
                style={{ height: '100%', width: '100%' }}
                option={{
                  tooltip: {
                    trigger: 'item',
                    backgroundColor: isDark ? '#1a2535' : '#fff',
                    borderColor: isDark ? '#2a3a4a' : '#e0e0e0',
                    borderWidth: 1,
                    textStyle: { fontFamily: 'monospace', fontSize: 11, color: isDark ? '#e8ecf0' : '#212121' },
                    formatter: (p: { seriesName: string; data: [string, number] }) =>
                      `<b>${p.seriesName}</b><br/>Time: ${p.data[0]}<br/>Health: ${p.data[1].toFixed(1)}%`,
                  },
                  legend: {
                    data: fleetHealthScatter.map(v => v.vehicle_id),
                    textStyle: { fontFamily: 'monospace', fontSize: 10, color: isDark ? '#8a9bb0' : '#616161' },
                    itemHeight: 8, top: 2, right: 8, type: 'scroll' as const, icon: 'circle',
                  },
                  dataZoom: [
                    { type: 'inside', xAxisIndex: 0 },
                    { type: 'slider', xAxisIndex: 0, bottom: 4, height: 20, borderColor: isDark ? '#2a3a4a' : '#e0e0e0', fillerColor: 'rgba(25,118,210,0.08)', handleStyle: { color: '#1976d2' } },
                  ],
                  grid: { top: 36, right: 16, bottom: 50, left: 50 },
                  xAxis: {
                    type: 'time' as const,
                    axisLabel: {
                      fontFamily: 'monospace', fontSize: 10, color: isDark ? '#8a9bb0' : '#616161',
                      formatter: '{HH}:{mm}:{ss}',
                    },
                    axisLine: { lineStyle: { color: isDark ? '#2a3a4a' : '#bdbdbd' } },
                    axisTick: { show: false },
                    splitLine: { show: false },
                  },
                  yAxis: {
                    type: 'value' as const,
                    min: 0,
                    max: 100,
                    axisLabel: { fontFamily: 'monospace', fontSize: 10, color: isDark ? '#8a9bb0' : '#616161', formatter: '{value}%' },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { type: 'dashed' as const, color: isDark ? '#2a3a4a' : '#e0e0e0' } },
                  },
                  series,
                  markArea: {
                    silent: true,
                    data: [
                      [{ yAxis: 0, itemStyle: { color: 'rgba(211,47,47,0.04)' } }, { yAxis: 60 }],
                      [{ yAxis: 60, itemStyle: { color: 'rgba(237,108,2,0.03)' } }, { yAxis: 80 }],
                    ],
                  },
                } as Record<string, unknown>}
              />
            );
          })() : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Waiting for pipeline backend (port 8005) — start streaming to populate Gold health data
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>

      {/* ── POINT 8: Vehicle Health Timeline ── */}
      <Paper sx={{ p: 1.5, flexShrink: 0 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
              VEHICLE HEALTH TIMELINE (GOLD)
            </Typography>
            {healthHistory && healthHistory.data.length > 0 && (() => {
              const last = healthHistory.data[healthHistory.data.length - 1];
              const odo = last?.mileage ?? 0;
              const nextSvc = Math.ceil(odo / SERVICE_INTERVAL_KM) * SERVICE_INTERVAL_KM;
              const kmLeft = nextSvc - odo;
              const urgent = kmLeft < 2000;
              return (<>
                <Chip
                  size="small"
                  label={`ODO: ${Math.round(odo).toLocaleString()} km`}
                  variant="outlined"
                  sx={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 'bold', height: 20 }}
                />
                <Chip
                  size="small"
                  label={`Next Service: ${Math.round(kmLeft).toLocaleString()} km`}
                  sx={{
                    fontFamily: 'monospace', fontSize: '10px', fontWeight: 'bold', height: 20,
                    bgcolor: urgent ? 'error.main' : 'info.main', color: '#fff',
                  }}
                />
              </>);
            })()}
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel sx={{ fontSize: '0.8rem' }}>Vehicle</InputLabel>
              <Select
                value={healthTimelineVehicle}
                onChange={(e) => setHealthTimelineVehicle(e.target.value)}
                label="Vehicle"
                sx={{ borderRadius: 0, height: 32, fontSize: '0.8rem', fontWeight: 'bold' }}
              >
                {(pipelineFleet?.vehicles || []).map(v => (
                  <MenuItem key={v.vehicle_id} value={v.vehicle_id} sx={{ fontSize: '0.8rem' }}>{v.vehicle_id}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <ToggleButtonGroup value={timelineXAxis} exclusive onChange={(_, v) => v && setTimelineXAxis(v)} size="small" sx={{ bgcolor: 'background.paper' }}>
              <ToggleButton value="mileage" sx={{ fontWeight: 'bold', px: 1.5, borderRadius: 0, fontSize: '11px' }}>MILEAGE</ToggleButton>
              <ToggleButton value="timestamp" sx={{ fontWeight: 'bold', px: 1.5, borderRadius: 0, fontSize: '11px' }}>TIMESTAMP</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
        <Box sx={{ height: 300 }}>
          {healthHistory && healthHistory.data.length > 0 ? (() => {
            const rows = healthHistory.data;
            const factor = Math.max(1, Math.floor(rows.length / 500));
            const sampled = factor === 1 ? rows : rows.filter((_, i) => i % factor === 0);
            const xData = sampled.map(r => timelineXAxis === 'mileage' ? (r.mileage_rel ?? r.mileage ?? 0) : (r.ts || r.timestamp || ''));
            const yData = sampled.map(r => r.health);

            const lastMileageAbs = rows[rows.length - 1]?.mileage ?? 0;
            const nextServiceKm = Math.ceil(lastMileageAbs / SERVICE_INTERVAL_KM) * SERVICE_INTERVAL_KM;
            const kmToService = nextServiceKm - lastMileageAbs;

            const lastRel = rows[rows.length - 1]?.mileage_rel ?? (rows[rows.length - 1]?.mileage ?? 0);
            const serviceRelX = lastRel + kmToService;
            const dataRangeRel = lastRel - (rows[0]?.mileage_rel ?? 0);
            const serviceInRange = timelineXAxis === 'mileage' && dataRangeRel > 0 && serviceRelX <= lastRel + dataRangeRel * 0.5;

            const markLines: Record<string, unknown>[] = [
              { yAxis: 60, lineStyle: { color: '#d32f2f', type: 'dashed', width: 1 }, label: { formatter: 'CRITICAL', fontSize: 9, color: '#d32f2f', fontFamily: 'monospace', position: 'insideStartTop' } },
              { yAxis: 80, lineStyle: { color: '#ed6c02', type: 'dashed', width: 1 }, label: { formatter: 'WARNING', fontSize: 9, color: '#ed6c02', fontFamily: 'monospace', position: 'insideStartTop' } },
            ];

            if (serviceInRange) {
              markLines.push({
                xAxis: serviceRelX,
                lineStyle: { color: '#1976d2', type: 'solid', width: 2 },
                label: { formatter: `SERVICE\n${Math.round(kmToService)} km`, fontSize: 9, color: '#1976d2', fontFamily: 'monospace', position: 'insideMiddleTop' },
              });
            }

            return (
              <ReactECharts
                style={{ height: '100%', width: '100%' }}
                option={{
                  tooltip: {
                    trigger: 'axis',
                    backgroundColor: isDark ? '#1a2535' : '#fff',
                    borderColor: isDark ? '#2a3a4a' : '#e0e0e0',
                    borderWidth: 1,
                    textStyle: { fontFamily: 'monospace', fontSize: 11, color: isDark ? '#e8ecf0' : '#212121' },
                    axisPointer: { type: 'line', lineStyle: { color: isDark ? '#2a3a4a' : '#e0e0e0', type: 'dashed' } },
                  },
                  dataZoom: [
                    { type: 'inside', xAxisIndex: 0 },
                    { type: 'slider', xAxisIndex: 0, bottom: 4, height: 20, borderColor: isDark ? '#2a3a4a' : '#e0e0e0', fillerColor: 'rgba(25,118,210,0.08)', handleStyle: { color: '#1976d2' } },
                  ],
                  grid: { top: 30, right: 30, bottom: 50, left: 50 },
                  xAxis: timelineXAxis === 'mileage' ? {
                    type: 'value' as const,
                    name: 'km traveled',
                    nameTextStyle: { fontFamily: 'monospace', fontSize: 9, color: isDark ? '#8a9bb0' : '#616161' },
                    axisLabel: {
                      fontFamily: 'monospace', fontSize: 10, color: isDark ? '#8a9bb0' : '#616161',
                      formatter: (v: number) => `${Math.round(v)} km`,
                    },
                    axisLine: { lineStyle: { color: isDark ? '#2a3a4a' : '#bdbdbd' } },
                    axisTick: { show: false },
                  } : {
                    type: 'time' as const,
                    axisLabel: {
                      fontFamily: 'monospace', fontSize: 10, color: isDark ? '#8a9bb0' : '#616161',
                      formatter: '{HH}:{mm}:{ss}',
                    },
                    axisLine: { lineStyle: { color: isDark ? '#2a3a4a' : '#bdbdbd' } },
                    axisTick: { show: false },
                  },
                  yAxis: {
                    type: 'value' as const,
                    min: 0,
                    max: 100,
                    axisLabel: { fontFamily: 'monospace', fontSize: 10, color: isDark ? '#8a9bb0' : '#616161', formatter: '{value}%' },
                    axisLine: { show: false },
                    axisTick: { show: false },
                    splitLine: { lineStyle: { type: 'dashed' as const, color: isDark ? '#2a3a4a' : '#e0e0e0' } },
                  },
                  series: [{
                    type: 'line' as const,
                    data: timelineXAxis === 'mileage'
                      ? sampled.map(r => [r.mileage_rel ?? r.mileage ?? 0, r.health ?? 0])
                      : sampled.map(r => [r.ts || r.timestamp || '', r.health ?? 0]),
                    symbol: 'none',
                    lineStyle: { color: '#1976d2', width: 2 },
                    itemStyle: { color: '#1976d2' },
                    areaStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(25,118,210,0.15)' }, { offset: 1, color: 'rgba(25,118,210,0.02)' }] } },
                    markLine: { silent: true, symbol: 'none', data: markLines },
                    markArea: {
                      silent: true,
                      data: [
                        [{ yAxis: 0, itemStyle: { color: 'rgba(211,47,47,0.04)' } }, { yAxis: 60 }],
                        [{ yAxis: 60, itemStyle: { color: 'rgba(237,108,2,0.03)' } }, { yAxis: 80 }],
                      ],
                    },
                  }],
                } as Record<string, unknown>}
              />
            );
          })() : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {healthHistory ? 'No Gold health history for this vehicle' : 'Connect to pipeline backend (port 8005) for live health data'}
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>

      <Drawer
        anchor="right"
        open={!!selectedVehicle}
        onClose={() => setSelectedVehicle(null)}
        variant="persistent"
        sx={{
          '& .MuiDrawer-paper': {
            width: DRAWER_W, mt: '48px', height: 'calc(100vh - 48px)',
            bgcolor: 'background.paper', borderLeft: `1px solid ${theme.palette.divider}`,
          },
        }}
      >
        {vehicleDetail && (
          <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${theme.palette.divider}` }}>
              <Box>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>{vehicleDetail.name.toUpperCase()}</Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  {vehicleDetail.vehicle_id} • {vehicleDetail.type} • {vehicleDetail.driver}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setSelectedVehicle(null)}><CloseIcon fontSize="small" /></IconButton>
            </Box>

            <Box sx={{ px: 1.5, py: 1, display: 'flex', gap: 2, alignItems: 'center', borderBottom: `1px solid ${theme.palette.divider}` }}>
              {(() => {
                const h = vehicleDetail.status === 'active' ? getVehicleHealth(vehicleDetail.vehicle_id, vehicleDetail.health) : vehicleDetail.health;
                const mods = vehicleDetail.status === 'active' ? getModuleHealth(vehicleDetail.vehicle_id, vehicleDetail.module_health || {}) : (vehicleDetail.module_health || {});
                return (
                  <>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" sx={{ fontWeight: 'bold', color: healthColor(h) }}>
                        {h.toFixed(1)}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>HEALTH</Typography>
                    </Box>
                    {Object.entries(mods).map(([mod, val]) => (
                      <Box key={mod} sx={{ textAlign: 'center' }}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: healthColor(val) }}>{val.toFixed(0)}</Typography>
                        <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', fontSize: '0.65rem' }}>{mod.slice(0, 4).toUpperCase()}</Typography>
                      </Box>
                    ))}
                  </>
                );
              })()}
            </Box>

            {vehicleDetail.status === 'active' ? (
              <>
                <Tabs value={drawerTab} onChange={(_, v) => setDrawerTab(v)} variant="fullWidth" sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '0.5px' } }}>
                  <Tab label="Trip" />
                  <Tab label="Behavior" />
                  <Tab label="Road" />
                </Tabs>
                <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
                  {drawerTab === 0 && tripData && (
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{tripData.origin} → {tripData.destination}</Typography>
                      <Box sx={{ mt: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                          <Typography variant="caption">{tripData.distance_completed_km} km</Typography>
                          <Typography variant="caption">{tripData.distance_total_km} km</Typography>
                        </Box>
                        <LinearProgress variant="determinate" value={tripData.progress_pct} sx={{ height: 6, borderRadius: 0, bgcolor: alpha('#22c55e', 0.15), '& .MuiLinearProgress-bar': { bgcolor: '#22c55e', borderRadius: 0 } }} />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                          {tripData.progress_pct.toFixed(1)}% complete
                        </Typography>
                      </Box>
                      <Divider sx={{ my: 1.5 }} />
                      <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>Current</Typography>
                      <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                        <Chip size="small" label={`${vehicleDetail.speed?.toFixed(0)} km/h`} sx={{ borderRadius: '2px', fontWeight: 'bold', fontSize: '0.75rem' }} />
                        <Chip size="small" label={vehicleDetail.road_type?.toUpperCase()} variant="outlined" sx={{ borderRadius: '2px', fontWeight: 'bold', fontSize: '0.75rem' }} />
                        <Chip size="small" label={`HDG ${vehicleDetail.heading?.toFixed(0)}°`} variant="outlined" sx={{ borderRadius: '2px', fontWeight: 'bold', fontSize: '0.75rem' }} />
                      </Box>
                      <Divider sx={{ my: 1.5 }} />
                      <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>EVENTS ON ROUTE ({tripData.events.length})</Typography>
                      <Box sx={{ mt: 0.5, maxHeight: 200, overflow: 'auto' }}>
                        {tripData.events.slice(-20).reverse().map((e, i) => (
                          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 0.3 }}>
                            <Box sx={{
                              width: 18, height: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              bgcolor: EVENT_COLORS[e.type] || '#888', color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                            }}>
                              {EVENT_LABELS[e.type] || '?'}
                            </Box>
                            <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{e.type.toUpperCase()} — {e.distance_km} km — {e.speed} km/h (G: {e.acc_x.toFixed(2)})</Typography>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {drawerTab === 1 && behaviorData && (
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <ScoreGauge score={behaviorData.current_score} label="Driver Score" />
                      </Box>
                      <Typography variant="caption" fontWeight={600} sx={{ mt: 1, display: 'block' }}>Score Timeline</Typography>
                      <ScoreTimeline data={behaviorData} />
                      <Typography variant="caption" fontWeight={600} sx={{ mt: 1, display: 'block' }}>Traction Circle (G-G Diagram)</Typography>
                      <TractionCircle data={behaviorData} />
                      <Typography variant="caption" fontWeight={600} sx={{ mt: 1, display: 'block' }}>Risk Profile (Events per 100km)</Typography>
                      <RiskRadar data={behaviorData} />
                      <Divider sx={{ my: 1 }} />
                      <Box sx={{ display: 'flex', gap: 2 }}>
                        <Box>
                          <Typography variant="caption" color="text.secondary">Total Events</Typography>
                          <Typography variant="body2" fontWeight={600}>{behaviorData.event_summary.total}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" color="text.secondary">Trip Distance</Typography>
                          <Typography variant="body2" fontWeight={600}>{behaviorData.trip_distance_km} km</Typography>
                        </Box>
                      </Box>
                    </Box>
                  )}

                  {drawerTab === 2 && behaviorData && (
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>Speed Distribution by Road Type</Typography>
                      <SpeedByRoad data={behaviorData} />
                      {tripData && (
                        <>
                          <Divider sx={{ my: 1.5 }} />
                          <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>Road Type Breakdown</Typography>
                          <Box sx={{ mt: 1 }}>
                            {(() => {
                              const counts: Record<string, number> = {};
                              tripData.route.slice(0, tripData.completed_index + 1).forEach(p => {
                                counts[p.road_type] = (counts[p.road_type] || 0) + 1;
                              });
                              const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
                              const colors: Record<string, string> = { highway: '#3b82f6', primary: '#8b5cf6', urban: '#f59e0b' };
                              return (
                                <>
                                  <Box sx={{ display: 'flex', height: 12, borderRadius: 2, overflow: 'hidden' }}>
                                    {Object.entries(counts).map(([rt, c]) => (
                                      <Box key={rt} sx={{ width: `${(c / total) * 100}%`, bgcolor: colors[rt] || '#888' }} />
                                    ))}
                                  </Box>
                                  <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                                    {Object.entries(counts).map(([rt, c]) => (
                                      <Box key={rt} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors[rt] || '#888' }} />
                                        <Typography variant="caption">{rt} {((c / total) * 100).toFixed(0)}%</Typography>
                                      </Box>
                                    ))}
                                  </Box>
                                </>
                              );
                            })()}
                          </Box>
                          <Divider sx={{ my: 1.5 }} />
                          <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>Adaptive Thresholds</Typography>
                          <Box sx={{ mt: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              Highway cornering: 0.25g (strict — swerving on highway is dangerous)
                            </Typography><br />
                            <Typography variant="caption" color="text.secondary">
                              Urban cornering: 0.45g (loose — sharp turns in city are expected)
                            </Typography><br />
                            <Typography variant="caption" color="text.secondary">
                              Harsh braking: -0.35g (all roads)
                            </Typography><br />
                            <Typography variant="caption" color="text.secondary">
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
                <Chip label={vehicleDetail.status === 'in_service' ? 'IN SERVICE' : 'PARKED'} color={vehicleDetail.status === 'in_service' ? 'warning' : 'default'} size="small" sx={{ borderRadius: '2px', fontWeight: 'bold' }} />
                <Typography variant="body2" sx={{ mt: 1, fontWeight: 'bold' }}>{vehicleDetail.city}</Typography>
                {vehicleDetail.module_health && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>MODULE HEALTH</Typography>
                    {Object.entries(vehicleDetail.module_health).map(([mod, val]) => (
                      <Box key={mod} sx={{ mt: 0.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="caption" sx={{ fontWeight: 'bold' }}>{mod.toUpperCase()}</Typography>
                          <Typography variant="caption" sx={{ fontWeight: 'bold', color: healthColor(val) }}>{val.toFixed(0)}%</Typography>
                        </Box>
                        <LinearProgress variant="determinate" value={val} sx={{ height: 4, borderRadius: 0, bgcolor: alpha(healthColor(val), 0.15), '& .MuiLinearProgress-bar': { bgcolor: healthColor(val), borderRadius: 0 } }} />
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            )}
          </Box>
        )}
      </Drawer>
    </Box>
  );
}