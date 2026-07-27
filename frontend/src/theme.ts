import { createTheme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";

const baseTypography = {
  fontFamily: '"Inter", "Segoe UI", Roboto, Arial, sans-serif',
  body1: {
    fontSize: "0.82rem",
    "@media (min-width:1440px) and (min-height:820px)": {
      fontSize: "0.9rem",
    },
    "@media (min-width:1800px) and (min-height:950px)": {
      fontSize: "0.98rem",
    },
  },
  body2: {
    fontSize: "0.76rem",
    "@media (min-width:1440px) and (min-height:820px)": {
      fontSize: "0.84rem",
    },
    "@media (min-width:1800px) and (min-height:950px)": {
      fontSize: "0.92rem",
    },
  },
  caption: {
    fontSize: "0.68rem",
    "@media (min-width:1440px) and (min-height:820px)": {
      fontSize: "0.74rem",
    },
    "@media (min-width:1800px) and (min-height:950px)": {
      fontSize: "0.8rem",
    },
  },
  button: {
    fontSize: "0.76rem",
    "@media (min-width:1440px) and (min-height:820px)": {
      fontSize: "0.84rem",
    },
    "@media (min-width:1800px) and (min-height:950px)": {
      fontSize: "0.92rem",
    },
  },
  h6: {
    fontWeight: 600,
    letterSpacing: "0.5px",
    textTransform: "uppercase" as const,
    fontSize: "0.9rem",
    "@media (min-width:1440px) and (min-height:820px)": {
      fontSize: "1rem",
    },
    "@media (min-width:1800px) and (min-height:950px)": {
      fontSize: "1.1rem",
    },
  },
};

const baseComponents = {
  MuiButton: {
    styleOverrides: {
      root: {
        textTransform: "none" as const,
        fontWeight: 600,
        borderRadius: 8,
      },
    },
  },
};

const cockpitLight = {
  appBg: "#f5f7fa",
  pageBg: "#f8fafc",
  panel: "#ffffff",
  panelElevated: "#fffaf7",
  panelSoft: "#fff3ec",
  border: "rgba(251, 78, 11, 0.16)",
  borderStrong: "rgba(251, 78, 11, 0.3)",
  text: "#16202d",
  muted: "#637083",
  orange: "#FB4E0B",
  blue: "#005071",
};

const cockpitDark = {
  appBg: "#050d17",
  pageBg: "#07111e",
  panel: "#0b1724",
  panelElevated: "#0f1f31",
  panelSoft: "#102235",
  border: "rgba(125, 211, 252, 0.14)",
  borderStrong: "rgba(56, 189, 248, 0.28)",
  text: "#edf5ff",
  muted: "#9fb2c9",
  blue: "#38bdf8",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
};

export const lightTheme = createTheme({
  palette: {
    mode: "light",
    background: {
      default: cockpitLight.appBg,
      paper: cockpitLight.panel,
    },
    primary: { main: cockpitLight.orange, dark: "#d83f06", light: "#ff8a4d" },
    error: { main: "#d32f2f" },
    warning: { main: "#ed6c02" },
    success: { main: "#2e7d32" },
    info: { main: cockpitLight.blue },
    text: {
      primary: cockpitLight.text,
      secondary: cockpitLight.muted,
    },
    divider: cockpitLight.border,
    action: {
      hover: alpha(cockpitLight.orange, 0.07),
      selected: alpha(cockpitLight.orange, 0.12),
      disabledBackground: alpha("#0f172a", 0.05),
    },
  },
  typography: baseTypography,
  shape: { borderRadius: 8 },
  components: {
    ...baseComponents,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at 12% 0%, rgba(251,78,11,0.07), transparent 27%), linear-gradient(145deg, #f8fafc 0%, #f2f6fa 52%, #fff8f3 100%)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage:
            "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(255,250,247,0.96))",
          border: `1px solid ${cockpitLight.border}`,
          boxShadow:
            "0 12px 28px rgba(15,47,69,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
          backdropFilter: "blur(10px)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage:
            "linear-gradient(145deg, rgba(255,255,255,0.98), rgba(255,250,247,0.96))",
          border: `1px solid ${cockpitLight.border}`,
          boxShadow:
            "0 12px 28px rgba(15,47,69,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage:
            "linear-gradient(90deg, rgba(255,255,255,0.98), rgba(255,250,247,0.96))",
          borderBottom: `1px solid ${cockpitLight.border}`,
          boxShadow: "0 8px 24px rgba(15,47,69,0.08)",
          backdropFilter: "blur(14px)",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          "&:hover": {
            backgroundColor: alpha(cockpitLight.orange, 0.1),
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(cockpitLight.panel, 0.86),
          "& fieldset": { borderColor: cockpitLight.border },
          "&:hover fieldset": { borderColor: cockpitLight.borderStrong },
          "&.Mui-focused fieldset": { borderColor: cockpitLight.orange },
        },
      },
    },
    MuiPaginationItem: {
      styleOverrides: {
        root: {
          fontSize: "12px",
          color: `${cockpitLight.muted} !important`,
          backgroundColor: `${cockpitLight.panel} !important`,
          border: `1px solid ${cockpitLight.border} !important`,
          borderRadius: "6px !important",
          "&:hover": {
            backgroundColor: `${cockpitLight.panelSoft} !important`,
            color: `${cockpitLight.text} !important`,
          },
          "&.Mui-selected": {
            backgroundColor: `${cockpitLight.blue} !important`,
            color: "#ffffff !important",
            borderColor: `${cockpitLight.blue} !important`,
            "&:hover": {
              backgroundColor: "#003e59 !important",
            },
          },
          "&.MuiPaginationItem-ellipsis": {
            backgroundColor: "transparent !important",
            border: "none !important",
          },
        },
      },
    },
  },
});

export const darkTheme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#080c12",
      paper: "#0d1117",
    },
    primary: { main: cockpitDark.blue, light: "#7dd3fc", dark: "#0ea5e9" },
    error: { main: cockpitDark.red },
    warning: { main: cockpitDark.amber },
    success: { main: cockpitDark.green },
    info: { main: "#60a5fa" },
    text: {
      primary: cockpitDark.text,
      secondary: cockpitDark.muted,
    },
    divider: cockpitDark.border,
    action: {
      hover: alpha(cockpitDark.blue, 0.08),
      selected: alpha(cockpitDark.blue, 0.14),
      disabledBackground: alpha("#ffffff", 0.06),
    },
    // divider: "#1e2433",
  },
  typography: baseTypography,
  shape: { borderRadius: 8 },
  components: {
    ...baseComponents,
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          background:
            "radial-gradient(circle at 12% 0%, rgba(56,189,248,0.08), transparent 26%), linear-gradient(145deg, #050d17 0%, #07111e 52%, #091522 100%)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid #1e2433",
          boxShadow: "none",
        },
      },
    },
    MuiPaginationItem: {
      styleOverrides: {
        root: {
          fontSize: "12px",
          color: `${cockpitDark.muted} !important`,
          backgroundColor: `${cockpitDark.panelElevated} !important`,
          border: `1px solid ${cockpitDark.border} !important`,
          borderRadius: "6px !important",
          "&:hover": {
            backgroundColor: `${cockpitDark.panelSoft} !important`,
            color: `${cockpitDark.text} !important`,
          },
          "&.Mui-selected": {
            backgroundColor: `${cockpitDark.blue} !important`,
            color: "#ffffff !important",
            borderColor: `${cockpitDark.blue} !important`,
            "&:hover": {
              backgroundColor: "#0ea5e9 !important",
            },
          },
          "&.MuiPaginationItem-ellipsis": {
            backgroundColor: "transparent !important",
            border: "none !important",
          },
        },
      },
    },
  },
});

export const industrialTheme = lightTheme;
