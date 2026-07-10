import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Divider,
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
import BoltIcon from "@mui/icons-material/Bolt";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DirectionsCarFilledIcon from "@mui/icons-material/DirectionsCarFilled";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import RouteIcon from "@mui/icons-material/Route";
import SecurityIcon from "@mui/icons-material/Security";
import SpeedIcon from "@mui/icons-material/Speed";
import TimelineIcon from "@mui/icons-material/Timeline";
import TuneIcon from "@mui/icons-material/Tune";
import BuildCircleIcon from "@mui/icons-material/BuildCircle";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import type { ElementType } from "react";
import { useNavigate } from "react-router";
import exlLogo from "../images/exl-logo.png";
import { useStore } from "../store";

type IconCard = {
  title: string;
  text: string;
  icon: ElementType;
};

const heroImage = "";

// ── LIGHT PALETTE ─────────────────────────────────────────────────────────
const light = {
  ink: "#102033",
  blue: "#2563eb",
  teal: "#005071",
  tealEyebrow: "#005071",
  amber: "#f59e0b",
  border: "#d8e5ec",
  muted: "#64748b",
  // section backgrounds
  sectionBg: "#f6f9fc",
  sectionSurface: "#ffffff",
  sectionNavy: "#0f2f45",
  // cards
  cardBg: "#ffffff",
  cardElevated: "#f8fbfd",
  cardShadow: "0 12px 32px rgba(15,47,69,0.07)",
  cardShadowStrong: "0 24px 70px rgba(15,47,69,0.14)",
  // navy-section internals
  navyText: "rgba(255,255,255,0.76)",
  navyMuted: "rgba(255,255,255,0.66)",
  navyBorder: "rgba(255,255,255,0.14)",
  navyCard: "rgba(255,255,255,0.08)",
  // appbar
  appBar: "rgba(255,255,255,0.92)",
  appBarBorder: "#d8e5ec",
  // logo
  logoColor: "#005071",
  logoSub: "#64748B",
  linkColor: "#102033",
  // icons
  iconBg: "rgba(15,118,110,0.12)",
  iconColor: "#005071",
  checkColor: "#005071",
  // pipeline section
  pipelineMiddle: "#0f2f45",
  pipelineMiddleText: "rgba(255,255,255,0.78)",
  pipelineMiddleBorder: "rgba(255,255,255,0.1)",
  // mockup
  mockupBar: "#f8fbfd",
  mockupDot2: "#b9c8cf",
  mockupGrid1: "rgba(37,99,235,0.08)",
  mockupGrid2: "rgba(15,118,110,0.08)",
  vehicleBorder: "#fff",
  alertIconBg0: "rgba(245,158,11,0.14)",
  alertIconBg1: "rgba(15,118,110,0.12)",
};

// ── DARK PALETTE ──────────────────────────────────────────────────────────
const dark = {
  ink: "#e8ecf0",
  blue: "#3b82f6",
  teal: "#005071",
  tealEyebrow: "#38bdf8",
  amber: "#f59e0b",
  border: "#1e2433",
  muted: "#94a3b8",
  // section backgrounds — gradient-based for clear visual hierarchy
  sectionBg: "linear-gradient(180deg, #07090f 0%, #080c14 100%)",
  sectionSurface: "linear-gradient(180deg, #0d1421 0%, #0a1118 100%)",
  sectionNavy: "linear-gradient(160deg, #06101c 0%, #0c1e30 50%, #0d1e2e 100%)",
  // cards — visibly lighter than section bg, with subtle depth
  cardBg: "linear-gradient(145deg, #141c28 0%, #0e1520 100%)",
  cardElevated: "linear-gradient(145deg, #111926 0%, #0c1118 100%)",
  cardShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
  cardShadowStrong: "0 24px 70px rgba(0,0,0,0.6), 0 0 0 1px #1e2433",
  // navy-section internals
  navyText: "rgba(232,236,240,0.78)",
  navyMuted: "rgba(232,236,240,0.55)",
  navyBorder: "rgba(56,189,248,0.12)",
  navyCard: "rgba(56,189,248,0.04)",
  // appbar
  appBar: "rgba(7,9,15,0.92)",
  appBarBorder: "#1e2433",
  // logo
  logoColor: "#38bdf8",
  logoSub: "#64748b",
  linkColor: "#e8ecf0",
  // icons
  iconBg: "rgba(56,189,248,0.1)",
  iconColor: "#38bdf8",
  checkColor: "#22c55e",
  // pipeline section
  pipelineMiddle: "linear-gradient(145deg, #0f1e2e 0%, #131a28 100%)",
  pipelineMiddleText: "rgba(232,236,240,0.8)",
  pipelineMiddleBorder: "rgba(56,189,248,0.15)",
  // mockup
  mockupBar: "#060a10",
  mockupDot2: "#1e2433",
  mockupGrid1: "rgba(56,189,248,0.05)",
  mockupGrid2: "rgba(0,80,113,0.07)",
  vehicleBorder: "#1e2433",
  alertIconBg0: "rgba(245,158,11,0.14)",
  alertIconBg1: "rgba(56,189,248,0.1)",
};

type Palette = typeof light;

const sectionPy = { xs: 3, md: 4 };

const capabilities: IconCard[] = [
  {
    title: "Real-Time Fleet Visibility",
    text: "Track connected vehicles on a live map with current location, ignition state, route history, engine health, speed, fuel level, and trip status.",
    icon: GpsFixedIcon,
  },
  {
    title: "Fleet Health Monitoring",
    text: "Classify vehicles into healthy, warning, critical, under maintenance, and offline states so teams can act before issues disrupt operations.",
    icon: DirectionsCarFilledIcon,
  },
  {
    title: "Predictive Maintenance",
    text: "Identify patterns that point to component wear, potential failures, overdue service, and repair trends before downtime becomes expensive.",
    icon: BuildCircleIcon,
  },
  {
    title: "Driver Performance Analytics",
    text: "Evaluate overspeeding, harsh braking, rapid acceleration, sharp cornering, excessive idling, route compliance, and safety scores.",
    icon: SpeedIcon,
  },
  {
    title: "Fuel Intelligence",
    text: "Monitor fuel efficiency, consumption trends, idle fuel burn, fuel theft alerts, refueling history, mileage, and cost per kilometer.",
    icon: LocalGasStationIcon,
  },
  {
    title: "Smart Alerts",
    text: "Receive instant notifications for engine faults, maintenance due, battery health, geofence entry and exit, temperature violations, and sensor failures.",
    icon: NotificationsActiveIcon,
  },
];

const challengeItems = [
  "Limited fleet visibility",
  "Rising maintenance costs",
  "Unexpected vehicle breakdowns",
  "High fuel consumption",
  "Low asset utilization",
  "Driver safety concerns",
  "Manual reporting processes",
  "Compliance risks",
];

const kpis = [
  "Fleet Health Score",
  "Vehicle Availability",
  "Fleet Utilization",
  "Mean Time Between Failures",
  "Mean Time To Repair",
  "Maintenance Cost",
  "Fuel Efficiency",
  "Cost per Kilometer",
  "Idle Time",
  "Driver Safety Score",
  "Route Efficiency",
  "Trip Completion Rate",
  "Battery Health",
  "Tire Pressure Monitoring",
  "Total Alerts Generated",
];

const dashboardList = [
  ["Executive Dashboard", "High-level KPIs and operational summaries for leadership teams."],
  ["Fleet Operations Dashboard", "Live fleet status, utilization, route progress, and vehicle availability."],
  ["Vehicle Detail Dashboard", "Diagnostics, maintenance history, trip details, and health signals by asset."],
  ["Maintenance Dashboard", "Work orders, service schedules, repair history, costs, MTBF, and MTTR."],
  ["Fuel Analytics Dashboard", "Usage, efficiency trends, refueling behavior, theft alerts, and consumption patterns."],
  ["Driver Analytics Dashboard", "Behavior analysis, safety scoring, coaching signals, and performance insights."],
  ["Alert Center", "Active alerts, system events, and operational incidents monitored in real time."],
];

const metrics = [
  ["Live Fleet", "100%", "Operational visibility across every connected asset"],
  ["Predictive Care", "24/7", "Maintenance signals and anomaly detection"],
  ["Fuel Control", "Up to 18%", "Potential savings through efficiency and idle reduction"],
  ["Response Time", "Real time", "Alerts for events, faults, geofence moves, and risk"],
];

const aiFeatures = [
  "Predictive failure detection",
  "Remaining useful life estimation",
  "Intelligent maintenance recommendations",
  "Fleet command forecasting",
  "Route optimization",
  "Fuel consumption prediction",
  "Driver risk analysis",
  "Automated operational insights",
  "Natural language analytics",
  "AI copilots for fleet operations",
];

const reasons = [
  "Unified fleet intelligence platform",
  "Real-time operational visibility",
  "Interactive executive dashboards",
  "AI-ready predictive analytics",
  "Scalable cloud architecture",
  "Enterprise-grade security",
  "Rapid deployment",
  "Seamless integration with existing systems",
  "Actionable insights that drive business outcomes",
];

function SectionHeader({
  eyebrow,
  title,
  body,
  center = true,
  inverted = false,
  p,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  center?: boolean;
  inverted?: boolean;
  p: Palette;
}) {
  return (
    <Box sx={{ textAlign: center ? "center" : "left", maxWidth: 760, mx: center ? "auto" : 0, mb: { xs: 3, md: 4 } }}>
      {eyebrow && (
        <Typography sx={{ color: inverted ? "#7dd3fc" : p.tealEyebrow, fontWeight: 900, letterSpacing: 0.8 }} variant="overline">
          {eyebrow}
        </Typography>
      )}
      <Typography variant="h2" sx={{ fontSize: { xs: 32, md: 44 }, color: inverted ? "#fff" : p.ink, lineHeight: 1.08, letterSpacing: 0 }}>
        {title}
      </Typography>
      {body && (
        <Typography sx={{ mt: 1.6, fontSize: { xs: 15.5, md: 17 }, lineHeight: 1.7, color: inverted ? "rgba(255,255,255,0.76)" : p.muted }}>
          {body}
        </Typography>
      )}
    </Box>
  );
}

function DashboardMockup({ p, isDark }: { p: Palette; isDark: boolean }) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: `1px solid ${p.border}`,
        borderRadius: 2,
        overflow: "hidden",
        background: isDark ? p.cardBg : "#ffffff",
        boxShadow: p.cardShadowStrong,
      }}
    >
      <Box sx={{ height: 42, bgcolor: p.mockupBar, display: "flex", alignItems: "center", px: 2, gap: 1, borderBottom: `1px solid ${p.border}` }}>
        {[0, 1, 2].map((item) => (
          <Box key={item} sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: item === 0 ? p.amber : p.mockupDot2 }} />
        ))}
        <Typography fontWeight={850} fontSize={12} color={p.logoColor} sx={{ ml: 1 }}>
          Telemetri
          <Box component="span" fontSize={14} sx={{ color: "#ed6c02", fontWeight: 900, fontStyle: "italic", fontFamily: "Arial Black, Arial, sans-serif", ml: "1px", lineHeight: 1 }}>
            X
          </Box>
        </Typography>
      </Box>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Grid container spacing={2}>
          {metrics.map(([label, value, hint]) => (
            <Grid item xs={6} md={3} key={label}>
              <Box sx={{ border: `1px solid ${p.border}`, borderRadius: 1.5, p: 1.4, minHeight: 98, background: isDark ? p.cardElevated : "#fbfdff", boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "none" }}>
                <Typography color={p.muted} fontSize={10} fontWeight={800}>{label}</Typography>
                <Typography color={p.ink} variant="h4" sx={{ mt: 0.5, fontWeight: 900, fontSize: 26 }}>{value}</Typography>
                <Typography color={p.muted} fontSize={10}>{hint}</Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={7}>
            <Box sx={{ height: 266, borderRadius: 1.5, bgcolor: isDark ? "#060a10" : "#eef6fb", position: "relative", overflow: "hidden", border: `1px solid ${p.border}` }}>
              <Box sx={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(90deg, ${p.mockupGrid1} 1px, transparent 1px), linear-gradient(${p.mockupGrid2} 1px, transparent 1px)`, backgroundSize: "34px 34px" }} />
              {[
                ["18%", "20%", p.amber],
                ["62%", "30%", p.blue],
                ["44%", "68%", "#005071"],
                ["76%", "74%", "#7c3aed"],
              ].map(([left, top, color], index) => (
                <Box key={index} sx={{ position: "absolute", left, top, transform: "translate(-50%, -50%)" }}>
                  <Box sx={{ width: 18, height: 18, borderRadius: "50%", bgcolor: color, border: `3px solid ${p.vehicleBorder}`, boxShadow: isDark ? `0 0 8px ${color}55` : "0 8px 18px rgba(0,0,0,0.18)" }} />
                </Box>
              ))}
              <RouteIcon sx={{ position: "absolute", bottom: 22, right: 24, color: p.ink, fontSize: 50, opacity: 0.16 }} />
            </Box>
          </Grid>
          <Grid item xs={12} md={5}>
            <Stack spacing={1.2}>
              {["Engine fault risk detected", "Fuel variance above baseline", "Service window due in 3 days", "Route compliance improved"].map((alert, index) => (
                <Box key={alert} sx={{ display: "flex", alignItems: "center", gap: 1.2, border: `1px solid ${p.border}`, borderRadius: 1.5, p: 1.2, background: isDark ? p.cardElevated : "#fbfdff" }}>
                  <Box sx={{ width: 34, height: 34, borderRadius: 1.2, display: "grid", placeItems: "center", bgcolor: index === 0 ? p.alertIconBg0 : p.alertIconBg1 }}>
                    {index === 0
                      ? <NotificationsActiveIcon sx={{ color: p.amber }} fontSize="small" />
                      : <CheckCircleIcon sx={{ color: p.checkColor }} fontSize="small" />}
                  </Box>
                  <Box>
                    <Typography fontWeight={800} fontSize={14} color={p.ink}>{alert}</Typography>
                    <Typography color={p.muted} fontSize={12}>Updated just now</Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  );
}

export default function telemetrixLandingPage() {
  const navigate = useNavigate();
  const { darkMode: isDark, toggleDarkMode } = useStore();
  const p = isDark ? dark : light;

  const navySectionSx = {
    py: sectionPy,
    background: p.sectionNavy,
    color: "#fff",
    borderTop: isDark ? `1px solid rgba(56,189,248,0.08)` : "none",
    borderBottom: isDark ? `1px solid rgba(56,189,248,0.08)` : "none",
  };

  return (
    <Box sx={{ background: isDark ? "#07090f" : "#f6f9fc", minHeight: "100vh", color: p.ink }}>

      {/* APPBAR */}
      <AppBar elevation={0} position="sticky" sx={{ background: p.appBar, backdropFilter: "blur(14px)", borderBottom: `1px solid ${p.appBarBorder}`, color: p.ink }}>
        <Toolbar sx={{ minHeight: "36px !important", padding: "0 8px !important", display: "flex", justifyContent: "space-between" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2.5 }}>
            <img src={exlLogo} alt="EXL Logo" width={72} />
            <Box>
              <Typography sx={{ fontSize: "20px", fontWeight: 800, color: p.logoColor, lineHeight: 1, letterSpacing: "-0.4px", display: "flex", alignItems: "baseline" }}>
                Telemetri
                <Box component="span" sx={{ fontSize: "22px", color: "#ed6c02", fontWeight: 900, fontStyle: "italic", fontFamily: "Arial Black, Arial, sans-serif", ml: "1px", lineHeight: 1 }}>X</Box>
              </Typography>
              <Typography sx={{ fontSize: "8px", color: p.logoSub, fontWeight: 500, letterSpacing: "0.08em", lineHeight: 1.2, whiteSpace: "nowrap", mt: 0.2 }}>
                Vehicle Intelligence Platform
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={3} sx={{ ml: "auto", display: { xs: "none", md: "flex" } }}>
            {["Platform", "Capabilities", "Dashboards", "FAQ"].map((item) => (
              <Link
                key={item}
                component="button"
                underline="none"
                color={p.linkColor}
                fontWeight={750}
                sx={{ fontSize: 14, cursor: "pointer", background: "none", border: "none", p: 0 }}
                onClick={() => document.getElementById(item.toLowerCase())?.scrollIntoView({ behavior: "smooth" })}
              >
                {item}
              </Link>
            ))}
          </Stack>
          <Tooltip title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}>
            <IconButton onClick={toggleDarkMode} size="small" sx={{ color: p.muted, ml: { xs: "auto", md: 1 } }}>
              {isDark ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            onClick={() => navigate("/cockpit-view")}
            sx={{
              ml: { xs: 1, md: 2 },
              bgcolor: "#005071",
              borderRadius: "10px",
              border: "1px solid transparent",
              "&:hover": { bgcolor: isDark ? "rgba(56,189,248,0.1)" : "#fff", border: isDark ? "1px solid #38bdf8" : "1px solid #005071", color: isDark ? "#38bdf8" : "#005071" },
            }}
          >
            Go to Solution
          </Button>
        </Toolbar>
      </AppBar>

      {/* HERO */}
      <Box
        component="section"
        sx={{
          position: "relative",
          color: "#fff",
          minHeight: { xs: 420, md: 490 },
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          background: isDark
            ? "linear-gradient(90deg, #030810 0%, #05111e 28%, #081f30 55%, #0c3244 78%, #0e4255 100%)"
            : undefined,
          backgroundImage: isDark
            ? undefined
            : `linear-gradient(90deg, rgba(8,26,39,0.94), rgba(15,47,69,0.78), rgba(15,118,110,0.28)), url(${heroImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <Container maxWidth="lg" sx={{ pt: { xs: 4, md: 5 }, pb: { xs: 4, md: 5 }, position: "relative" }}>
          <Box sx={{ maxWidth: 780 }}>
            <Chip label="Intelligent Fleet & Asset Intelligence Platform" sx={{ bgcolor: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.24)", fontWeight: 850 }} />
            <Typography sx={{ fontSize: { xs: 28, sm: 44, md: 64 }, fontWeight: 800, color: "#ffffff", lineHeight: 1, letterSpacing: "-0.4px", display: "flex", alignItems: "baseline" }}>
              Telemetri
              <Box component="span" sx={{ fontSize: { xs: 30, sm: 46, md: 68 }, color: "#ed6c02", fontWeight: 900, fontStyle: "italic", fontFamily: "Arial Black, Arial, sans-serif", ml: "1px", lineHeight: 1 }}>X</Box>
            </Typography>
            <Typography sx={{ mt: 2, fontSize: { xs: 18, md: 24 }, fontWeight: 800, lineHeight: 1.2, maxWidth: 760 }}>
              Connected fleet intelligence for real-time operations, predictive maintenance, and executive visibility.
            </Typography>
            <Typography sx={{ mt: 2.5, fontSize: { xs: 12, md: 14 }, lineHeight: 1.7, color: "rgba(255,255,255,0.82)", maxWidth: 700 }}>
              Consolidate telemetry, diagnostics, GPS tracking, maintenance records, fuel signals, and operational analytics into one professional command center.
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 3.5 }}>
              <Button onClick={() => navigate("/cockpit-view")} size="large" variant="contained" sx={{ bgcolor: p.amber, color: "#111827", fontWeight: 900, "&:hover": { bgcolor: "#d97706" } }}>
                Go to Solution
              </Button>
              <Button
                size="large"
                variant="outlined"
                onClick={() => document.getElementById("capabilities")?.scrollIntoView({ behavior: "smooth" })}
                sx={{ color: "#fff", borderColor: "rgba(255,255,255,0.46)", fontWeight: 850, "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,0.08)" } }}
              >
                View Capabilities
              </Button>
            </Stack>
          </Box>
        </Container>
      </Box>

      {/* PLATFORM — surface section */}
      <Box component="section" id="platform" sx={{ py: sectionPy, background: p.sectionSurface }}>
        <Container maxWidth="lg">
          <SectionHeader
            eyebrow="Monitor. Analyze. Predict. Optimize."
            title="One unified platform for fleet operations"
            body="Modern fleets generate millions of data points every day. TelemetriX turns scattered signals into clear intelligence that helps organizations improve safety, maximize utilization, and reduce operating costs."
            p={p}
          />
          <Box sx={{ mb: { xs: 3, md: 4 } }}>
            <DashboardMockup p={p} isDark={isDark} />
          </Box>
          <Paper
            elevation={0}
            sx={{
              border: `1px solid ${p.border}`,
              p: { xs: 2, md: 3 },
              borderRadius: 2,
              background: isDark ? "linear-gradient(145deg, #111926 0%, #0c1219 100%)" : "#ffffff",
              boxShadow: isDark ? "none" : "0 16px 44px rgba(15,47,69,0.08)",
            }}
          >
            <Grid container spacing={2} alignItems="center">
              {[
                ["Data Sources", "GPS, IoT sensors, CAN bus, diagnostics, fuel systems, maintenance records, weather, ERP"],
                ["TelemetriX Analytics Engine", "Normalizes, correlates, scores, predicts, and prioritizes fleet events"],
                ["Operational Intelligence", "Dashboards, KPIs, alerts, reports, predictive insights, and executive views"],
              ].map(([title, text], index) => (
                <Grid item xs={12} md={4} key={title}>
                  <Box
                    sx={{
                      minHeight: 148,
                      p: 2.3,
                      borderRadius: 1.5,
                      background: index === 1 ? p.pipelineMiddle : (isDark ? p.cardElevated : "#f8fbfd"),
                      color: index === 1 ? "#fff" : p.ink,
                      border: `1px solid ${index === 1 ? p.pipelineMiddleBorder : p.border}`,
                      boxShadow: isDark && index !== 1 ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "none",
                    }}
                  >
                    <Typography fontWeight={900} variant="h5" color={index === 1 ? "#fff" : p.ink}>{title}</Typography>
                    <Typography sx={{ mt: 1.4, color: index === 1 ? p.pipelineMiddleText : p.muted, lineHeight: 1.65 }}>{text}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Container>
      </Box>

      {/* CAPABILITIES — bg section */}
      <Box component="section" id="capabilities" sx={{ py: sectionPy, background: p.sectionBg }}>
        <Container maxWidth="lg">
          <SectionHeader
            eyebrow="Key Capabilities"
            title="Built for real fleet decisions"
            body="Everything needed to understand assets, control costs, protect drivers, and move from reactive operations to predictive fleet management."
            p={p}
          />
          <Grid container spacing={2.5}>
            {capabilities.map(({ title, text, icon: Icon }) => (
              <Grid item xs={12} sm={6} md={4} key={title}>
                <Paper
                  elevation={0}
                  sx={{
                    height: "100%",
                    p: 2.6,
                    border: `1px solid ${p.border}`,
                    borderRadius: 2,
                    background: isDark ? p.cardBg : "#ffffff",
                    boxShadow: p.cardShadow,
                    transition: "box-shadow 0.2s",
                    "&:hover": {
                      boxShadow: isDark
                        ? "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(56,189,248,0.06)"
                        : "0 16px 48px rgba(15,47,69,0.12)",
                    },
                  }}
                >
                  <Box sx={{ width: 44, height: 44, borderRadius: 1.5, bgcolor: p.iconBg, color: p.iconColor, display: "grid", placeItems: "center", mb: 2 }}>
                    <Icon />
                  </Box>
                  <Typography variant="h5" color={p.ink}>{title}</Typography>
                  <Typography sx={{ mt: 1.2, lineHeight: 1.7, color: p.muted }}>{text}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* OPERATIONAL ROI — navy section */}
      <Box sx={navySectionSx}>
        <Container maxWidth="lg">
          <SectionHeader eyebrow="Operational ROI" title="Measure what matters, every day" body="TelemetriX continuously tracks the operational metrics that decide uptime, cost, safety, and service quality." inverted p={p} />
          <Grid container spacing={2.5}>
            {metrics.map(([label, value, hint]) => (
              <Grid item xs={12} sm={6} md={3} key={label}>
                <Box sx={{ p: 3, borderRadius: 2, bgcolor: p.navyCard, border: `1px solid ${p.navyBorder}`, minHeight: 158 }}>
                  <Typography color={p.navyMuted} fontWeight={800}>{label}</Typography>
                  <Typography variant="h3" sx={{ color: p.amber, mt: 1 }}>{value}</Typography>
                  <Typography sx={{ mt: 1, color: p.navyText }}>{hint}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* DASHBOARDS — surface section */}
      <Box component="section" id="dashboards" sx={{ py: sectionPy, background: p.sectionSurface }}>
        <Container maxWidth="lg">
          <Grid container spacing={5} alignItems="center">
            <Grid item xs={12} md={5}>
              <SectionHeader center={false} eyebrow="Powerful Dashboards" title="Purpose-built views for every operational role" body="Executives, fleet managers, maintenance teams, fuel controllers, and safety teams each get the exact operating picture they need." p={p} />
              <Stack spacing={1.5}>
                {dashboardList.map(([title, text]) => (
                  <Box key={title} sx={{ display: "flex", gap: 1.5 }}>
                    <CheckCircleIcon sx={{ color: p.checkColor, flexShrink: 0, mt: "2px" }} />
                    <Box>
                      <Typography fontWeight={900} color={p.ink}>{title}</Typography>
                      <Typography sx={{ color: p.muted }}>{text}</Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={7}>
              <DashboardMockup p={p} isDark={isDark} />
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* CHALLENGES + KPIs — bg section */}
      <Box sx={{ py: sectionPy, background: p.sectionBg }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            <Grid item xs={12} md={5}>
              <SectionHeader center={false} eyebrow="Challenges We Solve" title="Replace operational blind spots with control" p={p} />
              <Grid container spacing={1.5}>
                {challengeItems.map((item) => (
                  <Grid item xs={12} sm={6} md={12} key={item}>
                    <Box sx={{ p: 1.6, borderRadius: 2, background: isDark ? p.cardBg : "#ffffff", border: `1px solid ${p.border}`, display: "flex", alignItems: "center", gap: 1.2, boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.03)" : "none" }}>
                      <BoltIcon sx={{ color: p.amber }} />
                      <Typography fontWeight={800} color={p.ink}>{item}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Grid>
            <Grid item xs={12} md={7}>
              <SectionHeader center={false} eyebrow="Key Performance Indicators" title="A live scorecard for fleet performance" p={p} />
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.2 }}>
                {kpis.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    icon={<TimelineIcon />}
                    sx={{
                      background: isDark ? p.cardBg : "#ffffff",
                      border: `1px solid ${isDark ? p.border : p.border}`,
                      color: p.ink,
                      fontWeight: 800,
                      px: 0.5,
                      "& .MuiChip-icon": { color: p.tealEyebrow },
                    }}
                  />
                ))}
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* AI FUTURE — navy section */}
      <Box sx={navySectionSx}>
        <Container maxWidth="lg">
          <Grid container spacing={5}>
            <Grid item xs={12} md={5}>
              <Typography sx={{ color: "#7dd3fc" }} fontWeight={900} variant="overline">Future Ready with AI</Typography>
              <Typography variant="h2" sx={{ fontSize: { xs: 34, md: 48 }, color: "#fff" }}>
                Intelligence for the future of connected operations
              </Typography>
              <Typography sx={{ mt: 2, color: p.navyText, lineHeight: 1.75 }}>
                TelemetriX is built to unlock advanced fleet capabilities, from predictive failure detection to natural language analytics and AI copilots for operations teams.
              </Typography>
            </Grid>
            <Grid item xs={12} md={7}>
              <Grid container spacing={1.5}>
                {aiFeatures.map((item) => (
                  <Grid item xs={12} sm={6} key={item}>
                    <Box sx={{ p: 1.8, borderRadius: 2, bgcolor: p.navyCard, border: `1px solid ${p.navyBorder}`, display: "flex", alignItems: "center", gap: 1.2 }}>
                      <AutoGraphIcon sx={{ color: "#7dd3fc" }} />
                      <Typography fontWeight={800}>{item}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* WHY CHOOSE — surface section */}
      <Box sx={{ py: sectionPy, background: p.sectionSurface }}>
        <Container maxWidth="lg">
          <SectionHeader eyebrow="Why Choose TelemetriX" title="Classy technology with practical outcomes" p={p} />
          <Grid container spacing={2}>
            {reasons.map((item) => (
              <Grid item xs={12} sm={6} md={4} key={item}>
                <Box
                  sx={{
                    p: 2.2,
                    borderRadius: 2,
                    border: `1px solid ${p.border}`,
                    minHeight: 92,
                    display: "flex",
                    alignItems: "center",
                    gap: 1.4,
                    background: isDark ? p.cardBg : "#fbfdff",
                    boxShadow: isDark ? "inset 0 1px 0 rgba(255,255,255,0.04)" : "none",
                  }}
                >
                  <CheckCircleIcon sx={{ color: p.checkColor, flexShrink: 0 }} />
                  <Typography fontWeight={900} color={p.ink}>{item}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* FAQ — bg section */}
      <Box component="section" id="faq" sx={{ py: sectionPy, background: p.sectionBg }}>
        <Container maxWidth="md">
          <SectionHeader eyebrow="FAQ" title="Got questions?" p={p} />
          {[
            ["What is TelemetriX?", "TelemetriX is an intelligent fleet and asset intelligence platform that consolidates telemetry, GPS, diagnostics, IoT sensor data, maintenance records, fuel signals, and analytics into one operating dashboard."],
            ["Can TelemetriX integrate with existing systems?", "Yes. It is designed to integrate with GPS devices, CAN bus data, fuel monitoring systems, maintenance tools, ERP platforms, and other operational systems."],
            ["Who should use TelemetriX?", "Fleet managers, operations leaders, maintenance teams, safety teams, fuel managers, and executives who need real-time visibility and predictive operational intelligence."],
            ["Does it support AI analytics?", "Yes. The platform is AI-ready for predictive failure detection, maintenance recommendations, route optimization, fuel prediction, driver risk analysis, and natural language analytics."],
          ].map(([question, answer]) => (
            <Accordion
              key={question}
              elevation={0}
              sx={{
                border: `1px solid ${p.border}`,
                mb: 1.2,
                borderRadius: "8px !important",
                overflow: "hidden",
                background: isDark ? p.cardBg : "#ffffff",
                "&:before": { display: "none" },
                "& .MuiAccordionSummary-root": { color: p.ink },
                "& .MuiSvgIcon-root": { color: p.muted },
                "&:hover": { borderColor: isDark ? "rgba(56,189,248,0.2)" : p.border },
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={900} color={p.ink}>{question}</Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ background: isDark ? "linear-gradient(180deg, #0c1320 0%, #0a1018 100%)" : "#fafcff", borderTop: `1px solid ${p.border}` }}>
                <Typography sx={{ color: p.muted }} lineHeight={1.7}>{answer}</Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Container>
      </Box>

      {/* CTA — navy section */}
      <Box component="section" id="contact" sx={navySectionSx}>
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={8}>
              <Typography variant="h2" sx={{ fontSize: { xs: 34, md: 52 }, color: "#fff" }}>
                Ready to modernize your fleet operations?
              </Typography>
              <Typography sx={{ mt: 2, color: p.navyText, fontSize: 18, lineHeight: 1.7, maxWidth: 820 }}>
                Monitor smarter. Predict earlier. Operate better. Join organizations transforming fleet management through intelligent telemetry and advanced analytics.
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack direction={{ xs: "column", sm: "row", md: "column" }} spacing={2}>
                <Button size="large" variant="contained" startIcon={<TuneIcon />} onClick={() => navigate("/cockpit-view")} sx={{ bgcolor: p.amber, color: "#111827", fontWeight: 900, "&:hover": { bgcolor: "#d97706" } }}>
                  Go to Solution
                </Button>
                <Button size="large" variant="outlined" startIcon={<FactCheckIcon />} sx={{ color: "#fff", borderColor: "rgba(255,255,255,0.5)" }}>
                  Request Proposal
                </Button>
              </Stack>
            </Grid>
          </Grid>
          <Divider sx={{ my: 5, borderColor: isDark ? "rgba(56,189,248,0.1)" : "rgba(255,255,255,0.16)" }} />
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ xs: "flex-start", md: "center" }} justifyContent="space-between">
            <Typography fontWeight={850} fontSize={14} color={"#fff"} sx={{ ml: 1 }}>
              Telemetri
              <Box component="span" fontSize={16} sx={{ color: "#ed6c02", fontWeight: 900, fontStyle: "italic", fontFamily: "Arial Black, Arial, sans-serif", ml: "1px", lineHeight: 1 }}>X</Box>
            </Typography>
            <Stack direction="row" spacing={1.2} flexWrap="wrap">
              {["Enterprise Security", "Cloud Ready", "Rapid Deployment", "AI Ready"].map((item) => (
                <Chip key={item} icon={<SecurityIcon />} label={item} sx={{ color: "#fff", bgcolor: p.navyCard, border: `1px solid ${p.navyBorder}`, "& .MuiChip-icon": { color: "rgba(255,255,255,0.6)" } }} />
              ))}
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
