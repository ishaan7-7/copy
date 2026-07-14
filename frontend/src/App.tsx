import { HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline, GlobalStyles } from "@mui/material";
import Layout from "./components/Layout";
import { useStore } from "./store";
import { lightTheme, darkTheme } from "./theme";
import { GoldStreamProvider } from "./contexts/GoldStreamContext";
import TelematrixLandingPage from "./pages/TelematrixLandingPage";

const scrollbarStyles = (dark: boolean) => ({
  ":root": {
    "--app-header-h": "42px",
    "--app-page-pad": "8px",
    "--app-gap": "8px",
    "--app-font-xs": "10px",
    "--app-font-sm": "11px",
    "--app-font-md": "12px",
    "--app-font-lg": "14px",
    "--app-icon-sm": "16px",
    "--app-icon-md": "20px",
    "--app-control-h": "30px",
  },
  "@media (min-width: 1440px) and (min-height: 820px)": {
    ":root": {
      "--app-header-h": "46px",
      "--app-page-pad": "10px",
      "--app-gap": "10px",
      "--app-font-xs": "10px",
      "--app-font-sm": "11px",
      "--app-font-md": "12px",
      "--app-font-lg": "14px",
      "--app-icon-sm": "18px",
      "--app-icon-md": "22px",
      "--app-control-h": "34px",
    },
  },
  "@media (min-width: 1800px) and (min-height: 950px)": {
    ":root": {
      "--app-header-h": "52px",
      "--app-page-pad": "12px",
      "--app-gap": "12px",
      "--app-font-xs": "10px",
      "--app-font-sm": "11px",
      "--app-font-md": "12px",
      "--app-font-lg": "14px",
      "--app-icon-sm": "20px",
      "--app-icon-md": "24px",
      "--app-control-h": "38px",
    },
  },
  "@media (max-height: 760px), (max-width: 1180px)": {
    ":root": {
      "--app-header-h": "38px",
      "--app-page-pad": "12px",
      "--app-gap": "6px",
      "--app-font-xs": "10px",
      "--app-font-sm": "11px",
      "--app-font-md": "12px",
      "--app-font-lg": "13px",
      "--app-icon-sm": "14px",
      "--app-icon-md": "18px",
      "--app-control-h": "28px",
    },
  },
  ".cockpit-card-fit": {
    minHeight: 0,
    overflow: "hidden",
  },
  ".cockpit-card-fit .MuiTypography-root": {
    minWidth: 0,
  },
  ".cockpit-internal-scroll": {
    minHeight: 0,
    overflow: "auto",
  },
  "html, body, #root": {
    height: "100%",
    overflowX: "hidden",
    overflowY: "scroll",
  },
  body: {
    fontSize: "var(--app-font-md)",
  },
  ".MuiSvgIcon-root": {
    fontSize: "var(--app-icon-md)",
  },
  ".MuiButton-root, .MuiToggleButton-root, .MuiInputBase-root, .MuiTableCell-root, .ag-cell, .ag-header-cell-label":
    {
      fontSize: "var(--app-font-sm) !important",
    },
  ".MuiTableContainer-root, .ag-root-wrapper, .ag-body-viewport": {
    overflow: "auto",
  },
  "*": {
    scrollbarWidth: "thin" as const,
    scrollbarColor: dark
      ? "rgba(56 189 248 / 0.35) transparent"
      : "rgba(0 0 0 / 0.18) transparent",
  },
  "*::-webkit-scrollbar": {
    width: "4px",
    height: "4px",
  },
  "*::-webkit-scrollbar-track": {
    background: "transparent",
  },
  "*::-webkit-scrollbar-thumb": {
    background: dark ? "rgba(56,189,248,0.35)" : "rgba(0,0,0,0.18)",
    borderRadius: "999px",
    transition: "background 0.2s",
  },
  "*::-webkit-scrollbar-thumb:hover": {
    background: dark ? "rgba(56,189,248,0.6)" : "rgba(0,0,0,0.35)",
  },
  "*::-webkit-scrollbar-corner": {
    background: "transparent",
  },
});

function App() {
  const darkMode = useStore((s) => s.darkMode);

  return (
    <GoldStreamProvider>
      <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
        <CssBaseline />
        <GlobalStyles styles={scrollbarStyles(darkMode)} />
        <HashRouter>
          <Routes>
            <Route path="/" element={<TelematrixLandingPage />} />
            <Route path="/*" element={<Layout />} />
          </Routes>
        </HashRouter>
      </ThemeProvider>
    </GoldStreamProvider>
  );
}

export default App;
