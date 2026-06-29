import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Paper, Chip, Select, MenuItem, FormControl, InputLabel,
  ToggleButton, ToggleButtonGroup, Button, TextField, CircularProgress, Tabs, Tab, LinearProgress,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Plot from 'react-plotly.js';
import { useStore } from '../store';
import { fetchApi, keepPreviousData, API } from '../hooks/useApi';
import { useChartTheme } from '../hooks/useChartTheme';
import { MODULE_COLORS, SEVERITY_BG_DARK, SEVERITY_BG_LIGHT } from '../constants/chartColors';
import EChart from '../components/EChart';
import type { EChartsOption } from 'echarts';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const ALL_MODULES = ['engine', 'transmission', 'battery', 'body', 'tyre'];
const BATCH_CAP = 15;

const MODULE_SENSOR_KEYS: Record<string, string[]> = {
  engine:       ['engine_rpm_rpm', 'engine_oil_temperature', 'ecu_7ea_engine_coolant_temperature', 'engine_load_absolute', 'fuel_flow_rate_hour_l_hr', 'turbo_boost_vacuum_gauge_psi', 'voltage_control_module_v'],
  battery:      ['battery_state_of_charge_soc_pct', 'battery_state_of_health_soh_pct', 'battery_voltage_ecu_7ee', 'battery_temperature_cell', 'internal_resistance_impedance', 'charging_power_kw', 'hv_battery_pack_voltage'],
  body:         ['cabin_temperature', 'fuel_level_pct', 'cabin_humidity_pct', 'hvac_blower_speed', 'ac_compressor_load_pct', 'distance_since_codes_cleared', 'odometer_reading'],
  transmission: ['transmission_oil_temperature', 'gear_position_actual', 'torque_converter_slip_speed', 'vehicle_speed_kmh', 'actual_engine_pct_torque', 'clutch_engagement_per_slip', 'engine_rpm'],
  tyre:         ['tyre_pressure_fl_psi', 'tyre_pressure_fr_psi', 'tyre_pressure_rl_psi', 'tyre_pressure_rr_psi', 'tyre_temp_fl_c', 'tyre_temp_fr_c', 'tyre_wear_fl_pct', 'tyre_wear_fr_pct', 'tyre_wear_rl_pct', 'tyre_wear_rr_pct'],
};

function sevColor(sev: string): string {
  return sev === 'critical' || sev === 'CRITICAL' ? '#d32f2f' : '#ed6c02';
}

function buildPlotLayout(darkMode: boolean) {
  const textColor = darkMode ? '#e8ecf0' : '#212121';
  const gridColor = darkMode ? '#2a3a4a' : '#e0e0e0';
  const lineColor = darkMode ? '#2a3a4a' : '#bdbdbd';
  const tickColor = darkMode ? '#8a9bb0' : '#616161';
  return {
    autosize: true,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'monospace', size: 10, color: textColor },
    margin: { t: 28, r: 12, b: 60, l: 50 },
    legend: { orientation: 'h' as const, y: -0.3, font: { size: 9, color: textColor } },
    xaxis: { gridcolor: gridColor, linecolor: lineColor, tickfont: { color: tickColor } },
    yaxis: { gridcolor: gridColor, linecolor: lineColor, tickfont: { color: tickColor } },
  };
}

function deduplicateAlerts(alerts: any[]): any[] {
  const map = new Map<string, any>();
  for (const alert of alerts) {
    const key = `${alert.source_id}|${alert.module}`;
    const existing = map.get(key);
    if (!existing || new Date(alert.peak_anomaly_ts) > new Date(existing.peak_anomaly_ts)) {
      map.set(key, alert);
    }
  }
  return Array.from(map.values());
}

interface BatchProgress {
  current: number;
  total: number;
  currentLabel: string;
  leftAfterCap: number;
}

interface BatchResult {
  analyzed: number;
  failed: number;
  leftAfterCap: number;
}

export default function DtcInvestigation() {
  const { autoRefresh, darkMode } = useStore();
  const theme = useTheme();
  const ct = useChartTheme();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const initVehicle = searchParams.get('vehicle') || '';
  const initModule  = searchParams.get('module')  || 'engine';
  const initPeakTs  = searchParams.get('peak_ts') || '';
  const initTabStr  = searchParams.get('tab')     || (initVehicle ? '1' : '0');

  const [activeTab,       setActiveTab]       = useState<number>(parseInt(initTabStr, 10));
  const [selectedVehicle, setSelectedVehicle] = useState<string>(initVehicle);
  const [selectedModule,  setSelectedModule]  = useState<string>(ALL_MODULES.includes(initModule) ? initModule : 'engine');
  const [peakTs,          setPeakTs]          = useState<string>(initPeakTs);
  const [evidenceWindow,  setEvidenceWindow]  = useState<number>(60);
  const [selectedSensor,  setSelectedSensor]  = useState<string>('');
  const [selectedDtcCode, setSelectedDtcCode] = useState<string>('');
  const [loadEvidence,    setLoadEvidence]    = useState<boolean>(!!initPeakTs && !!initVehicle);

  const [batchRunning,  setBatchRunning]  = useState<boolean>(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchResult,   setBatchResult]   = useState<BatchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { return () => { abortRef.current?.abort(); }; }, []);

  const sensorKeys = MODULE_SENSOR_KEYS[selectedModule] || [];

  useEffect(() => {
    if (sensorKeys.length === 0) return;
    const alerts = [
      ...(alertsMetricsQuery.data?.open_alerts || []),
      ...(alertsMetricsQuery.data?.closed_alerts || []),
    ].filter((a: Record<string, string>) => a.module === selectedModule);
    if (alerts.length > 0) {
      try {
        const feats = JSON.parse(String(alerts[0].top_10_features || '{}'));
        const topSensor = Object.entries(feats).sort(([, a], [, b]) => Number(b) - Number(a))[0]?.[0];
        if (topSensor && sensorKeys.includes(topSensor)) {
          setSelectedSensor(topSensor);
          return;
        }
      } catch {}
    }
    setSelectedSensor(sensorKeys[0]);
  }, [selectedModule]);

  const alertsMetricsQuery = useQuery({
    queryKey: ['alertsMetrics'],
    queryFn: fetchApi('/api/alerts/metrics'),
    refetchInterval: false,
    staleTime: 30000,
  });

  const fleetQuery = useQuery({
    queryKey: ['autoFleetSummary'],
    queryFn: fetchApi('/api/automotive/fleet-summary'),
    refetchInterval: false,
  });

  const dtcMasterQuery = useQuery({
    queryKey: ['dtcMaster'],
    queryFn: fetchApi('/api/automotive/dtc-master'),
    staleTime: Infinity,
  });

  const vehicleHistoryQuery = useQuery({
    queryKey: ['dtcVehicleHistory', selectedVehicle, selectedModule],
    queryFn: fetchApi(`/api/automotive/dtc-history/${selectedVehicle}`),
    enabled: !!selectedVehicle,
    placeholderData: keepPreviousData,
    refetchInterval: false,
  });

  const fleetDistributionQuery = useQuery({
    queryKey: ['dtcFleetDistribution'],
    queryFn: fetchApi('/api/automotive/dtc/fleet-distribution'),
    staleTime: 30000,
    refetchInterval: 10 * 60 * 1000,
  });

  const allHistoryQuery = useQuery({
    queryKey: ['dtcAllHistory'],
    queryFn: fetchApi('/api/automotive/dtc/history'),
    staleTime: 30000,
    refetchInterval: 10 * 60 * 1000,
  });

  const dtcAnalysisQuery = useQuery({
    queryKey: ['dtcAnalysis', selectedVehicle, selectedModule, peakTs],
    queryFn: ({ signal }) =>
      axios.get(`${API}/api/dtc/analyze`, {
        params: { source_id: selectedVehicle, module: selectedModule, peak_ts: peakTs },
        timeout: 70000,
        signal,
      }).then((r) => r.data),
    enabled: false,
    staleTime: Infinity,
    retry: false,
  });

  const sensorEvidenceQuery = useQuery({
    queryKey: ['dtcSensorEvidence', selectedVehicle, selectedModule, selectedSensor, peakTs, evidenceWindow],
    queryFn: ({ signal }) =>
      axios.get(`${API}/api/automotive/dtc-sensor-evidence/${selectedVehicle}/${selectedModule}/${selectedSensor}`, {
        params: { around_ts: peakTs, window: evidenceWindow },
        signal,
      }).then((r) => r.data),
    enabled: loadEvidence && !!selectedVehicle && !!selectedModule && !!selectedSensor,
    refetchInterval: false,
  });

  useEffect(() => {
    if (initVehicle && initPeakTs) dtcAnalysisQuery.refetch();
  }, []);

  useEffect(() => {
    if (dtcAnalysisQuery.isSuccess && (dtcAnalysisQuery.data as any)?.success) {
      queryClient.invalidateQueries({ queryKey: ['dtcVehicleHistory', selectedVehicle, selectedModule] });
      queryClient.invalidateQueries({ queryKey: ['dtcFleetDistribution'] });
      queryClient.invalidateQueries({ queryKey: ['dtcAllHistory'] });
    }
  }, [dtcAnalysisQuery.isSuccess, dtcAnalysisQuery.dataUpdatedAt]);

  const vehicles: any[] = fleetQuery.data?.vehicles || [];
  useEffect(() => {
    if (vehicles.length > 0 && !selectedVehicle) setSelectedVehicle(vehicles[0].vehicle_id);
  }, [fleetQuery.data]);

  const dtcMasterFlat = useMemo((): Record<string, any> => {
    const modules = dtcMasterQuery.data?.modules || {};
    const flat: Record<string, any> = {};
    Object.values(modules).forEach((codes: any) => {
      if (Array.isArray(codes)) codes.forEach((c: any) => { flat[c.dtc_code] = c; });
    });
    return flat;
  }, [dtcMasterQuery.data]);

  const selectedDtcDetail: any = selectedDtcCode ? dtcMasterFlat[selectedDtcCode] : null;

  const candidateRuns = useMemo((): any[] => {
    const allRuns: any[] = vehicleHistoryQuery.data?.runs || [];
    return allRuns.filter((r: any) => !selectedModule || r.module === selectedModule).slice(0, 30);
  }, [vehicleHistoryQuery.data, selectedModule]);

  const allTriggeredCodes = useMemo((): string[] => {
    const codes = new Set<string>();
    candidateRuns.forEach((r: any) => r.triggers?.forEach((t: any) => codes.add(t.code)));
    return Array.from(codes);
  }, [candidateRuns]);

  const distributionData = useMemo(
    () => (fleetDistributionQuery.data?.distribution || []).slice(0, 15) as any[],
    [fleetDistributionQuery.data],
  );

  const analyzedKeys = useMemo((): Set<string> => {
    const keys = new Set<string>();
    (allHistoryQuery.data?.runs || []).forEach((r: any) => {
      keys.add(`${r.source_id}|${r.module}|${r.peak_ts}`);
    });
    return keys;
  }, [allHistoryQuery.data]);

  const alertCoverage = useMemo(() => {
    const active: any[] = alertsMetricsQuery.data?.open_alerts || [];
    const deduped = deduplicateAlerts(active);
    const analyzed = deduped.filter((a) =>
      analyzedKeys.has(`${a.source_id}|${a.module}|${a.peak_anomaly_ts}`),
    ).length;
    return { analyzed, total: deduped.length, remaining: deduped.length - analyzed };
  }, [alertsMetricsQuery.data, analyzedKeys]);

  const perVehicleSummary = useMemo(() => {
    const runs: any[] = allHistoryQuery.data?.runs || [];
    const map = new Map<string, { runCount: number; codes: Map<string, { count: number; severity: string }>; lastRunTs: string }>();
    runs.forEach((r: any) => {
      if (!map.has(r.source_id)) map.set(r.source_id, { runCount: 0, codes: new Map(), lastRunTs: '' });
      const v = map.get(r.source_id)!;
      v.runCount++;
      if ((r.run_ts || '') > v.lastRunTs) v.lastRunTs = r.run_ts || '';
      (r.triggers || []).forEach((t: any) => {
        const c = v.codes.get(t.code);
        if (c) { c.count++; } else { v.codes.set(t.code, { count: 1, severity: t.severity || '' }); }
      });
    });
    return Array.from(map.entries()).map(([vehicle_id, v]) => {
      let topCode = '—'; let topSev = ''; let topCnt = 0;
      v.codes.forEach((val, code) => {
        if (val.count > topCnt) { topCnt = val.count; topCode = code; topSev = val.severity; }
      });
      return { vehicle_id, runCount: v.runCount, uniqueCodes: v.codes.size, topCode, topSev, topCnt, lastRunTs: v.lastRunTs };
    }).sort((a, b) => b.runCount - a.runCount);
  }, [allHistoryQuery.data]);

  const fleetKpis = useMemo(() => {
    const runs: any[] = allHistoryQuery.data?.runs || [];
    const allCodes = new Set<string>();
    let criticalCount = 0;
    runs.forEach((r: any) => {
      (r.triggers || []).forEach((t: any) => {
        allCodes.add(t.code);
        if (t.severity === 'critical' || t.severity === 'CRITICAL') criticalCount++;
      });
    });
    return { totalRuns: runs.length, uniqueFaults: allCodes.size, criticalCount, topCode: distributionData[0]?.code || '—' };
  }, [allHistoryQuery.data, distributionData]);

  const evidenceData: any[] = sensorEvidenceQuery.data?.data || [];

  const peakTsMs = useMemo((): number | null => {
    if (!peakTs) return null;
    const d = new Date(peakTs);
    return isNaN(d.getTime()) ? null : d.getTime();
  }, [peakTs]);

  const analysisData: any    = dtcAnalysisQuery.data;
  const analysisTriggered    = (analysisData?.triggers || []) as any[];
  const criticalPlot: any    = analysisData?.critical_plot    ?? null;
  const nonCriticalPlot: any = analysisData?.non_critical_plot ?? null;
  const canRun = !!selectedVehicle && !!selectedModule && !!peakTs;

  const navigateToDeepDive = (vehicle: string, module: string, peak_ts: string, dtcCode?: string) => {
    setSelectedVehicle(vehicle);
    setSelectedModule(ALL_MODULES.includes(module) ? module : 'engine');
    setPeakTs(peak_ts);
    if (dtcCode) setSelectedDtcCode(dtcCode);
    setActiveTab(1);
  };

  const handleLoadLatest = async () => {
    if (batchRunning) return;
    const active: any[] = alertsMetricsQuery.data?.open_alerts || [];
    const deduped = deduplicateAlerts(active);
    const toAnalyze = deduped
      .filter((a) => !analyzedKeys.has(`${a.source_id}|${a.module}|${a.peak_anomaly_ts}`))
      .sort((a, b) => (b.max_composite_score || 0) - (a.max_composite_score || 0));

    const queued = toAnalyze.slice(0, BATCH_CAP);
    const leftAfterCap = toAnalyze.length - queued.length;

    if (queued.length === 0) {
      setBatchResult({ analyzed: 0, failed: 0, leftAfterCap: 0 });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setBatchRunning(true);
    setBatchResult(null);

    let analyzed = 0;
    let failed = 0;

    for (let i = 0; i < queued.length; i++) {
      if (controller.signal.aborted) break;
      const alert = queued[i];
      setBatchProgress({
        current: i + 1,
        total: queued.length,
        currentLabel: `${alert.source_id} / ${alert.module.toUpperCase()}`,
        leftAfterCap,
      });
      try {
        await axios.get(`${API}/api/dtc/analyze`, {
          params: { source_id: alert.source_id, module: alert.module, peak_ts: alert.peak_anomaly_ts },
          timeout: 70000,
          signal: controller.signal,
        });
        analyzed++;
      } catch (_err: unknown) {
        if (!controller.signal.aborted) failed++;
      }
      queryClient.invalidateQueries({ queryKey: ['dtcFleetDistribution'] });
      queryClient.invalidateQueries({ queryKey: ['dtcAllHistory'] });
    }

    setBatchRunning(false);
    setBatchProgress(null);
    setBatchResult({ analyzed, failed, leftAfterCap });
  };

  const evidenceOption = useMemo((): EChartsOption => {
    const xData = evidenceData.map((r: any) => r.ts);
    const yData = evidenceData.map((r: any) => r.value);
    const peakIdx = xData.findIndex((ts: string) => ts === (peakTs || '').slice(0, 16));
    const markAreaData: any[] = [];
    const markPointData: any[] = [];
    if (peakTsMs && xData.length > 0) {
      const half = Math.floor(evidenceWindow * 0.25);
      const center = peakIdx >= 0 ? peakIdx : Math.floor(xData.length / 2);
      const s = Math.max(0, center - half);
      const e = Math.min(xData.length - 1, center + half);
      if (s < e) markAreaData.push([{ xAxis: xData[s], itemStyle: { color: 'rgba(211,47,47,0.08)' } }, { xAxis: xData[e] }]);
      if (peakIdx >= 0) markPointData.push({ xAxis: xData[peakIdx], yAxis: yData[peakIdx], symbol: 'pin', symbolSize: 20, itemStyle: { color: '#d32f2f' }, label: { show: false } });
    }
    return {
      tooltip: { trigger: 'axis', backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1, padding: [8, 12], textStyle: { fontFamily: 'monospace', fontSize: 11, color: ct.tooltipText }, axisPointer: { type: 'cross' } },
      dataZoom: [{ type: 'inside', xAxisIndex: 0 }, { type: 'slider', xAxisIndex: 0, bottom: 4, height: 18 }],
      grid: { top: 20, right: 16, bottom: 52, left: 50 },
      xAxis: { type: 'category', data: xData, axisLabel: { fontFamily: 'monospace', fontSize: 10, color: ct.axisColor }, axisLine: { lineStyle: { color: ct.tableBorder } }, axisTick: { show: false } },
      yAxis: { type: 'value', axisLabel: { fontFamily: 'monospace', fontSize: 10, color: ct.axisColor }, axisLine: { show: false }, axisTick: { show: false }, splitLine: { lineStyle: { type: 'dashed', color: ct.splitLineColor } } },
      series: [{
        type: 'line', data: yData, symbol: 'none',
        lineStyle: { color: MODULE_COLORS[selectedModule] || '#1976d2', width: 2 },
        itemStyle: { color: MODULE_COLORS[selectedModule] || '#1976d2' },
        markArea: markAreaData.length > 0 ? { data: [markAreaData[0]] } : undefined,
        markPoint: markPointData.length > 0 ? { data: markPointData, label: { show: false } } : undefined,
        markLine: peakIdx >= 0 ? { silent: true, symbol: 'none', data: [{ xAxis: xData[peakIdx], lineStyle: { color: '#d32f2f', type: 'dashed', width: 2 }, label: { formatter: 'PEAK', color: '#d32f2f', fontSize: 9, fontFamily: 'monospace' } }] } : undefined,
      }],
    } as EChartsOption;
  }, [evidenceData, peakTs, peakTsMs, evidenceWindow, selectedModule, ct]);

  const plotLayout = buildPlotLayout(darkMode);
  const axisStyle = { fontSize: '10px', fill: ct.axisColor, fontWeight: 600 };
  const tooltipStyle = { borderRadius: 0, fontSize: '11px', fontFamily: 'monospace', backgroundColor: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}`, color: ct.tooltipText };

  const tblHeader: React.CSSProperties = { textAlign: 'left', padding: '4px 12px', color: ct.tableHeaderText, fontWeight: 700, position: 'sticky', top: 0, background: ct.tableHeaderBg, boxShadow: `0 1px 0 ${ct.tableBorder}`, whiteSpace: 'nowrap' };
  const tblHeaderSm: React.CSSProperties = { ...tblHeader, padding: '4px 10px' };
  const tblRowEven: React.CSSProperties = { borderBottom: `1px solid ${ct.tableBorder}`, background: ct.tableRowEven, cursor: 'pointer' };
  const tblRowOdd: React.CSSProperties = { borderBottom: `1px solid ${ct.tableBorder}`, background: ct.tableRowOdd, cursor: 'pointer' };

  const sevBg = (sev: string) => sev === 'critical' || sev === 'CRITICAL'
    ? (darkMode ? SEVERITY_BG_DARK.CRITICAL : SEVERITY_BG_LIGHT.CRITICAL)
    : (darkMode ? SEVERITY_BG_DARK.WARNING : SEVERITY_BG_LIGHT.WARNING);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, bgcolor: 'background.default' }}>

      <Box sx={{ borderBottom: `2px solid ${theme.palette.divider}`, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', letterSpacing: '-0.5px' }}>
            DTC INVESTIGATION CENTER
          </Typography>
          {activeTab === 1 && initPeakTs && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
              Pre-populated from alert — Peak: {initPeakTs.slice(0, 16)} · Vehicle: {initVehicle} · Module: {initModule.toUpperCase()}
            </Typography>
          )}
        </Box>
        <Tabs
          value={activeTab}
          onChange={(_e, val: number) => setActiveTab(val)}
          sx={{
            minHeight: 36,
            '& .MuiTab-root': { fontWeight: 'bold', fontSize: '11px', fontFamily: 'monospace', minHeight: 36, borderRadius: 0 },
            '& .MuiTabs-indicator': { bgcolor: 'error.main', height: 3 },
          }}
        >
          <Tab label="FLEET OVERVIEW" />
          <Tab label="DEEP DIVE — VEHICLE / DTC" />
        </Tabs>
      </Box>

      {activeTab === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip
                size="small"
                label={alertsMetricsQuery.isLoading ? 'Loading alerts...' : `${alertCoverage.analyzed} / ${alertCoverage.total} active alerts analyzed`}
                sx={{
                  borderRadius: 0, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '10px', height: 22,
                  bgcolor: alertCoverage.remaining === 0 && alertCoverage.total > 0
                    ? (darkMode ? SEVERITY_BG_DARK.NORMAL : SEVERITY_BG_LIGHT.NORMAL)
                    : (darkMode ? SEVERITY_BG_DARK.WARNING : SEVERITY_BG_LIGHT.WARNING),
                  color: alertCoverage.remaining === 0 && alertCoverage.total > 0 ? theme.palette.success.main : theme.palette.warning.main,
                  border: `1px solid ${alertCoverage.remaining === 0 && alertCoverage.total > 0 ? theme.palette.success.main : theme.palette.warning.main}`,
                }}
              />
              {alertCoverage.remaining > 0 && !batchRunning && (
                <Chip
                  size="small"
                  label={`${alertCoverage.remaining} unanalyzed`}
                  sx={{
                    borderRadius: 0, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '10px', height: 22,
                    bgcolor: darkMode ? SEVERITY_BG_DARK.CRITICAL : SEVERITY_BG_LIGHT.CRITICAL,
                    color: theme.palette.error.main,
                    border: `1px solid ${theme.palette.error.main}`,
                  }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {batchRunning && (
                <Button variant="outlined" size="small" color="error" onClick={() => abortRef.current?.abort()} sx={{ borderRadius: 0, fontWeight: 'bold', fontSize: '11px', minWidth: 80 }}>
                  STOP
                </Button>
              )}
              <Button
                variant="contained"
                size="small"
                startIcon={batchRunning ? <CircularProgress size={12} color="inherit" /> : <PlayArrowIcon />}
                disabled={batchRunning || alertsMetricsQuery.isLoading}
                onClick={handleLoadLatest}
                sx={{ borderRadius: 0, boxShadow: 'none', fontWeight: 'bold', fontSize: '11px', bgcolor: '#1565c0', '&:hover': { bgcolor: '#0d47a1' }, minWidth: 140 }}
              >
                {batchRunning ? 'ANALYZING...' : 'LOAD LATEST'}
              </Button>
            </Box>
          </Box>

          {batchRunning && batchProgress && (
            <Paper sx={{ p: 1.5, borderRadius: 0, bgcolor: darkMode ? 'rgba(21,101,192,0.15)' : '#e3f2fd', border: `1px solid ${darkMode ? '#1565c0' : '#90caf9'}` }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#1976d2' }}>
                  ANALYZING {batchProgress.current} / {batchProgress.total}: {batchProgress.currentLabel}
                </Typography>
                {batchProgress.leftAfterCap > 0 && (
                  <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'warning.main', fontSize: '10px' }}>
                    +{batchProgress.leftAfterCap} more queued after this batch (cap {BATCH_CAP}/run)
                  </Typography>
                )}
              </Box>
              <LinearProgress
                variant="determinate"
                value={(batchProgress.current / batchProgress.total) * 100}
                sx={{ height: 6, borderRadius: 0, bgcolor: darkMode ? 'rgba(21,101,192,0.3)' : '#bbdefb', '& .MuiLinearProgress-bar': { bgcolor: '#1565c0' } }}
              />
            </Paper>
          )}

          {!batchRunning && batchResult !== null && (
            <Paper sx={{
              p: 1.5, borderRadius: 0,
              bgcolor: batchResult.leftAfterCap > 0
                ? (darkMode ? SEVERITY_BG_DARK.WARNING : '#fff8e1')
                : (darkMode ? SEVERITY_BG_DARK.NORMAL : '#e8f5e9'),
              border: `1px solid ${batchResult.leftAfterCap > 0 ? theme.palette.warning.main : theme.palette.success.main}`,
            }}>
              <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                {batchResult.analyzed === 0 && batchResult.leftAfterCap === 0
                  ? 'All active alerts already analyzed — fleet overview is up to date.'
                  : `${batchResult.analyzed} new alert${batchResult.analyzed !== 1 ? 's' : ''} analyzed.`}
                {batchResult.failed > 0 && ` ${batchResult.failed} failed (service error).`}
                {batchResult.leftAfterCap > 0 && (
                  <span style={{ color: theme.palette.warning.main, fontWeight: 'bold' }}>
                    {` ${batchResult.leftAfterCap} alert${batchResult.leftAfterCap !== 1 ? 's' : ''} not processed this run (cap ${BATCH_CAP}/run) — click LOAD LATEST again to continue.`}
                  </span>
                )}
              </Typography>
            </Paper>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            {([
              { label: 'TOTAL ANALYSIS RUNS',    value: fleetKpis.totalRuns,     color: '#1976d2' },
              { label: 'UNIQUE FAULT CODES SEEN', value: fleetKpis.uniqueFaults,  color: '#7b1fa2' },
              { label: 'CRITICAL FAULT TRIGGERS', value: fleetKpis.criticalCount, color: theme.palette.error.main },
              { label: 'TOP TRIGGERED CODE',      value: fleetKpis.topCode,       color: theme.palette.warning.main },
            ] as { label: string; value: string | number; color: string }[]).map((kpi, i) => (
              <Paper key={i} sx={{ flex: 1, p: 2, borderRadius: 0, borderLeft: `4px solid ${kpi.color}` }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', display: 'block' }}>{kpi.label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: kpi.color, mt: 0.5, fontFamily: 'monospace' }}>{kpi.value}</Typography>
              </Paper>
            ))}
          </Box>

          <Paper sx={{ p: 1.5, borderRadius: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>PER-VEHICLE DTC SUMMARY</Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '10px' }}>click row to investigate in Deep Dive</Typography>
            </Box>
            <Box sx={{ maxHeight: 200, overflowY: 'auto', border: `1px solid ${theme.palette.divider}` }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '11px' }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${ct.tableBorder}` }}>
                    {['VEHICLE', 'ANALYSES RUN', 'UNIQUE CODES', 'MOST PREVALENT', 'SEVERITY', 'LAST RUN'].map((h) => (
                      <th key={h} style={tblHeader}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {perVehicleSummary.length > 0 ? perVehicleSummary.map((row, i) => (
                    <tr key={row.vehicle_id} onClick={() => navigateToDeepDive(row.vehicle_id, selectedModule, '')} style={i % 2 === 0 ? tblRowEven : tblRowOdd} title="Click to open Deep Dive for this vehicle">
                      <td style={{ padding: '5px 12px', fontWeight: 700 }}>{row.vehicle_id}</td>
                      <td style={{ padding: '5px 12px', color: '#1976d2', fontWeight: 600 }}>{row.runCount}</td>
                      <td style={{ padding: '5px 12px' }}>{row.uniqueCodes}</td>
                      <td style={{ padding: '5px 12px' }}>
                        {row.topCode === '—' ? (
                          <span style={{ color: theme.palette.success.main, fontWeight: 600 }}>CLEAN</span>
                        ) : (
                          <span style={{ display: 'inline-block', padding: '1px 7px', fontSize: '10px', fontWeight: 700, background: sevColor(row.topSev), color: 'white' }}>
                            {row.topCode} ×{row.topCnt}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '5px 12px' }}>
                        {row.topSev ? <span style={{ fontWeight: 700, color: sevColor(row.topSev), textTransform: 'uppercase' }}>{row.topSev}</span> : '—'}
                      </td>
                      <td style={{ padding: '5px 12px', color: ct.axisColor }}>{row.lastRunTs.slice(0, 16) || '—'}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} style={{ padding: '12px', color: ct.axisColor, textAlign: 'center' }}>
                        {allHistoryQuery.isLoading ? 'Loading…' : 'No analyses yet — click LOAD LATEST to analyze active alerts'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Box>
          </Paper>

          <Box sx={{ display: 'flex', gap: 2, height: 400 }}>
            <Paper sx={{ flex: 1, p: 1.5, borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 0.5 }}>
                HISTORICAL FAULT FREQUENCY — most triggered codes across all runs
              </Typography>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                {distributionData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={distributionData} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={ct.gridColor} />
                      <XAxis type="number" tick={axisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                      <YAxis type="category" dataKey="code" tick={{ fontSize: 10, fontWeight: 700, fill: ct.axisColor, fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={70} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v: number, _name: string, props: any) => [`${v} runs · ${props.payload.vehicle_count} vehicle(s)`, props.payload.severity?.toUpperCase()]} />
                      <Bar dataKey="count" name="Occurrences" isAnimationActive={false}
                        label={{ position: 'right', fontSize: 9, fontWeight: 'bold', fill: ct.axisColor, fontFamily: 'monospace' }}
                        onClick={(data: any) => { setSelectedDtcCode(data.code); setActiveTab(1); }}
                        cursor="pointer"
                      >
                        {distributionData.map((d: any, i: number) => (
                          <Cell key={i} fill={d.severity === 'critical' || d.severity === 'CRITICAL' ? '#ef9a9a' : '#ffcc80'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 1 }}>
                    <Typography variant="caption" color="text.disabled">No data yet</Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '10px', textAlign: 'center' }}>
                      Click LOAD LATEST to run analysis on active alerts
                    </Typography>
                  </Box>
                )}
              </Box>
            </Paper>

            <Paper sx={{ flex: 1.2, p: 1.5, borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>ANALYSIS RUN LOG — all DTC analyses across fleet</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '10px', fontFamily: 'monospace' }}>click row to open in Deep Dive</Typography>
              </Box>
              <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', border: `1px solid ${theme.palette.divider}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${ct.tableBorder}` }}>
                      {['RUN TIME', 'VEHICLE', 'MODULE', 'CODES'].map((h) => (
                        <th key={h} style={tblHeaderSm}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(allHistoryQuery.data?.runs || []).map((run: any, i: number) => (
                      <tr key={i} onClick={() => navigateToDeepDive(run.source_id || '', run.module || 'engine', run.peak_ts || '')} style={i % 2 === 0 ? { ...tblRowEven, padding: undefined } : { ...tblRowOdd, padding: undefined }} title="Click to open Deep Dive for this run">
                        <td style={{ padding: '4px 10px', color: ct.axisColor }}>{String(run.run_ts || '—').slice(0, 16)}</td>
                        <td style={{ padding: '4px 10px', fontWeight: 600 }}>{run.source_id || '—'}</td>
                        <td style={{ padding: '4px 10px' }}>{(run.module || '—').toUpperCase()}</td>
                        <td style={{ padding: '4px 10px' }}>
                          {(run.triggers || []).length === 0 ? (
                            <span style={{ color: theme.palette.success.main, fontWeight: 600, fontSize: '10px' }}>CLEAR</span>
                          ) : (
                            (run.triggers as any[]).map((t: any, j: number) => (
                              <span key={j} onClick={(e) => { e.stopPropagation(); navigateToDeepDive(run.source_id || '', run.module || 'engine', run.peak_ts || '', t.code); }}
                                style={{ display: 'inline-block', marginRight: 4, padding: '1px 5px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', background: sevColor(t.severity), color: 'white' }}>
                                {t.code}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    ))}
                    {!(allHistoryQuery.data?.runs?.length) && (
                      <tr>
                        <td colSpan={4} style={{ padding: '10px', color: ct.axisColor, textAlign: 'center' }}>
                          {allHistoryQuery.isLoading ? 'Loading…' : 'No runs yet — click LOAD LATEST to analyze active alerts'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Box>
            </Paper>
          </Box>
        </Box>
      )}

      {activeTab === 1 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

          <Paper sx={{ p: 1.5, borderRadius: 0, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Vehicle</InputLabel>
              <Select value={selectedVehicle} onChange={(e) => setSelectedVehicle(e.target.value)} label="Vehicle" sx={{ borderRadius: 0 }}>
                {vehicles.map((v: any) => <MenuItem key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_id}</MenuItem>)}
              </Select>
            </FormControl>

            <ToggleButtonGroup value={selectedModule} exclusive size="small" sx={{ bgcolor: 'background.paper' }}
              onChange={(_e, val) => { if (val) { setSelectedModule(val); setSelectedSensor(MODULE_SENSOR_KEYS[val]?.[0] || ''); } }}>
              {ALL_MODULES.map((mod) => (
                <ToggleButton key={mod} value={mod} sx={{ fontWeight: 'bold', px: 1.5, borderRadius: 0, fontSize: '11px',
                  '&.Mui-selected': { bgcolor: MODULE_COLORS[mod], color: 'white', '&:hover': { bgcolor: MODULE_COLORS[mod] } } }}>
                  {mod.toUpperCase()}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>

            <TextField size="small" label="Peak Timestamp" value={peakTs} onChange={(e) => setPeakTs(e.target.value)}
              placeholder="YYYY-MM-DD HH:MM:SS"
              sx={{ minWidth: 220, '& .MuiOutlinedInput-root': { borderRadius: 0, fontFamily: 'monospace', fontSize: '12px' } }}
            />

            <Button variant="contained" color="error" size="small"
              startIcon={dtcAnalysisQuery.isFetching ? <CircularProgress size={12} color="inherit" /> : <PlayArrowIcon />}
              disabled={!canRun || dtcAnalysisQuery.isFetching}
              onClick={() => dtcAnalysisQuery.refetch()}
              sx={{ borderRadius: 0, boxShadow: 'none', fontWeight: 'bold', fontSize: '11px', minWidth: 170 }}>
              {dtcAnalysisQuery.isFetching ? 'RUNNING ANALYSIS...' : 'RUN DTC ANALYSIS'}
            </Button>

            {!canRun && (
              <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '10px' }}>
                vehicle + peak timestamp required
              </Typography>
            )}
          </Paper>

          <Paper sx={{ p: 1.5, borderRadius: 0 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                DTC PREDICTION ENGINE — FAULT MATURATION ANALYSIS
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                {analysisData?.success === true && analysisTriggered.length === 0 && (
                  <Chip size="small" label="NO FAULTS TRIGGERED" sx={{ borderRadius: 0, bgcolor: darkMode ? SEVERITY_BG_DARK.NORMAL : '#e8f5e9', color: theme.palette.success.main, fontWeight: 'bold', fontSize: '10px', height: 20 }} />
                )}
                {analysisTriggered.length > 0 && (
                  <>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '10px', mr: 0.5 }}>TRIGGERED:</Typography>
                    {analysisTriggered.map((t: any, i: number) => (
                      <Chip key={i} size="small" label={`${t.code} · ${t.severity}`} onClick={() => setSelectedDtcCode(t.code)}
                        sx={{ borderRadius: 0, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '10px', height: 20, cursor: 'pointer',
                          bgcolor: sevBg(t.severity), color: sevColor(t.severity), border: `1px solid ${sevColor(t.severity)}` }} />
                    ))}
                  </>
                )}
              </Box>
            </Box>

            {dtcAnalysisQuery.isFetching ? (
              <Box sx={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2 }}>
                <CircularProgress color="error" size={32} />
                <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace' }}>
                  Running PyTorch DTC inference · {selectedVehicle} / {selectedModule.toUpperCase()} · this may take up to 60 s
                </Typography>
              </Box>
            ) : analysisData?.error ? (
              <Box sx={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="caption" sx={{ color: 'error.main', fontFamily: 'monospace', textAlign: 'center' }}>
                  {analysisData.error}
                </Typography>
              </Box>
            ) : (criticalPlot || nonCriticalPlot) ? (
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'error.main', display: 'block', mb: 0.5 }}>
                    CRITICAL FAULT MATURATION
                  </Typography>
                  {criticalPlot ? (
                    <Plot data={criticalPlot.data} layout={{ ...(criticalPlot.layout || {}), ...plotLayout }} style={{ width: '100%', height: 300 }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
                  ) : (
                    <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${theme.palette.divider}` }}>
                      <Typography variant="caption" color="text.disabled">No critical fault activity detected</Typography>
                    </Box>
                  )}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'warning.main', display: 'block', mb: 0.5 }}>
                    NON-CRITICAL FAULT MATURATION
                  </Typography>
                  {nonCriticalPlot ? (
                    <Plot data={nonCriticalPlot.data} layout={{ ...(nonCriticalPlot.layout || {}), ...plotLayout }} style={{ width: '100%', height: 300 }} useResizeHandler config={{ displayModeBar: false, responsive: true }} />
                  ) : (
                    <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px dashed ${theme.palette.divider}` }}>
                      <Typography variant="caption" color="text.disabled">No non-critical fault activity detected</Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            ) : (
              <Box sx={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace' }}>
                  Select vehicle + module + peak timestamp, then click RUN DTC ANALYSIS
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '10px' }}>
                  Runs PyTorch ML models · produces critical and non-critical fault maturation curves
                </Typography>
              </Box>
            )}
          </Paper>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Paper sx={{ flex: 2, borderRadius: 0, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                  VEHICLE ANALYSIS HISTORY — {selectedVehicle || '—'} / {selectedModule.toUpperCase()}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontFamily: 'monospace', fontSize: '10px' }}>click row to load peak_ts · click code to inspect</Typography>
              </Box>
              <Box sx={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${theme.palette.divider}` }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${ct.tableBorder}` }}>
                      {['RUN TIME', 'PEAK TS', 'TRIGGERED CODES'].map((h) => (
                        <th key={h} style={tblHeader}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {candidateRuns.length > 0 ? candidateRuns.map((run: any, i: number) => (
                      <tr key={i} onClick={() => setPeakTs(run.peak_ts || '')} title="Click to load peak timestamp" style={i % 2 === 0 ? tblRowEven : tblRowOdd}>
                        <td style={{ padding: '5px 12px', color: ct.axisColor }}>{String(run.run_ts || '—').slice(0, 16)}</td>
                        <td style={{ padding: '5px 12px', fontWeight: peakTs === run.peak_ts ? 700 : 400, color: peakTs === run.peak_ts ? '#1976d2' : ct.axisColor }}>
                          {String(run.peak_ts || '—').slice(0, 16)}
                        </td>
                        <td style={{ padding: '5px 12px' }}>
                          {(run.triggers || []).length === 0 ? (
                            <span style={{ color: theme.palette.success.main, fontWeight: 600 }}>NO FAULTS</span>
                          ) : (
                            (run.triggers as any[]).map((t: any, j: number) => (
                              <span key={j} onClick={(e) => { e.stopPropagation(); setSelectedDtcCode(t.code); }} title="Click to inspect DTC detail"
                                style={{ display: 'inline-block', marginRight: 6, padding: '2px 7px', fontSize: '10px', fontWeight: 700, cursor: 'pointer', borderRadius: 1,
                                  background: t.code === selectedDtcCode ? '#1976d2' : sevColor(t.severity), color: 'white' }}>
                                {t.code}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} style={{ padding: '10px 12px', color: ct.axisColor, textAlign: 'center' }}>
                          {vehicleHistoryQuery.isLoading ? 'Loading…' : 'No analysis runs yet — click RUN DTC ANALYSIS above to start'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Box>
            </Paper>

            <Paper sx={{ flex: 1, borderRadius: 0, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>DTC DETAIL PANEL</Typography>
              {selectedDtcDetail ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Typography variant="h6" sx={{ fontWeight: 800, fontFamily: 'monospace', color: 'text.primary' }}>{selectedDtcDetail.dtc_code}</Typography>
                    <Chip size="small" label={selectedDtcDetail.severity?.toUpperCase() || '?'}
                      sx={{ borderRadius: 0, fontWeight: 'bold', fontSize: '10px', bgcolor: sevColor(selectedDtcDetail.severity), color: 'white', height: 18 }} />
                    <Chip size="small" label={selectedDtcDetail.category}
                      sx={{ borderRadius: 0, fontWeight: 'bold', fontSize: '10px', bgcolor: darkMode ? 'rgba(25,118,210,0.2)' : '#e3f2fd', color: '#1976d2', height: 18 }} />
                  </Box>
                  <Box sx={{ p: 1, bgcolor: 'background.default', border: `1px solid ${theme.palette.divider}` }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', fontFamily: 'monospace', display: 'block', mb: 0.5 }}>DESCRIPTION</Typography>
                    <Typography variant="body2" sx={{ fontSize: '12px', fontFamily: 'monospace', color: 'text.primary' }}>{selectedDtcDetail.description}</Typography>
                  </Box>
                  <Box sx={{ p: 1, bgcolor: sevBg(selectedDtcDetail.severity), border: `1px solid ${sevColor(selectedDtcDetail.severity)}` }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', fontFamily: 'monospace', display: 'block', mb: 0.5 }}>DASHBOARD MESSAGE</Typography>
                    <Typography variant="body2" sx={{ fontSize: '11px', fontFamily: 'monospace', color: sevColor(selectedDtcDetail.severity) }}>{selectedDtcDetail.dashboard_message}</Typography>
                  </Box>
                  {selectedDtcDetail.features?.length > 0 && (
                    <Box>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', fontFamily: 'monospace', display: 'block', mb: 0.5 }}>MONITORED FEATURES</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {(selectedDtcDetail.features as string[]).map((f: string) => (
                          <Chip key={f} size="small" label={f.replace(/_/g, ' ')} onClick={() => { setSelectedSensor(f); setLoadEvidence(true); }}
                            sx={{ borderRadius: 0, fontFamily: 'monospace', fontSize: '10px', height: 18, cursor: 'pointer', bgcolor: darkMode ? SEVERITY_BG_DARK.NORMAL : '#e8f5e9' }} />
                        ))}
                      </Box>
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '9px', mt: 0.5, display: 'block' }}>click feature chip to load sensor evidence</Typography>
                    </Box>
                  )}
                </Box>
              ) : (
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                  <Typography variant="caption" sx={{ color: 'text.disabled', textAlign: 'center' }}>
                    Click a DTC code from the triggered chips or history table
                  </Typography>
                  {allTriggeredCodes.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'center' }}>
                      {allTriggeredCodes.map((code) => (
                        <Chip key={code} size="small" label={code} onClick={() => setSelectedDtcCode(code)}
                          sx={{ borderRadius: 0, fontFamily: 'monospace', fontWeight: 'bold', fontSize: '10px', cursor: 'pointer',
                            bgcolor: darkMode ? SEVERITY_BG_DARK.CRITICAL : SEVERITY_BG_LIGHT.CRITICAL, color: 'error.main' }} />
                      ))}
                    </Box>
                  )}
                </Box>
              )}
            </Paper>
          </Box>

          <Paper sx={{ p: 1.5, borderRadius: 0, height: 320, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                SENSOR EVIDENCE — {selectedVehicle} / {selectedModule.toUpperCase()}
                {peakTs && <span style={{ color: theme.palette.error.main, marginLeft: 6 }}>PEAK {peakTs.slice(0, 16)}</span>}
              </Typography>
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel>Sensor</InputLabel>
                <Select value={selectedSensor} onChange={(e) => setSelectedSensor(e.target.value)} label="Sensor" sx={{ borderRadius: 0 }}>
                  {sensorKeys.map((k) => <MenuItem key={k} value={k}>{k.replace(/_/g, ' ').toUpperCase()}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Window (min)</InputLabel>
                <Select value={evidenceWindow} onChange={(e) => setEvidenceWindow(Number(e.target.value))} label="Window (min)" sx={{ borderRadius: 0 }}>
                  {[30, 60, 120, 240, 480].map((w) => <MenuItem key={w} value={w}>{w} min</MenuItem>)}
                </Select>
              </FormControl>
              <Button variant="contained" size="small" disabled={!selectedVehicle || !selectedSensor} onClick={() => setLoadEvidence(true)} sx={{ borderRadius: 0, boxShadow: 'none', fontWeight: 'bold', fontSize: '11px' }}>
                LOAD EVIDENCE
              </Button>
              {sensorEvidenceQuery.data?.data_source && (
                <Chip size="small" label={sensorEvidenceQuery.data.data_source} sx={{ borderRadius: 0, fontWeight: 'bold', fontSize: '10px', height: 18 }} />
              )}
            </Box>
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <EChart
                option={evidenceOption}
                loading={sensorEvidenceQuery.isFetching}
                empty={evidenceData.length === 0 && !sensorEvidenceQuery.isFetching}
                emptyText={loadEvidence ? 'No bronze data found for this vehicle/module/sensor' : 'Select vehicle, sensor, and click LOAD EVIDENCE'}
              />
            </Box>
          </Paper>

        </Box>
      )}
    </Box>
  );
}
