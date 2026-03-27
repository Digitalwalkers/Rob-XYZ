import { useRef, useEffect, useState, useCallback } from 'react';
import useTimelineStore from '../../stores/timelineStore';

const PADDING = 24;
const HEIGHT = 80;
const AXIS_Y = 50;
const HANDLE_W = 10;
const TICK_H = 8;
const MIN_WINDOW_MS = 5000;

function getTickInterval(rangeMs) {
  const intervals = [
    1000, 2000, 5000, 10000, 15000, 30000,
    60000, 120000, 300000, 600000, 900000, 1800000,
    3600000, 7200000, 21600000, 43200000,
    86400000,
  ];
  const target = rangeMs / 8;
  for (const iv of intervals) {
    if (iv >= target) return iv;
  }
  return intervals[intervals.length - 1];
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
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function Timeline() {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [width, setWidth] = useState(800);

  const fullRange = useTimelineStore((s) => s.fullRange);
  const viewStart = useTimelineStore((s) => s.viewStart);
  const viewEnd = useTimelineStore((s) => s.viewEnd);
  const left = useTimelineStore((s) => s.left);
  const right = useTimelineStore((s) => s.right);
  const zoomView = useTimelineStore((s) => s.zoomView);
  const panView = useTimelineStore((s) => s.panView);
  const setLeft = useTimelineStore((s) => s.setLeft);
  const setRight = useTimelineStore((s) => s.setRight);
  const setWindow = useTimelineStore((s) => s.setWindow);

  const [fullStart, fullEnd] = fullRange;
  const fullSpan = fullEnd - fullStart;
  const viewSpan = viewEnd - viewStart;

  // Cursor is always derived from window center
  const cursor = (left + right) / 2;

  const didDrag = useRef(false);

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullSpan > 0]);

  // Coordinate mapping — based on viewStart/viewEnd
  const axisWidth = width - PADDING * 2;
  const timeToX = useCallback(
    (t) => PADDING + ((t - viewStart) / viewSpan) * axisWidth,
    [viewStart, viewSpan, axisWidth],
  );
  const xToTime = useCallback(
    (x) => viewStart + ((x - PADDING) / axisWidth) * viewSpan,
    [viewStart, viewSpan, axisWidth],
  );

  // Ticks — based on viewSpan (granularity changes with zoom)
  const tickInterval = getTickInterval(viewSpan);
  const ticks = [];
  if (viewSpan > 0 && tickInterval > 0) {
    const firstTick = Math.ceil(viewStart / tickInterval) * tickInterval;
    for (let t = firstTick; t <= viewEnd; t += tickInterval) {
      ticks.push(t);
    }
  }

  // Handle pixel positions (may be outside viewport)
  const leftX = timeToX(left);
  const rightX = timeToX(right);
  const cursorX = timeToX(cursor);

  // Whether handles are off-screen
  const leftOffScreen = left < viewStart ? 'left' : left > viewEnd ? 'right' : null;
  const rightOffScreen = right < viewStart ? 'left' : right > viewEnd ? 'right' : null;

  // --- Drag interactions for boundary handles ---
  const onHandleDown = useCallback(
    (type, e) => {
      e.preventDefault();
      e.stopPropagation();
      didDrag.current = false;
      const startX = e.clientX;
      const store = useTimelineStore.getState();
      const startVal = type === 'left' ? store.left : store.right;

      const onMove = (me) => {
        didDrag.current = true;
        const dx = me.clientX - startX;
        const dt = (dx / axisWidth) * viewSpan;
        const newVal = startVal + dt;
        if (type === 'left') {
          useTimelineStore.getState().setLeft(newVal);
        } else {
          useTimelineStore.getState().setRight(newVal);
        }
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [axisWidth, viewSpan],
  );

  // --- Drag shaded area: move both boundaries together ---
  const onAreaDown = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      didDrag.current = false;
      const startX = e.clientX;
      const store = useTimelineStore.getState();
      const startLeft = store.left;
      const startRight = store.right;

      const onMove = (me) => {
        didDrag.current = true;
        const dx = me.clientX - startX;
        const dt = (dx / axisWidth) * viewSpan;
        const span = startRight - startLeft;

        let newLeft = startLeft + dt;
        let newRight = startRight + dt;
        const [fStart, fEnd] = useTimelineStore.getState().fullRange;

        if (newLeft < fStart) {
          newLeft = fStart;
          newRight = newLeft + span;
        }
        if (newRight > fEnd) {
          newRight = fEnd;
          newLeft = newRight - span;
        }

        useTimelineStore.getState().setWindow(newLeft, newRight);
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [axisWidth, viewSpan],
  );

  // Click on axis: center boundaries on click position
  const onAxisClick = useCallback(
    (e) => {
      if (didDrag.current) {
        didDrag.current = false;
        return;
      }
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const t = xToTime(x);

      const store = useTimelineStore.getState();
      const [fStart, fEnd] = store.fullRange;
      if (t < fStart || t > fEnd) return;

      const halfSpan = (store.right - store.left) / 2;
      let newLeft = t - halfSpan;
      let newRight = t + halfSpan;

      if (newLeft < fStart) {
        newLeft = fStart;
        newRight = newLeft + halfSpan * 2;
      }
      if (newRight > fEnd) {
        newRight = fEnd;
        newLeft = newRight - halfSpan * 2;
      }

      store.setWindow(Math.max(newLeft, fStart), Math.min(newRight, fEnd));
    },
    [xToTime],
  );

  // --- Zoom & Pan: wheel + gesture listeners ---
  const storeRef = useRef({ zoomView, panView });
  const axisWidthRef = useRef(axisWidth);
  const viewSpanRef = useRef(viewSpan);
  useEffect(() => { storeRef.current = { zoomView, panView }; }, [zoomView, panView]);
  useEffect(() => { axisWidthRef.current = axisWidth; }, [axisWidth]);
  useEffect(() => { viewSpanRef.current = viewSpan; }, [viewSpan]);

  const lastMouseX = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const aw = axisWidthRef.current;
      const vs = viewSpanRef.current;

      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        // Vertical dominant → zoom
        const svg = container.querySelector('svg');
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const anchorRatio = Math.max(0, Math.min(1, (x - PADDING) / aw));
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
        storeRef.current.zoomView(factor, anchorRatio);
      } else {
        // Horizontal dominant → pan
        const deltaMs = (e.deltaX / aw) * vs;
        storeRef.current.panView(deltaMs);
      }
    };

    // Safari gesture events for pinch
    let lastScale = 1;
    const handleGestureStart = (e) => {
      e.preventDefault();
      lastScale = 1;
    };
    const handleGestureChange = (e) => {
      e.preventDefault();
      const svg = container.querySelector('svg');
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const x = lastMouseX.current - rect.left;
      const aw = axisWidthRef.current;
      const anchorRatio = Math.max(0, Math.min(1, (x - PADDING) / aw));
      // scale > 1 = pinch out = zoom in (see more detail = smaller span)
      const factor = lastScale / e.scale;
      lastScale = e.scale;
      storeRef.current.zoomView(factor, anchorRatio);
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
  }, [fullSpan > 0]);

  // --- Empty state ---
  if (fullSpan <= 0) {
    return (
      <div
        ref={containerRef}
        className="bg-white rounded-xl border border-gray-200 p-5 text-center text-gray-400 text-sm"
      >
        请选择机器人以显示时间轴
      </div>
    );
  }

  // Clamp handle rendering to viewport edges for SVG elements
  const clampX = (x) => Math.max(PADDING, Math.min(x, width - PADDING));

  // Is the shaded area at least partially visible?
  const shadedL = Math.max(leftX, PADDING);
  const shadedR = Math.min(rightX, width - PADDING);
  const shadedVisible = shadedR > shadedL;

  return (
    <div
      ref={containerRef}
      className="bg-white rounded-xl border border-gray-200 p-4"
      style={{ touchAction: 'none' }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">时间轴</span>
        <span className="text-xs text-gray-400">
          {new Date(left).toLocaleString('zh-CN')} — {new Date(right).toLocaleString('zh-CN')}
        </span>
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={HEIGHT}
        className="select-none"
        onClick={onAxisClick}
      >
        {/* Axis line */}
        <line
          x1={PADDING}
          y1={AXIS_Y}
          x2={width - PADDING}
          y2={AXIS_Y}
          stroke="#d1d5db"
          strokeWidth={1}
        />

        {/* Ticks */}
        {ticks.map((t) => {
          const x = timeToX(t);
          if (x < PADDING - 1 || x > width - PADDING + 1) return null;
          return (
            <g key={t}>
              <line
                x1={x}
                y1={AXIS_Y - TICK_H / 2}
                x2={x}
                y2={AXIS_Y + TICK_H / 2}
                stroke="#9ca3af"
                strokeWidth={1}
              />
              <text
                x={x}
                y={AXIS_Y + TICK_H / 2 + 14}
                textAnchor="middle"
                className="text-[10px] fill-gray-400"
              >
                {formatTick(t, tickInterval)}
              </text>
            </g>
          );
        })}

        {/* Selected range background (if visible) */}
        {shadedVisible && (
          <rect
            x={shadedL + (leftOffScreen ? 0 : HANDLE_W / 2)}
            y={AXIS_Y - 20}
            width={Math.max(0, shadedR - shadedL - (leftOffScreen ? 0 : HANDLE_W / 2) - (rightOffScreen ? 0 : HANDLE_W / 2))}
            height={40}
            fill="#6366f1"
            opacity={0.1}
            className="cursor-grab"
            onPointerDown={onAreaDown}
          />
        )}

        {/* Left handle (only if in viewport) */}
        {!leftOffScreen && (
          <g
            className="cursor-ew-resize"
            onPointerDown={(e) => onHandleDown('left', e)}
          >
            <rect
              x={leftX - HANDLE_W / 2}
              y={AXIS_Y - 22}
              width={HANDLE_W}
              height={44}
              rx={3}
              fill="#4f46e5"
              className="hover:fill-indigo-700"
            />
            <line
              x1={leftX}
              y1={AXIS_Y - 16}
              x2={leftX}
              y2={AXIS_Y + 16}
              stroke="white"
              strokeWidth={1.5}
            />
          </g>
        )}

        {/* Right handle (only if in viewport) */}
        {!rightOffScreen && (
          <g
            className="cursor-ew-resize"
            onPointerDown={(e) => onHandleDown('right', e)}
          >
            <rect
              x={rightX - HANDLE_W / 2}
              y={AXIS_Y - 22}
              width={HANDLE_W}
              height={44}
              rx={3}
              fill="#4f46e5"
              className="hover:fill-indigo-700"
            />
            <line
              x1={rightX}
              y1={AXIS_Y - 16}
              x2={rightX}
              y2={AXIS_Y + 16}
              stroke="white"
              strokeWidth={1.5}
            />
          </g>
        )}

        {/* Off-screen indicators */}
        {leftOffScreen === 'left' && (
          <g>
            <polygon
              points={`${PADDING},${AXIS_Y - 6} ${PADDING + 8},${AXIS_Y} ${PADDING},${AXIS_Y + 6}`}
              fill="#4f46e5"
              opacity={0.7}
              transform={`rotate(180, ${PADDING + 4}, ${AXIS_Y})`}
            />
          </g>
        )}
        {leftOffScreen === 'right' && (
          <polygon
            points={`${width - PADDING},${AXIS_Y - 6} ${width - PADDING - 8},${AXIS_Y} ${width - PADDING},${AXIS_Y + 6}`}
            fill="#4f46e5"
            opacity={0.7}
          />
        )}
        {rightOffScreen === 'left' && (
          <g>
            <polygon
              points={`${PADDING},${AXIS_Y - 6} ${PADDING + 8},${AXIS_Y} ${PADDING},${AXIS_Y + 6}`}
              fill="#4f46e5"
              opacity={0.7}
              transform={`rotate(180, ${PADDING + 4}, ${AXIS_Y})`}
            />
          </g>
        )}
        {rightOffScreen === 'right' && (
          <polygon
            points={`${width - PADDING},${AXIS_Y - 6} ${width - PADDING - 8},${AXIS_Y} ${width - PADDING},${AXIS_Y + 6}`}
            fill="#4f46e5"
            opacity={0.7}
          />
        )}

        {/* Cursor line — always at boundary center */}
        {cursorX >= PADDING && cursorX <= width - PADDING && (
          <g>
            <line
              x1={cursorX}
              y1={AXIS_Y - 24}
              x2={cursorX}
              y2={AXIS_Y + 24}
              stroke="#ef4444"
              strokeWidth={2}
            />
            <circle
              cx={cursorX}
              cy={AXIS_Y - 24}
              r={4}
              fill="#ef4444"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
