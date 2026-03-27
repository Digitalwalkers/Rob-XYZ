import { useRef, useEffect, useMemo } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import useTimelineStore from '../../stores/timelineStore';
import useDataStore from '../../stores/dataStore';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const MIN_WINDOW_MS = 5000;

// Robot color palette
const COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#84cc16',
];

export default function BatteryChart() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  const fullRange = useTimelineStore((s) => s.fullRange);
  const left = useTimelineStore((s) => s.left);
  const right = useTimelineStore((s) => s.right);
  const setWindow = useTimelineStore((s) => s.setWindow);

  const robotData = useDataStore((s) => s.robotData);
  const loading = useDataStore((s) => s.loading);

  const [fullStart, fullEnd] = fullRange;
  const fullSpan = fullEnd - fullStart;

  // Extract battery_level per robot from grouped data
  const seriesData = useMemo(() => {
    const map = {};
    for (const { robotId, data } of robotData) {
      map[robotId] = data.map((row) => [new Date(row.timestamp).getTime(), row.battery_level]);
    }
    return map;
  }, [robotData]);

  const robotIds = useMemo(() => Object.keys(seriesData).sort(), [seriesData]);

  // Initialize ECharts instance
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el);
    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      chart.resize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Set up chart structure + data (when series data changes)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const series = robotIds.map((id, i) => ({
      name: id,
      type: 'line',
      data: seriesData[id],
      symbol: 'circle',
      symbolSize: 4,
      lineStyle: { width: 2 },
      itemStyle: { color: COLORS[i % COLORS.length] },
      showSymbol: false,
    }));

    chart.setOption({
      grid: {
        left: 50,
        right: 20,
        top: 40,
        bottom: 30,
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          if (!params || params.length === 0) return '';
          const time = new Date(params[0].value[0]).toLocaleString('zh-CN');
          const lines = params.map(
            (p) => `<span style="color:${p.color}">\u25CF</span> ${p.seriesName}: ${p.value[1].toFixed(1)}%`
          );
          return `${time}<br/>${lines.join('<br/>')}`;
        },
      },
      legend: {
        data: robotIds,
        top: 5,
        textStyle: { fontSize: 11, color: '#6b7280' },
      },
      xAxis: {
        type: 'time',
        min: left,
        max: right,
        axisLabel: {
          fontSize: 10,
          color: '#9ca3af',
          formatter: (value) => {
            const d = new Date(value);
            return d.toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            });
          },
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        name: '电量 (%)',
        nameTextStyle: { fontSize: 11, color: '#9ca3af' },
        axisLabel: { fontSize: 10, color: '#9ca3af' },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      series,
    }, { notMerge: true });
  }, [robotIds, seriesData]);

  // Update xAxis range when window boundaries change
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.setOption({
      xAxis: { min: left, max: right },
    });
  }, [left, right]);

  // --- Zoom & Pan gestures: operate on left/right window ---
  const storeRef = useRef(setWindow);
  const windowRef = useRef({ left, right, fullStart, fullEnd });
  useEffect(() => { storeRef.current = setWindow; }, [setWindow]);
  useEffect(() => { windowRef.current = { left, right, fullStart, fullEnd }; }, [left, right, fullStart, fullEnd]);

  const lastMouseX = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const doZoom = (factor, anchorRatio) => {
      const { left, right, fullStart, fullEnd } = windowRef.current;
      const span = right - left;
      const anchorTime = left + anchorRatio * span;
      const newSpan = Math.max(MIN_WINDOW_MS, Math.min(span * factor, fullEnd - fullStart));

      let newLeft = anchorTime - anchorRatio * newSpan;
      let newRight = newLeft + newSpan;

      if (newLeft < fullStart) {
        newLeft = fullStart;
        newRight = newLeft + newSpan;
      }
      if (newRight > fullEnd) {
        newRight = fullEnd;
        newLeft = Math.max(fullStart, newRight - newSpan);
      }

      storeRef.current(newLeft, newRight);
    };

    const doPan = (deltaMs) => {
      const { left, right, fullStart, fullEnd } = windowRef.current;
      const span = right - left;
      let newLeft = left + deltaMs;
      let newRight = right + deltaMs;

      if (newLeft < fullStart) {
        newLeft = fullStart;
        newRight = newLeft + span;
      }
      if (newRight > fullEnd) {
        newRight = fullEnd;
        newLeft = newRight - span;
      }

      storeRef.current(newLeft, newRight);
    };

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const chartWidth = rect.width - 50 - 20; // grid left - grid right
      const gridLeft = rect.left + 50;

      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        const x = e.clientX - gridLeft;
        const anchorRatio = Math.max(0, Math.min(1, x / chartWidth));
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        doZoom(factor, anchorRatio);
      } else {
        const { left, right } = windowRef.current;
        const deltaMs = (e.deltaX / chartWidth) * (right - left);
        doPan(deltaMs);
      }
    };

    // Safari gesture events
    let lastScale = 1;
    const handleGestureStart = (e) => {
      e.preventDefault();
      lastScale = 1;
    };
    const handleGestureChange = (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const chartWidth = rect.width - 50 - 20;
      const gridLeft = rect.left + 50;
      const x = lastMouseX.current - gridLeft;
      const anchorRatio = Math.max(0, Math.min(1, x / chartWidth));
      const factor = lastScale / e.scale;
      lastScale = e.scale;
      doZoom(factor, anchorRatio);
    };

    const handleMouseMove = (e) => {
      lastMouseX.current = e.clientX;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('gesturestart', handleGestureStart, { passive: false });
    container.addEventListener('gesturechange', handleGestureChange, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('gesturestart', handleGestureStart);
      container.removeEventListener('gesturechange', handleGestureChange);
    };
  }, []);

  if (fullSpan <= 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">电池电量</span>
        {loading && (
          <span className="text-xs text-gray-400">加载中...</span>
        )}
      </div>
      <div
        ref={containerRef}
        style={{ width: '100%', height: 280, touchAction: 'none' }}
      />
      {!loading && robotData.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-4">
          暂无数据
        </div>
      )}
    </div>
  );
}
