import { useState, useRef, useEffect } from "react";
import {
  Box,
  Card,
  Typography,
  Button,
  Chip,
  Stack,
  Divider,
  LinearProgress,
  CircularProgress,
  Alert,
} from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useStore } from "../store";

const API = "http://127.0.0.1:8010";

interface ReplayStatus {
  running: boolean;
  pid: number | null;
  rows_per_second: number | null;
  replay_mode: string | null;
  enabled_sims: string[];
}

interface HardResetStatus {
  in_progress: boolean;
  services_up: number;
  services_total: number;
}

export default function ReplayControl({ isActive = true }: { isActive?: boolean }) {
  const darkMode = useStore((s) => s.darkMode);
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingHardReset, setConfirmingHardReset] = useState(false);
  const [hardResetWatching, setHardResetWatching] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusQuery = useQuery<ReplayStatus>({
    queryKey: ["replay-control-status"],
    queryFn: () => axios.get(`${API}/api/replay/status`).then((r) => r.data),
    refetchInterval: isActive ? 3000 : false,
  });

  const hardResetQuery = useQuery<HardResetStatus>({
    queryKey: ["hard-reset-status"],
    queryFn: () => axios.get(`${API}/api/system/hard-reset/status`).then((r) => r.data),
    refetchInterval: isActive && hardResetWatching ? 2000 : false,
  });

  useEffect(() => {
    if (hardResetQuery.data && !hardResetQuery.data.in_progress) {
      setHardResetWatching(false);
    }
  }, [hardResetQuery.data]);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const runAction = (path: string) =>
    axios.post(`${API}${path}`).then((r) => r.data);

  const replayActionOptions = (path: string) => ({
    mutationFn: () => runAction(path),
    onMutate: () => setActionError(null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["replay-control-status"] });
    },
    onError: (err: unknown) => {
      const detail =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : "Action failed.";
      setActionError(detail);
    },
  });

  const startMutation = useMutation(replayActionOptions("/api/replay/start"));
  const stopMutation = useMutation(replayActionOptions("/api/replay/stop"));
  const startResetMutation = useMutation(replayActionOptions("/api/replay/start-with-reset"));
  const resetMutation = useMutation(replayActionOptions("/api/replay/reset"));

  const hardResetMutation = useMutation({
    mutationFn: () => runAction("/api/system/hard-reset"),
    onMutate: () => setActionError(null),
    onSuccess: () => {
      setHardResetWatching(true);
      queryClient.invalidateQueries({ queryKey: ["hard-reset-status"] });
    },
    onError: (err: unknown) => {
      const detail =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : "Hard reset failed to start.";
      setActionError(detail);
    },
  });

  const handleHardResetClick = () => {
    if (!confirmingHardReset) {
      setConfirmingHardReset(true);
      confirmTimer.current = setTimeout(() => setConfirmingHardReset(false), 5000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingHardReset(false);
    hardResetMutation.mutate();
  };

  const status = statusQuery.data;
  const hardReset = hardResetQuery.data;
  const busy =
    startMutation.isPending ||
    stopMutation.isPending ||
    startResetMutation.isPending ||
    resetMutation.isPending;

  const ink = darkMode ? "#edf5ff" : "#1a1f2b";
  const sub = darkMode ? "#9fb2c9" : "#64748b";
  const surface = darkMode ? "#0f1722" : "#fff";
  const border = darkMode ? "#1f2b3a" : "#e2e8f0";

  return (
    <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
      <Card
        sx={{
          width: "100%",
          maxWidth: 560,
          p: 3,
          bgcolor: surface,
          border: `1px solid ${border}`,
        }}
      >
        <Typography variant="h6" sx={{ color: ink, fontWeight: 700, mb: 0.5 }}>
          Replay Control
        </Typography>
        <Typography variant="body2" sx={{ color: sub, mb: 2 }}>
          Controls the same replay worker as run_controller.py — not linked from navigation.
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <Chip
            size="small"
            label={status?.running ? "RUNNING" : "STOPPED"}
            color={status?.running ? "success" : "default"}
          />
          {status?.pid != null && (
            <Typography variant="caption" sx={{ color: sub }}>
              PID {status.pid}
            </Typography>
          )}
          {status?.rows_per_second != null && (
            <Typography variant="caption" sx={{ color: sub }}>
              · {status.rows_per_second} rows/sec · {status.replay_mode}
            </Typography>
          )}
          {status?.enabled_sims != null && (
            <Typography variant="caption" sx={{ color: sub }}>
              · {status.enabled_sims.length} sims
            </Typography>
          )}
        </Stack>

        {actionError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
            {actionError}
          </Alert>
        )}

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button
            variant="contained"
            disabled={busy || !!status?.running}
            onClick={() => startMutation.mutate()}
            startIcon={startMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {startMutation.isPending ? "Starting…" : "Start"}
          </Button>
          <Button
            variant="outlined"
            disabled={busy || !status?.running}
            onClick={() => stopMutation.mutate()}
            startIcon={stopMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {stopMutation.isPending ? "Stopping…" : "Stop"}
          </Button>
          <Button
            variant="outlined"
            disabled={busy || !!status?.running}
            onClick={() => startResetMutation.mutate()}
            startIcon={startResetMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {startResetMutation.isPending ? "Starting…" : "Start with Reset"}
          </Button>
          <Button
            variant="outlined"
            color="warning"
            disabled={busy || !!status?.running}
            onClick={() => resetMutation.mutate()}
            startIcon={resetMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {resetMutation.isPending ? "Resetting…" : "Reset"}
          </Button>
        </Stack>

        <Divider sx={{ my: 3 }} />

        <Typography variant="subtitle2" sx={{ color: ink, fontWeight: 700, mb: 0.5 }}>
          Full Hard Reset
        </Typography>
        <Typography variant="body2" sx={{ color: sub, mb: 1.5 }}>
          Resets every backend service and the Spark/gold/silver/bronze state, same as{" "}
          <code>run.py --reset</code>. This dashboard stays up, but every other service goes
          down and relaunches — expect ~60-90s of zeroed data.
        </Typography>

        {hardResetWatching && hardReset && (
          <Box sx={{ mb: 1.5 }}>
            <LinearProgress
              variant="determinate"
              value={(hardReset.services_up / hardReset.services_total) * 100}
            />
            <Typography variant="caption" sx={{ color: sub }}>
              {hardReset.services_up}/{hardReset.services_total} services back online
            </Typography>
          </Box>
        )}

        <Button
          variant="contained"
          color="error"
          disabled={hardResetMutation.isPending || hardResetWatching}
          onClick={handleHardResetClick}
          startIcon={hardResetMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          {hardResetMutation.isPending
            ? "Starting…"
            : confirmingHardReset
            ? "Click again to confirm"
            : "Full Hard Reset"}
        </Button>
      </Card>
    </Box>
  );
}
