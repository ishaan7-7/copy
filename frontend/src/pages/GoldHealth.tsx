import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  ToggleButton,
  ToggleButtonGroup,
  Checkbox,
  FormControlLabel,
  Slider,
  Button,
  Alert,
  Chip,
  TextField,
  IconButton,
  Stack,
  Tooltip,
} from "@mui/material";
import { useTheme, alpha } from "@mui/material/styles";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, ClientSideRowModelModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useStore } from "../store";
import { MODULE_COLORS } from "../constants/chartColors";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import DeleteIcon from "@mui/icons-material/Delete";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import DirectionsCarOutlinedIcon from "@mui/icons-material/DirectionsCarOutlined";
import StorageOutlinedIcon from "@mui/icons-material/StorageOutlined";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import HealthAndSafetyOutlinedIcon from "@mui/icons-material/HealthAndSafetyOutlined";
import RestartAltOutlinedIcon from "@mui/icons-material/RestartAltOutlined";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

const CHART_FONT = '"Inter", "Segoe UI", Roboto, Arial, sans-serif';

const ALL_MODULES = ["engine", "transmission", "battery", "body", "tyre"];

const BUILTIN_PRESETS: Record<string, Record<string, number>> = {
  "Safety-First": {
    engine: 0.4,
    transmission: 0.2,
    battery: 0.25,
    body: 0.05,
    tyre: 0.1,
  },
  "Drivetrain-Heavy": {
    engine: 0.45,
    transmission: 0.35,
    battery: 0.1,
    body: 0.05,
    tyre: 0.05,
  },
  "Equal-Weight": {
    engine: 0.2,
    transmission: 0.2,
    battery: 0.2,
    body: 0.2,
    tyre: 0.2,
  },
};

const fetchGoldMetrics = async () =>
  (await axios.get("http://127.0.0.1:8005/api/gold/metrics")).data;
const fetchGoldConfig = async () =>
  (await axios.get("http://127.0.0.1:8005/api/gold/config")).data;
const fetchGoldHistory = async (simId: string) =>
  (await axios.get(`http://127.0.0.1:8005/api/gold/history/${simId}`)).data
    .data;

interface WeightPanelProps {
  label: string;
  profile: "A" | "B";
  weights: Record<string, number>;
  modules: string[];
  weightSum: number;
  isImbalanced: boolean;
  allPresets: Record<string, Record<string, number>>;
  savedPresets: Record<string, Record<string, number>>;
  onWeightChange: (mod: string, val: number) => void;
  onToggleModule: (mod: string) => void;
  onAutoBalance: () => void;
  onApplyPreset: (name: string, profile: "A" | "B") => void;
  onSavePreset: (
    name: string,
    weights: Record<string, number>,
    modules: string[]
  ) => void;
  onDeletePreset: (name: string) => void;
}

function WeightPanel({
  label,
  profile,
  weights,
  modules,
  weightSum,
  isImbalanced,
  allPresets,
  savedPresets,
  onWeightChange,
  onToggleModule,
  onAutoBalance,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
}: WeightPanelProps) {
  const theme = useTheme();
  const [selectedPreset, setSelectedPreset] = useState("");
  const [saveAsName, setSaveAsName] = useState("");

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflowY: "auto",
        p: 1.5,
        gap: 1,
        "& .MuiTypography-root": { fontSize: "10px" },
        "& .MuiInputLabel-root": { fontSize: "10px" },
        "& .MuiSelect-select": { fontSize: "10px" },
        "& .MuiMenuItem-root": { fontSize: "10px" },
        "& .MuiInputBase-input": { fontSize: "10px" },
        "& .MuiButton-root": { fontSize: "10px" },
      }}
    >
      <Typography
        sx={{
          fontWeight: 700,
          color: "text.secondary",
          mb: 0.5,
          fontSize: "10px !important",
        }}
      >
        {label}
      </Typography>

      <Box sx={{ display: "flex", gap: 0.75, mb: 1, alignItems: "center" }}>
        <FormControl size="small" sx={{ flex: 1 }}>
          <Select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            displayEmpty
            sx={{ borderRadius: 1, fontSize: "10px", height: 30 }}
            MenuProps={{
              PaperProps: {
                sx: { "& .MuiMenuItem-root": { fontSize: "10px" } },
              },
            }}
          >
            <MenuItem value="">
              <em>— Select Preset —</em>
            </MenuItem>
            {Object.keys(allPresets).map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            if (selectedPreset) onApplyPreset(selectedPreset, profile);
          }}
          disabled={!selectedPreset}
          sx={{
            borderRadius: 1,
            fontWeight: 700,
            fontSize: "10px",
            minWidth: 55,
            height: 30,
            px: 1,
          }}
        >
          APPLY
        </Button>

        {selectedPreset && savedPresets[selectedPreset] && (
          <IconButton
            size="small"
            onClick={() => {
              onDeletePreset(selectedPreset);
              setSelectedPreset("");
            }}
            sx={{ p: 0.5 }}
          >
            <DeleteIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>

      {isImbalanced && (
        <Alert
          severity="warning"
          icon={false}
          sx={{
            borderRadius: 1,
            mb: 1,
            "& .MuiAlert-message": { p: 0 },
          }}
          action={
            <Button
              size="small"
              color="inherit"
              onClick={onAutoBalance}
              startIcon={<AutoFixHighIcon sx={{ fontSize: 12 }} />}
              sx={{ fontSize: "10px", borderRadius: 1 }}
            >
              RECALIBRATE
            </Button>
          }
        >
          <Typography sx={{ fontWeight: 700, fontSize: "10px" }}>
            Sum: {weightSum.toFixed(3)} (Target: 1.0)
          </Typography>
        </Alert>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {ALL_MODULES.map((mod) => {
          const isActive = modules.includes(mod);
          return (
            <Box key={mod} sx={{ opacity: isActive ? 1 : 0.5, px: 0.5 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={isActive}
                      onChange={() => onToggleModule(mod)}
                      sx={{ color: MODULE_COLORS[mod], p: 0.5 }}
                    />
                  }
                  label={
                    <Typography
                      sx={{
                        fontWeight: 700,
                        textTransform: "uppercase",
                        fontSize: "10px",
                      }}
                    >
                      {mod}
                    </Typography>
                  }
                />
                <Chip
                  size="small"
                  label={isActive ? (weights[mod] || 0).toFixed(2) : "OFF"}
                  sx={{
                    borderRadius: "4px",
                    height: 18,
                    fontSize: "10px",
                    fontWeight: 700,
                  }}
                />
              </Box>
              <Slider
                size="small"
                value={weights[mod] || 0}
                onChange={(_, val) => onWeightChange(mod, val as number)}
                min={0}
                max={1}
                step={0.01}
                disabled={!isActive}
                sx={{
                  color: MODULE_COLORS[mod],
                  ml: 3,
                  width: "calc(100% - 24px)",
                  mt: -0.5,
                  "& .MuiSlider-markLabel": { fontSize: "10px" },
                  "& .MuiSlider-valueLabel": { fontSize: "10px" },
                }}
              />
            </Box>
          );
        })}
      </Box>

      <Box
        sx={{
          mt: 1.5,
          pt: 1,
          borderTop: `1px solid ${theme.palette.divider}`,
          display: "flex",
          gap: 0.75,
        }}
      >
        <TextField
          size="small"
          label="Save as preset..."
          value={saveAsName}
          onChange={(e) => setSaveAsName(e.target.value)}
          sx={{
            flex: 1,
            "& .MuiOutlinedInput-root": { borderRadius: 1, height: 30 },
            "& .MuiInputBase-input": { fontSize: "10px" },
          }}
        />
        <Button
          size="small"
          variant="contained"
          disableElevation
          onClick={() => {
            onSavePreset(saveAsName, weights, modules);
            setSaveAsName("");
          }}
          disabled={!saveAsName.trim()}
          sx={{
            borderRadius: 1,
            fontWeight: 700,
            fontSize: "10px",
            px: 2,
            height: 30,
          }}
        >
          SAVE
        </Button>
      </Box>
    </Box>
  );
}

// ── Inline design-system components ──────────────────────────────────────────

const Card = ({ children, sx }: { children: React.ReactNode; sx?: object }) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: isDark ? alpha("#0b1724", 0.9) : "#ffffff",
        border: `1px solid ${isDark ? alpha("#7dd3fc", 0.16) : alpha("#1f2937", 0.1)}`,
        boxShadow: isDark
          ? `0 18px 42px ${alpha("#000", 0.22)}`
          : `0 12px 30px ${alpha("#334155", 0.08)}`,
        ...sx,
      }}
    >
      {children}
    </Paper>
  );
};

const SectionTitle = ({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 1,
      mb: 1,
    }}
  >
    <Typography sx={{ fontSize: "12px", fontWeight: 800 }}>{title}</Typography>
    {action}
  </Box>
);

const MetricTile = ({
  label,
  value,
  icon,
  color,
  delta,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  delta?: string;
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";
  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 1.5,
        border: `1px solid ${alpha(color, isDark ? 0.22 : 0.18)}`,
        bgcolor: alpha(color, isDark ? 0.07 : 0.05),
        display: "flex",
        flexDirection: "column",
        gap: 0.35,
        position: "relative",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          width: "3px",
          height: "100%",
          bgcolor: color,
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <Typography
          sx={{
            fontSize: "16px",
            fontWeight: 800,
            lineHeight: 1,
            pl: 0.5,
            color: isDark ? "#f1f5f9" : "#0f172a",
          }}
        >
          {value}
        </Typography>
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: "6px",
            bgcolor: alpha(color, isDark ? 0.2 : 0.12),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color,
            flexShrink: 0,
          }}
        >
          {icon}
        </Box>
      </Box>
      <Typography
        sx={{
          fontSize: "10px",
          fontWeight: 600,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          pl: 0.5,
          lineHeight: 1,
        }}
      >
        {label}
      </Typography>
      {delta && (
        <Typography
          sx={{ fontSize: "9px", color, fontWeight: 700, pl: 0.5, lineHeight: 1 }}
        >
          {delta}
        </Typography>
      )}
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

export default function GoldHealth({ isActive = true }: { isActive?: boolean }) {
  const { autoRefresh } = useStore();
  const wasActiveRef = useRef(isActive);
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [activeTab, setActiveTab] = useState<"operations" | "experiment">(
    "operations"
  );
  const [filterSim, setFilterSim] = useState<string>("ALL");

  const [activeModules, setActiveModules] = useState<string[]>([]);
  const [expWeights, setExpWeights] = useState<Record<string, number>>({});

  const [profileMode, setProfileMode] = useState<"single" | "ab">("single");
  const [activeModulesB, setActiveModulesB] = useState<string[]>([]);
  const [expWeightsB, setExpWeightsB] = useState<Record<string, number>>({});
  const [savedPresets, setSavedPresets] = useState<
    Record<string, Record<string, number>>
  >(() => {
    try {
      return JSON.parse(localStorage.getItem("gold_weight_presets") || "{}");
    } catch {
      return {};
    }
  });

  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ["goldMetrics"],
    queryFn: fetchGoldMetrics,
    refetchInterval:
      isActive && activeTab === "operations" && autoRefresh ? 5000 : false,
  });
  const { data: config } = useQuery({
    queryKey: ["goldConfig"],
    queryFn: fetchGoldConfig,
    refetchInterval: false,
  });

  const availableSims = useMemo(() => metrics?.active_sims || [], [metrics]);

  const { data: history, refetch: refetchHistory } = useQuery({
    queryKey: ["goldHistory", filterSim],
    queryFn: () => fetchGoldHistory(filterSim),
    refetchInterval:
      isActive && activeTab === "operations" && autoRefresh ? 8000 : false,
  });

  useEffect(() => {
    if (isActive && !wasActiveRef.current) {
      refetchMetrics();
      refetchHistory();
    }
    wasActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (config && activeModules.length === 0) {
      setActiveModules(config.enabled_modules || ALL_MODULES);
      setExpWeights(config.default_weights || {});
    }
  }, [config]);

  useEffect(() => {
    if (config && activeModulesB.length === 0) {
      setActiveModulesB(config.enabled_modules || ALL_MODULES);
      setExpWeightsB(config.default_weights || {});
    }
  }, [config]);

  const allPresets = useMemo(
    () => ({ ...BUILTIN_PRESETS, ...savedPresets }),
    [savedPresets]
  );

  const applyPreset = (name: string, profile: "A" | "B") => {
    const w = allPresets[name];
    if (!w) return;
    if (profile === "A") {
      setExpWeights((prev) => ({ ...prev, ...w }));
      setActiveModules(ALL_MODULES.filter((m) => (w[m] || 0) > 0));
    } else {
      setExpWeightsB((prev) => ({ ...prev, ...w }));
      setActiveModulesB(ALL_MODULES.filter((m) => (w[m] || 0) > 0));
    }
  };

  const savePreset = (
    name: string,
    weights: Record<string, number>,
    modules: string[]
  ) => {
    if (!name.trim()) return;
    const toSave: Record<string, number> = {};
    modules.forEach((m) => {
      toSave[m] = weights[m] || 0;
    });
    setSavedPresets((prev) => {
      const updated = { ...prev, [name.trim()]: toSave };
      localStorage.setItem("gold_weight_presets", JSON.stringify(updated));
      return updated;
    });
  };

  const deletePreset = (name: string) => {
    setSavedPresets((prev) => {
      const { [name]: _, ...rest } = prev;
      localStorage.setItem("gold_weight_presets", JSON.stringify(rest));
      return rest;
    });
  };

  const handleToggleModuleB = (mod: string) => {
    setActiveModulesB((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };
  const handleWeightChangeB = (mod: string, val: number) => {
    setExpWeightsB((prev) => ({ ...prev, [mod]: val }));
  };
  const currentWeightSumB = useMemo(
    () =>
      activeModulesB.reduce((sum, mod) => sum + (expWeightsB[mod] || 0), 0),
    [activeModulesB, expWeightsB]
  );
  const isUnbalancedB = Math.abs(currentWeightSumB - 1.0) > 0.001;
  const autoBalanceWeightsB = () => {
    if (currentWeightSumB === 0) return;
    const balanced: Record<string, number> = {};
    activeModulesB.forEach((mod) => {
      balanced[mod] = parseFloat(
        ((expWeightsB[mod] || 0) / currentWeightSumB).toFixed(3)
      );
    });
    setExpWeightsB((prev) => ({ ...prev, ...balanced }));
  };

  const fleetHealthKpi = useMemo(() => {
    if (!history || history.length === 0) return 0;
    const latestPerVehicle: Record<string, number> = {};
    history.forEach((row: any) => {
      if (
        row.source_id !== undefined &&
        row.vehicle_health_score !== undefined
      ) {
        latestPerVehicle[String(row.source_id)] = row.vehicle_health_score;
      }
    });
    const healths = Object.values(latestPerVehicle);
    if (healths.length === 0) return 0;
    return parseFloat(
      (healths.reduce((s, h) => s + h, 0) / healths.length).toFixed(1)
    );
  }, [history]);

  const displayLag = useMemo(() => {
    if (!metrics || !metrics.processing_lags) return 0;
    return Math.max(
      ...Object.values(metrics.processing_lags as Record<string, number>)
    );
  }, [metrics]);

  const handleToggleModule = (mod: string) => {
    setActiveModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };
  const handleWeightChange = (mod: string, val: number) => {
    setExpWeights((prev) => ({ ...prev, [mod]: val }));
  };
  const currentWeightSum = useMemo(
    () => activeModules.reduce((sum, mod) => sum + (expWeights[mod] || 0), 0),
    [activeModules, expWeights]
  );
  const isUnbalanced = Math.abs(currentWeightSum - 1.0) > 0.001;
  const autoBalanceWeights = () => {
    if (currentWeightSum === 0) return;
    const balanced: Record<string, number> = {};
    activeModules.forEach((mod) => {
      balanced[mod] = parseFloat(
        ((expWeights[mod] || 0) / currentWeightSum).toFixed(3)
      );
    });
    setExpWeights((prev) => ({ ...prev, ...balanced }));
  };

  const simulatedHistory = useMemo(() => {
    if (!history || !config) return [];
    const processedRows = history.map((row: any) => {
      let simulatedHealth = 0;
      const parsedRow: any = { ...row, ts_short: row.gold_window_ts };
      activeModules.forEach((mod) => {
        const rawHealth = row[`${mod}_contrib`] || 0;
        parsedRow[`${mod}_raw`] = rawHealth;
        simulatedHealth += rawHealth * (expWeights[mod] || 0);
      });
      parsedRow.experimental_health = parseFloat(simulatedHealth.toFixed(2));
      return parsedRow;
    });

    if (filterSim === "ALL") {
      const grouped: Record<string, any> = {};
      processedRows.forEach((row: any) => {
        if (!grouped[row.ts_short]) {
          grouped[row.ts_short] = {
            count: 0,
            experimental_health: 0,
            penalty_active: false,
          };
          activeModules.forEach((m) => (grouped[row.ts_short][`${m}_raw`] = 0));
        }
        grouped[row.ts_short].count += 1;
        grouped[row.ts_short].experimental_health += row.experimental_health;
        grouped[row.ts_short].penalty_active =
          grouped[row.ts_short].penalty_active || row.penalty_active;
        activeModules.forEach(
          (m) => (grouped[row.ts_short][`${m}_raw`] += row[`${m}_raw`])
        );
      });
      return Object.keys(grouped)
        .map((ts) => {
          const g = grouped[ts];
          const avgRow: any = {
            ts_short: ts,
            experimental_health: parseFloat(
              (g.experimental_health / g.count).toFixed(2)
            ),
            penalty_active: g.penalty_active,
          };
          activeModules.forEach(
            (m) =>
              (avgRow[`${m}_raw`] = parseFloat(
                (g[`${m}_raw`] / g.count).toFixed(2)
              ))
          );
          return avgRow;
        })
        .sort((a, b) => a.ts_short.localeCompare(b.ts_short));
    }
    return processedRows;
  }, [history, config, activeModules, expWeights, filterSim]);

  const simulatedHistoryB = useMemo(() => {
    if (profileMode !== "ab" || !history || !config) return [];
    const processedRows = history.map((row: any) => {
      let simulatedHealth = 0;
      const parsedRow: any = { ...row, ts_short: row.gold_window_ts };
      activeModulesB.forEach((mod) => {
        const rawHealth = row[`${mod}_contrib`] || 0;
        parsedRow[`${mod}_raw_b`] = rawHealth;
        simulatedHealth += rawHealth * (expWeightsB[mod] || 0);
      });
      parsedRow.profile_b_health = parseFloat(simulatedHealth.toFixed(2));
      return parsedRow;
    });
    if (filterSim === "ALL") {
      const grouped: Record<string, any> = {};
      processedRows.forEach((row: any) => {
        if (!grouped[row.ts_short])
          grouped[row.ts_short] = { count: 0, profile_b_health: 0 };
        grouped[row.ts_short].count += 1;
        grouped[row.ts_short].profile_b_health += row.profile_b_health;
      });
      return Object.keys(grouped)
        .map((ts) => ({
          ts_short: ts,
          profile_b_health: parseFloat(
            (grouped[ts].profile_b_health / grouped[ts].count).toFixed(2)
          ),
        }))
        .sort((a, b) => a.ts_short.localeCompare(b.ts_short));
    }
    return processedRows;
  }, [history, config, activeModulesB, expWeightsB, filterSim, profileMode]);

  const mergedChartData = useMemo(() => {
    if (profileMode !== "ab") return simulatedHistory;
    const bMap: Record<string, number> = {};
    simulatedHistoryB.forEach((row: any) => {
      bMap[row.ts_short] = row.profile_b_health;
    });
    return simulatedHistory.map((row: any) => ({
      ...row,
      actual_gold: row.vehicle_health_score ?? null,
      profile_b_health: bMap[row.ts_short] ?? null,
    }));
  }, [profileMode, simulatedHistory, simulatedHistoryB]);

  const reversedHistory = useMemo(
    () => (history ? [...history].reverse() : []),
    [history]
  );
  const latestRow =
    history && history.length > 0 ? history[history.length - 1] : null;
  const topFeatures = useMemo(() => {
    if (!latestRow || !latestRow.top_5_features) return [];
    try {
      const obj = JSON.parse(latestRow.top_5_features);
      return Object.entries(obj).map(([k, v]) => ({ feature: k, impact: v }));
    } catch {
      return [];
    }
  }, [latestRow]);

  const tableColDefs = useMemo<ColDef[]>(() => {
    if (!history || !history[0]) return [];
    const contribModules = new Set(ALL_MODULES.map((m) => `${m}_contrib`));
    const friendlyName = (key: string): string => {
      const m = key.replace(/_contrib$/, "");
      if (contribModules.has(key)) return `${m.toUpperCase()} MODULE HEALTH`;
      return key.toUpperCase().replace(/_/g, " ");
    };
    const keys = Object.keys(history[0]).filter(
      (k) => k !== "top_5_features" && k !== "source_id"
    );
    const cols: ColDef[] = [];
    if (history[0].source_id) {
      cols.push({
        field: "source_id",
        headerName: "VEHICLE ID",
        sortable: true,
        filter: true,
        width: 130,
        pinned: "left",
      });
    }
    keys.forEach((key) => {
      cols.push({
        field: key,
        headerName: friendlyName(key),
        sortable: true,
        filter: true,
        width: key.includes("ts") ? 200 : 140,
        cellStyle:
          key === "vehicle_health_score"
            ? (params: any): any => {
                const color =
                  params.value >= 80
                    ? "#22c55e"
                    : params.value >= 60
                    ? "#eab308"
                    : "#ef4444";
                return {
                  fontWeight: "bold",
                  color,
                  backgroundColor:
                    params.value < 60
                      ? isDark
                        ? "rgba(239,68,68,0.15)"
                        : "#fee2e2"
                      : "transparent",
                };
              }
            : undefined,
      });
    });
    return cols;
  }, [history, isDark]);

  const agTheme = isDark ? "ag-theme-balham-dark" : "ag-theme-balham";

  const agGridContainerSx: object = {
    "--ag-background-color": "transparent",
    "--ag-odd-row-background-color": isDark ? alpha("#7dd3fc", 0.04) : "#f8fafc",
    "--ag-row-hover-color": isDark
      ? alpha("#7dd3fc", 0.09)
      : alpha("#3b82f6", 0.05),
    "--ag-selected-row-background-color": isDark
      ? alpha("#3b82f6", 0.22)
      : alpha("#3b82f6", 0.1),
    "--ag-foreground-color": isDark ? "#e2e8f0" : "#0f172a",
    "--ag-data-color": isDark ? "#e2e8f0" : "#1f2937",
    "--ag-secondary-foreground-color": isDark ? "#94a3b8" : "#64748b",
    "--ag-border-color": isDark ? alpha("#7dd3fc", 0.1) : alpha("#1f2937", 0.1),
    "--ag-row-border-color": isDark
      ? alpha("#7dd3fc", 0.07)
      : alpha("#1f2937", 0.07),
    "--ag-input-focus-border-color": isDark
      ? alpha("#7dd3fc", 0.5)
      : alpha("#3b82f6", 0.5),
    "& .ag-header": {
      backgroundColor: `${isDark ? "#0d2137" : "#1e3a5f"} !important`,
    },
    "& .ag-header-cell": {
      backgroundColor: `${isDark ? "#0d2137" : "#1e3a5f"} !important`,
      color: "#fff !important",
      fontSize: "11px !important",
      fontWeight: "700 !important",
      letterSpacing: "0.04em !important",
    },
    "& .ag-header-cell-label": { color: "#fff !important" },
    "& .ag-icon": { color: "#fff !important" },
    "& .ag-header-icon": { color: "#fff !important" },
    "& .ag-sort-ascending-icon": { color: "#fff !important" },
    "& .ag-sort-descending-icon": { color: "#fff !important" },
    "& .ag-sort-none-icon": { color: "#fff !important" },
    "& .ag-cell": { fontSize: "10px !important" },
    "& .ag-row": {
      fontSize: "10px !important",
      borderColor: `${
        isDark ? alpha("#7dd3fc", 0.07) : alpha("#1f2937", 0.08)
      } !important`,
    },
    "& .ag-root-wrapper": { borderRadius: "6px", border: "none !important" },
    "& .ag-root-wrapper-body": { borderRadius: "6px" },
  };

  const chartAxisStyle = {
    fontSize: "10px",
    fill: isDark ? "#94a3b8" : "#64748b",
    fontFamily: CHART_FONT,
  };

  const tooltipStyle = {
    backgroundColor: isDark ? alpha("#0b1724", 0.97) : "#ffffff",
    border: `1px solid ${
      isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.15)
    }`,
    borderRadius: 8,
    fontSize: "11px",
    padding: "10px 14px",
    color: isDark ? "#e2e8f0" : "#0f172a",
    boxShadow: isDark
      ? `0 8px 20px ${alpha("#000", 0.35)}`
      : `0 4px 12px ${alpha("#334155", 0.12)}`,
  };

  const selectSx = {
    borderRadius: 1,
    fontSize: "10px",
    height: 28,
    bgcolor: isDark ? alpha("#0b1724", 0.6) : "#ffffff",
    "& .MuiSelect-select": { fontSize: "10px", py: 0.5 },
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: isDark ? alpha("#7dd3fc", 0.2) : alpha("#1f2937", 0.18),
    },
    "&:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: isDark ? alpha("#7dd3fc", 0.4) : alpha("#1f2937", 0.35),
    },
  };

  const menuPropsSx = {
    PaperProps: {
      sx: {
        bgcolor: isDark ? "#0b1724" : "#ffffff",
        border: `1px solid ${
          isDark ? alpha("#7dd3fc", 0.15) : alpha("#1f2937", 0.1)
        }`,
        "& .MuiMenuItem-root": {
          fontSize: "10px",
          "&:hover": {
            bgcolor: isDark
              ? alpha("#7dd3fc", 0.06)
              : alpha("#3b82f6", 0.05),
          },
        },
      },
    },
  };

  const healthValue =
    filterSim === "ALL"
      ? fleetHealthKpi
      : latestRow?.vehicle_health_score || 0;
  const healthColor =
    healthValue >= 80 ? "#22c55e" : healthValue >= 60 ? "#eab308" : "#ef4444";

  const tabSwitcherSx = {
    bgcolor: isDark ? alpha("#020c16", 0.7) : alpha("#dde6ef", 0.6),
    borderRadius: "10px",
    border: `1px solid ${
      isDark ? alpha("#7dd3fc", 0.08) : alpha("#94a3b8", 0.2)
    }`,
    p: "3px",
    "& .MuiToggleButtonGroup-grouped": {
      border: "none !important",
      borderRadius: "7px !important",
    },
    "& .MuiToggleButton-root": {
      py: "5px",
      px: "14px",
      fontSize: "10px",
      fontWeight: 600,
      lineHeight: 1,
      textTransform: "none",
      letterSpacing: "0.015em",
      whiteSpace: "nowrap",
      color: isDark ? alpha("#94a3b8", 0.8) : "#64748b",
      transition: "background-color 0.15s, color 0.15s, box-shadow 0.15s",
      "&.Mui-selected": {
        color: isDark ? "#f1f5f9" : "#0f172a",
        fontWeight: 700,
        bgcolor: isDark ? "#0d2137" : "#ffffff",
        boxShadow: isDark
          ? `0 1px 4px ${alpha("#000", 0.45)}, 0 0 0 1px ${alpha(
              "#7dd3fc",
              0.06
            )}`
          : `0 1px 3px ${alpha("#334155", 0.16)}, 0 1px 2px ${alpha(
              "#334155",
              0.1
            )}`,
      },
      "&:hover:not(.Mui-selected)": {
        bgcolor: isDark ? alpha("#7dd3fc", 0.05) : alpha("#94a3b8", 0.12),
        color: isDark ? "#cbd5e1" : "#374151",
      },
    },
  };

  return (
    <Box
      sx={{
        height: "calc(100vh - 64px)",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        p: 1,
        background: isDark
          ? "linear-gradient(145deg, #06111d 0%, #0b1724 52%, #0d1b2a 100%)"
          : "linear-gradient(145deg, #f8fafc 0%, #eef6ff 52%, #f7fbff 100%)",
      }}
    >
      {/* Page Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          pb: 1,
          borderBottom: `1px solid ${
            isDark ? alpha("#7dd3fc", 0.12) : alpha("#1f2937", 0.1)
          }`,
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: "16px",
            letterSpacing: "-0.3px",
            whiteSpace: "nowrap",
            background: isDark
              ? "linear-gradient(135deg, #e2e8f0, #7dd3fc)"
              : "linear-gradient(135deg, #0f172a, #1e40af)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          GOLD LAYER: FUSED VEHICLE HEALTH
        </Typography>

        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography
            sx={{
              fontSize: "10px",
              fontWeight: 600,
              color: "text.secondary",
              whiteSpace: "nowrap",
            }}
          >
            FILTER CONTEXT:
          </Typography>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel sx={{ fontSize: "10px" }}>
              Active Vehicle (Sim)
            </InputLabel>
            <Select
              value={filterSim}
              onChange={(e) => setFilterSim(e.target.value)}
              label="Active Vehicle (Sim)"
              sx={selectSx}
              MenuProps={menuPropsSx}
            >
              <MenuItem value="ALL" sx={{ fontWeight: 700, fontSize: "10px" }}>
                ALL VEHICLES (FLEET)
              </MenuItem>
              {availableSims.map((sim: string) => (
                <MenuItem key={sim} value={sim} sx={{ fontSize: "10px" }}>
                  {sim}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        <ToggleButtonGroup
          value={activeTab}
          exclusive
          onChange={(_e, val) => val && setActiveTab(val)}
          size="small"
          sx={tabSwitcherSx}
        >
          <ToggleButton value="operations">Live Operations</ToggleButton>
          <ToggleButton value="experiment">Weight Lab</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* ── OPERATIONS TAB ──────────────────────────────────────────────────── */}
      {activeTab === "operations" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            gap: 1,
            minHeight: 0,
          }}
        >
          {/* KPI Tiles */}
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            <Box sx={{ flex: 1 }}>
              <MetricTile
                label="Active Simulations"
                value={availableSims.length}
                color="#3b82f6"
                icon={<DirectionsCarOutlinedIcon sx={{ fontSize: 14 }} />}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <MetricTile
                label="Total Gold Rows"
                value={metrics?.total_gold_rows?.toLocaleString() || "0"}
                color="#8b5cf6"
                icon={<StorageOutlinedIcon sx={{ fontSize: 14 }} />}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <MetricTile
                label="Global Max Lag"
                value={displayLag.toLocaleString()}
                color={displayLag > 1000 ? "#ef4444" : "#f59e0b"}
                icon={<TimerOutlinedIcon sx={{ fontSize: 14 }} />}
                delta={
                  displayLag > 1000 ? "High lag — check pipeline" : undefined
                }
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <MetricTile
                label={
                  filterSim === "ALL"
                    ? "Fleet Avg Health"
                    : "Vehicle Health"
                }
                value={`${healthValue}%`}
                color={healthColor}
                icon={<HealthAndSafetyOutlinedIcon sx={{ fontSize: 14 }} />}
                delta={
                  healthValue < 60 ? "Critical threshold" : undefined
                }
              />
            </Box>
          </Stack>

          {/* Main content row */}
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flex: 1,
              minHeight: 0,
            }}
          >
            {/* Degradation Drivers */}
            <Card
              sx={{
                width: 280,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                p: 1.25,
                overflowY: "auto",
              }}
            >
              <SectionTitle
                title={
                  filterSim === "ALL"
                    ? "Degradation Drivers (Fleet)"
                    : "Degradation Drivers"
                }
              />
              {topFeatures.length > 0 ? (
                topFeatures.map((f: any, i) => (
                  <Box key={i} sx={{ mb: 1.5 }}>
                    <Stack
                      direction="row"
                      justifyContent="space-between"
                      alignItems="center"
                      sx={{ mb: 0.4 }}
                    >
                      <Typography
                        sx={{ fontSize: "10px", fontWeight: 700 }}
                      >
                        {f.feature}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: "9px",
                          color: "text.secondary",
                          fontWeight: 600,
                        }}
                      >
                        {parseFloat(f.impact).toFixed(2)}
                      </Typography>
                    </Stack>
                    <Box
                      sx={{
                        height: 5,
                        borderRadius: "3px",
                        bgcolor: isDark ? "#1e293b" : "#e2e8f0",
                        overflow: "hidden",
                      }}
                    >
                      <Box
                        sx={{
                          width: `${Math.min(
                            100,
                            (f.impact as number) * 10
                          )}%`,
                          height: "100%",
                          bgcolor: "#ef4444",
                          borderRadius: "3px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </Box>
                  </Box>
                ))
              ) : (
                <Typography
                  sx={{ fontSize: "10px", color: "text.secondary" }}
                >
                  Awaiting anomaly data...
                </Typography>
              )}
            </Card>

            {/* Vehicle Health History Table */}
            <Card
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                p: 1.25,
                minHeight: 0,
              }}
            >
              <SectionTitle
                title="Vehicle Health History"
                action={
                  <Tooltip title="Refresh history">
                    <IconButton
                      size="small"
                      onClick={() => refetchHistory()}
                      sx={{ p: 0.4 }}
                    >
                      <RestartAltOutlinedIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                }
              />
              <Box
                className={agTheme}
                sx={{ flex: 1, minHeight: 0, width: "100%", ...agGridContainerSx }}
              >
                <AgGridReact
                  rowData={reversedHistory}
                  columnDefs={tableColDefs}
                  defaultColDef={{ resizable: true, sortable: true }}
                  rowHeight={28}
                  headerHeight={30}
                />
              </Box>
            </Card>
          </Box>
        </Box>
      )}

      {/* ── EXPERIMENT TAB ──────────────────────────────────────────────────── */}
      {activeTab === "experiment" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            gap: 1,
          }}
        >
          {/* Mode switcher */}
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Typography
              sx={{
                fontSize: "10px",
                fontWeight: 700,
                color: "text.secondary",
                whiteSpace: "nowrap",
              }}
            >
              SIMULATION MODE:
            </Typography>
            <ToggleButtonGroup
              value={profileMode}
              exclusive
              onChange={(_, val) => val && setProfileMode(val)}
              size="small"
              sx={tabSwitcherSx}
            >
              <ToggleButton value="single">Single Profile</ToggleButton>
              <ToggleButton value="ab">
                <CompareArrowsIcon sx={{ fontSize: 12, mr: 0.5 }} />
                A/B Comparison
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          {/* Panels + Chart */}
          <Box sx={{ display: "flex", gap: 1, flex: 1, minHeight: 0 }}>
            {/* Profile A */}
            <Card
              sx={{
                width: profileMode === "ab" ? 280 : 320,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                p: 0,
                borderTop: `3px solid ${
                  isDark ? alpha("#3b82f6", 0.9) : "#3b82f6"
                }`,
              }}
            >
              <WeightPanel
                label={
                  profileMode === "ab" ? "PROFILE A" : "DYNAMIC WEIGHT CONFIG"
                }
                profile="A"
                weights={expWeights}
                modules={activeModules}
                weightSum={currentWeightSum}
                isImbalanced={isUnbalanced}
                allPresets={allPresets}
                savedPresets={savedPresets}
                onWeightChange={handleWeightChange}
                onToggleModule={handleToggleModule}
                onAutoBalance={autoBalanceWeights}
                onApplyPreset={applyPreset}
                onSavePreset={savePreset}
                onDeletePreset={deletePreset}
              />
            </Card>

            {/* Profile B */}
            {profileMode === "ab" && (
              <Card
                sx={{
                  width: 280,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  p: 0,
                  borderTop: `3px solid ${
                    isDark ? alpha("#8b5cf6", 0.9) : "#7b1fa2"
                  }`,
                }}
              >
                <WeightPanel
                  label="PROFILE B"
                  profile="B"
                  weights={expWeightsB}
                  modules={activeModulesB}
                  weightSum={currentWeightSumB}
                  isImbalanced={isUnbalancedB}
                  allPresets={allPresets}
                  savedPresets={savedPresets}
                  onWeightChange={handleWeightChangeB}
                  onToggleModule={handleToggleModuleB}
                  onAutoBalance={autoBalanceWeightsB}
                  onApplyPreset={applyPreset}
                  onSavePreset={savePreset}
                  onDeletePreset={deletePreset}
                />
              </Card>
            )}

            {/* Chart */}
            <Card
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                p: 1.25,
                minHeight: 0,
              }}
            >
              <SectionTitle
                title={
                  (filterSim === "ALL"
                    ? "Fleet-Wide Averaged Health Trajectory"
                    : `Recalculated Health Trajectory: ${filterSim}`) +
                  (profileMode === "ab" ? " — A/B Comparison" : "")
                }
              />
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={mergedChartData}
                    margin={{ top: 10, right: 30, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={
                        isDark
                          ? alpha("#7dd3fc", 0.08)
                          : alpha("#1f2937", 0.06)
                      }
                    />
                    <XAxis
                      dataKey="ts_short"
                      tick={chartAxisStyle}
                      axisLine={{
                        stroke: isDark
                          ? alpha("#7dd3fc", 0.15)
                          : alpha("#1f2937", 0.12),
                      }}
                      tickLine={false}
                      minTickGap={30}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={chartAxisStyle}
                      axisLine={{
                        stroke: isDark
                          ? alpha("#7dd3fc", 0.15)
                          : alpha("#1f2937", 0.12),
                      }}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      cursor={{
                        stroke: isDark
                          ? alpha("#7dd3fc", 0.3)
                          : alpha("#3b82f6", 0.2),
                        strokeWidth: 1,
                      }}
                      contentStyle={tooltipStyle}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: "10px" }}
                      formatter={(value) => (
                        <span
                          style={{
                            fontSize: "8px",
                            fontWeight: 600,
                            color: isDark ? "#94a3b8" : "#64748b",
                            fontFamily: CHART_FONT,
                          }}
                        >
                          {value}
                        </span>
                      )}
                    />

                    {profileMode === "single" &&
                      activeModules.map((mod) => (
                        <Line
                          key={`${mod}_raw`}
                          type="monotone"
                          dataKey={`${mod}_raw`}
                          name={`${mod.toUpperCase()} MODULE HEALTH`}
                          stroke={MODULE_COLORS[mod]}
                          strokeWidth={1}
                          strokeDasharray="5 5"
                          dot={false}
                        />
                      ))}

                    {profileMode === "ab" && (
                      <Line
                        type="monotone"
                        dataKey="actual_gold"
                        name="ACTUAL GOLD"
                        stroke={isDark ? "#94a3b8" : "#475569"}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    )}

                    <Line
                      type="monotone"
                      dataKey="experimental_health"
                      name={
                        profileMode === "ab" ? "PROFILE A" : "FUSED VEHICLE HEALTH"
                      }
                      stroke="#3b82f6"
                      strokeWidth={4}
                      dot={false}
                      activeDot={{ r: 8 }}
                    />

                    {profileMode === "ab" && (
                      <Line
                        type="monotone"
                        dataKey="profile_b_health"
                        name="PROFILE B"
                        stroke="#8b5cf6"
                        strokeWidth={4}
                        dot={false}
                        activeDot={{ r: 8 }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Card>
          </Box>
        </Box>
      )}
    </Box>
  );
}
