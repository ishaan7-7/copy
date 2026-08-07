import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  Stack,
  Button,
  CircularProgress,
  Tooltip,
  Zoom,
} from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { alpha } from "@mui/material/styles";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";

const PIPELINE_API = "http://127.0.0.1:8005";

const MODULE_COLORS: Record<string, string> = {
  engine: "#ef4444",
  transmission: "#f59e0b",
  battery: "#22c55e",
  body: "#a855f7",
  tyre: "#38bdf8",
};

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
    .join(" ")
    .slice(0, 22);
}

export type AlertsPopupFilter = "all" | "critical" | "warning" | "resolved";

export default function FleetAlertsPopup({
  open,
  onClose,
  initialFilter,
  isDark,
  onVehicleClick,
}: {
  open: boolean;
  onClose: () => void;
  initialFilter: AlertsPopupFilter;
  isDark: boolean;
  onVehicleClick?: (vehicleId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<AlertsPopupFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  // Dialog uses keepMounted (below) so this scroll container's DOM node is
  // never removed on close — its native scrollTop persists across
  // open/close by itself, no manual save/restore needed.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const handleContentScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setShowScrollTop(e.currentTarget.scrollTop > 240);
  };
  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Resolve is optimistic (below) but the underlying alert cache only
  // refreshes every 5s server-side — a background refetch landing inside
  // that window can briefly report the alert as still OPEN and clobber the
  // optimistic patch. resolvedIds pins the locally-resolved state so the
  // badge/section placement can't flicker back, for the life of this popup.
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());
  // Decoupled from resolveAlertMutation.isPending on purpose — that reflects
  // the raw network promise, which can vary with backend load. A short,
  // bounded local timer keeps the "Resolving…" → resolved transition
  // predictable regardless of how long the actual request takes underneath.
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Each open of the popup can come from a different stat (Critical / Warning
  // / Resolved / the card body itself for "all") — resync the filter every
  // time it opens rather than only on first mount.
  useEffect(() => {
    if (open) setFilter(initialFilter);
  }, [open, initialFilter]);

  const { data: alertsMetrics, isLoading } = useQuery({
    queryKey: ["alertsMetrics"],
    queryFn: () => axios.get(`${PIPELINE_API}/api/alerts/metrics`).then((r) => r.data),
    enabled: open,
    refetchInterval: open ? 20000 : false,
    staleTime: 8000,
  });

  const openAlerts: any[] = alertsMetrics?.open_alerts ?? [];
  const closedAlerts: any[] = alertsMetrics?.closed_alerts ?? [];

  const resolveAlertMutation = useMutation({
    mutationFn: (alert: any) =>
      axios.post(`${PIPELINE_API}/api/alerts/resolve/${encodeURIComponent(alert.alert_id)}`, null, {
        params: { source_id: alert.source_id, module: alert.module },
      }),
    // Optimistic, matching the same pattern used on Fleet Health / Vehicle
    // Deep Dive — the backend's own alert cache refresh cycle can lag well
    // behind a manual resolve on a device with a large alert backlog.
    onMutate: async (alert: any) => {
      await queryClient.cancelQueries({ queryKey: ["alertsMetrics"] });
      const previous = queryClient.getQueryData<any>(["alertsMetrics"]);
      if (previous) {
        const moved = previous.open_alerts.find((a: any) => a.alert_id === alert.alert_id);
        queryClient.setQueryData(["alertsMetrics"], {
          ...previous,
          open_alerts: previous.open_alerts.filter((a: any) => a.alert_id !== alert.alert_id),
          closed_alerts: moved ? [moved, ...previous.closed_alerts] : previous.closed_alerts,
          active_alerts_count: Math.max(0, previous.active_alerts_count - 1),
        });
      }
      return { previous };
    },
    onError: (_err, _alert, context: any) => {
      if (context?.previous) queryClient.setQueryData(["alertsMetrics"], context.previous);
    },
  });

  // The whole point of this popup (vs. the Monitoring-role flow, which
  // navigates to /dtc for the ML investigation view) is that an executive
  // never leaves this dialog — the DTC inference runs entirely backend-side
  // and the result is stitched back into the same row once it's done.
  const handleInvestigate = async (alert: any) => {
    setAnalyzingId(alert.alert_id);
    try {
      const { data } = await axios.get(`${PIPELINE_API}/api/dtc/analyze`, {
        params: { source_id: alert.source_id, module: alert.module, peak_ts: alert.peak_anomaly_ts },
        timeout: 70000,
      });
      // /api/alerts/metrics is a plain in-memory cache refreshed by a 5s
      // background loop on the alerts service — refetching it right after
      // analyze almost always lands inside that gap and returns the alert
      // still unanalyzed, making the button look like it did nothing until
      // a second click. The analyze response already carries the triggers,
      // so patch them into the cache directly instead of waiting on the loop.
      // Deliberately no invalidateQueries here — that would immediately
      // refetch this same still-stale endpoint and clobber the patch below
      // with the pre-analysis data; the existing 20s poll reconciles later.
      if (data?.success) {
        queryClient.setQueryData<any>(["alertsMetrics"], (prev: any) => {
          if (!prev) return prev;
          const patch = (list: any[]) =>
            (list ?? []).map((a: any) =>
              a.alert_id === alert.alert_id ? { ...a, analyzed: true, dtc_triggers: data.triggers ?? [] } : a
            );
          return { ...prev, open_alerts: patch(prev.open_alerts), closed_alerts: patch(prev.closed_alerts) };
        });
        // If a Vehicle Deep Dive popup for this same vehicle is open (or
        // opens next), its Recent DTC card reads last_dtc off the
        // vehicle-summary cache — patch it directly so the result isn't
        // stuck waiting on that popup's own poll. Merge (prepend) rather
        // than replace, so an earlier investigated fault isn't wiped out
        // by this run coming back clean.
        queryClient.setQueryData<any>(["vehSummaryPopup", alert.source_id], (prev: any) => {
          if (!prev) return prev;
          const prevTriggers: any[] = prev.last_dtc?.triggers ?? [];
          return {
            ...prev,
            last_dtc: {
              source_id: alert.source_id,
              run_ts: new Date().toISOString(),
              triggers: [...(data.triggers ?? []), ...prevTriggers],
            },
          };
        });
      }
    } catch {
      // Swallow — the row just stays unanalyzed and the button re-enables
      // so the user can retry, no need for a toast in this dense a view.
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleResolve = (alert: any) => {
    setResolvedIds((prev) => new Set(prev).add(alert.alert_id));
    setResolvingId(alert.alert_id);
    resolveAlertMutation.mutate(alert, {
      onError: () => {
        setResolvedIds((prev) => {
          const next = new Set(prev);
          next.delete(alert.alert_id);
          return next;
        });
      },
    });
    const delay = 1500 + Math.random() * 1000;
    setTimeout(() => {
      setResolvingId((cur) => (cur === alert.alert_id ? null : cur));
    }, delay);
  };

  const isCritical = (a: any) => Number(a.max_composite_score ?? 0) >= 0.8;
  const isWarning = (a: any) => {
    const s = Number(a.max_composite_score ?? 0);
    return s >= 0.5 && s < 0.8;
  };

  const rows = (() => {
    let base: any[];
    if (filter === "resolved") base = closedAlerts;
    else if (filter === "critical") base = openAlerts.filter(isCritical);
    else if (filter === "warning") base = openAlerts.filter(isWarning);
    else base = [...openAlerts, ...closedAlerts];
    const text = search.trim().toLowerCase();
    if (!text) return base;
    return base.filter(
      (a) =>
        String(a.source_id || "").toLowerCase().includes(text) ||
        String(a.module || "").toLowerCase().includes(text)
    );
  })();

  const tabIndex = filter === "all" ? 0 : filter === "critical" ? 1 : filter === "warning" ? 2 : 3;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      keepMounted
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
          px: 3,
          pt: 2.5,
          pb: 0,
          background: isDark
            ? `linear-gradient(135deg, ${alpha("#1e3a5f", 0.8)}, ${alpha("#0c1628", 0.95)})`
            : `linear-gradient(135deg, ${alpha("#eff6ff", 1)}, ${alpha("#f8fafc", 1)})`,
          borderBottom: `1px solid ${isDark ? alpha("#334155", 0.6) : alpha("#e2e8f0", 1)}`,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", mb: 1.5 }}>
          <Box>
            <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: isDark ? "#64748b" : "#94a3b8" }}>
              Fleet-wide
            </Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: isDark ? "#f1f5f9" : "#0f172a" }}>
              Alerts
            </Typography>
          </Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, bgcolor: alpha("#ef4444", isDark ? 0.15 : 0.08), border: `1px solid ${alpha("#ef4444", 0.25)}` }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#ef4444" }}>{openAlerts.length} Open</Typography>
            </Box>
            <Box sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, bgcolor: alpha("#22c55e", isDark ? 0.12 : 0.07), border: `1px solid ${alpha("#22c55e", 0.22)}` }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: "#22c55e" }}>{closedAlerts.length} Resolved</Typography>
            </Box>
            <IconButton size="small" onClick={onClose} sx={{ color: isDark ? "#64748b" : "#94a3b8", "&:hover": { bgcolor: alpha("#ef4444", 0.1), color: "#ef4444" } }}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ pb: 1 }}>
          <Tabs
            value={tabIndex}
            onChange={(_e, v) => setFilter((["all", "critical", "warning", "resolved"] as AlertsPopupFilter[])[v])}
            sx={{
              minHeight: 34,
              "& .MuiTabs-indicator": { height: 2, borderRadius: "2px 2px 0 0", bgcolor: isDark ? "#38bdf8" : "#0284c7" },
              "& .MuiTab-root": { minHeight: 34, fontSize: 11, fontWeight: 600, textTransform: "none", color: isDark ? "#64748b" : "#94a3b8", px: 2, "&.Mui-selected": { color: isDark ? "#38bdf8" : "#0284c7", fontWeight: 700 } },
            }}
          >
            <Tab label="All" />
            <Tab label="Critical" />
            <Tab label="Warning" />
            <Tab label="Resolved" />
          </Tabs>
          <TextField
            size="small"
            placeholder="Search vehicle / module..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon sx={{ fontSize: 15, color: "text.secondary" }} />
                </InputAdornment>
              ),
            }}
            sx={{ width: 210, mb: 0.75, "& .MuiOutlinedInput-root": { fontSize: 11, height: 30 } }}
          />
        </Stack>
      </Box>

      <DialogContent sx={{ p: 1.5, bgcolor: isDark ? "#0a1220" : "#f8fafc", position: "relative" }}>
        <Zoom in={showScrollTop}>
          <IconButton
            onClick={scrollToTop}
            size="small"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 2,
              bgcolor: isDark ? alpha("#1e293b", 0.92) : "#ffffff",
              border: `1px solid ${isDark ? alpha("#334155", 0.8) : alpha("#e2e8f0", 1)}`,
              boxShadow: 3,
              color: isDark ? "#94a3b8" : "#475569",
              "&:hover": { bgcolor: isDark ? alpha("#334155", 0.9) : alpha("#f1f5f9", 1) },
            }}
          >
            <KeyboardArrowUpRoundedIcon fontSize="small" />
          </IconButton>
        </Zoom>
        <Box ref={scrollRef} onScroll={handleContentScroll} sx={{ maxHeight: "62vh", overflow: "auto" }}>
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 5 }}>
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>Loading alerts…</Typography>
          </Box>
        ) : rows.length === 0 ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 5, gap: 1 }}>
            <CheckCircleRoundedIcon sx={{ fontSize: 28, color: "#22c55e", opacity: 0.7 }} />
            <Typography sx={{ fontSize: 12, color: "text.secondary" }}>No alerts in this category</Typography>
          </Box>
        ) : (
          <Stack spacing={1}>
            {rows.map((a: any, i: number) => {
              const isOpenAlert = a.status === "OPEN" && !resolvedIds.has(a.alert_id);
              const scoreNum = Number(a.max_composite_score ?? 0);
              const scoreColor = scoreNum >= 0.8 ? "#ef4444" : scoreNum >= 0.5 ? "#f59e0b" : "#22c55e";
              const modColor = MODULE_COLORS[String(a.module || "").toLowerCase()] || (isDark ? "#7dd3fc" : "#0369a1");
              const isAnalyzing = analyzingId === a.alert_id;
              let featureEntries: { label: string; value: number }[] = [];
              if (a.top_10_features) {
                try {
                  const parsed = JSON.parse(a.top_10_features) as Record<string, number>;
                  const total = Object.values(parsed).reduce((s, v) => s + Math.abs(v), 0);
                  featureEntries = Object.entries(parsed)
                    .slice(0, 5)
                    .map(([k, v]) => ({ label: formatFeatureKey(k), value: total > 0 ? Math.round((Math.abs(v) / total) * 100) : 0 }));
                } catch {
                  featureEntries = [];
                }
              }
              const triggers: any[] = a.dtc_triggers ?? [];
              return (
                <Box
                  key={a.alert_id || i}
                  sx={{
                    display: "flex",
                    borderRadius: 2,
                    overflow: "hidden",
                    border: `1px solid ${isDark ? alpha("#334155", 0.7) : alpha("#e2e8f0", 1)}`,
                    bgcolor: isDark ? alpha("#1e293b", 0.5) : "#ffffff",
                  }}
                >
                  <Box sx={{ width: 4, flexShrink: 0, bgcolor: isOpenAlert ? "#ef4444" : "#22c55e" }} />
                  <Box sx={{ flex: 1, p: 1.25, display: "flex", gap: 1.5, alignItems: "flex-start", minWidth: 0 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.6, flexWrap: "wrap" }}>
                        <Typography
                          onClick={() => onVehicleClick?.(a.source_id)}
                          sx={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: isDark ? "#f1f5f9" : "#0f172a",
                            cursor: onVehicleClick ? "pointer" : "default",
                            "&:hover": onVehicleClick ? { textDecoration: "underline", color: isDark ? "#38bdf8" : "#0369a1" } : undefined,
                          }}
                        >
                          {a.source_id}
                        </Typography>
                        <Box sx={{ px: 0.75, py: "1px", borderRadius: "5px", fontSize: 9, fontWeight: 800, letterSpacing: 0.4, bgcolor: isOpenAlert ? alpha("#ef4444", isDark ? 0.18 : 0.1) : alpha("#22c55e", isDark ? 0.14 : 0.08), color: isOpenAlert ? "#ef4444" : "#22c55e", border: `1px solid ${isOpenAlert ? alpha("#ef4444", 0.3) : alpha("#22c55e", 0.25)}` }}>
                          {isOpenAlert ? "OPEN" : "RESOLVED"}
                        </Box>
                        <Box sx={{ px: 0.75, py: "1px", borderRadius: "5px", fontSize: 9, fontWeight: 800, letterSpacing: 0.4, bgcolor: alpha(modColor, isDark ? 0.16 : 0.1), color: modColor, border: `1px solid ${alpha(modColor, 0.28)}` }}>
                          {String(a.module || "").toUpperCase()}
                        </Box>
                        {a.analyzed && (
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
                      {a.analyzed && (
                        <Box sx={{ mt: 0.6, pt: 0.6, borderTop: `1px solid ${isDark ? alpha("#334155", 0.5) : alpha("#e2e8f0", 1)}` }}>
                          <Typography sx={{ fontSize: 8.5, fontWeight: 700, color: isDark ? "#475569" : "#94a3b8", mb: 0.35, textTransform: "uppercase", letterSpacing: 0.4 }}>
                            DTC Analysis
                          </Typography>
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
                      <Box sx={{ px: 1, py: 0.4, borderRadius: 1.5, bgcolor: alpha(scoreColor, isDark ? 0.14 : 0.08), border: `1px solid ${alpha(scoreColor, 0.25)}`, textAlign: "center" }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: scoreColor, lineHeight: 1.2 }}>{scoreNum.toFixed(3)}</Typography>
                      </Box>
                      {!a.analyzed ? (
                        <Button
                          size="small"
                          disabled={isAnalyzing}
                          onClick={() => handleInvestigate(a)}
                          startIcon={isAnalyzing ? <CircularProgress size={11} sx={{ color: "inherit" }} /> : undefined}
                          sx={{ fontSize: 9.5, fontWeight: 700, height: 24, px: 1.25, borderRadius: "6px", bgcolor: isDark ? alpha("#38bdf8", 0.1) : alpha("#0284c7", 0.07), color: isDark ? "#38bdf8" : "#0369a1", border: `1px solid ${isDark ? alpha("#38bdf8", 0.22) : alpha("#0284c7", 0.18)}`, "&:hover": { bgcolor: isDark ? alpha("#38bdf8", 0.18) : alpha("#0284c7", 0.13) } }}
                        >
                          {isAnalyzing ? "Analyzing…" : "Investigate"}
                        </Button>
                      ) : (
                        <Tooltip title="DTC inference already ran for this alert" arrow>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.3, height: 24, px: 1, borderRadius: "6px", bgcolor: alpha("#22c55e", 0.08) }}>
                            <OpenInNewRoundedIcon sx={{ fontSize: 11, color: "#22c55e", opacity: 0.6 }} />
                          </Box>
                        </Tooltip>
                      )}
                      {isOpenAlert ? (
                        <Button
                          size="small"
                          disabled={resolvingId === a.alert_id}
                          onClick={() => handleResolve(a)}
                          sx={{ fontSize: 9.5, fontWeight: 700, height: 24, px: 1.25, borderRadius: "6px", bgcolor: isDark ? alpha("#22c55e", 0.1) : alpha("#16a34a", 0.07), color: isDark ? "#22c55e" : "#15803d", border: `1px solid ${isDark ? alpha("#22c55e", 0.22) : alpha("#16a34a", 0.18)}`, "&:hover": { bgcolor: isDark ? alpha("#22c55e", 0.18) : alpha("#16a34a", 0.13) } }}
                        >
                          {resolvingId === a.alert_id ? "Resolving…" : "Resolve"}
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
          </Stack>
        )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
