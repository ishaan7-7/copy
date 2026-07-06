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
  Link,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import BoltIcon from "@mui/icons-material/Bolt";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DirectionsCarFilledIcon from "@mui/icons-material/DirectionsCarFilled";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FactCheckIcon from "@mui/icons-material/FactCheck";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import InsightsIcon from "@mui/icons-material/Insights";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import RouteIcon from "@mui/icons-material/Route";
import SecurityIcon from "@mui/icons-material/Security";
import SpeedIcon from "@mui/icons-material/Speed";
import TimelineIcon from "@mui/icons-material/Timeline";
import TuneIcon from "@mui/icons-material/Tune";
import BuildCircleIcon from "@mui/icons-material/BuildCircle";
import type { ElementType } from "react";
import { useNavigate } from "react-router";
import exlLogo from "../images/exl-logo.png";

type IconCard = {
  title: string;
  text: string;
  icon: ElementType;
};

const heroImage = "../images/telematrix-banner.png";
const palette = {
  ink: "#102033",
  navy: "#0f2f45",
  blue: "#2563eb",
  teal: "#0f766e",
  amber: "#f59e0b",
  bg: "#f6f9fc",
  surface: "#ffffff",
  soft: "#eef6fb",
  border: "#d8e5ec",
  muted: "#64748b",
};

const sectionPy = { xs: 7, md: 9 };

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
  [
    "Executive Dashboard",
    "High-level KPIs and operational summaries for leadership teams.",
  ],
  [
    "Fleet Operations Dashboard",
    "Live fleet status, utilization, route progress, and vehicle availability.",
  ],
  [
    "Vehicle Detail Dashboard",
    "Diagnostics, maintenance history, trip details, and health signals by asset.",
  ],
  [
    "Maintenance Dashboard",
    "Work orders, service schedules, repair history, costs, MTBF, and MTTR.",
  ],
  [
    "Fuel Analytics Dashboard",
    "Usage, efficiency trends, refueling behavior, theft alerts, and consumption patterns.",
  ],
  [
    "Driver Analytics Dashboard",
    "Behavior analysis, safety scoring, coaching signals, and performance insights.",
  ],
  [
    "Alert Center",
    "Active alerts, system events, and operational incidents monitored in real time.",
  ],
];

const metrics = [
  ["Live Fleet", "100%", "Operational visibility across every connected asset"],
  ["Predictive Care", "24/7", "Maintenance signals and anomaly detection"],
  [
    "Fuel Control",
    "Up to 18%",
    "Potential savings through efficiency and idle reduction",
  ],
  [
    "Response Time",
    "Real time",
    "Alerts for events, faults, geofence moves, and risk",
  ],
];

const industries = [
  "Logistics & Transportation",
  "Manufacturing",
  "Mining",
  "Construction",
  "Public Transportation",
  "Utilities",
  "Oil & Gas",
  "Agriculture",
  "Waste Management",
  "Emergency Services",
  "Smart Cities",
  "Distribution & Supply Chain",
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
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  center?: boolean;
  inverted?: boolean;
}) {
  return (
    <Box
      sx={{
        textAlign: center ? "center" : "left",
        maxWidth: 760,
        mx: center ? "auto" : 0,
        mb: { xs: 3, md: 4 },
      }}
    >
      {eyebrow && (
        <Typography
          sx={{
            color: inverted ? "#7dd3fc" : palette.teal,
            fontWeight: 900,
            letterSpacing: 0.8,
          }}
          variant="overline"
        >
          {eyebrow}
        </Typography>
      )}
      <Typography
        variant="h2"
        sx={{
          fontSize: { xs: 32, md: 44 },
          color: inverted ? "#fff" : palette.ink,
          lineHeight: 1.08,
          letterSpacing: 0,
        }}
      >
        {title}
      </Typography>
      {body && (
        <Typography
          sx={{
            mt: 1.6,
            fontSize: { xs: 15.5, md: 17 },
            lineHeight: 1.7,
            color: inverted ? "rgba(255,255,255,0.76)" : palette.muted,
          }}
        >
          {body}
        </Typography>
      )}
    </Box>
  );
}

function DashboardMockup() {
  return (
    <Paper
      elevation={0}
      sx={{
        border: `1px solid ${palette.border}`,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: palette.surface,
        boxShadow: "0 24px 70px rgba(15,47,69,0.14)",
      }}
    >
      <Box
        sx={{
          height: 42,
          bgcolor: "#f8fbfd",
          display: "flex",
          alignItems: "center",
          px: 2,
          gap: 1,
          borderBottom: `1px solid ${palette.border}`,
        }}
      >
        {[0, 1, 2].map((item) => (
          <Box
            key={item}
            sx={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              bgcolor: item === 0 ? palette.amber : "#b9c8cf",
            }}
          />
        ))}
        <Typography
          fontWeight={850}
          fontSize={12}
          color={palette.muted}
          sx={{ ml: 1 }}
        >
          Telematrix command center
        </Typography>
      </Box>
      <Box sx={{ p: { xs: 2, md: 2.5 } }}>
        <Grid container spacing={2}>
          {metrics.map(([label, value, hint]) => (
            <Grid item xs={6} md={3} key={label}>
              <Box
                sx={{
                  border: `1px solid ${palette.border}`,
                  borderRadius: 1.5,
                  p: 1.4,
                  minHeight: 98,
                  bgcolor: "#fbfdff",
                }}
              >
                <Typography
                  color={palette.muted}
                  fontSize={12}
                  fontWeight={800}
                >
                  {label}
                </Typography>
                <Typography
                  color={palette.navy}
                  variant="h4"
                  sx={{ mt: 0.5, fontWeight: 900 }}
                >
                  {value}
                </Typography>
                <Typography color={palette.muted} fontSize={12}>
                  {hint}
                </Typography>
              </Box>
            </Grid>
          ))}
        </Grid>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={7}>
            <Box
              sx={{
                height: 250,
                borderRadius: 1.5,
                bgcolor: palette.soft,
                position: "relative",
                overflow: "hidden",
                border: `1px solid ${palette.border}`,
              }}
            >
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage:
                    "linear-gradient(90deg, rgba(37,99,235,0.08) 1px, transparent 1px), linear-gradient(rgba(15,118,110,0.08) 1px, transparent 1px)",
                  backgroundSize: "34px 34px",
                }}
              />
              {[
                ["18%", "20%", palette.amber],
                ["62%", "30%", palette.blue],
                ["44%", "68%", palette.teal],
                ["76%", "74%", "#7c3aed"],
              ].map(([left, top, color], index) => (
                <Box
                  key={index}
                  sx={{
                    position: "absolute",
                    left,
                    top,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <Box
                    sx={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      bgcolor: color,
                      border: "3px solid #fff",
                      boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
                    }}
                  />
                </Box>
              ))}
              <RouteIcon
                sx={{
                  position: "absolute",
                  bottom: 22,
                  right: 24,
                  color: palette.navy,
                  fontSize: 50,
                  opacity: 0.26,
                }}
              />
            </Box>
          </Grid>
          <Grid item xs={12} md={5}>
            <Stack spacing={1.2}>
              {[
                "Engine fault risk detected",
                "Fuel variance above baseline",
                "Service window due in 3 days",
                "Route compliance improved",
              ].map((alert, index) => (
                <Box
                  key={alert}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.2,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 1.5,
                    p: 1.2,
                    bgcolor: "#fbfdff",
                  }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 1.2,
                      display: "grid",
                      placeItems: "center",
                      bgcolor:
                        index === 0
                          ? "rgba(245,158,11,0.14)"
                          : "rgba(15,118,110,0.12)",
                    }}
                  >
                    {index === 0 ? (
                      <NotificationsActiveIcon
                        sx={{ color: palette.amber }}
                        fontSize="small"
                      />
                    ) : (
                      <CheckCircleIcon
                        sx={{ color: palette.teal }}
                        fontSize="small"
                      />
                    )}
                  </Box>
                  <Box>
                    <Typography fontWeight={800} fontSize={14}>
                      {alert}
                    </Typography>
                    <Typography color={palette.muted} fontSize={12}>
                      Updated just now
                    </Typography>
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

export default function TelematrixLandingPage() {
  const navigate = useNavigate();
  return (
    <Box sx={{ bgcolor: palette.bg, minHeight: "100vh", color: palette.ink }}>
      <AppBar
        elevation={0}
        position="sticky"
        sx={{
          bgcolor: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(14px)",
          borderBottom: `1px solid ${palette.border}`,
        }}
      >
        <Toolbar
          sx={{
            maxWidth: 1200,
            mx: "auto",
            width: "100%",
            minHeight: 68,
            px: { xs: 2, md: 3 },
          }}
        >
           <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 2.5,
            }}
          >
            <img src={exlLogo} alt="EXL Logo" width={72} />
 
            <Box>
              <Typography
                sx={{
                  fontSize: "20px",
                  fontWeight: 800,
                  color: "#005071",
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
                    fontSize: "22px",
                    color: "#ed6c02", // EXL Orange
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
                  fontSize: "8px",
                  color: "#64748B",
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  lineHeight: 1.2,
                  whiteSpace: "nowrap", // Keep in a single line
                  mt: 0.2,
                }}
              >
                Vehicle Intelligence Platform
              </Typography>
            </Box>
          </Box>
          <Stack
            direction="row"
            spacing={3}
            sx={{ ml: "auto", display: { xs: "none", md: "flex" } }}
          >
            {[
              "Platform",
              "Capabilities",
              "Dashboards",
              "Industries",
              "FAQ",
            ].map((item) => (
              <Link
                key={item}
                href={`#${item.toLowerCase()}`}
                underline="none"
                color={palette.ink}
                fontWeight={750}
                sx={{ fontSize: 14 }}
              >
                {item}
              </Link>
            ))}
          </Stack>
          <Button
            variant="contained"
            onClick={() => navigate("/cockpit-view")}
            sx={{
              ml: { xs: "auto", md: 3 },
              bgcolor: palette.teal,
              "&:hover": { bgcolor: "#0b5f59" },
            }}
          >
            Request a Demo
          </Button>
        </Toolbar>
      </AppBar>

      <Box
        component="section"
        sx={{
          position: "relative",
          color: "#fff",
          minHeight: { xs: 620, md: 690 },
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          backgroundImage: `linear-gradient(90deg, rgba(8,26,39,0.94), rgba(15,47,69,0.78), rgba(15,118,110,0.28)), url(${heroImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <Container
          maxWidth="lg"
          sx={{ pt: { xs: 8, md: 10 }, pb: { xs: 8, md: 10 } }}
        >
          <Box sx={{ maxWidth: 780 }}>
            <Chip
              label="Intelligent Fleet & Asset Intelligence Platform"
              sx={{
                bgcolor: "rgba(255,255,255,0.12)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.24)",
                fontWeight: 850,
              }}
            />
            <Typography
              variant="h1"
              sx={{
                mt: 2.5,
                fontSize: { xs: 48, sm: 64, md: 84 },
                lineHeight: 0.96,
                letterSpacing: 0,
                fontWeight: 950,
              }}
            >
              Telematrix
            </Typography>
            <Typography
              sx={{
                mt: 2,
                fontSize: { xs: 22, md: 30 },
                fontWeight: 800,
                lineHeight: 1.2,
                maxWidth: 760,
              }}
            >
              Connected fleet intelligence for real-time operations, predictive
              maintenance, and executive visibility.
            </Typography>
            <Typography
              sx={{
                mt: 2.5,
                fontSize: { xs: 16, md: 18 },
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.82)",
                maxWidth: 700,
              }}
            >
              Consolidate telemetry, diagnostics, GPS tracking, maintenance
              records, fuel signals, and operational analytics into one
              professional command center.
            </Typography>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              sx={{ mt: 3.5 }}
            >
              <Button
                size="large"
                variant="contained"
                onClick={() => navigate("/cockpit-view")}
                sx={{
                  bgcolor: palette.amber,
                  color: "#111827",
                  fontWeight: 900,
                  "&:hover": { bgcolor: "#d97706" },
                }}
              >
                Request a Demo
              </Button>
              <Button
                href="#capabilities"
                size="large"
                variant="outlined"
                sx={{
                  color: "#fff",
                  borderColor: "rgba(255,255,255,0.46)",
                  fontWeight: 850,
                  "&:hover": {
                    borderColor: "#fff",
                    bgcolor: "rgba(255,255,255,0.08)",
                  },
                }}
              >
                View Capabilities
              </Button>
            </Stack>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.2}
              sx={{ mt: 4, maxWidth: 760 }}
            >
              {[
                "Live vehicle health",
                "Fuel and route intelligence",
                "Predictive service signals",
              ].map((item) => (
                <Box
                  key={item}
                  sx={{
                    px: 1.4,
                    py: 1,
                    borderRadius: 1.5,
                    border: "1px solid rgba(255,255,255,0.18)",
                    bgcolor: "rgba(255,255,255,0.08)",
                  }}
                >
                  <Typography sx={{ fontSize: 13, fontWeight: 850 }}>
                    {item}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Box>
        </Container>
      </Box>

      <Box
        component="section"
        id="platform"
        sx={{ py: sectionPy, bgcolor: palette.surface }}
      >
        <Container maxWidth="lg">
          <SectionHeader
            eyebrow="Monitor. Analyze. Predict. Optimize."
            title="One unified platform for fleet operations"
            body="Modern fleets generate millions of data points every day. Telematrix turns scattered signals into clear intelligence that helps organizations improve safety, maximize utilization, and reduce operating costs."
          />
          <Box sx={{ mb: { xs: 3, md: 4 } }}>
            <DashboardMockup />
          </Box>
          <Paper
            elevation={0}
            sx={{
              border: `1px solid ${palette.border}`,
              p: { xs: 2, md: 3 },
              borderRadius: 2,
              boxShadow: "0 16px 44px rgba(15,47,69,0.08)",
            }}
          >
            <Grid container spacing={2} alignItems="center">
              {[
                [
                  "Data Sources",
                  "GPS, IoT sensors, CAN bus, diagnostics, fuel systems, maintenance records, weather, ERP",
                ],
                [
                  "Telematrix Analytics Engine",
                  "Normalizes, correlates, scores, predicts, and prioritizes fleet events",
                ],
                [
                  "Operational Intelligence",
                  "Dashboards, KPIs, alerts, reports, predictive insights, and executive views",
                ],
              ].map(([title, text], index) => (
                <Grid item xs={12} md={4} key={title}>
                  <Box
                    sx={{
                      minHeight: 148,
                      p: 2.3,
                      borderRadius: 1.5,
                      bgcolor: index === 1 ? palette.navy : "#f8fbfd",
                      color: index === 1 ? "#fff" : palette.ink,
                      border: `1px solid ${
                        index === 1 ? "rgba(255,255,255,0.1)" : palette.border
                      }`,
                    }}
                  >
                    <Typography fontWeight={900} variant="h5">
                      {title}
                    </Typography>
                    <Typography
                      sx={{
                        mt: 1.4,
                        color:
                          index === 1
                            ? "rgba(255,255,255,0.78)"
                            : palette.muted,
                        lineHeight: 1.65,
                      }}
                    >
                      {text}
                    </Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Container>
      </Box>

      <Box component="section" id="capabilities" sx={{ py: sectionPy }}>
        <Container maxWidth="lg">
          <SectionHeader
            eyebrow="Key Capabilities"
            title="Built for real fleet decisions"
            body="Everything needed to understand assets, control costs, protect drivers, and move from reactive operations to predictive fleet management."
          />
          <Grid container spacing={2.5}>
            {capabilities.map(({ title, text, icon: Icon }) => (
              <Grid item xs={12} sm={6} md={4} key={title}>
                <Paper
                  elevation={0}
                  sx={{
                    height: "100%",
                    p: 2.6,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 2,
                    boxShadow: "0 12px 32px rgba(15,47,69,0.06)",
                  }}
                >
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: 1.5,
                      bgcolor: "rgba(15,118,110,0.12)",
                      color: palette.teal,
                      display: "grid",
                      placeItems: "center",
                      mb: 2,
                    }}
                  >
                    <Icon />
                  </Box>
                  <Typography variant="h5">{title}</Typography>
                  <Typography
                    sx={{ mt: 1.2, lineHeight: 1.7, color: palette.muted }}
                  >
                    {text}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box sx={{ py: sectionPy, bgcolor: palette.navy, color: "#fff" }}>
        <Container maxWidth="lg">
          <SectionHeader
            eyebrow="Operational ROI"
            title="Measure what matters, every day"
            body="Telematrix continuously tracks the operational metrics that decide uptime, cost, safety, and service quality."
            inverted
          />
          <Grid container spacing={2.5}>
            {metrics.map(([label, value, hint]) => (
              <Grid item xs={12} sm={6} md={3} key={label}>
                <Box
                  sx={{
                    p: 3,
                    borderRadius: 2,
                    bgcolor: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    minHeight: 158,
                  }}
                >
                  <Typography color="rgba(255,255,255,0.66)" fontWeight={800}>
                    {label}
                  </Typography>
                  <Typography variant="h3" sx={{ color: palette.amber, mt: 1 }}>
                    {value}
                  </Typography>
                  <Typography sx={{ mt: 1, color: "rgba(255,255,255,0.74)" }}>
                    {hint}
                  </Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box
        component="section"
        id="dashboards"
        sx={{ py: sectionPy, bgcolor: palette.surface }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={5} alignItems="center">
            <Grid item xs={12} md={5}>
              <SectionHeader
                center={false}
                eyebrow="Powerful Dashboards"
                title="Purpose-built views for every operational role"
                body="Executives, fleet managers, maintenance teams, fuel controllers, and safety teams each get the exact operating picture they need."
              />
              <Stack spacing={1.5}>
                {dashboardList.map(([title, text]) => (
                  <Box key={title} sx={{ display: "flex", gap: 1.5 }}>
                    <CheckCircleIcon sx={{ color: palette.teal }} />
                    <Box>
                      <Typography fontWeight={900}>{title}</Typography>
                      <Typography sx={{ color: palette.muted }}>
                        {text}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={7}>
              <DashboardMockup />
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box sx={{ py: sectionPy }}>
        <Container maxWidth="lg">
          <Grid container spacing={4}>
            <Grid item xs={12} md={5}>
              <SectionHeader
                center={false}
                eyebrow="Challenges We Solve"
                title="Replace operational blind spots with control"
              />
              <Grid container spacing={1.5}>
                {challengeItems.map((item) => (
                  <Grid item xs={12} sm={6} md={12} key={item}>
                    <Box
                      sx={{
                        p: 1.6,
                        borderRadius: 2,
                        bgcolor: palette.surface,
                        border: `1px solid ${palette.border}`,
                        display: "flex",
                        alignItems: "center",
                        gap: 1.2,
                      }}
                    >
                      <BoltIcon sx={{ color: palette.amber }} />
                      <Typography fontWeight={800}>{item}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Grid>
            <Grid item xs={12} md={7}>
              <SectionHeader
                center={false}
                eyebrow="Key Performance Indicators"
                title="A live scorecard for fleet performance"
              />
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.2 }}>
                {kpis.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    icon={<TimelineIcon />}
                    sx={{
                      bgcolor: palette.surface,
                      border: `1px solid ${palette.border}`,
                      fontWeight: 800,
                      px: 0.5,
                    }}
                  />
                ))}
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box
        component="section"
        id="industries"
        sx={{ py: sectionPy, bgcolor: palette.surface }}
      >
        <Container maxWidth="lg">
          <SectionHeader
            eyebrow="Industries We Serve"
            title="Designed for high-motion operations"
            body="Telematrix supports connected operations across transportation, industrial, civic, energy, and supply chain environments."
          />
          <Grid container spacing={1.5}>
            {industries.map((item) => (
              <Grid item xs={12} sm={6} md={3} key={item}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: 2,
                    border: `1px solid ${palette.border}`,
                    minHeight: 72,
                    display: "flex",
                    alignItems: "center",
                    bgcolor: "#f8fbfd",
                  }}
                >
                  <Typography fontWeight={850}>{item}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box sx={{ py: sectionPy, bgcolor: palette.navy, color: "#fff" }}>
        <Container maxWidth="lg">
          <Grid container spacing={5}>
            <Grid item xs={12} md={5}>
              <Typography
                sx={{ color: "#7dd3fc" }}
                fontWeight={900}
                variant="overline"
              >
                Future Ready with AI
              </Typography>
              <Typography variant="h2" sx={{ fontSize: { xs: 34, md: 48 } }}>
                Intelligence for the future of connected operations
              </Typography>
              <Typography
                sx={{
                  mt: 2,
                  color: "rgba(255,255,255,0.76)",
                  lineHeight: 1.75,
                }}
              >
                Telematrix is built to unlock advanced fleet capabilities, from
                predictive failure detection to natural language analytics and
                AI copilots for operations teams.
              </Typography>
            </Grid>
            <Grid item xs={12} md={7}>
              <Grid container spacing={1.5}>
                {aiFeatures.map((item) => (
                  <Grid item xs={12} sm={6} key={item}>
                    <Box
                      sx={{
                        p: 1.8,
                        borderRadius: 2,
                        bgcolor: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(255,255,255,0.15)",
                        display: "flex",
                        alignItems: "center",
                        gap: 1.2,
                      }}
                    >
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

      <Box sx={{ py: sectionPy, bgcolor: palette.surface }}>
        <Container maxWidth="lg">
          <SectionHeader
            eyebrow="Why Choose Telematrix"
            title="Classy technology with practical outcomes"
          />
          <Grid container spacing={2}>
            {reasons.map((item) => (
              <Grid item xs={12} sm={6} md={4} key={item}>
                <Box
                  sx={{
                    p: 2.2,
                    borderRadius: 2,
                    border: `1px solid ${palette.border}`,
                    minHeight: 92,
                    display: "flex",
                    alignItems: "center",
                    gap: 1.4,
                    bgcolor: "#fbfdff",
                  }}
                >
                  <CheckCircleIcon sx={{ color: palette.teal }} />
                  <Typography fontWeight={900}>{item}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box component="section" id="faq" sx={{ py: sectionPy }}>
        <Container maxWidth="md">
          <SectionHeader eyebrow="FAQ" title="Got questions?" />
          {[
            [
              "What is Telematrix?",
              "Telematrix is an intelligent fleet and asset intelligence platform that consolidates telemetry, GPS, diagnostics, IoT sensor data, maintenance records, fuel signals, and analytics into one operating dashboard.",
            ],
            [
              "Can Telematrix integrate with existing systems?",
              "Yes. It is designed to integrate with GPS devices, CAN bus data, fuel monitoring systems, maintenance tools, ERP platforms, and other operational systems.",
            ],
            [
              "Who should use Telematrix?",
              "Fleet managers, operations leaders, maintenance teams, safety teams, fuel managers, and executives who need real-time visibility and predictive operational intelligence.",
            ],
            [
              "Does it support AI analytics?",
              "Yes. The platform is AI-ready for predictive failure detection, maintenance recommendations, route optimization, fuel prediction, driver risk analysis, and natural language analytics.",
            ],
          ].map(([question, answer]) => (
            <Accordion
              key={question}
              elevation={0}
              sx={{
                border: `1px solid ${palette.border}`,
                mb: 1.2,
                borderRadius: "8px !important",
                overflow: "hidden",
                bgcolor: palette.surface,
              }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography fontWeight={900}>{question}</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography sx={{ color: palette.muted }} lineHeight={1.7}>
                  {answer}
                </Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Container>
      </Box>

      <Box
        component="section"
        id="contact"
        sx={{ py: sectionPy, bgcolor: palette.navy, color: "#fff" }}
      >
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={8}>
              <Typography variant="h2" sx={{ fontSize: { xs: 34, md: 52 } }}>
                Ready to modernize your fleet operations?
              </Typography>
              <Typography
                sx={{
                  mt: 2,
                  color: "rgba(255,255,255,0.78)",
                  fontSize: 18,
                  lineHeight: 1.7,
                  maxWidth: 820,
                }}
              >
                Monitor smarter. Predict earlier. Operate better. Join
                organizations transforming fleet management through intelligent
                telemetry and advanced analytics.
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack
                direction={{ xs: "column", sm: "row", md: "column" }}
                spacing={2}
              >
                <Button
                  size="large"
                  variant="contained"
                  onClick={() => navigate("/cockpit-view")}
                  startIcon={<TuneIcon />}
                  sx={{
                    bgcolor: palette.amber,
                    color: "#111827",
                    fontWeight: 900,
                    "&:hover": { bgcolor: "#d97706" },
                  }}
                >
                  Request a Demo
                </Button>
                <Button
                  size="large"
                  variant="outlined"
                  onClick={() => navigate("/cockpit-view")}
                  startIcon={<FactCheckIcon />}
                  sx={{ color: "#fff", borderColor: "rgba(255,255,255,0.5)" }}
                >
                  Request Proposal
                </Button>
              </Stack>
            </Grid>
          </Grid>
          <Divider sx={{ my: 5, borderColor: "rgba(255,255,255,0.16)" }} />
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
          >
            <Typography fontWeight={900}>Telematrix</Typography>
            <Stack direction="row" spacing={1.2} flexWrap="wrap">
              {[
                "Enterprise Security",
                "Cloud Ready",
                "Rapid Deployment",
                "AI Ready",
              ].map((item) => (
                <Chip
                  key={item}
                  icon={<SecurityIcon />}
                  label={item}
                  sx={{
                    color: "#fff",
                    bgcolor: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.16)",
                  }}
                />
              ))}
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}
