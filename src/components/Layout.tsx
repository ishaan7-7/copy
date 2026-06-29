import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, AppBar, Toolbar, Button, IconButton, Tooltip } from '@mui/material';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { alpha } from '@mui/material/styles';
import HomeIcon from '@mui/icons-material/Home';
import SpeedIcon from '@mui/icons-material/Speed';
import PsychologyIcon from '@mui/icons-material/Psychology';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import BugReportIcon from '@mui/icons-material/BugReport';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { useStore } from '../store';

const DRAWER_WIDTH = 240;

const menuItems = [
  { text: 'Fleet Center', path: '/', icon: <HomeIcon />, index: 0 },
  { text: 'System Ops', path: '/writer-ops', icon: <SpeedIcon />, index: 1 },
  { text: 'Inference Engine', path: '/inference', icon: <PsychologyIcon />, index: 2 },
  { text: 'Vehicle Health', path: '/gold', icon: <HealthAndSafetyIcon />, index: 3 },
  { text: 'Alerts Management', path: '/alerts', icon: <WarningAmberIcon />, index: 4 },
  { text: 'Automotive Dive', path: '/automotive', icon: <DirectionsCarIcon />, index: 5 },
  { text: 'DTC Investigation', path: '/dtc', icon: <BugReportIcon />, index: 6 },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const { autoRefresh, darkMode, toggleAutoRefresh, toggleDarkMode, setActiveTab } = useStore();

  const handleNavigation = (path: string, index: number) => {
    setActiveTab(index);
    navigate(path);
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <AppBar
        position="fixed"
        sx={{
          zIndex: (t) => t.zIndex.drawer + 1,
          bgcolor: 'primary.main',
          boxShadow: 'none',
          borderBottom: `1px solid ${alpha(theme.palette.common.white, 0.15)}`,
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', minHeight: '48px !important' }}>
          <Typography variant="h6" color="inherit">
            Streaming Emulator // Master Control
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              <IconButton onClick={toggleDarkMode} size="small" sx={{ color: 'inherit' }}>
                {darkMode ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              color={autoRefresh ? 'success' : 'error'}
              onClick={toggleAutoRefresh}
              size="small"
              disableElevation
              sx={{ borderRadius: 0 }}
            >
              {autoRefresh ? 'LIVE REFRESH: ON' : 'LIVE REFRESH: OFF'}
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
          },
        }}
      >
        <Toolbar sx={{ minHeight: '48px !important' }} />
        <Box sx={{ overflow: 'auto', mt: 2 }}>
          <List>
            {menuItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton
                  selected={item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path)}
                  onClick={() => handleNavigation(item.path, item.index)}
                  sx={{
                    '&.Mui-selected': {
                      bgcolor: alpha(theme.palette.primary.main, 0.10),
                      borderRight: `4px solid ${theme.palette.primary.main}`,
                    },
                    '&.Mui-selected:hover': {
                      bgcolor: alpha(theme.palette.primary.main, 0.14),
                    },
                    '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: location.pathname === item.path ? 'primary.main' : 'text.secondary',
                      minWidth: 40,
                    }}
                  >
                    {item.icon}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.text}
                    primaryTypographyProps={{
                      fontWeight: location.pathname === item.path ? 700 : 500,
                      fontSize: '0.85rem',
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{ flexGrow: 1, p: 3, bgcolor: 'background.default', mt: '48px', overflow: 'auto' }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
