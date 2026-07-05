import { useState, useRef, useEffect } from "react";
import {
  Box,
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
  Tooltip,
  Switch,
} from "@mui/material";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@mui/material/styles";
import { alpha } from "@mui/material/styles";
import HomeIcon from "@mui/icons-material/Home";
import SpeedIcon from "@mui/icons-material/Speed";
import PsychologyIcon from "@mui/icons-material/Psychology";
import HealthAndSafetyIcon from "@mui/icons-material/HealthAndSafety";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import BugReportIcon from "@mui/icons-material/BugReport";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import { useStore } from "../store";
import exlLogo from "../images/exl-logo.png";
import CockpitView from "../pages/CockpitView";
import WriterOps from "../pages/WriterOps";
import DashboardInference from "../pages/DashboardInference";
import GoldHealth from "../pages/GoldHealth";
import DashboardAlerts from "../pages/DashboardAlerts";
import AutomotiveDive from "../pages/AutomotiveDive";
import DtcInvestigation from "../pages/DtcInvestigation";
import KnowledgeRepo from "../pages/KnowledgeRepo";

const DRAWER_WIDTH = 240;

const menuItems = [
  { text: "Cockpit View", path: "/", icon: <HomeIcon />, index: 0 },
  { text: "System Ops", path: "/writer-ops", icon: <SpeedIcon />, index: 1 },
  {
    text: "Inference Engine",
    path: "/inference",
    icon: <PsychologyIcon />,
    index: 2,
  },
  {
    text: "Vehicle Health",
    path: "/gold",
    icon: <HealthAndSafetyIcon />,
    index: 3,
  },
  {
    text: "Alerts Management",
    path: "/alerts",
    icon: <WarningAmberIcon />,
    index: 4,
  },
  {
    text: "Automotive Dive",
    path: "/automotive",
    icon: <DirectionsCarIcon />,
    index: 5,
  },
  {
    text: "DTC Investigation",
    path: "/dtc",
    icon: <BugReportIcon />,
    index: 6,
  },
  {
    text: "Knowledge Repo",
    path: "/knowledge-repo",
    icon: <MenuBookIcon />,
    index: 7,
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
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const visited = (path: string) => everVisited.has(path);
  const hide = (active: boolean) => (active ? {} : { display: "none" });

  const isCockpit =
    location.pathname === "/" ||
    location.pathname.startsWith("/cockpit-view");
  const isWriter = location.pathname.startsWith("/writer-ops");
  const isInference = location.pathname.startsWith("/inference");
  const isGold = location.pathname.startsWith("/gold");
  const isAlerts = location.pathname.startsWith("/alerts");
  const isAuto = location.pathname.startsWith("/automotive");
  const isDtc = location.pathname.startsWith("/dtc");
  const isKnowledge = location.pathname.startsWith("/knowledge-repo");

  const handleNavigation = (path: string, index: number) => {
    setActiveTab(index);
    navigate(path);
  };

  return (
    <Box sx={{ display: "flex", height: "100vh", overflow: "auto" }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: darkMode ? "#080f1a" : "#fff",
          color: darkMode ? "#e2e8f0" : "#333",
          borderBottom: darkMode ? "1px solid #1a2535" : "1px solid #ECECEC",
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar
          disableGutters
          sx={{
            minHeight: "36px !important",
            padding: "0 8px !important",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {/* Left Section */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* Logo */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2.5 }}>
              <img src={exlLogo} alt="exl-logo" width={70} />
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: 16,
                  color: darkMode ? "#e2e8f0" : "#333",
                  width: "max-content",
                }}
              >
                Streaming Emulator / Master Control
              </Typography>
            </Box>

            {/* Menu */}
            <Box sx={{ display: "flex", gap: 1, height: "100%" }}>
              {menuItems.map((item) => {
                const isSelected =
                  item.path === "/"
                    ? isCockpit
                    : location.pathname.startsWith(item.path);

                return (
                  <Box
                    key={item.text}
                    onClick={() => {
                      if (!isSelected) {
                        handleNavigation(item.path, item.index);
                      }
                    }}
                    sx={{
                      position: "relative",
                      height: "36px",
                      px: 0.2,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",

                      borderRadius: "8px 8px 0 0",

                      color: isSelected
                        ? darkMode
                          ? "#e2e8f0"
                          : "#FB4E0B"
                        : darkMode
                        ? "#94a3b8"
                        : "#333",

                      bgcolor: isSelected
                        ? darkMode
                          ? "rgba(56,189,248,.10)"
                          : "rgb(251 78 11 / 7%)"
                        : "transparent",

                      transition: "all .25s ease",

                      "&:hover": {
                        color: darkMode ? "#e2e8f0" : "#FB4E0B",

                        bgcolor: darkMode
                          ? "rgba(56,189,248,.07)"
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
                          ? "rgba(56,189,248,.5)"
                          : "rgba(251,78,11,.45)",
                      },
                    }}
                  >
                    {/* Width reserver */}
                    <Box
                      sx={{
                        visibility: "hidden",
                        fontWeight: 700,
                        px: 0,
                        width: "fit-content",
                      }}
                    >
                      {item.text}
                    </Box>

                    {/* Actual text */}
                    <Typography
                      sx={{
                        position: "absolute",
                        whiteSpace: "nowrap",
                        fontSize: 12,
                        fontWeight: isSelected ? (darkMode ? 500 : 700) : 500,
                        transition: "font-weight .15s ease",
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
          p: isKnowledge ? 0 : 1,
          bgcolor: "background.default",
          mt: "45px",
          overflow: "auto",
        }}
      >
        {visited("/") && (
          <Box sx={hide(isCockpit)}>
            <CockpitView isActive={isCockpit} />
          </Box>
        )}
        {visited("/writer-ops") && (
          <Box sx={hide(isWriter)}>
            <WriterOps isActive={isWriter} />
          </Box>
        )}
        {visited("/inference") && (
          <Box sx={hide(isInference)}>
            <DashboardInference isActive={isInference} />
          </Box>
        )}
        {visited("/gold") && (
          <Box sx={hide(isGold)}>
            <GoldHealth isActive={isGold} />
          </Box>
        )}
        {visited("/alerts") && (
          <Box sx={hide(isAlerts)}>
            <DashboardAlerts isActive={isAlerts} />
          </Box>
        )}
        {visited("/automotive") && (
          <Box sx={hide(isAuto)}>
            <AutomotiveDive isActive={isAuto} />
          </Box>
        )}
        {isDtc && <DtcInvestigation />}
        {visited("/knowledge-repo") && (
          <Box sx={hide(isKnowledge)}>
            <KnowledgeRepo />
          </Box>
        )}
      </Box>
    </Box>
  );
}
