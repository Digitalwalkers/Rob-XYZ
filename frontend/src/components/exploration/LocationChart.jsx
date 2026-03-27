import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
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

const COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#3b82f6', '#84cc16',
];

const GRID = { left: 50, right: 20, top: 40, bottom: 35 };
const PADDING_RATIO = 0.05;

function computeBounds(seriesData) {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const pts of Object.values(seriesData)) {
    for (const [x, y] of pts) {
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
  }
  if (!isFinite(xMin)) return null;
  const dx = (xMax - xMin) * PADDING_RATIO || 1;
  const dy = (yMax - yMin) * PADDING_RATIO || 1;
  return { xMin: xMin - dx, xMax: xMax + dx, yMin: yMin - dy, yMax: yMax + dy };
}

export default function LocationChart() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  const left = useTimelineStore((s) => s.left);
  const right = useTimelineStore((s) => s.right);

  const robotData = useDataStore((s) => s.robotData);
  const loading = useDataStore((s) => s.loading);

  // XY view state (null = auto fit)
  const [xyView, setXyView] = useState(null);
  const manualZoom = useRef(false);

  // Filter data by left/right and extract location
  const seriesData = useMemo(() => {
    const map = {};
    for (const { robotId, data } of robotData) {
      const pts = [];
      for (const row of data) {
        const t = new Date(row.timestamp).getTime();
        if (t >= left && t <= right) {
          pts.push([row.location_x, row.location_y]);
        }
      }
      if (pts.length > 0) map[robotId] = pts;
    }
    return map;
  }, [robotData, left, right]);

  const robotIds = useMemo(() => Object.keys(seriesData).sort(), [seriesData]);

  // Auto-fit bounds when data changes (unless user manually zoomed)
  const dataBounds = useMemo(() => computeBounds(seriesData), [seriesData]);

  useEffect(() => {
    if (!manualZoom.current && dataBounds) {
      setXyView(dataBounds);
    }
  }, [dataBounds]);

  const resetView = useCallback(() => {
    manualZoom.current = false;
    if (dataBounds) setXyView(dataBounds);
  }, [dataBounds]);

  // Initialize ECharts
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = echarts.init(el);
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Update series data
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const series = robotIds.map((id, i) => ({
      name: id,
      type: 'line',
      data: seriesData[id],
      symbol: 'circle',
      symbolSize: 2,
      lineStyle: { width: 1.5 },
      itemStyle: { color: COLORS[i % COLORS.length] },
      showSymbol: false,
    }));

    const view = xyView || dataBounds || { xMin: 0, xMax: 100, yMin: 0, yMax: 100 };

    chart.setOption({
      grid: GRID,
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          if (!p || !p.value) return '';
          return `${p.seriesName}<br/>X: ${p.value[0].toFixed(2)}<br/>Y: ${p.value[1].toFixed(2)}`;
        },
      },
      legend: {
        data: robotIds,
        top: 5,
        textStyle: { fontSize: 11, color: '#6b7280' },
      },
      xAxis: {
        type: 'value',
        min: view.xMin,
        max: view.xMax,
        name: 'X',
        nameTextStyle: { fontSize: 11, color: '#9ca3af' },
        axisLabel: { fontSize: 10, color: '#9ca3af' },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      yAxis: {
        type: 'value',
        min: view.yMin,
        max: view.yMax,
        name: 'Y',
        nameTextStyle: { fontSize: 11, color: '#9ca3af' },
        axisLabel: { fontSize: 10, color: '#9ca3af' },
        splitLine: { lineStyle: { color: '#f3f4f6' } },
      },
      series,
    }, { notMerge: true });
  }, [robotIds, seriesData, xyView, dataBounds]);

  // Update axis range when xyView changes (without rebuilding series)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !xyView) return;

    chart.setOption({
      xAxis: { min: xyView.xMin, max: xyView.xMax },
      yAxis: { min: xyView.yMin, max: xyView.yMax },
    });
  }, [xyView]);

  // --- XY Zoom & Pan gestures ---
  const viewRef = useRef(xyView);
  useEffect(() => { viewRef.current = xyView; }, [xyView]);

  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getChartRect = () => {
      const rect = container.getBoundingClientRect();
      return {
        chartW: rect.width - GRID.left - GRID.right,
        chartH: rect.height - GRID.top - GRID.bottom,
        gridLeft: rect.left + GRID.left,
        gridTop: rect.top + GRID.top,
      };
    };

    const doZoom = (factor, anchorXRatio, anchorYRatio) => {
      const v = viewRef.current;
      if (!v) return;

      const xSpan = v.xMax - v.xMin;
      const ySpan = v.yMax - v.yMin;
      const anchorX = v.xMin + anchorXRatio * xSpan;
      const anchorY = v.yMin + anchorYRatio * ySpan;

      const newXSpan = xSpan * factor;
      const newYSpan = ySpan * factor;

      manualZoom.current = true;
      setXyView({
        xMin: anchorX - anchorXRatio * newXSpan,
        xMax: anchorX + (1 - anchorXRatio) * newXSpan,
        yMin: anchorY - anchorYRatio * newYSpan,
        yMax: anchorY + (1 - anchorYRatio) * newYSpan,
      });
    };

    const doPan = (dxRatio, dyRatio) => {
      const v = viewRef.current;
      if (!v) return;

      const dx = dxRatio * (v.xMax - v.xMin);
      const dy = dyRatio * (v.yMax - v.yMin);

      manualZoom.current = true;
      setXyView({
        xMin: v.xMin + dx,
        xMax: v.xMax + dx,
        yMin: v.yMin - dy,
        yMax: v.yMax - dy,
      });
    };

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const { chartW, chartH, gridLeft, gridTop } = getChartRect();

      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        // Zoom
        const x = e.clientX - gridLeft;
        const y = e.clientY - gridTop;
        const anchorXRatio = Math.max(0, Math.min(1, x / chartW));
        const anchorYRatio = 1 - Math.max(0, Math.min(1, y / chartH)); // Y is inverted
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        doZoom(factor, anchorXRatio, anchorYRatio);
      } else {
        // Pan X
        doPan(e.deltaX / chartW, 0);
      }
    };

    let lastScale = 1;
    const handleGestureStart = (e) => {
      e.preventDefault();
      lastScale = 1;
    };
    const handleGestureChange = (e) => {
      e.preventDefault();
      const { chartW, chartH, gridLeft, gridTop } = getChartRect();
      const x = lastMousePos.current.x - gridLeft;
      const y = lastMousePos.current.y - gridTop;
      const anchorXRatio = Math.max(0, Math.min(1, x / chartW));
      const anchorYRatio = 1 - Math.max(0, Math.min(1, y / chartH));
      const factor = lastScale / e.scale;
      lastScale = e.scale;
      doZoom(factor, anchorXRatio, anchorYRatio);
    };

    const handleMouseMove = (e) => {
      lastMousePos.current = { x: e.clientX, y: e.clientY };
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">位置轨迹</span>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-xs text-gray-400">加载中...</span>
          )}
          {manualZoom.current && (
            <button
              onClick={resetView}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              重置视图
            </button>
          )}
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 min-h-0"
        style={{ width: '100%', touchAction: 'none' }}
      />
      {!loading && robotData.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-4">
          暂无数据
        </div>
      )}
    </div>
  );
}
