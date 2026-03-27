import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import useTimelineStore from '../../stores/timelineStore';
import useDataStore from '../../stores/dataStore';

const MIN_WINDOW_MS = 5000;

const LABEL_WIDTH = 80;
const RIGHT_PAD = 20;
const STRIP_HEIGHT = 20;
const STRIP_GAP = 2;
const TOP_PAD = 8;
const AXIS_HEIGHT = 28;
const TICK_H = 5;

const TICK_INTERVALS = [
  1000, 2000, 5000, 10000, 15000, 30000,
  60000, 120000, 300000, 600000, 900000, 1800000,
  3600000, 7200000, 21600000, 43200000, 86400000,
];

function getTickInterval(rangeMs) {
  const target = rangeMs / 8;
  for (const iv of TICK_INTERVALS) {
    if (iv >= target) return iv;
  }
  return TICK_INTERVALS[TICK_INTERVALS.length - 1];
}

function formatTick(ms, intervalMs) {
  const d = new Date(ms);
  if (intervalMs >= 86400000) {
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  }
  if (intervalMs >= 3600000) {
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const STATUS_COLORS = {
  ok: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
};
const DISABLED_COLOR = '#e5e7eb';
const OVERLAY_FILL = 'rgba(99,102,241,0.10)';
const OVERLAY_BORDER = 'rgba(99,102,241,0.4)';
const HIGHLIGHT_BORDER = '#6366f1';

export default function StatusChart() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);

  const fullRange = useTimelineStore((s) => s.fullRange);
  const mainLeft = useTimelineStore((s) => s.left);
  const mainRight = useTimelineStore((s) => s.right);
  const setWindow = useTimelineStore((s) => s.setWindow);

  const robotData = useDataStore((s) => s.robotData);
  const loading = useDataStore((s) => s.loading);

  const [fullStart, fullEnd] = fullRange;
  const fullSpan = fullEnd - fullStart;

  // Independent view state
  const [view, setView] = useState({ start: 0, end: 0 });

  // Reset view when fullRange changes
  useEffect(() => {
    if (fullSpan > 0) {
      setView({ start: fullStart, end: fullEnd });
    }
  }, [fullStart, fullEnd, fullSpan]);

  // Status filter
  const [activeStatuses, setActiveStatuses] = useState({
    ok: true,
    warning: true,
    error: true,
  });

  const toggleStatus = (status) => {
    setActiveStatuses((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  // Highlighted segment
  const [highlightSeg, setHighlightSeg] = useState(null);

  // Canvas width from ResizeObserver
  const [canvasWidth, setCanvasWidth] = useState(0);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setCanvasWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Compute segments from robotData
  const strips = useMemo(() => {
    const result = [];
    const sorted = [...robotData].sort((a, b) => a.robotId.localeCompare(b.robotId));

    for (const { robotId, data } of sorted) {
      for (const device of ['a', 'b']) {
        const field = `device_${device}_status`;
        const segments = [];
        let segStart = null;
        let segStatus = null;

        for (const row of data) {
          const t = new Date(row.timestamp).getTime();
          const status = row[field] || 'ok';

          if (status !== segStatus) {
            if (segStatus !== null) {
              segments.push({ start: segStart, end: t, status: segStatus });
            }
            segStart = t;
            segStatus = status;
          }
        }
        if (segStatus !== null && data.length > 0) {
          const lastT = new Date(data[data.length - 1].timestamp).getTime();
          segments.push({ start: segStart, end: lastT, status: segStatus });
        }

        result.push({
          robotId,
          device: device.toUpperCase(),
          label: `${robotId} ${device.toUpperCase()}`,
          segments,
        });
      }
    }
    return result;
  }, [robotData]);

  const stripsHeight = strips.length > 0
    ? TOP_PAD + strips.length * (STRIP_HEIGHT + STRIP_GAP) - STRIP_GAP + TOP_PAD
    : 0;
  const canvasHeight = stripsHeight + (strips.length > 0 ? AXIS_HEIGHT : 0);

  // Coordinate mapping helpers (use view state)
  const timeToX = useCallback(
    (t) => ((t - view.start) / (view.end - view.start)) * canvasWidth,
    [view.start, view.end, canvasWidth],
  );

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasWidth <= 0 || canvasHeight <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    const vStart = view.start;
    const vEnd = view.end;
    const vSpan = vEnd - vStart;
    if (vSpan <= 0) return;

    const toX = (t) => ((t - vStart) / vSpan) * canvasWidth;

    // 1. Draw strips
    strips.forEach((strip, i) => {
      const y = TOP_PAD + i * (STRIP_HEIGHT + STRIP_GAP);

      for (const seg of strip.segments) {
        if (seg.end <= vStart || seg.start >= vEnd) continue;

        const x0 = Math.max(0, toX(Math.max(seg.start, vStart)));
        const x1 = Math.min(canvasWidth, toX(Math.min(seg.end, vEnd)));
        const w = x1 - x0;
        if (w < 0.5) continue;

        const isActive = activeStatuses[seg.status];
        ctx.fillStyle = isActive ? STATUS_COLORS[seg.status] : DISABLED_COLOR;
        ctx.fillRect(x0, y, w, STRIP_HEIGHT);
      }
    });

    // 2. Draw main window overlay
    const olX0 = Math.max(0, toX(mainLeft));
    const olX1 = Math.min(canvasWidth, toX(mainRight));
    if (olX1 > olX0) {
      ctx.fillStyle = OVERLAY_FILL;
      ctx.fillRect(olX0, 0, olX1 - olX0, canvasHeight);

      ctx.strokeStyle = OVERLAY_BORDER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(olX0, 0);
      ctx.lineTo(olX0, canvasHeight);
      ctx.moveTo(olX1, 0);
      ctx.lineTo(olX1, canvasHeight);
      ctx.stroke();
    }

    // 3. Draw highlight
    if (highlightSeg) {
      const hx0 = Math.max(0, toX(highlightSeg.start));
      const hx1 = Math.min(canvasWidth, toX(highlightSeg.end));
      if (hx1 > hx0) {
        ctx.strokeStyle = HIGHLIGHT_BORDER;
        ctx.lineWidth = 2;
        ctx.strokeRect(hx0, highlightSeg._y, hx1 - hx0, STRIP_HEIGHT);
      }
    }

    // 4. Draw time axis
    const axisY = stripsHeight;
    // Axis line
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(canvasWidth, axisY);
    ctx.stroke();

    // Ticks
    const tickInterval = getTickInterval(vSpan);
    const firstTick = Math.ceil(vStart / tickInterval) * tickInterval;
    ctx.fillStyle = '#9ca3af';
    ctx.strokeStyle = '#9ca3af';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (let t = firstTick; t <= vEnd; t += tickInterval) {
      const x = toX(t);
      if (x < -1 || x > canvasWidth + 1) continue;
      // Tick mark
      ctx.beginPath();
      ctx.moveTo(x, axisY);
      ctx.lineTo(x, axisY + TICK_H);
      ctx.stroke();
      // Label
      ctx.fillText(formatTick(t, tickInterval), x, axisY + TICK_H + 2);
    }
  }, [strips, view, activeStatuses, canvasWidth, canvasHeight, stripsHeight, mainLeft, mainRight, highlightSeg]);

  // Click handler
  const handleCanvasClick = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas || canvasWidth <= 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Find strip
      const adjustedY = y - TOP_PAD;
      if (adjustedY < 0) return;
      const stripIndex = Math.floor(adjustedY / (STRIP_HEIGHT + STRIP_GAP));
      const withinStrip = adjustedY - stripIndex * (STRIP_HEIGHT + STRIP_GAP);
      if (withinStrip > STRIP_HEIGHT || stripIndex >= strips.length) return;

      // Convert x to time
      const vSpan = view.end - view.start;
      if (vSpan <= 0) return;
      const t = view.start + (x / canvasWidth) * vSpan;

      // Find segment
      const strip = strips[stripIndex];
      const seg = strip.segments.find((s) => t >= s.start && t <= s.end);
      if (!seg) return;
      if (!activeStatuses[seg.status]) return;

      // Set main timeline window
      setWindow(seg.start, seg.end);

      // Highlight this segment
      const stripY = TOP_PAD + stripIndex * (STRIP_HEIGHT + STRIP_GAP);
      setHighlightSeg({ ...seg, _y: stripY });
    },
    [strips, view, canvasWidth, activeStatuses, setWindow],
  );

  // --- Zoom & Pan gestures: operate on local view ---
  const viewRef = useRef(view);
  const fullRef = useRef({ fullStart, fullEnd });
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { fullRef.current = { fullStart, fullEnd }; }, [fullStart, fullEnd]);

  const lastMouseX = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const doZoom = (factor, anchorRatio) => {
      const { start, end } = viewRef.current;
      const { fullStart, fullEnd } = fullRef.current;
      const span = end - start;
      const anchorTime = start + anchorRatio * span;
      const newSpan = Math.max(MIN_WINDOW_MS, Math.min(span * factor, fullEnd - fullStart));

      let newStart = anchorTime - anchorRatio * newSpan;
      let newEnd = newStart + newSpan;

      if (newStart < fullStart) {
        newStart = fullStart;
        newEnd = newStart + newSpan;
      }
      if (newEnd > fullEnd) {
        newEnd = fullEnd;
        newStart = Math.max(fullStart, newEnd - newSpan);
      }

      setView({ start: newStart, end: newEnd });
    };

    const doPan = (deltaMs) => {
      const { start, end } = viewRef.current;
      const { fullStart, fullEnd } = fullRef.current;
      const span = end - start;
      let newStart = start + deltaMs;
      let newEnd = end + deltaMs;

      if (newStart < fullStart) {
        newStart = fullStart;
        newEnd = newStart + span;
      }
      if (newEnd > fullEnd) {
        newEnd = fullEnd;
        newStart = newEnd - span;
      }

      setView({ start: newStart, end: newEnd });
    };

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const chartWidth = rect.width - LABEL_WIDTH - RIGHT_PAD;
      const gridLeft = rect.left + LABEL_WIDTH;

      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        const x = e.clientX - gridLeft;
        const anchorRatio = Math.max(0, Math.min(1, x / chartWidth));
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        doZoom(factor, anchorRatio);
      } else {
        const { start, end } = viewRef.current;
        const deltaMs = (e.deltaX / chartWidth) * (end - start);
        doPan(deltaMs);
      }
    };

    let lastScale = 1;
    const handleGestureStart = (e) => {
      e.preventDefault();
      lastScale = 1;
    };
    const handleGestureChange = (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const chartWidth = rect.width - LABEL_WIDTH - RIGHT_PAD;
      const gridLeft = rect.left + LABEL_WIDTH;
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

  const filterItems = [
    { key: 'ok', label: '正常', color: '#10b981' },
    { key: 'warning', label: '警告', color: '#f59e0b' },
    { key: 'error', label: '错误', color: '#ef4444' },
  ];

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-xl border border-gray-200 p-4"
      style={{ touchAction: 'none' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">设备状态</span>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-xs text-gray-400">加载中...</span>
          )}
          {filterItems.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleStatus(key)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border transition-colors ${
                activeStatuses[key]
                  ? 'border-gray-300 text-gray-700'
                  : 'border-gray-200 text-gray-400'
              }`}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: activeStatuses[key] ? color : '#e5e7eb' }}
              />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content: labels + canvas */}
      {strips.length > 0 && (
        <div className="flex" style={{ minHeight: canvasHeight }}>
          {/* Label column */}
          <div style={{ width: LABEL_WIDTH, flexShrink: 0 }}>
            {strips.map((strip, i) => (
              <div
                key={strip.label}
                className="text-xs text-gray-500 truncate pr-2 text-right"
                style={{
                  height: STRIP_HEIGHT,
                  lineHeight: `${STRIP_HEIGHT}px`,
                  marginTop: i === 0 ? TOP_PAD : STRIP_GAP,
                }}
              >
                {strip.label}
              </div>
            ))}
          </div>

          {/* Canvas zone */}
          <div ref={wrapperRef} className="flex-1 min-w-0">
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              style={{
                width: '100%',
                height: canvasHeight,
                cursor: 'pointer',
              }}
            />
          </div>
        </div>
      )}

      {!loading && robotData.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-4">
          暂无数据
        </div>
      )}
    </div>
  );
}
