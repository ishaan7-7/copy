import { useState, type ElementType } from "react";
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
import { alpha } from "@mui/material/styles";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import BuildCircleIcon from "@mui/icons-material/BuildCircle";
import BusinessCenterRoundedIcon from "@mui/icons-material/BusinessCenterRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import GpsFixedIcon from "@mui/icons-material/GpsFixed";
import MonitorHeartRoundedIcon from "@mui/icons-material/MonitorHeartRounded";
import SpeedIcon from "@mui/icons-material/Speed";
import { useNavigate } from "react-router-dom";
import exlLogo from "../images/exl-logo.png";
import solutionSnapshot from "../images/telemetrix-solution-snapshot.png";
import darkSolutionSnapshot from "../images/telemetrix-solution-snapshot-dark.png";
import { useStore } from "../store";

type UserRole = "executive" | "monitoring" | "engineering";

type Capability = { title: string; text: string; icon: ElementType };

const capabilities: Capability[] = [
  {
    title: "Live Fleet Command",
    text: "See location, status, routes, utilization, alerts, and health in one current operating view.",
    icon: GpsFixedIcon,
  },
  {
    title: "Predictive Fleet Health",
    text: "Detect emerging component issues, prioritize maintenance, and reduce unplanned downtime.",
    icon: BuildCircleIcon,
  },
  {
    title: "Safety & Efficiency",
    text: "Understand driver behavior, idle time, utilization, and route performance with clear scores.",
    icon: SpeedIcon,
  },
  {
    title: "AI-Assisted Intelligence",
    text: "Get role-aware summaries and recommended actions from connected fleet telemetry.",
    icon: AutoGraphIcon,
  },
];

const roles: Array<{
  id: UserRole;
  label: string;
  eyebrow: string;
  description: string;
  access: string;
  icon: ElementType;
  color: string;
}> = [
  {
    id: "executive",
    label: "Executive",
    eyebrow: "STRATEGIC CONTROL",
    description:
      "Understand fleet-wide health, availability, risk, and AI priorities at a glance.",
    access: "Executive cockpit · Knowledge repository",
    icon: BusinessCenterRoundedIcon,
    color: "#8b5cf6",
  },
  {
    id: "monitoring",
    label: "Monitoring",
    eyebrow: "LIVE OPERATIONS",
    description:
      "Track vehicles, exceptions, alerts, diagnostics, and fleet health as conditions change.",
    access: "Cockpit · Deep dive · DTC · Fleet health",
    icon: MonitorHeartRoundedIcon,
    color: "#0284c7",
  },
  {
    id: "engineering",
    label: "Engineer",
    eyebrow: "SYSTEM INTELLIGENCE",
    description:
      "Investigate telemetry pipelines and system performance to resolve technical root causes.",
    access: "Systems operations · Knowledge repository",
    icon: EngineeringRoundedIcon,
    color: "#ea580c",
  },
];

export default function TelematrixLandingPage() {
  const navigate = useNavigate();
  const { darkMode: isDark, toggleDarkMode } = useStore();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  const colors = isDark
    ? {
        page: "#070b12",
        surface: "#0b131e",
        card: "linear-gradient(145deg,#162231,#101a26)",
        ink: "#f1f7fb",
        muted: "#a8bac8",
        border: "#263747",
        appBar: "rgba(7,11,18,.92)",
        accent: "#38bdf8",
        iconBg: "rgba(56,189,248,.13)",
      }
    : {
        page: "#f5f9fb",
        surface: "#fff",
        card: "#fff",
        ink: "#102033",
        muted: "#64748b",
        border: "#d9e6ec",
        appBar: "rgba(255,255,255,.94)",
        accent: "#005071",
        iconBg: "rgba(0,80,113,.09)",
      };

  const scrollTo = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  const enterPlatform = () => {
    if (!selectedRole) {
      scrollTo("roles");
      return;
    }
    localStorage.setItem("telematrix-role", selectedRole);
    navigate(selectedRole === "engineering" ? "/datascience" : "/cockpit-view");
  };

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
          sx={{ minHeight: "64px !important", px: { xs: 2, md: 4 }, gap: 2 }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.4}
            sx={{ cursor: "pointer" }}
            onClick={() => scrollTo("top")}
          >
            <Box
              component="img"
              src={exlLogo}
              alt="EXL Logo"
              sx={{ width: { xs: 60, md: 74 } }}
            />
            <Box>
              <Typography
                sx={{
                  fontSize: { xs: 17, md: 21 },
                  fontWeight: 850,
                  color: isDark ? "#edf5ff" : "#005071",
                  lineHeight: 1,
                }}
              >
                Telemetri
                <Box
                  component="span"
                  sx={{
                    color: "#ed6c02",
                    fontWeight: 950,
                    fontStyle: "italic",
                  }}
                >
                  X
                </Box>
              </Typography>
              <Typography
                sx={{
                  mt: 0.25,
                  color: colors.muted,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: ".09em",
                  whiteSpace: "nowrap",
                }}
              >
                VEHICLE INTELLIGENCE PLATFORM
              </Typography>
            </Box>
          </Stack>
          <Link
            component="button"
            underline="none"
            onClick={() => scrollTo("capabilities")}
            sx={{
              display: { xs: "none", md: "block" },
              ml: "auto",
              color: colors.ink,
              fontSize: 13,
              fontWeight: 800,
              border: 0,
              bgcolor: "transparent",
              cursor: "pointer",
            }}
          >
            What it does
          </Link>
          <Tooltip
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            <IconButton
              onClick={toggleDarkMode}
              size="small"
              sx={{ ml: { xs: "auto", md: 0 }, color: colors.muted }}
            >
              {isDark ? (
                <Brightness7Icon fontSize="small" />
              ) : (
                <Brightness4Icon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            onClick={() => (selectedRole ? enterPlatform() : scrollTo("roles"))}
            sx={{
              display: { xs: "none", sm: "inline-flex" },
              bgcolor: "#005071",
              borderRadius: 2,
              fontWeight: 850,
              textTransform: "none",
              "&:hover": { bgcolor: "#003f59" },
            }}
          >
            {selectedRole ? "Open workspace" : "Select role"}
          </Button>
        </Toolbar>
      </AppBar>

      <Box
        id="top"
        component="section"
        sx={{
          minHeight: { xs: 440, md: 485 },
          display: "flex",
          alignItems: "center",
          color: "#fff",
          background:
            "radial-gradient(circle at 82% 22%,rgba(56,189,248,.2),transparent 30%),linear-gradient(120deg,#06111d 0%,#0b2c40 58%,#07536a 100%)",
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 6 } }}>
          <Grid container spacing={{ xs: 4, md: 5 }} alignItems="center">
            <Grid item xs={12} md={6}>
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                flexWrap="wrap"
                sx={{ mb: 2.2 }}
              >
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
                  fontSize: { xs: 38, sm: 46, lg: 52 },
                  lineHeight: 0.98,
                  fontWeight: 900,
                  letterSpacing: "-.035em",
                }}
              >
                <Box component="span" sx={{ display: "block" }}>
                  See your fleet clearly.
                </Box>
                <Box
                  component="span"
                  sx={{ display: "block", mt: 1.1, color: "#7dd3fc" }}
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
                  lineHeight: 1.65,
                }}
              >
                TelemetriX brings live vehicle data, health, maintenance,
                safety, and operating performance into one role-based command
                center.
              </Typography>
              <Stack direction="row" spacing={1.3} sx={{ mt: 3.5 }}>
                <Button
                  size="large"
                  variant="contained"
                  onClick={() => scrollTo("roles")}
                  endIcon={<ArrowForwardRoundedIcon />}
                  sx={{
                    bgcolor: "#f59e0b",
                    color: "#111827",
                    fontWeight: 900,
                    textTransform: "none",
                    "&:hover": { bgcolor: "#d98605" },
                  }}
                >
                  Choose your workspace
                </Button>
                <Button
                  size="large"
                  variant="outlined"
                  onClick={() => scrollTo("capabilities")}
                  sx={{
                    display: { xs: "none", sm: "inline-flex" },
                    color: "#fff",
                    borderColor: "rgba(255,255,255,.4)",
                    fontWeight: 800,
                    textTransform: "none",
                  }}
                >
                  See capabilities
                </Button>
              </Stack>
            </Grid>
            <Grid
              item
              xs={12}
              md={6}
              sx={{ display: { xs: "none", sm: "block" } }}
            >
              <Box sx={{ width: "90%", maxWidth: 570, ml: "auto" }}>
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
                    alt="TelemetriX Executive Cockpit solution preview"
                    sx={{ display: "block", width: "100%", borderRadius: 1.8 }}
                  />
                </Paper>
                <Typography
                  sx={{
                    mt: 0.8,
                    textAlign: "right",
                    color: "rgba(255,255,255,.58)",
                    fontSize: 11,
                  }}
                >
                  Executive Cockpit · Solution preview
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Box
        component="section"
        id="capabilities"
        sx={{ bgcolor: isDark ? colors.page : "#f5f9fb", scrollMarginTop: 64 }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 6 } }}>
          <Box sx={{ maxWidth: 700, mb: 3.5 }}>
            <Typography
              variant="overline"
              sx={{
                color: colors.accent,
                fontWeight: 900,
                letterSpacing: ".08em",
              }}
            >
              ONE PLATFORM, FOUR OUTCOMES
            </Typography>
            <Typography
              component="h2"
              sx={{
                mt: 0.4,
                fontSize: { xs: 30, md: 38 },
                fontWeight: 900,
                lineHeight: 1.1,
              }}
            >
              From telemetry to confident action
            </Typography>
            <Typography sx={{ mt: 1.2, color: colors.muted, lineHeight: 1.6 }}>
              The essential fleet picture—without switching between disconnected
              tools and reports.
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
                      ? "inset 0 1px rgba(255,255,255,.03)"
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
                  <Typography
                    sx={{ color: colors.ink, fontSize: 17, fontWeight: 900 }}
                  >
                    {title}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 1,
                      color: colors.muted,
                      fontSize: 13.5,
                      lineHeight: 1.55,
                    }}
                  >
                    {text}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{
              mt: 3,
              px: { xs: 2, md: 3 },
              py: 2,
              borderRadius: 2,
              bgcolor: isDark ? "rgba(56,189,248,.08)" : "#eef7fa",
              border: `1px solid ${colors.border}`,
            }}
          >
            {[
              "Connect fleet data",
              "Understand what matters",
              "Act with confidence",
            ].map((step, index) => (
              <Stack
                key={step}
                direction="row"
                alignItems="center"
                spacing={1.2}
                sx={{ flex: 1 }}
              >
                <Box
                  sx={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: colors.accent,
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {index + 1}
                </Box>
                <Typography
                  sx={{ color: colors.ink, fontSize: 13.5, fontWeight: 800 }}
                >
                  {step}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Container>
      </Box>

      <Box
        component="section"
        id="roles"
        sx={{ bgcolor: colors.surface, scrollMarginTop: 64 }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 6.5 } }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            alignItems={{ xs: "flex-start", md: "flex-end" }}
            spacing={2}
            sx={{ mb: 3 }}
          >
            <Box sx={{ maxWidth: 680 }}>
              <Typography
                variant="overline"
                sx={{
                  color: colors.accent,
                  fontWeight: 900,
                  letterSpacing: ".09em",
                }}
              >
                PERSONALIZED WORKSPACES
              </Typography>
              <Typography
                component="h2"
                sx={{
                  mt: 0.3,
                  fontSize: { xs: 30, md: 38 },
                  fontWeight: 900,
                  lineHeight: 1.1,
                }}
              >
                Choose how you work with the fleet
              </Typography>
              <Typography
                sx={{ mt: 1.1, color: colors.muted, lineHeight: 1.6 }}
              >
                Select a role to open the views and intelligence most relevant
                to your responsibilities. No credentials are required for this
                preview.
              </Typography>
            </Box>
            <Chip
              label="Preview access · No sign-in required"
              sx={{
                color: colors.accent,
                bgcolor: colors.iconBg,
                border: `1px solid ${alpha(colors.accent, 0.2)}`,
                fontWeight: 800,
              }}
            />
          </Stack>

          <Grid container spacing={2}>
            {roles.map(
              ({
                id,
                label,
                eyebrow,
                description,
                access,
                icon: Icon,
                color,
              }) => {
                const selected = selectedRole === id;
                return (
                  <Grid item xs={12} md={4} key={id}>
                    <Paper
                      component="button"
                      type="button"
                      onClick={() => setSelectedRole(id)}
                      aria-pressed={selected}
                      sx={{
                        appearance: "none",
                        width: "100%",
                        height: "100%",
                        minHeight: 245,
                        p: 2.5,
                        textAlign: "left",
                        cursor: "pointer",
                        color: colors.ink,
                        borderRadius: 3,
                        background: selected
                          ? `linear-gradient(145deg,${alpha(
                              color,
                              isDark ? 0.18 : 0.09
                            )},${isDark ? "#101a26" : "#fff"})`
                          : colors.card,
                        border: `2px solid ${selected ? color : colors.border}`,
                        boxShadow: selected
                          ? `0 22px 48px ${alpha(color, 0.18)}`
                          : isDark
                          ? "inset 0 1px rgba(255,255,255,.03)"
                          : "0 12px 32px rgba(15,47,69,.06)",
                        transition:
                          "transform .18s ease, border-color .18s ease, box-shadow .18s ease",
                        "&:hover": {
                          transform: "translateY(-4px)",
                          borderColor: color,
                        },
                        "&:focus-visible": {
                          outline: `3px solid ${alpha(color, 0.28)}`,
                          outlineOffset: 3,
                        },
                      }}
                    >
                      <Stack
                        direction="row"
                        justifyContent="space-between"
                        alignItems="flex-start"
                      >
                        <Box
                          sx={{
                            width: 48,
                            height: 48,
                            borderRadius: 2,
                            display: "grid",
                            placeItems: "center",
                            color,
                            bgcolor: alpha(color, 0.12),
                          }}
                        >
                          <Icon />
                        </Box>
                        {selected && (
                          <CheckCircleRoundedIcon
                            sx={{ color, fontSize: 25 }}
                          />
                        )}
                      </Stack>
                      <Typography
                        sx={{
                          mt: 2,
                          color,
                          fontSize: 10,
                          fontWeight: 950,
                          letterSpacing: ".11em",
                        }}
                      >
                        {eyebrow}
                      </Typography>
                      <Typography
                        sx={{ mt: 0.45, fontSize: 21, fontWeight: 900 }}
                      >
                        {label}
                      </Typography>
                      <Typography
                        sx={{
                          mt: 0.8,
                          minHeight: 60,
                          color: colors.muted,
                          fontSize: 13,
                          lineHeight: 1.55,
                        }}
                      >
                        {description}
                      </Typography>
                      <Box
                        sx={{
                          mt: 1.5,
                          pt: 1.4,
                          borderTop: `1px solid ${colors.border}`,
                        }}
                      >
                        <Typography
                          sx={{
                            color: colors.muted,
                            fontSize: 10.5,
                            fontWeight: 750,
                          }}
                        >
                          {access}
                        </Typography>
                      </Box>
                    </Paper>
                  </Grid>
                );
              }
            )}
          </Grid>

          <Paper
            elevation={0}
            sx={{
              mt: 2.5,
              p: { xs: 2, md: 2.25 },
              borderRadius: 2.5,
              display: "flex",
              flexDirection: { xs: "column", sm: "row" },
              alignItems: { xs: "stretch", sm: "center" },
              justifyContent: "space-between",
              gap: 2,
              bgcolor: isDark ? "rgba(56,189,248,.07)" : "#eef7fa",
              border: `1px solid ${colors.border}`,
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 900 }}>
                {selectedRole
                  ? `${
                      roles.find((role) => role.id === selectedRole)?.label
                    } workspace selected`
                  : "Select a role to continue"}
              </Typography>
              <Typography sx={{ mt: 0.3, color: colors.muted, fontSize: 12 }}>
                {selectedRole
                  ? "Your role will also control the navigation available inside the platform."
                  : "You can change your role later from the top-right workspace menu."}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              disabled={!selectedRole}
              onClick={enterPlatform}
              endIcon={<ArrowForwardRoundedIcon />}
              sx={{
                minWidth: 210,
                bgcolor: "#005071",
                fontWeight: 900,
                textTransform: "none",
                "&:hover": { bgcolor: "#003f59" },
              }}
            >
              Enter TelemetriX
            </Button>
          </Paper>
        </Container>
      </Box>

      <Box
        component="footer"
        sx={{
          color: "#fff",
          background: "linear-gradient(115deg,#071827,#0d3e54)",
          borderTop: "1px solid rgba(125,211,252,.12)",
        }}
      >
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            alignItems={{ xs: "flex-start", md: "center" }}
            justifyContent="space-between"
            spacing={2.5}
          >
            <Box>
              <Typography
                sx={{ fontSize: { xs: 25, md: 31 }, fontWeight: 900 }}
              >
                One clear view of your connected fleet.
              </Typography>
              <Typography sx={{ mt: 0.7, color: "rgba(255,255,255,.7)" }}>
                Monitor now, predict what’s next, and respond from the same
                platform.
              </Typography>
            </Box>
            <Button
              size="large"
              variant="contained"
              onClick={() =>
                selectedRole ? enterPlatform() : scrollTo("roles")
              }
              sx={{
                bgcolor: "#f59e0b",
                color: "#111827",
                fontWeight: 900,
                textTransform: "none",
                "&:hover": { bgcolor: "#d98605" },
              }}
            >
              {selectedRole ? "Open your workspace" : "Choose your role"}
            </Button>
          </Stack>
          <Typography
            sx={{
              mt: 3.5,
              pt: 2,
              borderTop: "1px solid rgba(255,255,255,.12)",
              color: "rgba(255,255,255,.52)",
              fontSize: 11.5,
            }}
          >
            TelemetriX · Vehicle Intelligence Platform
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}