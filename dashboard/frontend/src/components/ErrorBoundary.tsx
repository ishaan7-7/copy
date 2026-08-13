import { Component, ErrorInfo, ReactNode } from "react";
import { Box, Typography } from "@mui/material";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";

interface Props {
  children: ReactNode;
  active?: boolean;
  darkMode?: boolean;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Dashboard section crashed:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && this.props.active && !prevProps.active) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      const { darkMode } = this.props;
      return (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            height: "100%",
            minHeight: 300,
            textAlign: "center",
            p: 4,
          }}
        >
          <WarningAmberRoundedIcon sx={{ fontSize: 32, color: darkMode ? "#f0b955" : "#93600a" }} />
          <Typography variant="h6" sx={{ color: darkMode ? "#edf5ff" : "#333" }}>
            This section hit a problem
          </Typography>
          <Typography variant="body2" sx={{ color: darkMode ? "#9fb2c9" : "#64748B", maxWidth: 420 }}>
            Switch to another page and back to reload it, or refresh the dashboard if it persists.
          </Typography>
        </Box>
      );
    }
    return this.props.children;
  }
}
