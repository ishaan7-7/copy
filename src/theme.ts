import { createTheme } from '@mui/material/styles';

const baseTypography = {
  fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
  h6: {
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    fontSize: '0.9rem',
  },
};

const baseComponents = {
  MuiButton: {
    styleOverrides: {
      root: { textTransform: 'none' as const, fontWeight: 600 },
    },
  },
};

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#f4f6f8',
      paper: '#ffffff',
    },
    primary: { main: '#2c3e50' },
    error: { main: '#d32f2f' },
    warning: { main: '#ed6c02' },
    success: { main: '#2e7d32' },
  },
  typography: baseTypography,
  shape: { borderRadius: 0 },
  components: {
    ...baseComponents,
    MuiPaper: {
      styleOverrides: {
        root: {
          border: '1px solid #e0e0e0',
          boxShadow: 'none',
        },
      },
    },
  },
});

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0f1923',
      paper: '#1a2535',
    },
    primary: { main: '#5c85a8' },
    error: { main: '#ef5350' },
    warning: { main: '#ffa726' },
    success: { main: '#66bb6a' },
    text: {
      primary: '#e8ecf0',
      secondary: '#8a9bb0',
    },
    divider: '#2a3a4a',
  },
  typography: baseTypography,
  shape: { borderRadius: 0 },
  components: {
    ...baseComponents,
    MuiPaper: {
      styleOverrides: {
        root: {
          border: '1px solid #2a3a4a',
          boxShadow: 'none',
        },
      },
    },
  },
});

export const industrialTheme = lightTheme;
