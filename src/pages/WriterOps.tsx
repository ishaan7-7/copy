import React, { useMemo, useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Chip, Select, MenuItem,
  FormControl, InputLabel, ToggleButton, ToggleButtonGroup,
  Divider, Button,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Refresh';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import { ModuleRegistry, ClientSideRowModelModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-balham.css';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store';
import { useChartTheme } from '../hooks/useChartTheme';
import { fetchApi, liveInterval, useRefetchOnActivate } from '../hooks/useApi';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

export default function WriterOps({ isActive = true }: { isActive?: boolean }) {
  const { autoRefresh, darkMode } = useStore();
  const theme = useTheme();
  const ct = useChartTheme();

  const [viewMode, setViewMode] = useState<'operations' | 'inspector' | 'live'>('operations');
  const [selectedModule, setSelectedModule] = useState<string>('engine');
  const [filterModule, setFilterModule] = useState<string>('ALL');
  const [filterSim, setFilterSim] = useState<string>('ALL');
  const [inspectorVid, setInspectorVid] = useState<string>('');
  const [inspectorSource, setInspectorSource] = useState<string>('ALL (Latest)');

  const { data: metricsData, isLoading: metricsLoading, isError: metricsError, refetch: refetchMetrics } = useQuery({
    queryKey: ['writerMetrics'],
    queryFn: fetchApi('/api/writer/metrics'),
    refetchInterval: liveInterval(3000, isActive && viewMode === 'operations', autoRefresh),
  });

  const { data: inspectorData, isLoading: inspectorLoading, refetch: refetchInspector } = useQuery({
    queryKey: ['writerInspector', selectedModule],
    queryFn: fetchApi(`/api/writer/inspector/${selectedModule}`),
    enabled: viewMode === 'inspector',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (d: { data: any[] }) => d.data,
    staleTime: 60000,
  });

  const { data: observerData, refetch: refetchObserver } = useQuery({
    queryKey: ['observerSnapshot'],
    queryFn: fetchApi('/api/observer/snapshot'),
    enabled: viewMode === 'live',
    refetchInterval: liveInterval(3000, isActive && viewMode === 'live', autoRefresh),
  });

  useRefetchOnActivate(isActive && viewMode === 'operations', [refetchMetrics]);
  useRefetchOnActivate(isActive && viewMode === 'live', [refetchObserver]);

  const metricsRowData = useMemo(() => {
    if (!metricsData) return [];
    try {
      let rows = Object.values(metricsData) as any[];
      if (filterModule !== 'ALL') {
        rows = rows.filter(r => r.module?.toLowerCase() === filterModule.toLowerCase());
      }
      return rows;
    } catch (e) {
      return [];
    }
  }, [metricsData, filterModule]);

  const chartData = useMemo(() => {
    return metricsRowData.map(row => ({
      name: row.module,
      throughput: parseFloat(row.throughput || 0),
      latency: parseFloat(row.latency_ms || 0),
      lag: row.true_lag || 0,
    }));
  }, [metricsRowData]);

  const summaryStats = useMemo(() => {
    if (!metricsRowData.length) return { active: 0, written: 0, lag: 0, latency: 0 };
    const active = metricsRowData.filter(r => r.status === 'RUNNING').length;
    const written = metricsRowData.reduce((acc, r) => acc + (r.delta_total || 0), 0);
    const lag = metricsRowData.reduce((acc, r) => acc + (r.true_lag || 0), 0);
    const latencySum = metricsRowData.reduce((acc, r) => acc + (r.latency_ms || 0), 0);
    return { active, written, lag, latency: latencySum / metricsRowData.length };
  }, [metricsRowData]);

  const metricsColumnDefs = useMemo<ColDef[]>(() => [
    { field: 'module', headerName: 'SUBSYSTEM', sortable: true, filter: true, flex: 1, minWidth: 120 },
    {
      field: 'status',
      headerName: 'PROCESS STATUS',
      flex: 1,
      minWidth: 140,
      cellRenderer: (params: any) => {
        let color: 'success' | 'error' | 'warning' = 'error';
        if (params.value === 'RUNNING') color = 'success';
        if (params.value === 'STALLED') color = 'warning';
        return <Chip label={params.value || 'UNKNOWN'} color={color} size="small" sx={{ borderRadius: '2px', height: '20px', fontSize: '0.75rem', fontWeight: 'bold' }} />;
      },
    },
    { field: 'delta_total', headerName: 'DELTA RECORDS', flex: 1, minWidth: 130, type: 'numericColumn', valueFormatter: p => p.value?.toLocaleString() },
    {
      field: 'true_lag',
      headerName: 'SYSTEM LAG',
      flex: 1,
      minWidth: 130,
      type: 'numericColumn',
      cellStyle: (params: any): any => {
        if (params.value > 100) return {
          color: theme.palette.error.main,
          fontWeight: 'bold',
          backgroundColor: darkMode ? 'rgba(211,47,47,0.20)' : '#ffebee',
        };
        return { color: theme.palette.success.main };
      },
      valueFormatter: p => p.value?.toLocaleString(),
    },
    { field: 'throughput', headerName: 'IN RATE (r/s)', flex: 1, minWidth: 120, type: 'numericColumn' },
    { field: 'processed', headerName: 'OUT RATE (r/s)', flex: 1, minWidth: 120, type: 'numericColumn' },
    { field: 'latency_ms', headerName: 'LATENCY (ms)', flex: 1, minWidth: 120, type: 'numericColumn' },
  ], [theme, darkMode]);

  const availableSims = useMemo<string[]>(() => {
    if (!inspectorData || inspectorData.length === 0) return [];
    const sims = new Set<string>();
    inspectorData.forEach((row: any) => { if (row.source_id) sims.add(row.source_id); });
    return Array.from(sims).sort();
  }, [inspectorData]);

  const filteredInspectorData = useMemo(() => {
    if (!inspectorData) return [];
    if (filterSim === 'ALL') return inspectorData;
    return inspectorData.filter((row: any) => row.source_id === filterSim);
  }, [inspectorData, filterSim]);

  const inspectorColumnDefs = useMemo<ColDef[]>(() => {
    if (!inspectorData || inspectorData.length === 0) return [];
    return Object.keys(inspectorData[0]).map(key => ({
      field: key,
      headerName: key.toUpperCase(),
      sortable: true,
      filter: true,
      width: key.includes('ts') || key.includes('hash') ? 220 : 130,
    }));
  }, [inspectorData]);

  const observerVehicles: any[] = observerData?.vehicles || [];
  const observerHealth = observerData?.system_health || {};
  const observerGlobal = observerData?.global_stats || { total_rows: 0, active_vehicles: 0, avg_latency: 0, dlq_backlog: 0 };

  useEffect(() => {
    if (observerVehicles.length > 0 && !inspectorVid) {
      setInspectorVid(observerVehicles[0].vehicle_id);
    }
  }, [observerVehicles, inspectorVid]);

  const selectedInspectorV = observerVehicles.find((v: any) => v.vehicle_id === inspectorVid) || observerVehicles[0];
  const availableInspectorSources = ['ALL (Latest)', ...(selectedInspectorV?.module_payloads ? Object.keys(selectedInspectorV.module_payloads) : [])];

  const observerColDefs = useMemo<ColDef[]>(() => [
    { field: 'vehicle_id', headerName: 'VEHICLE ID', flex: 1, minWidth: 150, cellStyle: { fontWeight: 'bold', color: theme.palette.primary.main } as any },
    { field: 'rows_processed', headerName: 'PROCESSED', flex: 1, type: 'numericColumn', valueFormatter: (p: any) => p.value?.toLocaleString() },
    { field: 'rejected_rows', headerName: 'REJECTED', flex: 1, type: 'numericColumn', cellStyle: { color: theme.palette.error.main } as any },
    {
      field: 'validation_rate',
      headerName: 'QUALITY SCORE',
      flex: 1,
      valueFormatter: (p: any) => p.value != null ? `${p.value.toFixed(1)}%` : '',
      cellStyle: (p: any) => ({ color: p.value > 95 ? theme.palette.success.main : theme.palette.error.main, fontWeight: 'bold' }),
    },
    { field: 'avg_latency', headerName: 'LATENCY (ms)', flex: 1, type: 'numericColumn', valueFormatter: (p: any) => p.value?.toFixed(1) },
    { field: 'last_seen_sec', headerName: 'LAST SEEN', flex: 1, valueFormatter: (p: any) => p.value != null ? `${p.value.toFixed(1)}s ago` : '' },
  ], [theme]);

  const agTheme = darkMode ? 'ag-theme-balham-dark' : 'ag-theme-balham';
  const chartAxisStyle = { fontSize: '11px', fill: ct.axisColor, fontWeight: 600 };
  const tooltipStyle = {
    borderRadius: 0,
    fontSize: '12px',
    padding: '5px',
    backgroundColor: ct.tooltipBg,
    border: `1px solid ${ct.tooltipBorder}`,
    color: ct.tooltipText,
  };

  return (
    <Box sx={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: 2, p: 2, bgcolor: 'background.default' }}>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `2px solid ${theme.palette.divider}`, pb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', letterSpacing: '-0.5px' }}>
          BRONZE LAYER WRITER PIPELINE
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <ToggleButtonGroup value={viewMode} exclusive onChange={(_e, val) => val && setViewMode(val)} size="small" sx={{ bgcolor: 'background.paper' }}>
            <ToggleButton value="operations" sx={{ fontWeight: 'bold', px: 3, borderRadius: 0 }}>OPERATIONS METRICS</ToggleButton>
            <ToggleButton value="inspector" sx={{ fontWeight: 'bold', px: 3, borderRadius: 0 }}>DATA INSPECTOR</ToggleButton>
            <ToggleButton value="live" sx={{ fontWeight: 'bold', px: 3, borderRadius: 0 }}>LIVE STREAM MONITOR</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {viewMode === 'operations' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
            {[
              { label: 'ACTIVE WRITERS', value: `${summaryStats.active} / 5` },
              { label: 'TOTAL WRITTEN', value: summaryStats.written.toLocaleString() },
              { label: 'GLOBAL LAG', value: summaryStats.lag.toLocaleString(), color: summaryStats.lag > 500 ? theme.palette.error.main : theme.palette.success.main },
              { label: 'AVG LATENCY', value: `${summaryStats.latency.toFixed(1)} ms` },
            ].map((kpi, idx) => (
              <Paper key={idx} sx={{ flex: 1, p: 2, borderRadius: 0, borderLeft: `4px solid ${theme.palette.text.secondary}` }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>{kpi.label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: kpi.color || 'text.primary', mt: 0.5 }}>{kpi.value}</Typography>
              </Paper>
            ))}
          </Box>

          <Paper sx={{ display: 'flex', flexDirection: 'column', p: 0, borderRadius: 0, flex: 1, minHeight: '220px' }}>
            <Box sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', gap: 2, bgcolor: 'background.default' }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', ml: 1, color: 'text.secondary' }}>FILTER CONTEXT:</Typography>
              <FormControl size="small" sx={{ minWidth: 200, bgcolor: 'background.paper' }}>
                <Select value={filterModule} onChange={(e) => setFilterModule(e.target.value)} sx={{ borderRadius: 0, height: '30px', fontSize: '13px' }}>
                  <MenuItem value="ALL">ALL MODULES</MenuItem>
                  <MenuItem value="BATTERY">BATTERY</MenuItem>
                  <MenuItem value="BODY">BODY</MenuItem>
                  <MenuItem value="ENGINE">ENGINE</MenuItem>
                  <MenuItem value="TRANSMISSION">TRANSMISSION</MenuItem>
                  <MenuItem value="TYRE">TYRE</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <Box className={agTheme} sx={{ flexGrow: 1, width: '100%' }}>
              <AgGridReact
                rowData={metricsRowData}
                columnDefs={metricsColumnDefs}
                animateRows={false}
                rowSelection="single"
                defaultColDef={{ resizable: true, sortable: true }}
                overlayLoadingTemplate={metricsLoading ? '<span class="ag-overlay-loading-center">Fetching Telemetry...</span>' : undefined}
                overlayNoRowsTemplate={metricsError ? '<span class="ag-overlay-loading-center">ERROR: Backend Unreachable</span>' : undefined}
              />
            </Box>
          </Paper>

          <Box sx={{ display: 'flex', gap: 2, height: '240px' }}>
            <Paper sx={{ flex: 1, p: 2, borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>SYSTEM THROUGHPUT PROFILE (R/S)</Typography>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
                  <XAxis dataKey="name" tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <YAxis tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <Tooltip cursor={{ fill: ct.tableRowEven }} contentStyle={tooltipStyle} />
                  <Bar dataKey="throughput" fill="#1976d2" barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>

            <Paper sx={{ flex: 1, p: 2, borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>PROCESSING LATENCY VARIANCE (MS)</Typography>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
                  <XAxis dataKey="name" tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <YAxis tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="latency" stroke="#d32f2f" strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Box>
        </Box>
      )}

      {viewMode === 'inspector' && (
        <Paper sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 0, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 250 }}>
              <InputLabel>Target Parquet Module</InputLabel>
              <Select value={selectedModule} onChange={(e) => { setSelectedModule(e.target.value); setFilterSim('ALL'); }} label="Target Parquet Module" sx={{ borderRadius: 0 }}>
                <MenuItem value="battery">BATTERY</MenuItem>
                <MenuItem value="body">BODY</MenuItem>
                <MenuItem value="engine">ENGINE</MenuItem>
                <MenuItem value="transmission">TRANSMISSION</MenuItem>
                <MenuItem value="tyre">TYRE</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Filter Vehicle</InputLabel>
              <Select value={filterSim} onChange={(e) => setFilterSim(e.target.value)} label="Filter Vehicle" sx={{ borderRadius: 0 }}>
                <MenuItem value="ALL">ALL VEHICLES</MenuItem>
                {availableSims.map(sim => (
                  <MenuItem key={sim} value={sim}>{sim}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="contained" color="primary" onClick={() => refetchInspector()} disabled={inspectorLoading} startIcon={<RefreshIcon />} sx={{ borderRadius: 0, fontWeight: 'bold', height: '40px', boxShadow: 'none' }}>
              FETCH LATEST 100 ROWS
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              *Inspector reads raw parquet files directly from disk. Auto-refresh disabled.
            </Typography>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Box className={agTheme} sx={{ flexGrow: 1, minHeight: 0, width: '100%' }}>
            <AgGridReact
              rowData={filteredInspectorData}
              columnDefs={inspectorColumnDefs}
              defaultColDef={{ resizable: true, sortable: true, filter: true }}
              overlayLoadingTemplate={inspectorLoading ? '<span class="ag-overlay-loading-center">Scanning Parquet...</span>' : undefined}
              overlayNoRowsTemplate='<span class="ag-overlay-loading-center">No Parquet Data Available in Bronze Layer</span>'
            />
          </Box>
        </Paper>
      )}

      {viewMode === 'live' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Paper sx={{ p: 2, borderRadius: 0, display: 'flex', gap: 2, flexWrap: 'wrap', flex: 1.5, borderLeft: `4px solid ${theme.palette.primary.main}` }}>
              {Object.entries(observerHealth).map(([name, isUp]: [string, any]) => (
                <Chip key={name} label={name.toUpperCase()} color={isUp ? 'success' : 'error'} size="small" variant={isUp ? 'outlined' : 'filled'} sx={{ borderRadius: '2px', fontWeight: 'bold' }} />
              ))}
              {Object.keys(observerHealth).length === 0 && <Typography variant="caption" color="text.secondary">AWAITING HEALTH DATA</Typography>}
            </Paper>
            {[
              { label: 'TOTAL THROUGHPUT', value: observerGlobal.total_rows.toLocaleString() },
              { label: 'ACTIVE FLEET', value: observerGlobal.active_vehicles },
              { label: 'DLQ BACKLOG', value: observerGlobal.dlq_backlog, color: observerGlobal.dlq_backlog > 0 ? theme.palette.error.main : undefined },
            ].map((kpi, idx) => (
              <Paper key={idx} sx={{ flex: 1, p: 2, borderRadius: 0, borderLeft: `4px solid ${theme.palette.text.secondary}` }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>{kpi.label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: kpi.color || 'text.primary', mt: 0.5 }}>{kpi.value}</Typography>
              </Paper>
            ))}
          </Box>

          <Paper sx={{ display: 'flex', flexDirection: 'column', p: 0, borderRadius: 0, minHeight: '180px', maxHeight: '220px' }}>
            <Box sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: 'background.default' }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', ml: 1, color: 'text.secondary' }}>LIVE VEHICLE STATUS:</Typography>
            </Box>
            <Box className={agTheme} sx={{ flexGrow: 1, width: '100%' }}>
              <AgGridReact
                rowData={observerVehicles}
                columnDefs={observerColDefs}
                animateRows={false}
                rowSelection="single"
                defaultColDef={{ resizable: true, sortable: true }}
                overlayNoRowsTemplate='<span class="ag-overlay-loading-center">No Stream Data Available</span>'
              />
            </Box>
          </Paper>

          <Box sx={{ display: 'flex', gap: 2, height: '220px' }}>
            <Paper sx={{ flex: 1, p: 2, borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>LATENCY BY VEHICLE (ms)</Typography>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={observerVehicles} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
                  <XAxis dataKey="vehicle_id" tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <YAxis tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <Tooltip cursor={{ fill: ct.tableRowEven }} contentStyle={tooltipStyle} />
                  <Bar dataKey="avg_latency" name="Avg Latency (ms)" fill="#fbc02d" barSize={30} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
            <Paper sx={{ flex: 1, p: 2, borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>DATA QUALITY DISTRIBUTION</Typography>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={observerVehicles} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
                  <XAxis dataKey="vehicle_id" tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <YAxis tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <Tooltip cursor={{ fill: ct.tableRowEven }} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '12px', color: ct.tooltipText }} />
                  <Bar dataKey="rows_processed" name="Accepted" stackId="a" fill="#2e7d32" barSize={30} isAnimationActive={false} />
                  <Bar dataKey="rejected_rows" name="Rejected" stackId="a" fill="#c62828" barSize={30} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Box>

          <Paper sx={{ display: 'flex', flexDirection: 'column', p: 2, borderRadius: 0 }}>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <FormControl size="small" sx={{ minWidth: 200, bgcolor: 'background.paper' }}>
                <InputLabel>Target Vehicle</InputLabel>
                <Select value={inspectorVid} onChange={(e) => { setInspectorVid(e.target.value); setInspectorSource('ALL (Latest)'); }} label="Target Vehicle" sx={{ borderRadius: 0 }}>
                  {observerVehicles.map((v: any) => <MenuItem key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_id}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 200, bgcolor: 'background.paper' }}>
                <InputLabel>Payload Source</InputLabel>
                <Select value={inspectorSource} onChange={(e) => setInspectorSource(e.target.value)} label="Payload Source" sx={{ borderRadius: 0 }}>
                  {availableInspectorSources.map((src: string) => <MenuItem key={src} value={src}>{src}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ bgcolor: 'background.default', border: `1px solid ${theme.palette.divider}`, p: 2, maxHeight: '200px', overflow: 'auto' }}>
              <pre style={{ margin: 0, color: ct.tooltipText, fontFamily: 'Consolas, monospace', fontSize: '12px', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                {(() => {
                  if (!selectedInspectorV) return '// NO DATA FOR TARGET VEHICLE';
                  const payload = inspectorSource === 'ALL (Latest)'
                    ? selectedInspectorV.latest_payload
                    : selectedInspectorV.module_payloads?.[inspectorSource];
                  return payload ? JSON.stringify(payload, null, 2) : '// WAITING FOR PACKET...';
                })()}
              </pre>
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
}
