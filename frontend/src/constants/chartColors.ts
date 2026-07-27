export const MODULE_COLORS: Record<string, string> = {
  engine: '#e57373',
  transmission: '#ffb74d',
  battery: '#81c784',
  body: '#ba68c8',
  tyre: '#4dd0e1',
};

export const SHAP_COLORS_LIGHT = ['#e53935', '#fb8c00', '#8e24aa', '#1e88e5', '#43a047', '#6d4c41'];
export const SHAP_COLORS_DARK  = ['#ef4444', '#f59e0b', '#a855f7', '#38bdf8', '#22c55e', '#c08457'];

export const SEVERITY_COLORS = {
  CRITICAL: '#d32f2f',
  WARNING:  '#ed6c02',
  NORMAL:   '#2e7d32',
} as const;

export const SEVERITY_BG_LIGHT: Record<string, string> = {
  CRITICAL: '#ffebee',
  WARNING:  '#fff8e1',
  NORMAL:   '#e8f5e9',
};

export const SEVERITY_BG_DARK: Record<string, string> = {
  CRITICAL: 'rgba(239,68,68,0.18)',
  WARNING:  'rgba(245,158,11,0.18)',
  NORMAL:   'rgba(34,197,94,0.16)',
};
