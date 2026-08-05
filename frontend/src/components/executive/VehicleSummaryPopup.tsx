import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Stack,
  Button,
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { alpha } from "@mui/material/styles";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from "recharts";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ErrorRoundedIcon from "@mui/icons-material/ErrorRounded";
import BuildRoundedIcon from "@mui/icons-material/BuildRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SpeedRoundedIcon from "@mui/icons-material/SpeedRounded";
import FavoriteRoundedIcon from "@mui/icons-material/FavoriteRounded";
import SensorsRoundedIcon from "@mui/icons-material/SensorsRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import { MODULE_COLORS } from "../../constants/chartColors";
import { getDtcDetails } from "../../utils/dtcKnowledge";
import { useStore } from "../../store";
import {
  convertDistance,
  convertSpeed,
  distanceUnitLabel,
  speedUnitLabel,
} from "../../utils/units";

const API = "http://127.0.0.1:8005";
const TOP_DRIVER_MODULES = ["engine", "transmission", "battery"];

function fmtDriverScore(s: number): string {
  return s >= 100 ? s.toFixed(0) : s >= 10 ? s.toFixed(1) : s.toFixed(3);
}

function formatFeatureKey(k: string): string {
  return k
    .replace(/_calculated/g, "")
    .replace(/_absolute/g, "")
    .replace(/_sensor_\d+/g, "")
    .replace(/_bank_\d+/g, "")
    .replace(/_pct$/g, "")
    .split("_")
    .filter((w) => w.length > 1 || /\d/.test(w))
    .slice(0, 4)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function findSensor(sensors: any[], key: string) {
  return sensors.find((s: any) => s.key === key) ?? null;
}

function formatXTick(val: string | number, mode: "timestamp" | "mileage"): string {
  if (mode === "mileage") {
    const km = Math.round(Number(val));
    return km >= 1000 ? `${(km / 1000).toFixed(1)}k` : `${km}`;
  }
  const s = String(val);
  if (s.includes("T")) return s.slice(5, 16).replace("T", " ");
  if (s.length >= 16) return s.slice(5, 16);
  return s;
}

export default function VehicleSummaryPopup({
  open,
  onClose,
  vehicleId,
  isDark,
}: {
  open: boolean;
  onClose: () => void;
  vehicleId: string | null;
  isDark: boolean;
}) {
  const region = useStore((s) => s.region);
  const queryClient = useQueryClient();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [xAxisMode, setXAxisMode] = useState<"timestamp" | "mileage">("timestamp");

  const enabled = open && !!vehicleId;

  const summaryQuery = useQuery({
    queryKey: ["vehSummaryPopup", vehicleId],
    queryFn: () => axios.get(`${API}/api/automotive/vehicle-summary/${vehicleId}`).then((r) => r.data),
    enabled,
    refetchInterval: enabled ? 15000 : false,
  });

  const healthHistQuery = useQuery({
    queryKey: ["vehHealthHistPopup", vehicleId],
    queryFn: () => axios.get(`${API}/api/automotive/vehicle-health-history/${vehicleId}`).then((r) => r.data),
    enabled,
    staleTime: 30000,
  });

  const behaviorQuery = useQuery({
    queryKey: ["vehBehaviorPopup", vehicleId],
    queryFn: () => axios.get(`${API}/api/fleet/vehicle/${vehicleId}/behavior`).then((r) => r.data),
    enabled,
    refetchInterval: enabled ? 8000 : false,
  });

  const alertsQuery = useQuery({
    queryKey: ["vehAlertsPopup", vehicleId],
    queryFn: () => axios.get(`${API}/api/automotive/alerts/${vehicleId}`).then((r) => r.data),
    enabled,
    refetchInterval: enabled ? 15000 : false,
  });

  const dtcHistoryQuery = useQuery({
    queryKey: ["vehDtcHistoryPopup", vehicleId],
    queryFn: () => axios.get(`${API}/api/automotive/dtc-history/${vehicleId}`).then((r) => r.data),
    enabled,
    refetchInterval: enabled ? 15000 : false,
  });

  const resolveMutation = useMutation({
    mutationFn: (alert: any) =>
      axios.post(`${API}/api/alerts/resolve/${encodeURIComponent(alert.alert_id)}`, null, {
        params: { source_id: vehicleId, module: alert.module },
      }),
    onMutate: async (alert: any) => {
      const key = ["vehAlertsPopup", vehicleId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<any>(key);
      if (previous) {
        const moved = (previous.open ?? []).find((a: any) => a.alert_id === alert.alert_id);
        queryClient.setQueryData(key, {
          ...previous,
          open: (previous.open ?? []).filter((a: any) => a.alert_id !== alert.alert_id),
          closed: moved ? [{ ...moved, status: "CLOSED" }, ...(previous.closed ?? [])] : previous.closed,
        });
      }
      return { previous };
    },
    onError: (_err, _alert, context: any) => {
      if (context?.previous) queryClient.setQueryData(["vehAlertsPopup", vehicleId], context.previous);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alertsMetrics"] });
    },
  });

  const handleInvestigate = async (alert: any) => {
    setAnalyzingId(alert.alert_id);
    try {
      const { data } = await axios.get(`${API}/api/dtc/analyze`, {
        params: { source_id: vehicleId, module: alert.module, peak_ts: alert.peak_anomaly_ts },
        timeout: 70000,
      });
      // Patch the analyze response straight into the dtc-history cache
      // instead of relying on a refetch landing after the write — same fix
      // as FleetAlertsPopup, so the row updates on the first click.
      if (data?.success) {
        const norm = (ts: string) => String(ts || "").slice(0, 16).replace(" ", "T");
        queryClient.setQueryData<any>(["vehDtcHistoryPopup", vehicleId], (prev: any) => {
          const runs: any[] = prev?.runs ?? [];
          const filtered = runs.filter(
            (r: any) => !(r.module === alert.module && norm(r.peak_ts) === norm(alert.peak_anomaly_ts))
          );
          const newRun = {
            source_id: vehicleId,
            module: alert.module,
            peak_ts: alert.peak_anomaly_ts,
            run_ts: new Date().toISOString(),
            triggers: data.triggers ?? [],
          };
          return { ...(prev ?? {}), runs: [newRun, ...filtered] };
        });
      }
      // No invalidateQueries here — same reasoning as FleetAlertsPopup: an
      // immediate refetch risks racing the write and clobbering the patch
      // above; the existing 15s poll reconciles with the server later.
    } catch {
      // Swallow — row stays unanalyzed, button re-enables for retry
    } finally {
      setAnalyzingId(null);
    }
  };

  const summaryData: any = summaryQuery.data;
  const behaviorData: any = behaviorQuery.data;
  const healthScore: number | null = summaryData?.health_snapshot?.health_score ?? null;
  const healthStatus: string = summaryData?.health_snapshot?.status ?? "UNKNOWN";
  const fleetRank: number | null = summaryData?.health_snapshot?.fleet_rank ?? null;
  const fleetTotal: number | null = summaryData?.health_snapshot?.fleet_total ?? null;
  const moduleContribs: Record<string, number> = summaryData?.health_snapshot?.module_contribs ?? {};
  const odometerKm: number | null = summaryData?.service_info?.odometer_km ?? null;
  const nextServiceKm: number | null = summaryData?.service_info?.next_service_in_km ?? null;
  const serviceProgress = odometerKm != null ? Math.min(100, ((odometerKm % 15000) / 15000) * 100) : 0;
  const fleetSimData: any = summaryData?.fleet_sim ?? {};
  const tripData: any = summaryData?.trip_data ?? null;
  const isVehicleActive = fleetSimData?.status === "active";
  const lastDtc: any = summaryData?.last_dtc ?? null;
  const dtcTriggers: any[] = lastDtc?.triggers ?? [];

  const topDrivers: any[] = (summaryData?.top_anomaly_drivers ?? []).filter((d: any) =>
    TOP_DRIVER_MODULES.includes(d.module)
  );
  // One driver per module (its highest-scoring feature), scaled against the
  // other two modules' top score — so at most one row ever reads 100%,
  // instead of every module's own top driver saturating its own bar.
  const topDriversFlat = useMemo(() => {
    const best = TOP_DRIVER_MODULES.map((mod) => {
      const inMod = topDrivers.filter((d) => d.module === mod).sort((a, b) => b.score - a.score);
      return inMod[0] ?? null;
    }).filter(Boolean) as any[];
    // Raw anomaly magnitude can differ by orders of magnitude across
    // modules, so a linear ratio against the max routinely rounded the
    // smaller two down to a visually-dead 0%. log1p compresses that range
    // so all three read as meaningfully non-zero, with a floor as a backstop.
    const maxLog = Math.max(...best.map((d) => Math.log1p(d.score)), 1e-6);
    return best.map((d) => ({ ...d, pct: maxLog > 0 ? Math.max(4, (Math.log1p(d.score) / maxLog) * 100) : 0 }));
  }, [topDrivers]);

  const healthChartData = useMemo(() => {
    const raw: any[] = healthHistQuery.data?.data ?? [];
    const factor = Math.max(1, Math.floor(raw.length / 150));
    const sampled = factor === 1 ? raw : raw.filter((_: any, i: number) => i % factor === 0);
    return sampled.map((r: any) => ({
      ts: r.ts || String(r.timestamp || "").slice(5, 16),
      mileage: r.mileage ?? 0,
      health: r.health,
    }));
  }, [healthHistQuery.data]);

  const vehicleOpenAlerts: any[] = alertsQuery.data?.open ?? [];
  const vehicleClosedAlerts: any[] = alertsQuery.data?.closed ?? [];
  const allVehicleAlerts = [...vehicleOpenAlerts, ...vehicleClosedAlerts];
  const dtcRuns: any[] = dtcHistoryQuery.data?.runs ?? [];
  const normPeakTs = (ts: string) => String(ts || "").slice(0, 16).replace(" ", "T");
  const dtcRunMap: Record<string, any> = {};
  for (const r of dtcRuns) dtcRunMap[`${r.module}|${normPeakTs(r.peak_ts)}`] = r;

  const kpi = summaryData?.kpi_snapshot ?? {};
  const engineSensors: any[] = kpi.engine?.sensors ?? [];
  const batterySensors: any[] = kpi.battery?.sensors ?? [];
  const bodySensors: any[] = kpi.body?.sensors ?? [];

  const sensorPairCards = [
    {
      title: "Engine RPM & Load",
      color: MODULE_COLORS.engine,
      a: findSensor(engineSensors, "engine_rpm_rpm"),
      b: findSensor(engineSensors, "engine_load_absolute"),
    },
    {
      title: "Oil & Coolant Temp",
      color: MODULE_COLORS.engine,
      a: findSensor(engineSensors, "engine_oil_temperature"),
      b: findSensor(engineSensors, "ecu_7ea_engine_coolant_temperature"),
    },
    {
      title: "Battery Voltage & Cell Temp",
      color: MODULE_COLORS.battery,
      a: findSensor(batterySensors, "battery_voltage_ecu_7ee"),
      b: findSensor(batterySensors, "battery_temperature_cell"),
    },
    {
      title: "Fuel & Cabin Temp",
      color: MODULE_COLORS.body,
      a: findSensor(bodySensors, "fuel_level_pct"),
      b: findSensor(bodySensors, "cabin_temperature"),
    },
  ];

  const sectionLabel = (color: string, text: string, icon?: React.ReactNode) => (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1 }}>
      <Box sx={{ width: 3, height: 14, borderRadius: 2, bgcolor: color }} />
      {icon}
      <Typography sx={{ fontSize: 11, fontWeight: 700, color: isDark ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>
        {text}
      </Typography>
    </Box>
  );

  const cardSx = {
    p: 1.25,
    borderRadius: 2,
    border: `1px solid ${isDark ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`,
    bgcolor: isDark ? alpha("#0f172a", 0.6) : "#fafbfc",
  };

  const isLoading = summaryQuery.isLoading;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          overflow: "hidden",
          bgcolor: isDark ? "#0c1628" : "#ffffff",
          border: `1px solid ${isDark ? alpha("#334155", 0.8) : alpha("#e2e8f0", 1)}`,
        },
      }}
    >
      <Box
        sx={{
          px: 2.5,
          pt: 2,
          pb: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: isDark
            ? `linear-gradient(135deg, ${alpha("#1e3a5f", 0.8)}, ${alpha("#0c1628", 0.95)})`
            : `linear-gradient(135deg, ${alpha("#eff6ff", 1)}, ${alpha("#f8fafc", 1)})`,
          borderBottom: `1px solid ${isDark ? alpha("#334155", 0.6) : alpha("#e2e8f0", 1)}`,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: isDark ? "#64748b" : "#94a3b8" }}>
            Vehicle Deep Dive
          </Typography>
          <Typography sx={{ fontSize: 20, fontWeight: 700, color: isDark ? "#f1f5f9" : "#0f172a" }}>
            {vehicleId}
          </Typography>
        </Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          {healthScore != null && (
            <Box
              sx={{
                px: 1.25,
                py: 0.5,
                borderRadius: 1.5,
                textAlign: "center",
                bgcolor: alpha(healthScore >= 80 ? "#22c55e" : healthScore >= 60 ? "#f59e0b" : "#ef4444", isDark ? 0.15 : 0.08),
                border: `1px solid ${alpha(healthScore >= 80 ? "#22c55e" : healthScore >= 60 ? "#f59e0b" : "#ef4444", 0.28)}`,
              }}
            >
              <Typography sx={{ fontSize: 8, fontWeight: 700, color: isDark ? "#64748b" : "#94a3b8", textTransform: "uppercase" }}>Health</Typography>
              <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1, color: healthScore >= 80 ? "#22c55e" : healthScore >= 60 ? "#f59e0b" : "#ef4444" }}>
                {healthScore.toFixed(0)}%
              </Typography>
            </Box>
          )}
          <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, bgcolor: isDark ? alpha("#334155", 0.5) : alpha("#e2e8f0", 0.8) }}>
            <Typography sx={{ fontSize: 8, fontWeight: 700, color: isDark ? "#64748b" : "#94a3b8", textTransform: "uppercase" }}>Status</Typography>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: isDark ? "#e2e8f0" : "#0f172a", textTransform: "capitalize" }}>
              {String(healthStatus).toLowerCase()}
            </Typography>
          </Box>
          {fleetRank != null && fleetTotal != null && (
            <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, bgcolor: isDark ? alpha("#334155", 0.5) : alpha("#e2e8f0", 0.8) }}>
              <Typography sx={{ fontSize: 8, fontWeight: 700, color: isDark ? "#64748b" : "#94a3b8", textTransform: "uppercase" }}>Fleet Rank</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: isDark ? "#e2e8f0" : "#0f172a" }}>
                {fleetRank} / {fleetTotal}
              </Typography>
            </Box>
          )}
          <IconButton size="small" onClick={onClose} sx={{ color: isDark ? "#64748b" : "#94a3b8", "&:hover": { bgcolor: alpha("#ef4444", 0.1), color: "#ef4444" } }}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      <DialogContent sx={{ p: 1.5, maxHeight: "82vh", bgcolor: isDark ? "#0a1220" : "#f8fafc" }}>
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={22} />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {/* ROW 1: 3 columns — deliberately no explicit height here. With
                alignItems:"stretch" (default) and no height on this row or
                its column children, the row auto-sizes to the tallest
                column's natural content height and the other two stretch to
                match exactly that — the standard equal-height-columns flex
                trick. A hardcoded height here previously left a lot of dead
                space below the shorter columns' content. */}
            <Box sx={{ display: "flex", gap: 1, alignItems: "stretch" }}>
              {/* Col A: Health Trend + Top Anomaly Drivers */}
              <Box sx={{ flex: "0 0 36%", display: "flex", flexDirection: "column", gap: 1, minWidth: 0, minHeight: 0 }}>
                <Box sx={{ ...cardSx, flexShrink: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                      <Box sx={{ width: 3, height: 14, borderRadius: 2, bgcolor: "#3b82f6" }} />
                      <Typography sx={{ fontSize: 11, fontWeight: 700, color: isDark ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>
                        Health Trend
                      </Typography>
                    </Box>
                    <ToggleButtonGroup
                      value={xAxisMode}
                      exclusive
                      onChange={(_e, val) => val && setXAxisMode(val)}
                      size="small"
                      sx={{
                        height: 20,
                        "& .MuiToggleButton-root": {
                          px: 0.75,
                          py: 0,
                          minHeight: 20,
                          borderRadius: 1,
                          fontSize: 8,
                          fontWeight: 700,
                          lineHeight: 1,
                        },
                      }}
                    >
                      <ToggleButton value="timestamp">Time</ToggleButton>
                      <ToggleButton value="mileage">Mileage</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>
                  <ResponsiveContainer width="100%" height={150}>
                    <LineChart data={healthChartData} margin={{ top: 4, right: 10, left: -25, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? alpha("#334155", 0.5) : "#e2e8f0"} />
                      <XAxis
                        dataKey={xAxisMode === "mileage" ? "mileage" : "ts"}
                        tick={{ fontSize: 8, fill: isDark ? "#64748b" : "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={40}
                        tickFormatter={(v) => formatXTick(v, xAxisMode)}
                      />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: isDark ? "#64748b" : "#94a3b8" }} axisLine={false} tickLine={false} />
                      <RTooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Health"]} contentStyle={{ fontSize: 10, borderRadius: 8, background: isDark ? "#0f172a" : "#fff", border: `1px solid ${isDark ? "#334155" : "#e2e8f0"}` }} />
                      <ReferenceLine y={60} stroke="#ef4444" strokeDasharray="4 4" />
                      <ReferenceLine y={80} stroke="#eab308" strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="health" stroke="#3b82f6" strokeWidth={2} dot={false} isAnimationActive={false} />
                      <Brush
                        dataKey={xAxisMode === "mileage" ? "mileage" : "ts"}
                        height={16}
                        stroke={isDark ? alpha("#7dd3fc", 0.5) : alpha("#3b82f6", 0.5)}
                        fill={isDark ? alpha("#0d2137", 0.85) : alpha("#e2eaf4", 0.9)}
                        travellerWidth={6}
                        tickFormatter={(v) => formatXTick(v, xAxisMode)}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Box>

                <Box sx={{ ...cardSx, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  {sectionLabel("#ef4444", "Top Anomaly Drivers")}
                  {topDriversFlat.length === 0 ? (
                    <Typography sx={{ fontSize: 10, color: "text.secondary", textAlign: "center", py: 2 }}>No anomaly data</Typography>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, flex: 1, minHeight: 0, overflow: "auto" }}>
                      {topDriversFlat.map((d: any, i: number) => {
                        const modColor = MODULE_COLORS[d.module] || "#0369a1";
                        return (
                          <Box
                            key={i}
                            sx={{ display: "flex", alignItems: "center", gap: 0.9, borderRadius: 1.5, bgcolor: alpha(modColor, isDark ? 0.1 : 0.06), border: `1px solid ${alpha(modColor, 0.22)}`, borderLeft: `3px solid ${modColor}`, p: 0.75 }}
                          >
                            <Typography sx={{ fontSize: 10, fontWeight: 600, flex: 1, color: isDark ? "#e2e8f0" : "#1e293b", fontFamily: "monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {formatFeatureKey(d.feature)}
                            </Typography>
                            <Box sx={{ width: 60, height: 6, borderRadius: 3, bgcolor: alpha(modColor, 0.18), flexShrink: 0, position: "relative", overflow: "hidden" }}>
                              <Box sx={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${d.pct}%`, bgcolor: modColor, borderRadius: 3 }} />
                            </Box>
                            <Typography sx={{ fontSize: 9.5, fontWeight: 700, fontFamily: "monospace", width: 32, textAlign: "right", color: modColor, flexShrink: 0 }}>{Math.round(d.pct)}%</Typography>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Box>

              {/* Col B: Service Info + Active Trip + Driver Behavior merged */}
              <Box sx={{ flex: "0 0 32%", display: "flex", flexDirection: "column", gap: 1, minWidth: 0, minHeight: 0 }}>
                <Box sx={{ ...cardSx, flex: 1, display: "flex", flexDirection: "column", gap: 1.25, minHeight: 0, overflow: "auto" }}>
                  {sectionLabel("#f59e0b", "Service, Trip & Driver", <BuildRoundedIcon sx={{ fontSize: 12, color: "#f59e0b" }} />)}

                  <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.75 }}>
                    <Box sx={{ p: 0.9, borderRadius: 1.5, bgcolor: isDark ? alpha("#1e293b", 0.6) : alpha("#f1f5f9", 0.8) }}>
                      <Typography sx={{ fontSize: 8, fontWeight: 600, color: isDark ? "#475569" : "#94a3b8", textTransform: "uppercase" }}>Odometer</Typography>
                      <Typography sx={{ fontSize: 15, fontWeight: 900, fontFamily: "monospace", color: isDark ? "#e2e8f0" : "#0f172a", lineHeight: 1 }}>
                        {odometerKm != null ? Math.round(convertDistance(odometerKm, region)).toLocaleString() : "--"}
                      </Typography>
                      <Typography sx={{ fontSize: 8, color: isDark ? "#475569" : "#94a3b8" }}>{distanceUnitLabel(region)} total</Typography>
                    </Box>
                    <Box sx={{ p: 0.9, borderRadius: 1.5, bgcolor: isDark ? alpha("#1e293b", 0.6) : alpha("#f1f5f9", 0.8) }}>
                      <Typography sx={{ fontSize: 8, fontWeight: 600, color: isDark ? "#475569" : "#94a3b8", textTransform: "uppercase" }}>Next Service</Typography>
                      <Typography sx={{ fontSize: 15, fontWeight: 900, fontFamily: "monospace", lineHeight: 1, color: nextServiceKm != null && nextServiceKm < 2000 ? "#ef4444" : nextServiceKm != null && nextServiceKm < 5000 ? "#f59e0b" : "#22c55e" }}>
                        {nextServiceKm != null ? Math.round(convertDistance(nextServiceKm, region)).toLocaleString() : "--"}
                      </Typography>
                      <Typography sx={{ fontSize: 8, color: isDark ? "#475569" : "#94a3b8" }}>{distanceUnitLabel(region)} remaining</Typography>
                    </Box>
                  </Box>
                  {odometerKm != null && (
                    <Box sx={{ height: 5, borderRadius: 3, bgcolor: isDark ? alpha("#1e293b", 0.8) : alpha("#e2e8f0", 0.8), overflow: "hidden" }}>
                      <Box sx={{ height: "100%", width: `${serviceProgress}%`, bgcolor: serviceProgress > 80 ? "#ef4444" : serviceProgress > 60 ? "#f59e0b" : "#22c55e", borderRadius: 3 }} />
                    </Box>
                  )}

                  {isVehicleActive && tripData && (
                    <Box sx={{ pt: 1, borderTop: `1px solid ${isDark ? alpha("#334155", 0.5) : alpha("#e2e8f0", 1)}` }}>
                      <Stack direction="row" alignItems="center" spacing={0.6} sx={{ mb: 0.6 }}>
                        <SpeedRoundedIcon sx={{ fontSize: 11, color: "#22c55e" }} />
                        <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: 0.5 }}>Active Trip</Typography>
                      </Stack>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.6, p: 0.6, borderRadius: 1, bgcolor: isDark ? alpha("#1e293b", 0.5) : alpha("#f1f5f9", 0.8) }}>
                        <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: isDark ? "#94a3b8" : "#475569", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tripData.origin || "--"}</Typography>
                        <Typography sx={{ fontSize: 9, color: isDark ? "#475569" : "#94a3b8" }}>→</Typography>
                        <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: isDark ? "#94a3b8" : "#475569", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{tripData.destination || "--"}</Typography>
                      </Box>
                      <Box sx={{ height: 4, borderRadius: 3, bgcolor: isDark ? alpha("#1e293b", 0.8) : alpha("#e2e8f0", 0.8), overflow: "hidden", mb: 0.4 }}>
                        <Box sx={{ height: "100%", width: `${Math.min(tripData.progress_pct ?? 0, 100)}%`, bgcolor: "#22c55e", borderRadius: 3 }} />
                      </Box>
                      <Typography sx={{ fontSize: 8, color: isDark ? "#475569" : "#94a3b8" }}>
                        {tripData.progress_pct != null ? `${tripData.progress_pct.toFixed(0)}%` : "--"} complete
                        {fleetSimData.speed != null ? ` · ${Math.round(convertSpeed(fleetSimData.speed, region))} ${speedUnitLabel(region)}` : ""}
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{ pt: 1, borderTop: `1px solid ${isDark ? alpha("#334155", 0.5) : alpha("#e2e8f0", 1)}`, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <Stack direction="row" alignItems="center" spacing={0.6} sx={{ mb: 0.6, flexShrink: 0 }}>
                      <PersonRoundedIcon sx={{ fontSize: 11, color: "#38bdf8" }} />
                      <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: 0.5 }}>Driver Behavior</Typography>
                    </Stack>
                    {behaviorData ? (
                      <>
                        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5, mb: 0.75 }}>
                          <Typography sx={{ fontSize: 26, fontWeight: 900, fontFamily: "monospace", lineHeight: 1, color: (behaviorData.current_score ?? 0) >= 85 ? "#22c55e" : (behaviorData.current_score ?? 0) >= 70 ? "#f59e0b" : "#ef4444" }}>
                            {behaviorData.current_score != null ? Math.round(behaviorData.current_score) : "--"}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: isDark ? "#475569" : "#94a3b8", fontFamily: "monospace" }}>/100</Typography>
                        </Box>
                        {behaviorData.event_summary && (
                          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0.5 }}>
                            {[
                              { label: "Braking", value: behaviorData.event_summary.braking, color: "#ef4444" },
                              { label: "Accel", value: behaviorData.event_summary.accel, color: "#f59e0b" },
                              { label: "Corners", value: behaviorData.event_summary.cornering, color: "#a855f7" },
                            ].map(({ label, value, color }) => (
                              <Box key={label} sx={{ p: 0.6, borderRadius: 1, bgcolor: isDark ? alpha("#1e293b", 0.5) : alpha("#f1f5f9", 0.8), textAlign: "center" }}>
                                <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color }}>{value ?? "--"}</Typography>
                                <Typography sx={{ fontSize: 8, color: isDark ? "#475569" : "#94a3b8" }}>{label}</Typography>
                              </Box>
                            ))}
                          </Box>
                        )}
                      </>
                    ) : (
                      <Typography sx={{ fontSize: 10, color: "text.secondary", textAlign: "center", py: 1 }}>
                        {behaviorQuery.isLoading ? "Loading…" : "Driver data unavailable"}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>

              {/* Col C: Module Health + Recent DTC */}
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, minWidth: 0, minHeight: 0 }}>
                <Box sx={{ ...cardSx, flexShrink: 0 }}>
                  {sectionLabel("#38bdf8", "Module Health", <FavoriteRoundedIcon sx={{ fontSize: 12, color: "#38bdf8" }} />)}
                  <Box sx={{ display: "flex", flexDirection: "column", gap: 0.65 }}>
                    {["engine", "transmission", "battery", "tyre", "body"].map((mod) => {
                      const modColor = MODULE_COLORS[mod] ?? "#94a3b8";
                      const score = moduleContribs[mod];
                      const statusColor = score == null ? (isDark ? "#475569" : "#94a3b8") : score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
                      return (
                        <Box key={mod} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: modColor, flexShrink: 0 }} />
                          <Typography sx={{ fontSize: 8, fontWeight: 600, color: isDark ? alpha(modColor, 0.85) : modColor, textTransform: "uppercase", letterSpacing: 0.3, width: 76, flexShrink: 0 }}>{mod}</Typography>
                          <Box sx={{ flex: 1, height: 4, borderRadius: 2, bgcolor: alpha(statusColor, isDark ? 0.12 : 0.1), overflow: "hidden" }}>
                            <Box sx={{ height: "100%", width: `${score ?? 0}%`, bgcolor: statusColor, borderRadius: 2 }} />
                          </Box>
                          <Typography sx={{ fontSize: 9, fontFamily: "monospace", width: 36, textAlign: "right", color: statusColor, flexShrink: 0, fontWeight: 600 }}>
                            {score != null ? `${score.toFixed(1)}%` : "—"}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>

                <Box sx={{ ...cardSx, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  {sectionLabel("#ef4444", "Recent DTC", <ErrorRoundedIcon sx={{ fontSize: 12, color: "#ef4444" }} />)}
                  {dtcTriggers.length === 0 ? (
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75, py: 2.5 }}>
                      <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "#22c55e", opacity: 0.7 }} />
                      <Typography sx={{ fontSize: 11, color: "text.secondary" }}>No DTC present</Typography>
                    </Box>
                  ) : (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, flex: 1, minHeight: 0, maxHeight: 200, overflow: "auto" }}>
                      {dtcTriggers.map((t: any, i: number) => {
                        const isCrit = t.severity === "CRITICAL";
                        const sevColor = isCrit ? "#ef4444" : "#f59e0b";
                        const details = t.code ? getDtcDetails(t.code) : null;
                        return (
                          <Box key={i} sx={{ borderRadius: 1.5, overflow: "hidden", border: `1px solid ${alpha(sevColor, 0.28)}`, bgcolor: alpha(sevColor, isDark ? 0.05 : 0.03), display: "flex" }}>
                            <Box sx={{ width: 3, flexShrink: 0, bgcolor: sevColor }} />
                            <Box sx={{ p: 0.9, flex: 1, minWidth: 0 }}>
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.6, mb: 0.4 }}>
                                <Box sx={{ px: 0.65, py: "1px", borderRadius: 1, bgcolor: alpha(sevColor, isDark ? 0.18 : 0.1), border: `1px solid ${alpha(sevColor, 0.35)}` }}>
                                  <Typography sx={{ fontSize: 9.5, fontWeight: 800, fontFamily: "monospace", color: sevColor }}>{t.code || "—"}</Typography>
                                </Box>
                                <Typography sx={{ fontSize: 7.5, fontWeight: 700, color: sevColor, textTransform: "uppercase" }}>{isCrit ? "Critical" : "Non-Critical"}</Typography>
                              </Box>
                              <Typography sx={{ fontSize: 9.5, fontWeight: 600, color: isDark ? "#cbd5e1" : "#1e293b", lineHeight: 1.3 }}>
                                {details?.description || t.message || "—"}
                              </Typography>
                              {details?.dashboard_message && (
                                <Typography sx={{ fontSize: 8.5, color: "#64748b", lineHeight: 1.35, mt: 0.2 }}>{details.dashboard_message}</Typography>
                              )}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>

            {/* ROW 2: Vehicle Alerts (full width) */}
            <Box sx={{ ...cardSx, p: 0 }}>
              <Box sx={{ px: 1.5, pt: 1.25, pb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <WarningAmberRoundedIcon sx={{ fontSize: 13, color: "#ef4444" }} />
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: isDark ? "text.primary" : "#005071", textTransform: "uppercase", letterSpacing: 0.8 }}>Vehicle Alerts</Typography>
                  <Box sx={{ px: 0.85, py: "2px", borderRadius: 1, bgcolor: alpha("#ef4444", isDark ? 0.14 : 0.08), border: `1px solid ${alpha("#ef4444", 0.28)}` }}>
                    <Typography sx={{ fontSize: 9, fontWeight: 700, color: "#ef4444" }}>{vehicleOpenAlerts.length} Open</Typography>
                  </Box>
                  <Box sx={{ px: 0.85, py: "2px", borderRadius: 1, bgcolor: alpha("#22c55e", isDark ? 0.12 : 0.07), border: `1px solid ${alpha("#22c55e", 0.25)}` }}>
                    <Typography sx={{ fontSize: 9, fontWeight: 700, color: "#22c55e" }}>{vehicleClosedAlerts.length} Resolved</Typography>
                  </Box>
                </Stack>
              </Box>
              {alertsQuery.isLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>Loading alerts…</Typography>
                </Box>
              ) : allVehicleAlerts.length === 0 ? (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0.75, py: 3 }}>
                  <CheckCircleRoundedIcon sx={{ fontSize: 18, color: "#22c55e", opacity: 0.7 }} />
                  <Typography sx={{ fontSize: 11, color: "text.secondary" }}>No alerts for this vehicle</Typography>
                </Box>
              ) : (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.9, p: 1.5, pt: 0, maxHeight: 420, overflow: "auto" }}>
                  {allVehicleAlerts.map((a: any, i: number) => {
                    const isOpenAlert = a.status === "OPEN";
                    const isAnalyzed = dtcRunMap[`${a.module}|${normPeakTs(a.peak_anomaly_ts)}`] != null;
                    const dtcRun = dtcRunMap[`${a.module}|${normPeakTs(a.peak_anomaly_ts)}`];
                    const scoreNum = Number(a.max_composite_score ?? 0);
                    const scoreColor = scoreNum >= 0.8 ? "#ef4444" : scoreNum >= 0.5 ? "#f59e0b" : "#22c55e";
                    const modColor = MODULE_COLORS[String(a.module || "").toLowerCase()] || "#0369a1";
                    const isAnalyzing = analyzingId === a.alert_id;
                    let featureEntries: { label: string; value: number }[] = [];
                    if (a.top_10_features) {
                      try {
                        const parsed = JSON.parse(a.top_10_features) as Record<string, number>;
                        const total = Object.values(parsed).reduce((s, v) => s + Math.abs(v), 0);
                        featureEntries = Object.entries(parsed).slice(0, 5).map(([k, v]) => ({ label: formatFeatureKey(k), value: total > 0 ? Math.round((Math.abs(v) / total) * 100) : 0 }));
                      } catch { featureEntries = []; }
                    }
                    const triggers: any[] = dtcRun?.triggers ?? [];
                    return (
                      <Box key={a.alert_id || i} sx={{ display: "flex", borderRadius: 2, overflow: "hidden", border: `1px solid ${isDark ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`, bgcolor: isDark ? alpha("#1e293b", 0.5) : "#ffffff" }}>
                        <Box sx={{ width: 4, flexShrink: 0, bgcolor: isOpenAlert ? "#ef4444" : "#22c55e" }} />
                        <Box sx={{ flex: 1, p: 1.25, display: "flex", gap: 1.5, alignItems: "flex-start", minWidth: 0 }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.6, flexWrap: "wrap" }}>
                              <Box sx={{ px: 0.75, py: "1px", borderRadius: "5px", fontSize: 9, fontWeight: 800, letterSpacing: 0.4, bgcolor: isOpenAlert ? alpha("#ef4444", isDark ? 0.18 : 0.1) : alpha("#22c55e", isDark ? 0.14 : 0.08), color: isOpenAlert ? "#ef4444" : "#22c55e", border: `1px solid ${isOpenAlert ? alpha("#ef4444", 0.3) : alpha("#22c55e", 0.25)}` }}>{isOpenAlert ? "OPEN" : "RESOLVED"}</Box>
                              <Box sx={{ px: 0.75, py: "1px", borderRadius: "5px", fontSize: 9, fontWeight: 800, letterSpacing: 0.4, bgcolor: alpha(modColor, isDark ? 0.16 : 0.1), color: modColor, border: `1px solid ${alpha(modColor, 0.28)}` }}>{String(a.module || "").toUpperCase()}</Box>
                              {isAnalyzed && (
                                <Stack direction="row" alignItems="center" spacing={0.4}>
                                  <CheckCircleRoundedIcon sx={{ fontSize: 11, color: "#22c55e" }} />
                                  <Typography sx={{ fontSize: 9, fontWeight: 600, color: "#22c55e" }}>Analyzed</Typography>
                                </Stack>
                              )}
                            </Stack>
                            <Typography sx={{ fontSize: 10, fontFamily: "monospace", color: isDark ? "#94a3b8" : "#64748b" }}>
                              Peak: {String(a.peak_anomaly_ts || "").slice(0, 19)}
                            </Typography>
                            {featureEntries.length > 0 && (
                              <Box sx={{ mt: 0.6, display: "flex", gap: 0.4, flexWrap: "wrap" }}>
                                {featureEntries.map((f, fi) => (
                                  <Box key={fi} sx={{ display: "inline-flex", alignItems: "center", gap: 0.4, px: 0.65, py: "1px", borderRadius: "5px", bgcolor: isDark ? alpha("#1e293b", 0.9) : alpha("#f1f5f9", 1), border: `1px solid ${isDark ? alpha("#475569", 0.35) : alpha("#cbd5e1", 1)}` }}>
                                    <Typography sx={{ fontSize: 8.5, fontWeight: 500, color: isDark ? "#94a3b8" : "#475569" }}>{f.label}</Typography>
                                    <Typography sx={{ fontSize: 8.5, fontWeight: 800, color: isDark ? "#e2e8f0" : "#0f172a", fontFamily: "monospace" }}>{f.value}%</Typography>
                                  </Box>
                                ))}
                              </Box>
                            )}
                            {isAnalyzed && (
                              <Box sx={{ mt: 0.6, pt: 0.6, borderTop: `1px solid ${isDark ? alpha("#334155", 0.5) : alpha("#e2e8f0", 1)}` }}>
                                <Typography sx={{ fontSize: 8.5, fontWeight: 700, color: isDark ? "#475569" : "#94a3b8", mb: 0.35, textTransform: "uppercase", letterSpacing: 0.4 }}>DTC Analysis</Typography>
                                {triggers.length === 0 ? (
                                  <Stack direction="row" alignItems="center" spacing={0.5}>
                                    <CheckCircleRoundedIcon sx={{ fontSize: 11, color: "#22c55e" }} />
                                    <Typography sx={{ fontSize: 9.5, color: isDark ? "#94a3b8" : "#475569" }}>No fault codes triggered</Typography>
                                  </Stack>
                                ) : (
                                  <Stack spacing={0.4}>
                                    {triggers.map((t: any, ti: number) => {
                                      const trigColor = t.severity === "CRITICAL" ? "#ef4444" : "#f59e0b";
                                      return (
                                        <Box key={ti} sx={{ display: "flex", alignItems: "flex-start", gap: 0.75, p: 0.6, borderRadius: 1.5, bgcolor: isDark ? alpha("#0f172a", 0.5) : alpha("#f8fafc", 1), border: `1px solid ${alpha(trigColor, 0.2)}` }}>
                                          <Box sx={{ px: 0.6, py: "1px", borderRadius: 1, bgcolor: alpha(trigColor, isDark ? 0.15 : 0.09), border: `1px solid ${alpha(trigColor, 0.3)}`, flexShrink: 0 }}>
                                            <Typography sx={{ fontSize: 9, fontWeight: 800, color: trigColor, fontFamily: "monospace" }}>{t.code}</Typography>
                                          </Box>
                                          <Typography sx={{ fontSize: 9.5, fontWeight: 600, color: isDark ? "#cbd5e1" : "#1e293b", lineHeight: 1.3 }}>{t.message || "—"}</Typography>
                                        </Box>
                                      );
                                    })}
                                  </Stack>
                                )}
                              </Box>
                            )}
                          </Box>
                          <Stack alignItems="flex-end" spacing={0.75} sx={{ flexShrink: 0 }}>
                            {a.max_composite_score != null && (
                              <Box sx={{ px: 1, py: 0.4, borderRadius: 1.5, bgcolor: alpha(scoreColor, isDark ? 0.14 : 0.08), border: `1px solid ${alpha(scoreColor, 0.25)}`, textAlign: "center" }}>
                                <Typography sx={{ fontSize: 12, fontWeight: 800, color: scoreColor, lineHeight: 1.2 }}>{scoreNum.toFixed(3)}</Typography>
                              </Box>
                            )}
                            {!isAnalyzed && (
                              <Button
                                size="small"
                                disabled={isAnalyzing}
                                onClick={() => handleInvestigate(a)}
                                startIcon={isAnalyzing ? <CircularProgress size={11} sx={{ color: "inherit" }} /> : undefined}
                                sx={{ fontSize: 9.5, fontWeight: 700, height: 24, px: 1.25, borderRadius: "6px", bgcolor: isDark ? alpha("#38bdf8", 0.1) : alpha("#0284c7", 0.07), color: isDark ? "#38bdf8" : "#0369a1", border: `1px solid ${isDark ? alpha("#38bdf8", 0.22) : alpha("#0284c7", 0.18)}`, "&:hover": { bgcolor: isDark ? alpha("#38bdf8", 0.18) : alpha("#0284c7", 0.13) } }}
                              >
                                {isAnalyzing ? "Analyzing…" : "Investigate"}
                              </Button>
                            )}
                            {isOpenAlert ? (
                              <Button
                                size="small"
                                disabled={resolveMutation.isPending}
                                onClick={() => resolveMutation.mutate(a)}
                                sx={{ fontSize: 9.5, fontWeight: 700, height: 24, px: 1.25, borderRadius: "6px", bgcolor: isDark ? alpha("#22c55e", 0.1) : alpha("#16a34a", 0.07), color: isDark ? "#22c55e" : "#15803d", border: `1px solid ${isDark ? alpha("#22c55e", 0.22) : alpha("#16a34a", 0.18)}`, "&:hover": { bgcolor: isDark ? alpha("#22c55e", 0.18) : alpha("#16a34a", 0.13) } }}
                              >
                                {resolveMutation.isPending && resolveMutation.variables?.alert_id === a.alert_id ? "Resolving…" : "Resolve"}
                              </Button>
                            ) : (
                              <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, height: 24, px: 1, borderRadius: "6px", bgcolor: alpha("#22c55e", 0.08) }}>
                                <CheckCircleRoundedIcon sx={{ fontSize: 11, color: "#22c55e" }} />
                              </Box>
                            )}
                          </Stack>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              )}
            </Box>

            {/* ROW 3: Live Sensors — 4 merged-pair cards */}
            <Box sx={cardSx}>
              {sectionLabel("#38bdf8", "Live Sensors", <SensorsRoundedIcon sx={{ fontSize: 12, color: "#38bdf8" }} />)}
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1 }}>
                {sensorPairCards.map((card) => (
                  <Box key={card.title} sx={{ p: 1, borderRadius: 1.5, bgcolor: isDark ? "#1e293b" : "#ffffff", border: `1px solid ${alpha(card.color, isDark ? 0.28 : 0.22)}` }}>
                    <Typography sx={{ fontSize: 8.5, fontWeight: 800, color: card.color, textTransform: "uppercase", letterSpacing: 0.4, mb: 0.6 }}>{card.title}</Typography>
                    {[card.a, card.b].map((s: any, i: number) => {
                      const v = s?.value as number | null | undefined;
                      const vStr = v != null ? (Number.isInteger(v) ? String(v) : v.toFixed(1)) : "—";
                      const outOfRange = v != null && s?.range_lo != null && s?.range_hi != null && (v < s.range_lo || v > s.range_hi);
                      return (
                        <Box key={i} sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", py: 0.3, borderTop: i > 0 ? `1px solid ${isDark ? alpha("#334155", 0.4) : alpha("#e2e8f0", 0.8)}` : "none", mt: i > 0 ? 0.4 : 0, pt: i > 0 ? 0.4 : 0 }}>
                          <Typography sx={{ fontSize: 9, fontWeight: 600, color: isDark ? "#64748b" : "#64748b" }}>{s?.label ?? "--"}</Typography>
                          <Stack direction="row" alignItems="baseline" spacing={0.3}>
                            <Typography sx={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: outOfRange ? "#ef4444" : v != null ? (isDark ? "#f1f5f9" : "#0f172a") : (isDark ? "#475569" : "#cbd5e1") }}>{vStr}</Typography>
                            {s?.unit && <Typography sx={{ fontSize: 8, fontWeight: 600, color: isDark ? "#64748b" : "#64748b" }}>{s.unit}</Typography>}
                          </Stack>
                        </Box>
                      );
                    })}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
