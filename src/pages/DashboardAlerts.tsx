import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, ToggleButton, ToggleButtonGroup, Button,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef } from 'ag-grid-community';
import { ModuleRegistry, ClientSideRowModelModule } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-balham.css';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '../store';
import { fetchApi } from '../hooks/useApi';
import { SEVERITY_BG_DARK, SEVERITY_BG_LIGHT } from '../constants/chartColors';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

export default function DashboardAlerts() {
  const { autoRefresh, darkMode } = useStore();
  const navigate = useNavigate();
  const theme = useTheme();

  const [activeTab, setActiveTab] = useState<'OPEN' | 'CLOSED'>('OPEN');

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['alertsMetrics'],
    queryFn: fetchApi('/api/alerts/metrics'),
    refetchInterval: autoRefresh ? 20000 : false,
  });

  const tableColDefs = useMemo<ColDef[]>(() => [
    {
      field: 'alert_id',
      headerName: 'ALERT ID',
      flex: 1,
      minWidth: 120,
      valueFormatter: (p) => (p.value ? p.value.substring(0, 8) : ''),
      cellStyle: { fontFamily: 'monospace', fontWeight: 'bold' },
    },
    {
      field: 'module',
      headerName: 'MODULE',
      flex: 1,
      minWidth: 130,
      valueFormatter: (p) => p.value?.toUpperCase(),
    },
    {
      field: 'source_id',
      headerName: 'VEHICLE',
      flex: 1,
      minWidth: 120,
    },
    {
      field: 'peak_anomaly_ts',
      headerName: 'PEAK ANOMALY TS',
      flex: 1.5,
      minWidth: 200,
    },
    {
      field: 'max_composite_score',
      headerName: 'SEVERITY SCORE',
      flex: 1,
      minWidth: 140,
      type: 'numericColumn',
      valueFormatter: (p) => (p.value ? parseFloat(p.value).toFixed(2) : ''),
    },
    {
      headerName: 'ACTION',
      width: 160,
      pinned: 'right',
      cellRenderer: (params: any) => (
        <Button
          size="small"
          variant="contained"
          color="error"
          startIcon={<PsychologyIcon />}
          onClick={() =>
            navigate(
              `/dtc?tab=1&vehicle=${encodeURIComponent(params.data.source_id)}&module=${encodeURIComponent(params.data.module)}&peak_ts=${encodeURIComponent(params.data.peak_anomaly_ts)}`,
            )
          }
          sx={{ height: '24px', fontSize: '10px', mt: 0.5, borderRadius: 0, boxShadow: 'none' }}
        >
          ROOT CAUSE
        </Button>
      ),
    },
  ], [navigate]);

  const activeBg = darkMode ? SEVERITY_BG_DARK.CRITICAL : SEVERITY_BG_LIGHT.CRITICAL;

  return (
    <Box sx={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: 2, p: 2, bgcolor: 'background.default' }}>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `2px solid ${theme.palette.divider}`, pb: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: 'text.primary', letterSpacing: '-0.5px' }}>
          OPERATIONS CENTER: FLEET ALERTS
        </Typography>

        <ToggleButtonGroup value={activeTab} exclusive onChange={(_e, val) => val && setActiveTab(val)} size="small" sx={{ bgcolor: 'background.paper' }}>
          <ToggleButton value="OPEN" sx={{ fontWeight: 'bold', px: 3, borderRadius: 0, color: 'error.main', '&.Mui-selected': { bgcolor: activeBg, color: 'error.main' } }}>
            🔴 ACTIVE (OPEN)
          </ToggleButton>
          <ToggleButton value="CLOSED" sx={{ fontWeight: 'bold', px: 3, borderRadius: 0 }}>
            📜 RESOLVED (CLOSED)
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, width: '100%' }}>
        {[
          { label: '🔴 ACTIVE ALERTS', value: metrics?.active_alerts_count?.toLocaleString() || 0, color: theme.palette.error.main },
          { label: '⚠️ CRITICAL VEHICLES', value: metrics?.critical_vehicles?.toLocaleString() || 0, color: theme.palette.warning.main },
          { label: 'PROCESSING LAG', value: metrics?.processing_lag?.toLocaleString() || 0, color: '' },
        ].map((kpi, idx) => (
          <Paper key={idx} sx={{ flex: 1, p: 2, borderRadius: 0, borderLeft: `4px solid ${kpi.color || theme.palette.text.secondary}` }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold' }}>{kpi.label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: kpi.color || 'text.primary', mt: 0.5 }}>{kpi.value}</Typography>
          </Paper>
        ))}
      </Box>

      <Paper sx={{ display: 'flex', flexDirection: 'column', p: 0, borderRadius: 0, flex: 1, minHeight: 0 }}>
        <Box className={darkMode ? 'ag-theme-balham-dark' : 'ag-theme-balham'} sx={{ flexGrow: 1, width: '100%' }}>
          <AgGridReact
            rowData={activeTab === 'OPEN' ? (metrics?.open_alerts ?? []) : (metrics?.closed_alerts ?? [])}
            columnDefs={tableColDefs}
            animateRows={false}
            defaultColDef={{ resizable: true, sortable: true, filter: true }}
            overlayLoadingTemplate={metricsLoading ? '<span class="ag-overlay-loading-center">Fetching Alerts...</span>' : undefined}
            overlayNoRowsTemplate='<span class="ag-overlay-loading-center">No Alerts Found</span>'
          />
        </Box>
      </Paper>
    </Box>
  );
}