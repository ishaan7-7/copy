import React, { useMemo, useState } from 'react';
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
import { fetchApi } from '../hooks/useApi';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

export default function DashboardInference() {
  const { autoRefresh, darkMode } = useStore();
  const theme = useTheme();
  const ct = useChartTheme();

  const [viewMode, setViewMode] = useState<'metrics' | 'inspector'>('metrics');
  const [selectedModule, setSelectedModule] = useState<string>('engine');
  const [filterSim, setFilterSim] = useState<string>('ALL');

  const { data: metricsData, isLoading: metricsLoading, isError: metricsError } = useQuery({
    queryKey: ['inferenceMetrics'],
    queryFn: fetchApi('/api/inference/metrics'),
    refetchInterval: (viewMode === 'metrics' && autoRefresh) ? 3000 : false,
  });

  const { data: inspectorData, isLoading: inspectorLoading, refetch: refetchInspector } = useQuery({
    queryKey: ['inferenceTail', selectedModule],
    queryFn: fetchApi(`/api/inference/tail/${selectedModule}`),
    enabled: viewMode === 'inspector',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (d: { data: any[] }) => d.data,
    staleTime: 60000,
  });

  const metricsRowData = useMemo(() => {
    if (!metricsData || !metricsData.module_stats) return [];
    return Object.entries(metricsData.module_stats).map(([moduleName, stats]: [string, any]) => ({
      module: moduleName,
      e2e_latency: stats.e2e_latency,
      inf_latency: stats.inf_latency,
      rows_5m: stats.rows_5m,
    }));
  }, [metricsData]);

  const metricsColumnDefs = useMemo<ColDef[]>(() => [
    { field: 'module', headerName: 'ML SUBSYSTEM', sortable: true, filter: true, flex: 1, minWidth: 150 },
    {
      field: 'e2e_latency',
      headerName: 'E2E LATENCY (ms)',
      flex: 1,
      minWidth: 150,
      type: 'numericColumn',
      cellStyle: (params: any) => params.value > 50000
        ? { color: theme.palette.error.main, fontWeight: 'bold' }
        : { color: theme.palette.success.main, fontWeight: 'normal' },
      valueFormatter: p => p.value?.toLocaleString(),
    },
    {
      field: 'inf_latency',
      headerName: 'PURE INFERENCE LATENCY (ms)',
      flex: 1,
      minWidth: 200,
      type: 'numericColumn',
      valueFormatter: p => p.value?.toLocaleString(),
    },
    { field: 'rows_5m', headerName: 'INFERENCES (LAST 5M)', flex: 1, minWidth: 180, type: 'numericColumn', valueFormatter: p => p.value?.toLocaleString() },
  ], [theme]);

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
    return Object.keys(inspectorData[0]).map(key => {
      const colDef: ColDef = {
        field: key,
        headerName: key.toUpperCase(),
        sortable: true,
        filter: true,
        width: key.includes('ts') || key.includes('hash') || key === 'top_features' ? 240 : 130,
      };

      if (key === 'severity') {
        colDef.cellRenderer = (params: any) => {
          let color: 'success' | 'error' | 'warning' | 'info' = 'info';
          if (params.value === 'NORMAL') color = 'success';
          if (params.value === 'WARNING') color = 'warning';
          if (params.value === 'CRITICAL') color = 'error';
          return <Chip label={params.value || 'UNKNOWN'} color={color} size="small" sx={{ borderRadius: '2px', height: '20px', fontSize: '0.75rem', fontWeight: 'bold' }} />;
        };
      }

      if (key === 'top_features') {
        colDef.valueFormatter = (params: any) => {
          if (!params.value) return '';
          try {
            const parsed = JSON.parse(params.value);
            return Object.keys(parsed).join(', ');
          } catch (e) {
            return params.value;
          }
        };
      }

      if (key === 'health_score') {
        colDef.valueFormatter = (params: any) => params.value ? parseFloat(params.value).toFixed(2) + '%' : '';
      }

      return colDef;
    });
  }, [inspectorData]);

  const throughputChartData = useMemo(() => {
    if (!metricsData?.module_stats) return [];
    return Object.entries(metricsData.module_stats).map(([mod, stats]: [string, any]) => ({
      module: mod,
      rows: stats.rows_5m ?? 0,
      e2e: stats.e2e_latency ?? 0,
      inf: stats.inf_latency ?? 0,
    }));
  }, [metricsData]);

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
          ML ENGINE & SILVER LAYER PIPELINE
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <ToggleButtonGroup value={viewMode} exclusive onChange={(_e, val) => val && setViewMode(val)} size="small" sx={{ bgcolor: 'background.paper' }}>
            <ToggleButton value="metrics" sx={{ fontWeight: 'bold', px: 3, borderRadius: 0 }}>SYSTEM LATENCY METRICS</ToggleButton>
            <ToggleButton value="inspector" sx={{ fontWeight: 'bold', px: 3, borderRadius: 0 }}>SILVER DATA INSPECTOR</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {viewMode === 'metrics' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
            {[
              { label: 'ACTIVE SIMULATIONS', value: metricsData?.active_sims || 0 },
              { label: 'ACTIVE ML MODULES', value: `${metricsData?.active_modules || 0} / 5` },
              { label: 'GLOBAL E2E DELAY', value: `${metricsData?.global_e2e_ms?.toLocaleString() || 0} ms`, color: (metricsData?.global_e2e_ms || 0) > 50000 ? theme.palette.error.main : undefined },
              { label: 'GLOBAL INFERENCE DELAY', value: `${metricsData?.global_inf_ms?.toLocaleString() || 0} ms` },
            ].map((kpi, idx) => (
              <Paper key={idx} sx={{ flex: 1, p: 2, borderRadius: 0, borderLeft: `4px solid ${theme.palette.primary.main}` }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>{kpi.label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 'bold', color: kpi.color || 'text.primary', mt: 0.5 }}>{kpi.value}</Typography>
              </Paper>
            ))}
          </Box>

          <Paper sx={{ display: 'flex', flexDirection: 'column', p: 0, borderRadius: 0, flex: 1, minHeight: '220px' }}>
            <Box sx={{ p: 1, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: 'background.default' }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', ml: 1, color: 'text.secondary' }}>SUBSYSTEM LATENCY PROFILE:</Typography>
            </Box>
            <Box className={agTheme} sx={{ flexGrow: 1, width: '100%' }}>
              <AgGridReact
                rowData={metricsRowData}
                columnDefs={metricsColumnDefs}
                animateRows={false}
                rowSelection="single"
                defaultColDef={{ resizable: true, sortable: true }}
                overlayLoadingTemplate={metricsLoading ? '<span class="ag-overlay-loading-center">Fetching ML Telemetry...</span>' : undefined}
                overlayNoRowsTemplate={metricsError ? '<span class="ag-overlay-loading-center">ERROR: Backend Unreachable</span>' : undefined}
              />
            </Box>
          </Paper>

          <Box sx={{ display: 'flex', gap: 2, height: '240px' }}>
            <Paper sx={{ flex: 1, p: 2, borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>E2E VS PURE INFERENCE LATENCY (MS)</Typography>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metricsRowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
                  <XAxis dataKey="module" tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <YAxis tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <Tooltip cursor={{ fill: ct.tableRowEven }} contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold', color: ct.axisColor }} />
                  <Bar dataKey="e2e_latency" name="Total E2E Latency" fill={ct.gridColor} barSize={30} isAnimationActive={false} />
                  <Bar dataKey="inf_latency" name="PyTorch Compute Latency" fill="#1976d2" barSize={30} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
            <Paper sx={{ flex: 1, p: 2, borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>MODULE THROUGHPUT — ROWS PROCESSED (LAST 5M)</Typography>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={throughputChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={ct.gridColor} />
                  <XAxis dataKey="module" tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <YAxis tick={chartAxisStyle} axisLine={{ stroke: ct.tableBorder }} tickLine={false} />
                  <Tooltip cursor={{ fill: ct.tableRowEven }} contentStyle={tooltipStyle} />
                  <Bar dataKey="rows" name="Rows Processed" fill="#1976d2" barSize={30} isAnimationActive={false} label={{ position: 'top', fontSize: 10, fontWeight: 'bold', fill: ct.axisColor }} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Box>
        </Box>
      )}

      {viewMode === 'inspector' && (
        <Paper sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: 0, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <FormControl size="small" sx={{ minWidth: 250 }}>
              <InputLabel>Target ML Module</InputLabel>
              <Select value={selectedModule} onChange={(e) => { setSelectedModule(e.target.value); setFilterSim('ALL'); }} label="Target ML Module" sx={{ borderRadius: 0 }}>
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
              FETCH LATEST 100 INFERENCES
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
              *Inspector applies native AG Grid filtering. Use column headers to slice by Sim ID or Severity.
            </Typography>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Box className={agTheme} sx={{ flexGrow: 1, minHeight: 0, width: '100%' }}>
            <AgGridReact
              rowData={filteredInspectorData}
              columnDefs={inspectorColumnDefs}
              defaultColDef={{ resizable: true, sortable: true, filter: true }}
              overlayLoadingTemplate={inspectorLoading ? '<span class="ag-overlay-loading-center">Scanning Silver Parquet...</span>' : undefined}
              overlayNoRowsTemplate='<span class="ag-overlay-loading-center">No Inferences Available in Silver Layer</span>'
            />
          </Box>
        </Paper>
      )}
    </Box>
  );
}