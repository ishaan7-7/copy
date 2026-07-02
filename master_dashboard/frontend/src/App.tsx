import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import Layout from './components/Layout';
import FleetCenter from './pages/FleetCenter';
import WriterOps from './pages/WriterOps';
import GoldHealth from './pages/GoldHealth';
import AutomotiveDive from './pages/AutomotiveDive';
import DashboardInference from './pages/DashboardInference';
import DashboardAlerts from './pages/DashboardAlerts';
import DtcInvestigation from './pages/DtcInvestigation';
import { useStore } from './store';
import { lightTheme, darkTheme } from './theme';
import { GoldStreamProvider } from './contexts/GoldStreamContext';

const API = 'http://127.0.0.1:8005';

function DataPrefetcher() {
  const qc = useQueryClient();
  useEffect(() => {
    const pf = (key: string, url: string) =>
      qc.prefetchQuery({ queryKey: [key], queryFn: () => axios.get(url).then(r => r.data), staleTime: 30000 });
    pf('writerMetrics', `${API}/api/writer/metrics`);
    pf('inferenceMetrics', `${API}/api/inference/metrics`);
    pf('goldMetrics', `${API}/api/gold/metrics`);
    pf('goldConfig', `${API}/api/gold/config`);
    pf('alertsMetrics', `${API}/api/alerts/metrics`);
  }, [qc]);
  return null;
}

function App() {
  const darkMode = useStore((s) => s.darkMode);

  return (
    <GoldStreamProvider>
      <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
        <CssBaseline />
        <HashRouter>
          <DataPrefetcher />
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<FleetCenter />} />
              <Route path="writer-ops" element={<WriterOps />} />
              <Route path="inference" element={<DashboardInference />} />
              <Route path="gold" element={<GoldHealth />} />
              <Route path="alerts" element={<DashboardAlerts />} />
              <Route path="automotive" element={<AutomotiveDive />} />
              <Route path="dtc" element={<DtcInvestigation />} />
            </Route>
          </Routes>
        </HashRouter>
      </ThemeProvider>
    </GoldStreamProvider>
  );
}

export default App;
