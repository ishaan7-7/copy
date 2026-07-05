import { HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline, GlobalStyles } from "@mui/material";
import Layout from "./components/Layout";
import { useStore } from "./store";
import { lightTheme, darkTheme } from "./theme";
import { GoldStreamProvider } from "./contexts/GoldStreamContext";

const scrollbarStyles = (dark: boolean) => ({
  "*": {
    scrollbarWidth: "thin" as const,
    scrollbarColor: dark
      ? "rgba(94 124 160 / 0.35) transparent"
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
    background: dark ? "rgba(94,124,160,0.35)" : "rgba(0,0,0,0.18)",
    borderRadius: "999px",
    transition: "background 0.2s",
  },
  "*::-webkit-scrollbar-thumb:hover": {
    background: dark ? "rgba(94,124,160,0.65)" : "rgba(0,0,0,0.35)",
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
            <Route path="/*" element={<Layout />} />
          </Routes>
        </HashRouter>
      </ThemeProvider>
    </GoldStreamProvider>
  );
}

export default App;
