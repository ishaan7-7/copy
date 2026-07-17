import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Grid,
  IconButton,
  Link,
  Paper,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import BuildCircleIcon from "@mui/icons-material/BuildCircle";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import SpeedIcon from "@mui/icons-material/Speed";
import type { ElementType } from "react";
import { useNavigate } from "react-router";
import exlLogo from "../images/exl-logo.png";
import solutionSnapshot from "../images/telemetrix-solution-snapshot.png";
import darkSolutionSnapshot from "../images/telemetrix-solution-snapshot-dark.png";
import { useStore } from "../store";

type Capability = {
  title: string;
  text: string;
  icon: ElementType;
};

const capabilities: Capability[] = [
  {
    title: "Live Fleet Command",
    text: "See vehicle location, status, routes, utilization, alerts, and health in one current operating view.",
    icon: GpsFixedIcon,
  },
  {
    title: "Predictive Fleet Health",
    text: "Detect emerging component issues, prioritize maintenance, and reduce unplanned downtime.",
    icon: BuildCircleIcon,
  },
  {
    title: "Safety & Efficiency",
    text: "Understand driver behavior, fuel use, idle time, and route performance with clear scores.",
    icon: SpeedIcon,
  },
  {
    title: "AI-Assisted Intelligence",
    text: "Ask fleet questions in natural language and get role-aware summaries for executives, monitoring teams, and engineers.",
    icon: AutoGraphIcon,
  },
];

export default function TelematrixLandingPage() {
  const navigate = useNavigate();
  const { darkMode: isDark, toggleDarkMode } = useStore();

  const colors = isDark
    ? {
        page: "#070b12",
        surface: "#0b131e",
        card: "linear-gradient(145deg, #162231 0%, #101a26 100%)",
        ink: "#f1f7fb",
        muted: "#a8bac8",
        border: "#263747",
        appBar: "rgba(7,11,18,.92)",
        accent: "#38bdf8",
        iconBg: "rgba(56,189,248,.13)",
      }
    : {
        page: "#f5f9fb",
        surface: "#ffffff",
        card: "#ffffff",
        ink: "#102033",
        muted: "#64748b",
        border: "#d9e6ec",
        appBar: "rgba(255,255,255,.94)",
        accent: "#005071",
        iconBg: "rgba(0,80,113,.09)",
      };

  const goToCapabilities = () =>
    document.getElementById("capabilities")?.scrollIntoView({ behavior: "smooth" });

  return (
    <Box
      sx={{
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        bgcolor: colors.page,
        color: colors.ink,
      }}
    >
      <AppBar
        elevation={0}
        position="sticky"
        sx={{
          bgcolor: colors.appBar,
          backdropFilter: "blur(14px)",
          borderBottom: `1px solid ${colors.border}`,
          color: colors.ink,
        }}
      >
        <Toolbar
          disableGutters
          sx={{
            minHeight: "var(--app-header-h) !important",
            height: "var(--app-header-h)",
            padding: "0 var(--app-page-pad) !important",
            display: "flex",
            justifyContent: "space-between",
            gap: "var(--app-gap)",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 1.5, lg: 2, xl: 2.5 },
              minWidth: 0,
              flexShrink: 0,
            }}
          >
            <Box
              aria-hidden="true"
              sx={{
                width: "var(--app-control-h)",
                height: "var(--app-control-h)",
                flexShrink: 0,
              }}
            />
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1, lg: 1.75, xl: 2.5 },
                flexShrink: 0,
                cursor: "pointer",
              }}
              onClick={() => navigate("/")}
            >
            <Box
              component="img"
              src={exlLogo}
              alt="EXL Logo"
              sx={{ width: { xs: 58, lg: 72, xl: 84 }, flex: "0 0 auto" }}
            />
            <Box>
              <Typography
                sx={{
                  fontSize: { xs: 16, lg: 20, xl: 22 },
                  fontWeight: 800,
                  color: isDark ? "#edf5ff" : "#005071",
                  lineHeight: 1,
                  letterSpacing: "-0.4px",
                  display: "flex",
                  alignItems: "baseline",
                }}
              >
                Telemetri
                <Box
                  component="span"
                  sx={{
                    fontSize: { xs: 18, lg: 22, xl: 24 },
                    color: "#ed6c02",
                    fontWeight: 900,
                    fontStyle: "italic",
                    fontFamily: "Arial Black, Arial, sans-serif",
                    ml: "1px",
                    lineHeight: 1,
                  }}
                >
                  X
                </Box>
              </Typography>
              <Typography
                sx={{
                  fontSize: "var(--app-font-xs)",
                  color: isDark ? "#9fb2c9" : "#64748B",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                  mt: 0.2,
                }}
              >
                Vehicle Intelligence Platform
              </Typography>
            </Box>
            </Box>
          </Box>

          <Link
            component="button"
            underline="none"
            onClick={goToCapabilities}
            sx={{
              display: { xs: "none", md: "block" },
              ml: "auto",
              color: colors.ink,
              fontSize: 13,
              fontWeight: 750,
              border: 0,
              bgcolor: "transparent",
              cursor: "pointer",
            }}
          >
            What it does
          </Link>
          <Tooltip title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
            <IconButton
              onClick={toggleDarkMode}
              size="small"
              sx={{ ml: { xs: "auto", md: 0 }, color: colors.muted }}
            >
              {isDark ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            onClick={() => navigate("/cockpit-view")}
            sx={{
              bgcolor: "#005071",
              color: "#fff !important",
              borderRadius: 2,
              fontWeight: 800,
              textTransform: "none",
              boxShadow: isDark ? "0 6px 18px rgba(0,80,113,.38)" : undefined,
              "&:hover": { bgcolor: "#003f59", color: "#fff !important" },
            }}
          >
            Open Platform
          </Button>
        </Toolbar>
      </AppBar>

      <Box
        component="section"
        sx={{
          minHeight: { xs: 390, md: 425 },
          display: "flex",
          alignItems: "center",
          color: "#fff",
          background:
            "radial-gradient(circle at 82% 22%, rgba(56,189,248,.2), transparent 30%), linear-gradient(120deg, #06111d 0%, #0b2c40 58%, #07536a 100%)",
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 5.5 } }}>
          <Grid container spacing={{ xs: 4, md: 4 }} alignItems="center">
            <Grid item xs={12} md={6}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2.2 }}>
                <Chip
                  label="Connected fleet intelligence"
                  size="small"
                  sx={{
                    color: "#dff6ff",
                    bgcolor: "rgba(255,255,255,.1)",
                    border: "1px solid rgba(255,255,255,.18)",
                    fontWeight: 800,
                  }}
                />
                <Chip
                  label="AI Assistant · Built in"
                  size="small"
                  sx={{
                    color: "#e0f2fe",
                    bgcolor: "rgba(56,189,248,.15)",
                    border: "1px solid rgba(125,211,252,.3)",
                    fontWeight: 850,
                  }}
                />
              </Stack>
              <Typography
                component="h1"
                sx={{
                  fontSize: { xs: 38, sm: 46, md: 46, lg: 50 },
                  lineHeight: 0.98,
                  fontWeight: 850,
                  letterSpacing: "-.03em",
                }}
              >
                <Box component="span" sx={{ display: "block", whiteSpace: { xs: "normal", sm: "nowrap" } }}>
                  See your fleet clearly.
                </Box>
                <Box
                  component="span"
                  sx={{
                    display: "block",
                    mt: { xs: 1, md: 1.25 },
                    color: "#7dd3fc",
                    whiteSpace: { xs: "normal", sm: "nowrap" },
                  }}
                >
                  Act before issues grow.
                </Box>
              </Typography>
              <Typography
                sx={{
                  mt: 2.5,
                  maxWidth: 600,
                  color: "rgba(255,255,255,.78)",
                  fontSize: { xs: 15, md: 16 },
                  lineHeight: 1.6,
                }}
              >
                TelemetriX brings live vehicle data, health, maintenance, safety, and operating performance into one role-based command center.
              </Typography>
              <Stack direction="row" spacing={1.4} sx={{ mt: 3.5 }}>
                <Button
                  size="large"
                  variant="contained"
                  onClick={() => navigate("/cockpit-view")}
                  sx={{
                    bgcolor: "#f59e0b",
                    color: "#111827",
                    fontWeight: 900,
                    textTransform: "none",
                    "&:hover": { bgcolor: "#d98605" },
                  }}
                >
                  Explore TelemetriX
                </Button>
                <Button
                  size="large"
                  variant="outlined"
                  onClick={goToCapabilities}
                  sx={{
                    display: { xs: "none", sm: "inline-flex" },
                    color: "#fff",
                    borderColor: "rgba(255,255,255,.4)",
                    fontWeight: 800,
                    textTransform: "none",
                    "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,.06)" },
                  }}
                >
                  See capabilities
                </Button>
              </Stack>
            </Grid>
            <Grid item xs={12} md={6} sx={{ display: { xs: "none", sm: "block" } }}>
              <Box sx={{ width: { sm: "88%", md: "88%" }, maxWidth: 560, ml: "auto" }}>
                <Paper
                  elevation={18}
                  sx={{
                    p: 0.7,
                    borderRadius: 2.5,
                    bgcolor: "rgba(255,255,255,.12)",
                    border: "1px solid rgba(255,255,255,.22)",
                    boxShadow: "0 22px 58px rgba(0,0,0,.3)",
                    transform: { md: "perspective(1200px) rotateY(-2deg)" },
                  }}
                >
                  <Box
                    component="img"
                    src={isDark ? darkSolutionSnapshot : solutionSnapshot}
                    alt="TelemetriX Executive Cockpit solution snapshot"
                    sx={{ display: "block", width: "100%", height: "auto", borderRadius: 1.8 }}
                  />
                </Paper>
                <Typography
                  sx={{ mt: 0.8, textAlign: "right", color: "rgba(255,255,255,.58)", fontSize: 11 }}
                >
                  Executive Cockpit · Solution preview
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box component="section" id="capabilities" sx={{ bgcolor: colors.surface }}>
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 6 } }}>
          <Box sx={{ maxWidth: 700, mb: 3.5 }}>
            <Typography
              variant="overline"
              sx={{ color: colors.accent, fontWeight: 900, letterSpacing: ".08em" }}
            >
              ONE PLATFORM, FOUR OUTCOMES
            </Typography>
            <Typography
              component="h2"
              sx={{ mt: 0.4, fontSize: { xs: 30, md: 38 }, fontWeight: 850, lineHeight: 1.1 }}
            >
              From telemetry to confident action
            </Typography>
            <Typography sx={{ mt: 1.2, color: colors.muted, lineHeight: 1.6 }}>
              The essential fleet picture—without switching between disconnected tools and reports.
            </Typography>
          </Box>

          <Grid container spacing={2}>
            {capabilities.map(({ title, text, icon: Icon }) => (
              <Grid item xs={12} sm={6} md={3} key={title}>
                <Paper
                  elevation={0}
                  sx={{
                    height: "100%",
                    minHeight: 195,
                    p: 2.4,
                    borderRadius: 2.5,
                    border: `1px solid ${colors.border}`,
                    background: colors.card,
                    boxShadow: isDark
                      ? "inset 0 1px 0 rgba(255,255,255,.03)"
                      : "0 10px 28px rgba(15,47,69,.06)",
                  }}
                >
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      mb: 2,
                      borderRadius: 1.8,
                      display: "grid",
                      placeItems: "center",
                      bgcolor: colors.iconBg,
                      color: colors.accent,
                    }}
                  >
                    <Icon />
                  </Box>
                  <Typography sx={{ color: colors.ink, fontSize: 17, fontWeight: 850 }}>
                    {title}
                  </Typography>
                  <Typography sx={{ mt: 1, color: colors.muted, fontSize: 13.5, lineHeight: 1.55 }}>
                    {text}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={{ xs: 1, sm: 2 }}
            alignItems={{ xs: "flex-start", sm: "center" }}
            sx={{
              mt: 3,
              px: { xs: 2, md: 3 },
              py: 2,
              borderRadius: 2,
              bgcolor: isDark ? "rgba(56,189,248,.08)" : "#eef7fa",
              border: `1px solid ${colors.border}`,
            }}
          >
            {["Connect fleet data", "Understand what matters", "Act with confidence"].map(
              (step, index) => (
                <Stack key={step} direction="row" alignItems="center" spacing={1.2} sx={{ flex: 1 }}>
                  <Box
                    sx={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      bgcolor: colors.accent,
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Typography sx={{ color: colors.ink, fontSize: 13.5, fontWeight: 800 }}>
                    {step}
                  </Typography>
                </Stack>
              )
            )}
          </Stack>
        </Container>
      </Box>

      <Box
        component="section"
        sx={{
          color: "#fff",
          background: "linear-gradient(115deg, #071827, #0d3e54)",
          borderTop: "1px solid rgba(125,211,252,.12)",
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 4.5 } }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
            spacing={2.5}
          >
            <Box>
              <Typography sx={{ fontSize: { xs: 25, md: 31 }, fontWeight: 850 }}>
                One clear view of your connected fleet.
              </Typography>
              <Typography sx={{ mt: 0.7, color: "rgba(255,255,255,.7)" }}>
                Monitor now, predict what’s next, and respond from the same platform.
              </Typography>
            </Box>
            <Button
              size="large"
              variant="contained"
              onClick={() => navigate("/cockpit-view")}
              sx={{
                bgcolor: "#f59e0b",
                color: "#111827",
                fontWeight: 900,
                textTransform: "none",
                flexShrink: 0,
                "&:hover": { bgcolor: "#d98605" },
              }}
            >
              Open the platform
            </Button>
          </Stack>
          <Typography sx={{ mt: 3.5, pt: 2, borderTop: "1px solid rgba(255,255,255,.12)", color: "rgba(255,255,255,.52)", fontSize: 11.5 }}>
            TelemetriX · Vehicle Intelligence Platform
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
