import { HashRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline } from "@mui/material";
import Layout from "./components/Layout";
import { useStore } from "./store";
import { lightTheme, darkTheme } from "./theme";
import { GoldStreamProvider } from "./contexts/GoldStreamContext";

function App() {
  const darkMode = useStore((s) => s.darkMode);

  return (
    <GoldStreamProvider>
      <ThemeProvider theme={darkMode ? darkTheme : lightTheme}>
        <CssBaseline />
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
