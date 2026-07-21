import { useState, useRef, useEffect } from "react";
import {
  Box,
  Badge,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  AppBar,
  Toolbar,
  Button,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  Switch,
  Divider,
  FormControl,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";
import HomeIcon from "@mui/icons-material/Home";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import BugReportIcon from "@mui/icons-material/BugReport";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import AnalyticsRoundedIcon from "@mui/icons-material/AnalyticsRounded";
import MonitorHeartRoundedIcon from "@mui/icons-material/MonitorHeartRounded";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import BusinessCenterRoundedIcon from "@mui/icons-material/BusinessCenterRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import { useStore } from "../store";
import exlLogo from "../images/exl-logo.png";
import CockpitView from "../pages/CockpitView";
import FleetHealth from "../pages/FleetHealth";
import AutomotiveDive from "../pages/AutomotiveDive";
import DtcInvestigation from "../pages/DtcInvestigation";
import DataScience from "../pages/DataScience";
import KnowledgeRepo from "../pages/KnowledgeRepo";
import FleetChatAssistant from "./FleetChatAssistant";

const DRAWER_WIDTH = 240;
const PIPELINE_API = "http://127.0.0.1:8005";

function SidebarPanelIcon() {
  return (
    <Box
      aria-hidden="true"
      sx={{
        position: "relative",
        pointerEvents: "none",
        width: 18,
        height: 15,
        border: "1.6px solid currentColor",
        borderRadius: "3px",
        boxSizing: "border-box",
        "&::before": {
          content: '""',
          position: "absolute",
          top: -0.2,
          bottom: -0.2,
          left: 5.2,
          borderLeft: "1.6px solid currentColor",
        },
        "&::after": {
          content: '""',
          position: "absolute",
          width: 2,
          height: 2,
          left: 1.4,
          top: 2.1,
          borderRadius: "50%",
          bgcolor: "currentColor",
          boxShadow: "0 3.2px 0 currentColor, 0 6.4px 0 currentColor",
        },
      }}
    />
  );
}

type UserRole = "executive" | "monitoring" | "engineering";

const roleConfig: Record<
  UserRole,
  {
    label: string;
    description: string;
    paths: string[];
    color: string;
    icon: typeof BusinessCenterRoundedIcon;
  }
> = {
  executive: {
    label: "Executive",
    description: "Leadership overview and knowledge access",
    paths: ["/cockpit-view", "/knowledge-repo"],
    color: "#8b5cf6",
    icon: BusinessCenterRoundedIcon,
  },
  monitoring: {
    label: "Monitoring",
    description: "Fleet operations and incident monitoring",
    paths: ["/cockpit-view", "/fleet-health", "/dtc", "/knowledge-repo"],
    color: "#0ea5e9",
    icon: MonitorHeartRoundedIcon,
  },
  engineering: {
    label: "Engineering",
    description: "Full diagnostics, data, and systems access",
    paths: [
      "/cockpit-view",
      "/fleet-health",
      "/automotive",
      "/dtc",
      "/datascience",
      "/knowledge-repo",
    ],
    color: "#f97316",
    icon: EngineeringRoundedIcon,
  },
};

const menuItems = [
  { text: "Cockpit View", path: "/cockpit-view", icon: <HomeIcon />, index: 0 },
  {
    text: "Fleet Health",
    path: "/fleet-health",
    icon: <MonitorHeartRoundedIcon />,
    index: 1,
  },
  {
    text: "Vehicle Deep Dive",
    path: "/automotive",
    icon: <DirectionsCarIcon />,
    index: 2,
  },
  {
    text: "DTC Investigation",
    path: "/dtc",
    icon: <BugReportIcon />,
    index: 3,
  },
  {
    text: "Systems Ops",
    path: "/datascience",
    icon: <AnalyticsRoundedIcon />,
    index: 4,
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const {
    autoRefresh,
    darkMode,
    toggleAutoRefresh,
    toggleDarkMode,
    setActiveTab,
  } = useStore();

  const [everVisited, setEverVisited] = useState<Set<string>>(new Set(["/"]));
  const [notificationAnchor, setNotificationAnchor] =
    useState<HTMLElement | null>(null);
  const [roleDrawerOpen, setRoleDrawerOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const stored = localStorage.getItem("telematrix-role") as UserRole | null;
    return stored && roleConfig[stored] ? stored : "engineering";
  });
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allowedPaths = roleConfig[currentRole].paths;
  const visibleMenuItems = menuItems.filter((item) =>
    allowedPaths.includes(item.path)
  );
  const canAccessKnowledge = allowedPaths.includes("/knowledge-repo");

  useEffect(() => {
    setEverVisited((prev) => new Set([...prev, location.pathname]));
    if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    resizeTimerRef.current = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
      resizeTimerRef.current = null;
    }, 120);
    return () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem("telematrix-role", currentRole);
  }, [currentRole]);

  const visited = (path: string) => everVisited.has(path);
  const hide = (active: boolean) => (active ? {} : { display: "none" });

  const isCockpit =
    location.pathname === "/" || location.pathname.startsWith("/cockpit-view");
  const isFleetHealth = location.pathname.startsWith("/fleet-health");
  const isAuto = location.pathname.startsWith("/automotive");
  const isDtc = location.pathname.startsWith("/dtc");
  const isDataScience = location.pathname.startsWith("/datascience");
  const isKnowledge = location.pathname.startsWith("/knowledge-repo");

  const { data: notificationData } = useQuery({
    queryKey: ["layout-alert-notifications"],
    queryFn: () =>
      axios.get(`${PIPELINE_API}/api/alerts/metrics`).then((r) => r.data),
    refetchInterval: autoRefresh ? 10000 : false,
    retry: 1,
  });

  const liveNotifications = (() => {
    const open = notificationData?.open_alerts ?? [];
    if (open.length) {
      return open.map((alert: any) => ({
        title: `${alert.source_id} ${String(alert.module ?? "module").toUpperCase()}`,
        body:
          alert.severity === "critical"
            ? "Critical anomaly needs immediate attention"
            : "Live anomaly detected from vehicle stream",
        color: alert.severity === "critical" ? "#ef4444" : "#f59e0b",
      }));
    }
    return [
      {
        title: "Fleet stream monitor",
        body: "Waiting for live fleet alerts from the backend",
        color: "#3b82f6",
      },
      {
        title: "Telemetry fallback",
        body: "Showing operational notifications until streaming resumes",
        color: "#f59e0b",
      },
    ];
  })();

  const notificationCount =
    notificationData?.active_alerts_count ?? liveNotifications.length;

  const handleNavigation = (path: string, index: number) => {
    setActiveTab(index);
    navigate(path);
  };

  const selectRole = (role: UserRole) => {
    setCurrentRole(role);
    const nextAllowedPaths = roleConfig[role].paths;
    const currentPath =
      location.pathname === "/" ? "/cockpit-view" : location.pathname;
    if (!nextAllowedPaths.some((path) => currentPath.startsWith(path))) {
      setActiveTab(0);
      navigate("/cockpit-view");
    }
  };

  const handleRoleSelect = (event: SelectChangeEvent<UserRole>) => {
    selectRole(event.target.value as UserRole);
  };

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: darkMode ? "rgba(5,13,23,0.96)" : "#fff",
          color: darkMode ? "#edf5ff" : "#333",
          borderBottom: darkMode
            ? "1px solid rgba(125,211,252,0.14)"
            : "1px solid #ECECEC",
          boxShadow: darkMode ? "0 10px 30px rgba(0,0,0,0.32)" : "none",
          backdropFilter: darkMode ? "blur(14px)" : undefined,
          zIndex: (theme) => theme.zIndex.drawer + 1,
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
          {/* Left Section */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 1.5, lg: 2, xl: 2.5 },
              minWidth: 0,
              flex: 1,
            }}
          >
            <Tooltip title="Open role and navigation menu">
              <IconButton
                aria-label="Open role and navigation menu"
                disabled={roleDrawerOpen}
                onClick={() => setRoleDrawerOpen(true)}
                size="small"
                sx={{
                  width: "var(--app-control-h)",
                  height: "var(--app-control-h)",
                  flexShrink: 0,
                  color: darkMode ? "#cbd5e1" : "#475569",
                  border: `1px solid ${
                    darkMode ? "rgba(148,163,184,.16)" : "#e2e8f0"
                  }`,
                  borderRadius: 1.5,
                }}
              >
                <SidebarPanelIcon />
              </IconButton>
            </Tooltip>

            {/* Logo */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: { xs: 1, lg: 1.75, xl: 2.5 },
                cursor: "pointer",
                flexShrink: 0,
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
                    color: darkMode ? "#edf5ff" : "#005071",
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
                    fontSize: "var(--app-font-xs)",
                    color: darkMode ? "#9fb2c9" : "#64748B",
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

            {/* Menu */}
            <Box
              data-testid="top-navigation"
              sx={{
                display: "flex",
                gap: 0.45,
                height: "-webkit-fill-available",
                width: "100%",
                minWidth: 0,
                overflow: "hidden",
                alignItems: "center",
                flex: 1,
                p: { xs: "3px", xl: "4px" },
                borderRadius: "10px",
                // bgcolor: darkMode
                //   ? "rgba(15,31,49,0.68)"
                //   : "rgba(255,247,243,0.96)",
                // border: darkMode
                //   ? "1px solid rgba(125,211,252,0.12)"
                //   : "1px solid rgba(251,78,11,0.14)",
              }}
            >
              {visibleMenuItems.map((item) => {
                const isSelected =
                  item.path === "/"
                    ? location.pathname === "/"
                    : location.pathname.startsWith(item.path);

                return (
                  <Box
                    key={item.text}
                    data-testid={`top-nav-${item.index}`}
                    onClick={() => {
                      if (!isSelected) {
                        handleNavigation(item.path, item.index);
                      }
                    }}
                    sx={{
                      position: "relative",
                      height: "100%",
                      px: { xs: 0.45, lg: 0.75, xl: 1 },
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      width: { xs: 112, lg: 126, xl: 140 },
                      minWidth: { xs: 112, lg: 126, xl: 140 },
                      flex: "0 0 auto",
                      borderRadius: "7px",

                      color: isSelected
                        ? darkMode
                          ? "#edf5ff"
                          : "#FB4E0B"
                        : darkMode
                        ? "#c8d7e8"
                        : "#333",

                      bgcolor: isSelected
                        ? darkMode
                          ? "rgba(56,189,248,.18)"
                          : "rgba(251,78,11,.13)"
                        : "transparent",
                      boxShadow: isSelected
                        ? darkMode
                          ? "inset 0 0 0 1px rgba(56,189,248,0.2)"
                          : "inset 0 0 0 1px rgba(251,78,11,0.16)"
                        : "none",

                      transition: "all .25s ease",

                      "&:hover": {
                        color: darkMode ? "#edf5ff" : "#FB4E0B",

                        bgcolor: darkMode
                          ? "rgba(56,189,248,.09)"
                          : "rgba(251,78,11,.05)",
                      },

                      "&::after": {
                        content: '""',
                        position: "absolute",
                        left: 6,
                        right: 6,
                        bottom: 0,
                        height: "2px",
                        borderRadius: "999px",

                        backgroundColor: darkMode
                          ? "#38bdf8"
                          : isSelected
                          ? "#FB4E0B"
                          : "rgba(251,78,11,.45)",

                        transform: isSelected ? "scaleX(1)" : "scaleX(0)",

                        transition:
                          "transform .25s ease, background-color .25s ease",
                      },

                      "&:hover::after": {
                        transform: "scaleX(1)",

                        backgroundColor: darkMode
                          ? "rgba(56,189,248,.75)"
                          : "rgba(251,78,11,.45)",
                      },

                      // "&:hover::after": {
                      //   transform: "scaleX(1)",

                      //   backgroundColor: darkMode
                      //     ? "#fff"
                      //     : "rgba(251,78,11,.45)",
                      // },
                    }}
                  >
                    {/* Width reserver */}
                    <Box
                      sx={{
                        visibility: "hidden",
                        fontWeight: 800,
                        px: 0,
                        width: "100%",
                        textAlign: "center",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.text}
                    </Box>

                    {/* Actual text */}
                    <Typography
                      sx={{
                        position: "absolute",
                        whiteSpace: "nowrap",
                        fontSize: "var(--app-font-md)",
                        fontWeight: isSelected ? 800 : 650,
                        transition: "font-weight .15s ease",
                        px: 0.25,
                        maxWidth: "calc(100% - 8px)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        textAlign: "center",
                      }}
                    >
                      {item.text}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {/* Right Actions */}
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <FormControl size="small" sx={{ minWidth: { xs: 112, lg: 138 } }}>
              <Select<UserRole>
                aria-label="Select dashboard role"
                value={currentRole}
                onChange={handleRoleSelect}
                sx={{
                  height: "var(--app-control-h)",
                  fontSize: "var(--app-font-sm)",
                  fontWeight: 750,
                  borderRadius: 1.5,
                  bgcolor: alpha(roleConfig[currentRole].color, darkMode ? 0.12 : 0.07),
                  "& .MuiSelect-select": {
                    display: "flex",
                    alignItems: "center",
                    py: 0.4,
                  },
                  "& fieldset": {
                    borderColor: alpha(roleConfig[currentRole].color, 0.34),
                  },
                }}
              >
                {(Object.keys(roleConfig) as UserRole[]).map((role) => (
                  <MenuItem key={role} value={role}>
                    {roleConfig[role].label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {canAccessKnowledge && (
              <Tooltip title="Knowledge Repo">
                <IconButton
                  size="small"
                  onClick={() => navigate("/knowledge-repo")}
                  sx={{
                    color: isKnowledge
                      ? darkMode
                        ? "#fff"
                        : "#FB4E0B"
                      : darkMode
                      ? "#94a3b8"
                      : "#64748b",
                  }}
                >
                  <MenuBookIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Live Notifications">
              <IconButton
                size="small"
                onClick={(event) => setNotificationAnchor(event.currentTarget)}
                sx={{
                  color: darkMode ? "#94a3b8" : "#64748b",
                  width: "var(--app-control-h)",
                  height: "var(--app-control-h)",
                }}
              >
                <Badge
                  badgeContent={notificationCount}
                  color="error"
                  max={99}
                  sx={{
                    "& .MuiBadge-badge": {
                      fontSize: 9,
                      height: 16,
                      minWidth: 16,
                      px: 0.35,
                    },
                  }}
                >
                  <NotificationsNoneOutlinedIcon fontSize="small" />
                </Badge>
              </IconButton>
            </Tooltip>
            <Popover
              open={Boolean(notificationAnchor)}
              anchorEl={notificationAnchor}
              onClose={() => setNotificationAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <Box
                sx={{
                  width: 330,
                  p: 1.2,
                  bgcolor: darkMode ? "#0f172a" : "#ffffff",
                  border: `1px solid ${darkMode ? "#1e293b" : "#e2e8f0"}`,
                }}
              >
                <Typography sx={{ fontSize: 12, fontWeight: 800, mb: 0.8 }}>
                  Live Notifications
                </Typography>
                <Stack spacing={0.7} sx={{ maxHeight: 360, overflowY: "auto" }}>
                  {liveNotifications.map(
                    (item: { title: string; body: string; color: string }) => (
                    <Box
                      key={`${item.title}-${item.body}`}
                      sx={{
                        display: "flex",
                        gap: 0.8,
                        p: 0.8,
                        borderRadius: 1,
                        bgcolor: darkMode ? "#111827" : "#f8fafc",
                        border: `1px solid ${darkMode ? "#1e293b" : "#e2e8f0"}`,
                      }}
                    >
                      <Box
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          bgcolor: item.color,
                          mt: 0.45,
                          flexShrink: 0,
                        }}
                      />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 11, fontWeight: 800 }} noWrap>
                          {item.title}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: "text.secondary" }}>
                          {item.body}
                        </Typography>
                      </Box>
                    </Box>
                    )
                  )}
                </Stack>
              </Box>
            </Popover>
            <Tooltip
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              <IconButton onClick={toggleDarkMode} size="small">
                {darkMode ? (
                  <Brightness7Icon fontSize="small" />
                ) : (
                  <Brightness4Icon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {roleDrawerOpen && (
        <>
          <Box
            data-testid="sidebar-backdrop"
            aria-hidden="true"
            onClick={() => setRoleDrawerOpen(false)}
            sx={{
              position: "fixed",
              inset: 0,
              zIndex: (muiTheme) => muiTheme.zIndex.drawer + 2,
              bgcolor: darkMode ? "rgba(0,0,0,.58)" : "rgba(15,23,42,.28)",
              backdropFilter: "blur(2px)",
            }}
          />
          <Box
            component="aside"
            role="dialog"
            aria-label="Role and navigation menu"
            data-testid="role-sidebar"
            sx={{
              position: "fixed",
              top: 0,
              bottom: 0,
              left: 0,
              zIndex: (muiTheme) => muiTheme.zIndex.drawer + 3,
              width: { xs: "min(88vw, 330px)", sm: 330 },
              boxSizing: "border-box",
              overflowY: "auto",
              bgcolor: darkMode ? "#08111f" : "#ffffff",
              color: darkMode ? "#e5eef9" : "#172033",
              borderRight: `1px solid ${darkMode ? "#1e293b" : "#e2e8f0"}`,
              boxShadow: darkMode
                ? "24px 0 70px rgba(0,0,0,.55)"
                : "24px 0 70px rgba(15,23,42,.20)",
              animation: "role-sidebar-in .2s ease-out",
              "@keyframes role-sidebar-in": {
                from: { transform: "translateX(-100%)" },
                to: { transform: "translateX(0)" },
              },
            }}
          >
        <Box
          sx={{
            height: "var(--app-header-h)",
            px: 1.4,
            display: "flex",
            alignItems: "center",
            gap: 1,
            borderBottom: `1px solid ${darkMode ? "#1e293b" : "#e2e8f0"}`,
          }}
        >
          <Box
              component="button"
              type="button"
              aria-label="Collapse role and navigation menu"
              data-testid="sidebar-collapse-button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setRoleDrawerOpen(false);
              }}
              sx={{
                width: 30,
                height: 30,
                display: "grid",
                placeItems: "center",
                p: 0,
                color: darkMode ? "#cbd5e1" : "#475569",
                border: `1px solid ${darkMode ? "#334155" : "#e2e8f0"}`,
                borderRadius: 1.5,
                flexShrink: 0,
                bgcolor: "transparent",
                cursor: "pointer",
                font: "inherit",
                "&:hover": {
                  bgcolor: darkMode ? "rgba(56,189,248,.10)" : "rgba(0,80,113,.08)",
                },
              }}
          >
            <SidebarPanelIcon />
          </Box>
          <Box
            component="img"
            src={exlLogo}
            alt="EXL Logo"
            sx={{ width: 58, order: 1 }}
          />
          <Typography sx={{ fontSize: 13, fontWeight: 850, flex: 1, order: 2 }}>
            Role access
          </Typography>
        </Box>

        <Box sx={{ p: 1.5, overflowY: "auto" }}>
          <Typography
            sx={{
              px: 0.4,
              mb: 0.9,
              fontSize: 9.5,
              fontWeight: 800,
              color: "text.secondary",
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            Choose workspace
          </Typography>
          <Stack spacing={0.8}>
            {(Object.keys(roleConfig) as UserRole[]).map((role) => {
              const config = roleConfig[role];
              const RoleIcon = config.icon;
              const selected = currentRole === role;
              return (
                <Button
                  key={role}
                  fullWidth
                  onClick={() => selectRole(role)}
                  aria-pressed={selected}
                  sx={{
                    justifyContent: "flex-start",
                    textAlign: "left",
                    gap: 1.15,
                    px: 1.15,
                    py: 1.05,
                    borderRadius: 2,
                    color: "text.primary",
                    textTransform: "none",
                    border: `1px solid ${
                      selected
                        ? alpha(config.color, 0.5)
                        : darkMode
                        ? "#1e293b"
                        : "#e2e8f0"
                    }`,
                    bgcolor: selected
                      ? alpha(config.color, darkMode ? 0.16 : 0.08)
                      : "transparent",
                    "&:hover": { bgcolor: alpha(config.color, darkMode ? 0.2 : 0.1) },
                  }}
                >
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 1.7,
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      color: config.color,
                      bgcolor: alpha(config.color, 0.12),
                    }}
                  >
                    <RoleIcon fontSize="small" />
                  </Box>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography sx={{ fontSize: 11.5, fontWeight: 800 }}>
                      {config.label}
                    </Typography>
                    <Typography sx={{ fontSize: 9.5, color: "text.secondary", lineHeight: 1.35 }}>
                      {config.description}
                    </Typography>
                  </Box>
                  {selected && (
                    <CheckCircleRoundedIcon sx={{ color: config.color, fontSize: 18 }} />
                  )}
                </Button>
              );
            })}
          </Stack>

          <Divider sx={{ my: 1.6 }} />
          <Typography
            sx={{
              px: 0.4,
              mb: 0.7,
              fontSize: 9.5,
              fontWeight: 800,
              color: "text.secondary",
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            Available views
          </Typography>
          <Stack spacing={0.4}>
            {visibleMenuItems.map((item) => (
              <Button
                key={item.path}
                startIcon={item.icon}
                onClick={() => {
                  handleNavigation(item.path, item.index);
                  setRoleDrawerOpen(false);
                }}
                sx={{
                  justifyContent: "flex-start",
                  color: "text.primary",
                  textTransform: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 1.5,
                }}
              >
                {item.text}
              </Button>
            ))}
            {canAccessKnowledge && (
              <Button
                startIcon={<MenuBookIcon />}
                onClick={() => {
                  navigate("/knowledge-repo");
                  setRoleDrawerOpen(false);
                }}
                sx={{
                  justifyContent: "flex-start",
                  color: "text.primary",
                  textTransform: "none",
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 1.5,
                }}
              >
                Knowledge Repo
              </Button>
            )}
          </Stack>

          {currentRole === "monitoring" && (
            <Box
              sx={{
                mt: 1.5,
                p: 1.15,
                borderRadius: 2,
                bgcolor: alpha(roleConfig.monitoring.color, darkMode ? 0.11 : 0.06),
                border: `1px dashed ${alpha(roleConfig.monitoring.color, 0.38)}`,
              }}
            >
              <Typography sx={{ fontSize: 10.5, fontWeight: 800, mb: 0.25 }}>
                Monitoring cockpit
              </Typography>
              <Typography sx={{ fontSize: 9.5, color: "text.secondary", lineHeight: 1.4 }}>
                A dedicated monitoring cockpit can be connected here when its view is finalized.
              </Typography>
            </Box>
          )}
        </Box>
          </Box>
        </>
      )}

      {/* <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            borderRight: `1px solid ${theme.palette.divider}`,
            bgcolor: "background.paper",
          },
        }}
      >
        <Toolbar sx={{ minHeight: "48px !important" }} />
        <Box sx={{ overflow: "auto", mt: 2 }}>
          <List>
            {menuItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  selected={
                    item.path === "/"
                      ? location.pathname === "/"
                      : location.pathname.startsWith(item.path)
                  }
                  onClick={() => handleNavigation(item.path, item.index)}
                  sx={{
                    "&.Mui-selected": {
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                      borderRight: `4px solid ${theme.palette.primary.main}`,
                    },
                    "&.Mui-selected:hover": {
                      bgcolor: alpha(theme.palette.primary.main, 0.14),
                    },
                    "&:hover": {
                      bgcolor: alpha(theme.palette.primary.main, 0.05),
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color:
                        location.pathname === item.path
                          ? "primary.main"
                          : "text.secondary",
                      minWidth: 40,
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{
                      fontWeight: location.pathname === item.path ? 700 : 500,
                      fontSize: "0.85rem",
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer> */}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: isKnowledge || isDataScience || isFleetHealth ? 0 : 1,
          bgcolor: "background.default",
          mt: "var(--app-header-h)",
          height: "calc(100vh - var(--app-header-h))",
          minHeight: 0,
          overflow: "auto",
        }}
      >
        {visited("/") && (
          <Box
            sx={{
              ...hide(isCockpit),
              height: "100%",
              minHeight: 0,
              overflow: "auto",
            }}
          >
            <CockpitView isActive={isCockpit} />
          </Box>
        )}
        {visited("/fleet-health") && (
          <Box sx={hide(isFleetHealth)}>
            <FleetHealth isActive={isFleetHealth} />
          </Box>
        )}
        {visited("/automotive") && (
          <Box
            sx={{
              ...hide(isAuto),
              height: "100%",
              minHeight: 0,
              overflow: "auto",
            }}
          >
            <AutomotiveDive isActive={isAuto} />
          </Box>
        )}
        {visited("/dtc") && (
          <Box sx={hide(isDtc)}>
            <DtcInvestigation isActive={isDtc} />
          </Box>
        )}
        {visited("/datascience") && (
          <Box sx={hide(isDataScience)}>
            <DataScience isActive={isDataScience} />
          </Box>
        )}
        {visited("/knowledge-repo") && (
          <Box
            sx={{
              ...hide(isKnowledge),
              height: "100%",
              minHeight: 0,
              overflow: "auto",
            }}
          >
            <KnowledgeRepo />
          </Box>
        )}
      </Box>
      <FleetChatAssistant
        activeAlertCount={notificationCount}
        currentRoleLabel={roleConfig[currentRole].label}
      />
    </Box>
  );
}
