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
  Divider,
  Checkbox,
  FormControlLabel,
  Slider,
  Button,
  Alert,
  Chip,
  TextField,
  IconButton,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import { ModuleRegistry, ClientSideRowModelModule } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-balham.css";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useStore } from "../store";
import { useChartTheme } from "../hooks/useChartTheme";
import { MODULE_COLORS } from "../constants/chartColors";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import DeleteIcon from "@mui/icons-material/Delete";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";

ModuleRegistry.registerModules([ClientSideRowModelModule]);

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

        "& .MuiTypography-root": {
          fontSize: "10px",
        },

        "& .MuiInputLabel-root": {
          fontSize: "10px",
        },

        "& .MuiSelect-select": {
          fontSize: "10px",
        },

        "& .MuiMenuItem-root": {
          fontSize: "10px",
        },

        "& .MuiInputBase-input": {
          fontSize: "10px",
        },

        "& .MuiButton-root": {
          fontSize: "10px",
        },
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

      {/* Preset */}
      <Box
        sx={{
          display: "flex",
          gap: 0.75,
          mb: 1,
          alignItems: "center",
        }}
      >
        <FormControl size="small" sx={{ flex: 1 }}>
          <Select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            displayEmpty
            sx={{
              borderRadius: 0,
              fontSize: "10px",
              height: 30,
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  "& .MuiMenuItem-root": {
                    fontSize: "10px",
                  },
                },
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
            borderRadius: 0,
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
            sx={{
              borderRadius: 0,
              p: 0.5,
            }}
          >
            <DeleteIcon sx={{ fontSize: 14 }} />
          </IconButton>
        )}
      </Box>

      {/* Warning */}
      {isImbalanced && (
        <Alert
          severity="warning"
          icon={false}
          sx={{
            borderRadius: 0,
            mb: 1,

            "& .MuiAlert-message": {
              p: 0,
            },
          }}
          action={
            <Button
              size="small"
              color="inherit"
              onClick={onAutoBalance}
              startIcon={<AutoFixHighIcon sx={{ fontSize: 12 }} />}
              sx={{
                fontSize: "10px",
              }}
            >
              RECALIBRATE
            </Button>
          }
        >
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: "10px",
            }}
          >
            Sum: {weightSum.toFixed(3)} (Target: 1.0)
          </Typography>
        </Alert>
      )}

      {/* Modules */}
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
        }}
      >
        {ALL_MODULES.map((mod) => {
          const isActive = modules.includes(mod);

          return (
            <Box
              key={mod}
              sx={{
                opacity: isActive ? 1 : 0.5,
                px: 0.5,
              }}
            >
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
                      sx={{
                        color: MODULE_COLORS[mod],
                        p: 0.5,
                      }}
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
                    borderRadius: 0,
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

                  "& .MuiSlider-markLabel": {
                    fontSize: "10px",
                  },

                  "& .MuiSlider-valueLabel": {
                    fontSize: "10px",
                  },
                }}
              />
            </Box>
          );
        })}
      </Box>

      {/* Save */}
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

            "& .MuiOutlinedInput-root": {
              borderRadius: 0,
              height: 30,
            },

            "& .MuiInputBase-input": {
              fontSize: "10px",
            },
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
            borderRadius: 0,
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

export default function GoldHealth({ isActive = true }: { isActive?: boolean }) {
  const { autoRefresh, darkMode } = useStore();
  const wasActiveRef = useRef(isActive);
  const theme = useTheme();
  const ct = useChartTheme();

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
    refetchInterval: isActive && activeTab === "operations" && autoRefresh ? 5000 : false,
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
    refetchInterval: isActive && activeTab === "operations" && autoRefresh ? 8000 : false,
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
    () => activeModulesB.reduce((sum, mod) => sum + (expWeightsB[mod] || 0), 0),
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
            ? (params: any) => ({
                fontWeight: "bold",
                color:
                  params.value < 50
                    ? "#d32f2f"
                    : params.value < 80
                    ? "#f57c00"
                    : "#388e3c",
              })
            : undefined,
      });
    });
    return cols;
  }, [history]);

  const agTheme = darkMode ? "ag-theme-balham-dark" : "ag-theme-balham";
  const chartAxisStyle = {
    fontSize: "11px",
    fill: ct.axisColor,
    fontWeight: 600,
  };
  const tooltipStyle = {
    borderRadius: 0,
    fontSize: "12px",
    padding: "10px",
    backgroundColor: ct.tooltipBg,
    border: `1px solid ${ct.tooltipBorder}`,
    color: ct.tooltipText,
  };

  return (
    <Box
      sx={{
        height: "calc(100vh - 80px)", // slightly more available space
        minHeight: 0, // prevents flex children from shrinking
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: "0 8px",
        bgcolor: "background.default",
        // pb: 10,
        // overflow: "hidden", // avoids nested overflow issues
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `2px solid ${theme.palette.divider}`,
          pb: 1,
          gap: 2,
          flexWrap: "wrap",

          "& .MuiTypography-root": {
            fontSize: "10px",
          },

          "& .MuiInputLabel-root": {
            fontSize: "10px",
          },

          "& .MuiSelect-select": {
            fontSize: "10px",
          },

          "& .MuiMenuItem-root": {
            fontSize: "10px",
          },
        }}
      >
        {/* LEFT TITLE */}
        <Typography
          sx={{
            fontWeight: 700,
            color: "text.secondary",
            letterSpacing: "-0.3px",
            fontSize: "14px !important",
            whiteSpace: "nowrap",
          }}
        >
          GOLD LAYER: FUSED VEHICLE HEALTH
        </Typography>

        {/* CENTER FILTER */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <Typography
            sx={{
              fontWeight: 700,
              color: "text.secondary",
              fontSize: "10px",
            }}
          >
            FILTER CONTEXT:
          </Typography>

          <FormControl
            size="small"
            sx={{
              minWidth: 220,

              "& .MuiOutlinedInput-root": {
                borderRadius: 0,
                height: 30,
                fontSize: "10px",
              },
            }}
          >
            <InputLabel sx={{ fontSize: "10px" }}>
              Active Vehicle (Sim)
            </InputLabel>

            <Select
              value={filterSim}
              onChange={(e) => setFilterSim(e.target.value)}
              label="Active Vehicle (Sim)"
              sx={{
                fontSize: "10px",
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    "& .MuiMenuItem-root": {
                      fontSize: "10px",
                    },
                  },
                },
              }}
            >
              <MenuItem
                value="ALL"
                sx={{
                  fontWeight: 700,
                  fontSize: "10px",
                }}
              >
                ALL VEHICLES (FLEET)
              </MenuItem>

              {availableSims.map((sim: string) => (
                <MenuItem key={sim} value={sim} sx={{ fontSize: "10px" }}>
                  {sim}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* RIGHT TOGGLE */}
        <ToggleButtonGroup
          value={activeTab}
          exclusive
          onChange={(_e, val) => val && setActiveTab(val)}
          size="small"
          sx={{
            height: 28,
            bgcolor: "background.paper",
            "& .MuiToggleButton-root": {
              px: 2,
              py: 0,
              minHeight: 28,
              borderRadius: 0,
              fontSize: "10px",
              fontWeight: 700,
              lineHeight: 1,
            },
          }}
        >
          <ToggleButton value="operations">LIVE OPERATIONS</ToggleButton>

          <ToggleButton value="experiment">
            WEIGHT EXPERIMENTATION LAB
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {activeTab === "operations" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            gap: 2,
            minHeight: 0,
          }}
        >
          <Box sx={{ display: "flex", gap: 1, width: "100%" }}>
            {[
              {
                label: "ACTIVE SIMULATIONS",
                value: availableSims.length,
                bg: "#EEF6FF",
                border: "#005071",
              },
              {
                label: "TOTAL GOLD ROWS",
                value: metrics?.total_gold_rows?.toLocaleString() || 0,
                bg: "#F3F0FF",
                border: "#6D5BD0",
              },
              {
                label: "GLOBAL MAX LAG",
                value: displayLag.toLocaleString(),
                color: displayLag > 1000 ? theme.palette.error.main : undefined,
                bg: "#FFF4E8",
                border: "#E67E22",
              },
              {
                label:
                  filterSim === "ALL"
                    ? "FLEET AVG VEHICLE HEALTH"
                    : "CURRENT VEHICLE HEALTH",
                value: `${
                  filterSim === "ALL"
                    ? fleetHealthKpi
                    : latestRow?.vehicle_health_score || 0
                }%`,
                color:
                  (filterSim === "ALL"
                    ? fleetHealthKpi
                    : latestRow?.vehicle_health_score ?? 100) < 60
                    ? theme.palette.error.main
                    : theme.palette.success.main,
                bg:
                  (filterSim === "ALL"
                    ? fleetHealthKpi
                    : latestRow?.vehicle_health_score ?? 100) < 60
                    ? "#FFF1F1"
                    : "#EEFCEF",
                border:
                  (filterSim === "ALL"
                    ? fleetHealthKpi
                    : latestRow?.vehicle_health_score ?? 100) < 60
                    ? "#D32F2F"
                    : "#2E7D32",
              },
            ].map((kpi, idx) => (
              <Paper
                key={idx}
                elevation={0}
                sx={{
                  flex: 1,
                  p: 1.5,
                  borderRadius: 0,
                  bgcolor: kpi.bg,
                  borderLeft: `5px solid ${kpi.border}`,
                  minHeight: 100,

                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <Typography
                  sx={{
                    color: "text.secondary",
                    fontWeight: 700,
                    fontSize: "10px",
                  }}
                >
                  {kpi.label}
                </Typography>

                <Typography
                  sx={{
                    fontWeight: 700,
                    color: kpi.color || "text.primary",
                    mt: 1,
                    fontSize: "20px",
                  }}
                >
                  {kpi.value}
                </Typography>
              </Paper>
            ))}
          </Box>

          <Box sx={{ display: "flex", gap: 2, flex: 1, minHeight: 0 }}>
            <Paper
              sx={{
                width: "300px",
                p: 1,
                borderRadius: 0,
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: "bold", color: "text.secondary", mb: 2 }}
              >
                {filterSim === "ALL"
                  ? "LATEST DEGRADATION DRIVERS (FLEET)"
                  : "LATEST DEGRADATION DRIVERS"}
              </Typography>
              {topFeatures.length > 0 ? (
                topFeatures.map((f: any, i) => (
                  <Box key={i} sx={{ mb: 1.5 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: "bold", fontSize: "12px" }}
                    >
                      {f.feature}
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box
                        sx={{
                          flex: 1,
                          height: "6px",
                          bgcolor: ct.gridColor,
                          borderRadius: "3px",
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
                            bgcolor: theme.palette.error.main,
                          }}
                        />
                      </Box>
                      <Typography variant="caption">
                        {parseFloat(f.impact).toFixed(2)}
                      </Typography>
                    </Box>
                  </Box>
                ))
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Awaiting anomaly data...
                </Typography>
              )}
            </Paper>

            <Paper
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                p: 1,
                borderRadius: 0,
                minHeight: 0,

                /* Global text */
                "& .MuiTypography-root": {
                  fontSize: "10px",
                },

                /* AG Grid Header */
                "& .ag-header": {
                  background: "#005071 !important",
                  borderBottom: "none !important",
                },

                "& .ag-header-cell": {
                  background: "#005071 !important",
                  color: "#fff !important",
                  fontSize: "10px !important",
                  fontWeight: 700,
                  borderColor: "#0B658B !important",
                },

                "& .ag-header-cell-label": {
                  color: "#fff !important",
                },

                /* Sort / Filter icons */
                "& .ag-icon": {
                  color: "#fff !important",
                },

                /* Rows */
                "& .ag-cell": {
                  fontSize: "10px !important",
                  display: "flex",
                  alignItems: "center",
                },

                "& .ag-row": {
                  minHeight: "30px !important",
                },

                "& .ag-row:nth-of-type(even)": {
                  backgroundColor: "#FAFBFC",
                },

                "& .ag-root-wrapper": {
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 0,
                },
              }}
            >
              <Box
                sx={{
                  px: 0,
                  py: 0,
                  mb: 1,
                  bgcolor: "transparent",
                  lineHeight: "12px",
                  // borderBottom: `1px solid ${theme.palette.divider}`,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: "bold",
                    color: "text.secondary",
                    mb: 0,
                    fontSize: "12px !important",
                    lineHeight: "12px",
                  }}
                >
                  VEHICLE HEALTH HISTORY
                </Typography>
              </Box>

              <Box
                className={agTheme}
                sx={{
                  flex: 1,
                  minHeight: 0,
                  width: "100%",
                }}
              >
                <AgGridReact
                  rowData={reversedHistory}
                  columnDefs={tableColDefs}
                  defaultColDef={{
                    resizable: true,
                    sortable: true,
                  }}
                />
              </Box>
            </Paper>
          </Box>
        </Box>
      )}

      {activeTab === "experiment" && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: "bold", color: "text.secondary" }}
            >
              SIMULATION MODE:
            </Typography>
            <ToggleButtonGroup
              value={profileMode}
              exclusive
              onChange={(_, val) => val && setProfileMode(val)}
              size="small"
              // sx={{ bgcolor: "background.paper" }}
              sx={{
                height: 28,
                bgcolor: "background.paper",
                "& .MuiToggleButton-root": {
                  px: 2,
                  py: 0,
                  minHeight: 28,
                  borderRadius: 0,
                  fontSize: "10px",
                  fontWeight: 700,
                  lineHeight: 1,
                },
              }}
            >
              <ToggleButton
                value="single"
                sx={{
                  fontWeight: "bold",
                  px: 2,
                  borderRadius: 0,
                  fontSize: "12px",
                }}
              >
                SINGLE PROFILE
              </ToggleButton>
              <ToggleButton
                value="ab"
                sx={{
                  fontWeight: "bold",
                  px: 2,
                  borderRadius: 0,
                  fontSize: "12px",
                }}
              >
                <CompareArrowsIcon sx={{ fontSize: 16, mr: 0.5 }} />
                A/B COMPARISON
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: "flex", gap: 2, flex: 1, minHeight: 0 }}>
            <Paper
              sx={{
                width: profileMode === "ab" ? "280px" : "320px",
                p: 1,
                borderRadius: 0,
                display: "flex",
                flexDirection: "column",
                borderTop: "3px solid #1976d2",
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
            </Paper>

            {profileMode === "ab" && (
              <Paper
                sx={{
                  width: "280px",
                  p: 1,
                  borderRadius: 0,
                  display: "flex",
                  flexDirection: "column",
                  borderTop: "3px solid #7b1fa2",
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
              </Paper>
            )}

            <Paper
              sx={{
                flex: 1,
                p: 1,
                borderRadius: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: "bold",
                  color: "text.secondary",
                  mb: 1,
                  fontSize: "12px !important",
                }}
              >
                {filterSim === "ALL"
                  ? "FLEET-WIDE AVERAGED HEALTH TRAJECTORY"
                  : `RECALCULATED HEALTH TRAJECTORY: ${filterSim}`}
                {profileMode === "ab" && " — A/B COMPARISON"}
              </Typography>

              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={mergedChartData}
                  margin={{ top: 10, right: 30, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke={ct.gridColor}
                  />
                  <XAxis
                    dataKey="ts_short"
                    tick={chartAxisStyle}
                    axisLine={{ stroke: ct.tableBorder }}
                    tickLine={false}
                    minTickGap={30}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={chartAxisStyle}
                    axisLine={{ stroke: ct.tableBorder }}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend
                    wrapperStyle={{
                      fontSize: "10px",
                    }}
                    formatter={(value) => (
                      <span
                        style={{
                          fontSize: "8px",
                          fontWeight: 600,
                          color: ct.axisColor,
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
                      stroke={ct.axisColor}
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  )}

                  <Line
                    type="monotone"
                    dataKey="experimental_health"
                    name={
                      profileMode === "ab"
                        ? "PROFILE A"
                        : "FUSED VEHICLE HEALTH"
                    }
                    stroke="#1976d2"
                    strokeWidth={4}
                    dot={false}
                    activeDot={{ r: 8 }}
                  />

                  {profileMode === "ab" && (
                    <Line
                      type="monotone"
                      dataKey="profile_b_health"
                      name="PROFILE B"
                      stroke="#7b1fa2"
                      strokeWidth={4}
                      dot={false}
                      activeDot={{ r: 8 }}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </Paper>
          </Box>
        </Box>
      )}
    </Box>
  );
}
