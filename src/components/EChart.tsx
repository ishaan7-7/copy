import { useEffect, useRef } from 'react';
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReactECharts>(null);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const inst = chartRef.current?.getEchartsInstance();
      if (inst && el.offsetWidth > 0 && el.offsetHeight > 0) {
        inst.resize();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (empty && !loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">{emptyText}</Typography>
      </Box>
    );
  }

  return (
    <Box ref={wrapperRef} sx={{ width: '100%', height: '100%' }}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={defaultStyle}
        showLoading={loading}
        loadingOption={{ text: 'Loading...', color: ct.loadingColor, maskColor: ct.maskColor }}
        onEvents={onEvents}
        notMerge={notMerge}
        opts={{ renderer: 'canvas' }}
      />
    </Box>
  );
}
