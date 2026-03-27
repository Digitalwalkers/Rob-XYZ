import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const MIN_VIEW_SPAN = 1000;   // 1 second minimum visible range
const MIN_WINDOW_MS = 5000;   // 5 seconds minimum between left/right boundaries

const useTimelineStore = create(
  subscribeWithSelector((set, get) => ({
    fullRange: [0, 0],    // [startMs, endMs] — total data range
    viewStart: 0,         // leftmost visible time (ms)
    viewEnd: 0,           // rightmost visible time (ms)
    left: 0,              // left boundary marker (ms)
    right: 0,             // right boundary marker (ms)

    setFullRange: (startIso, endIso) => {
      const start = new Date(startIso).getTime();
      const end = new Date(endIso).getTime();
      set({
        fullRange: [start, end],
        viewStart: start,
        viewEnd: end,
        left: start,
        right: end,
      });
    },

    zoomView: (factor, anchorRatio) => {
      const { fullRange, viewStart, viewEnd } = get();
      const [fullStart, fullEnd] = fullRange;
      const fullSpan = fullEnd - fullStart;
      const viewSpan = viewEnd - viewStart;

      const anchorTime = viewStart + anchorRatio * viewSpan;
      const newSpan = Math.max(MIN_VIEW_SPAN, Math.min(viewSpan * factor, fullSpan));

      let newStart = anchorTime - anchorRatio * newSpan;
      let newEnd = newStart + newSpan;

      // Clamp to fullRange
      if (newStart < fullStart) {
        newStart = fullStart;
        newEnd = newStart + newSpan;
      }
      if (newEnd > fullEnd) {
        newEnd = fullEnd;
        newStart = Math.max(fullStart, newEnd - newSpan);
      }

      set({ viewStart: newStart, viewEnd: newEnd });
    },

    panView: (deltaMs) => {
      const { fullRange, viewStart, viewEnd } = get();
      const [fullStart, fullEnd] = fullRange;
      const span = viewEnd - viewStart;

      let newStart = viewStart + deltaMs;
      let newEnd = viewEnd + deltaMs;

      if (newStart < fullStart) {
        newStart = fullStart;
        newEnd = newStart + span;
      }
      if (newEnd > fullEnd) {
        newEnd = fullEnd;
        newStart = newEnd - span;
      }

      set({ viewStart: newStart, viewEnd: newEnd });
    },

    setLeft: (ms) => {
      const { fullRange, right } = get();
      const clamped = Math.max(fullRange[0], Math.min(ms, right - MIN_WINDOW_MS));
      set({ left: clamped });
    },

    setRight: (ms) => {
      const { fullRange, left } = get();
      const clamped = Math.min(fullRange[1], Math.max(ms, left + MIN_WINDOW_MS));
      set({ right: clamped });
    },

    setView: (viewStart, viewEnd) => {
      const { fullRange } = get();
      set({
        viewStart: Math.max(viewStart, fullRange[0]),
        viewEnd: Math.min(viewEnd, fullRange[1]),
      });
    },

    setWindow: (left, right) => {
      const { fullRange } = get();
      set({
        left: Math.max(left, fullRange[0]),
        right: Math.min(right, fullRange[1]),
      });
    },
  })),
);

export default useTimelineStore;
