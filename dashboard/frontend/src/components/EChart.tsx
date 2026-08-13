import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Box, Typography } from '@mui/material';
import { useChartTheme } from '../hooks/useChartTheme';

interface Props {
  option:    EChartsOption;
  style?:    React.CSSProperties;
  loading?:  boolean;
  empty?:    boolean;
  emptyText?: string;
  onEvents?: Record<string, (params: unknown) => void>;
  notMerge?: boolean;
}

export default function EChart({
  option,
  style,
  loading   = false,
  empty     = false,
  emptyText = 'No data available',
  onEvents,
  notMerge  = false,
}: Props) {
  const ct = useChartTheme();
  const defaultStyle: React.CSSProperties = { width: '100%', height: '100%', ...style };

  if (empty && !loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">{emptyText}</Typography>
      </Box>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={defaultStyle}
      showLoading={loading}
      loadingOption={{ text: 'Loading...', color: ct.loadingColor, maskColor: ct.maskColor }}
      onEvents={onEvents}
      notMerge={notMerge}
      opts={{ renderer: 'canvas' }}
    />
  );
}
