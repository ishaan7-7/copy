import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API } from './hooks/useApi';
import Layout from './components/Layout';
import { useStore } from './store';
import { lightTheme, darkTheme } from './theme';

function DataPrefetcher() {
  const qc = useQueryClient();
  useEffect(() => {
    const pf = (key: string | string[], url: string, stale = 30000) =>
      qc.prefetchQuery({ queryKey: Array.isArray(key) ? key : [key], queryFn: ({ signal }) => axios.get(url, { signal }).then(r => r.data), staleTime: stale });
    pf('writerMetrics', `${API}/api/writer/metrics`);
    pf('inferenceMetrics', `${API}/api/inference/metrics`);
    pf('goldMetrics', `${API}/api/gold/metrics`);
    pf('goldConfig', `${API}/api/gold/config`, 600000);
    pf('alertsMetrics', `${API}/api/alerts/metrics`);
    pf('observerSnapshot', `${API}/api/observer/snapshot`);
    pf('autoFleetSummary', `${API}/api/automotive/fleet-summary`);
    pf('dtcMaster', `${API}/api/automotive/dtc-master`, 600000);
  }, [qc]);
  return null;
}

function App() {
  const darkMode = useStore((s) => s.darkMode);

  return (
    <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
      <CssBaseline />
      <HashRouter>
        <DataPrefetcher />
        <Routes>
          <Route path="/*" element={<Layout />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  );
}

export default App;
