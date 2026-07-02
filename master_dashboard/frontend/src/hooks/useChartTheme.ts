import { useStore } from '../store';

export interface ChartTheme {
  axisColor: string;
  gridColor: string;
  splitLineColor: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  maskColor: string;
  loadingColor: string;
  tableRowEven: string;
  tableRowOdd: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  tableBorder: string;
}

const LIGHT: ChartTheme = {
  axisColor:       '#616161',
  gridColor:       '#e0e0e0',
  splitLineColor:  '#e0e0e0',
  tooltipBg:       '#ffffff',
  tooltipBorder:   '#e0e0e0',
  tooltipText:     '#212121',
  maskColor:       'rgba(255,255,255,0.7)',
  loadingColor:    '#2c3e50',
  tableRowEven:    '#fafafa',
  tableRowOdd:     '#ffffff',
  tableHeaderBg:   '#f5f5f5',
  tableHeaderText: '#616161',
  tableBorder:     '#bdbdbd',
};

const DARK: ChartTheme = {
  axisColor:       '#8a9bb0',
  gridColor:       '#2a3a4a',
  splitLineColor:  '#2a3a4a',
  tooltipBg:       '#1a2535',
  tooltipBorder:   '#2a3a4a',
  tooltipText:     '#e8ecf0',
  maskColor:       'rgba(15,25,35,0.7)',
  loadingColor:    '#5c85a8',
  tableRowEven:    '#1a2535',
  tableRowOdd:     '#0f1923',
  tableHeaderBg:   '#0a1520',
  tableHeaderText: '#8a9bb0',
  tableBorder:     '#2a3a4a',
};

export function useChartTheme(): ChartTheme {
  const darkMode = useStore((s) => s.darkMode);
  return darkMode ? DARK : LIGHT;
}
