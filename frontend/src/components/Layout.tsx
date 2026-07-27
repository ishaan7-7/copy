import { useState, useRef, useEffect } from "react";
import {
  Box,
  Badge,
  Typography,
  AppBar,
  Toolbar,
  IconButton,
  Popover,
  Stack,
  Tooltip,
  FormControl,
  MenuItem,
  Select,
  SelectChangeEvent,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import { alpha } from "@mui/material/styles";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import NotificationsNoneOutlinedIcon from "@mui/icons-material/NotificationsNoneOutlined";
import BusinessCenterRoundedIcon from "@mui/icons-material/BusinessCenterRounded";
import EngineeringRoundedIcon from "@mui/icons-material/EngineeringRounded";
import MonitorHeartRoundedIcon from "@mui/icons-material/MonitorHeartRounded";
import { useStore } from "../store";
import exlLogo from "../images/exl-logo.png";
import CockpitView from "../pages/CockpitView";
import FleetHealth from "../pages/FleetHealth";
import AutomotiveDive from "../pages/AutomotiveDive";
import DtcInvestigation from "../pages/DtcInvestigation";
import DataScience from "../pages/DataScience";
import FleetChatAssistant from "./FleetChatAssistant";

const PIPELINE_API = "http://127.0.0.1:8005";

type UserRole = "executive" | "monitoring" | "engineering";

const roleConfig: Record<
  UserRole,
  {
    label: string;
    paths: string[];
    color: string;
    icon: typeof BusinessCenterRoundedIcon;
  }
> = {
  executive: {
    label: "Executive",
    paths: ["/cockpit-view"],
    color: "#8b5cf6",
    icon: BusinessCenterRoundedIcon,
  },
  monitoring: {
    label: "Monitoring",
    paths: ["/cockpit-view", "/fleet-health", "/automotive", "/dtc"],
    color: "#0ea5e9",
    icon: MonitorHeartRoundedIcon,
  },
  engineering: {
    label: "Engineering",
    paths: ["/datascience"],
    color: "#f97316",
    icon: EngineeringRoundedIcon,
  },
};

const menuItems = [
  { text: "Cockpit View", path: "/cockpit-view", index: 0 },
  { text: "Vehicle Deep Dive", path: "/automotive", index: 1 },
  { text: "DTC Investigation", path: "/dtc", index: 2 },
  { text: "Fleet Health", path: "/fleet-health", index: 3 },
  { text: "Systems Ops", path: "/datascience", index: 4 },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { autoRefresh, darkMode, toggleAutoRefresh, toggleDarkMode, setActiveTab } = useStore();

  const [everVisited, setEverVisited] = useState<Set<string>>(new Set(["/"]));
  const [notificationAnchor, setNotificationAnchor] = useState<HTMLElement | null>(null);
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    const stored = localStorage.getItem("telematrix-role") as UserRole | null;
    return stored && roleConfig[stored] ? stored : "monitoring";
  });
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allowedPaths = roleConfig[currentRole].paths;
  const visibleMenuItems = menuItems.filter((item) => allowedPaths.includes(item.path));

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

  const isCockpit = location.pathname === "/" || location.pathname.startsWith("/cockpit-view");
  const isFleetHealth = location.pathname.startsWith("/fleet-health");
  const isAuto = location.pathname.startsWith("/automotive");
  const isDtc = location.pathname.startsWith("/dtc");
  const isDataScience = location.pathname.startsWith("/datascience");

  const { data: notificationData } = useQuery({
    queryKey: ["layout-alert-notifications"],
    queryFn: () => axios.get(`${PIPELINE_API}/api/alerts/metrics`).then((r) => r.data),
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

  const notificationCount = notificationData?.active_alerts_count ?? liveNotifications.length;

  const handleNavigation = (path: string, index: number) => {
    setActiveTab(index);
    navigate(path);
  };

  const selectRole = (role: UserRole) => {
    setCurrentRole(role);
    const nextAllowedPaths = roleConfig[role].paths;
    const currentPath = location.pathname === "/" ? "/cockpit-view" : location.pathname;
    if (!nextAllowedPaths.some((path) => currentPath.startsWith(path))) {
      navigate(nextAllowedPaths[0]);
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
          {/* Left: Logo + Nav */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 1.5, lg: 2, xl: 2.5 },
              minWidth: 0,
              flex: 1,
            }}
          >
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
                    color: darkMode ? "#9fb2c9" : "#64748B",
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

            {/* Nav tabs */}
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
                      if (!isSelected) handleNavigation(item.path, item.index);
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
                        ? darkMode ? "#edf5ff" : "#FB4E0B"
                        : darkMode ? "#c8d7e8" : "#333",
                      bgcolor: isSelected
                        ? darkMode ? "rgba(56,189,248,.18)" : "rgba(251,78,11,.13)"
                        : "transparent",
                      boxShadow: isSelected
                        ? darkMode
                          ? "inset 0 0 0 1px rgba(56,189,248,0.2)"
                          : "inset 0 0 0 1px rgba(251,78,11,0.16)"
                        : "none",
                      transition: "all .25s ease",
                      "&:hover": {
                        color: darkMode ? "#edf5ff" : "#FB4E0B",
                        bgcolor: darkMode ? "rgba(56,189,248,.09)" : "rgba(251,78,11,.05)",
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
                          : isSelected ? "#FB4E0B" : "rgba(251,78,11,.45)",
                        transform: isSelected ? "scaleX(1)" : "scaleX(0)",
                        transition: "transform .25s ease, background-color .25s ease",
                      },
                      "&:hover::after": {
                        transform: "scaleX(1)",
                        backgroundColor: darkMode ? "rgba(56,189,248,.75)" : "rgba(251,78,11,.45)",
                      },
                    }}
                  >
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

          {/* Right: role selector + notifications + theme */}
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <FormControl size="small" sx={{ minWidth: { xs: 112, lg: 138 } }}>
              <Select<UserRole>
                aria-label="Select dashboard view"
                value={currentRole}
                onChange={handleRoleSelect}
                sx={{
                  height: "var(--app-control-h)",
                  fontSize: "var(--app-font-sm)",
                  fontWeight: 750,
                  borderRadius: 1.5,
                  bgcolor: alpha(roleConfig[currentRole].color, darkMode ? 0.12 : 0.07),
                  "& .MuiSelect-select": { display: "flex", alignItems: "center", py: 0.4 },
                  "& fieldset": { borderColor: alpha(roleConfig[currentRole].color, 0.34) },
                }}
              >
                {(Object.keys(roleConfig) as UserRole[]).map((role) => (
                  <MenuItem key={role} value={role}>
                    {roleConfig[role].label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

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
                  sx={{ "& .MuiBadge-badge": { fontSize: 9, height: 16, minWidth: 16, px: 0.35 } }}
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

            <Tooltip title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}>
              <IconButton onClick={toggleDarkMode} size="small">
                {darkMode ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: isDataScience || isFleetHealth ? 0 : 1,
          bgcolor: "background.default",
          mt: "var(--app-header-h)",
          height: "calc(100vh - var(--app-header-h))",
          minHeight: 0,
          overflow: "auto",
        }}
      >
        {visited("/") && (
          <Box sx={{ ...hide(isCockpit), height: "100%", minHeight: 0, overflow: "auto" }}>
            <CockpitView isActive={isCockpit} disableExternalNav={currentRole === "executive"} />
          </Box>
        )}
        {visited("/fleet-health") && (
          <Box sx={hide(isFleetHealth)}>
            <FleetHealth isActive={isFleetHealth} />
          </Box>
        )}
        {visited("/automotive") && (
          <Box sx={{ ...hide(isAuto), height: "100%", minHeight: 0, overflow: "auto" }}>
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
      </Box>

      <FleetChatAssistant
        activeAlertCount={notificationCount}
        currentRoleLabel={roleConfig[currentRole].label}
      />
    </Box>
  );
}
