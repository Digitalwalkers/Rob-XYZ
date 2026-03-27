import { getFileData } from '../api/client';
import useTimelineStore from '../stores/timelineStore';
import useConfigStore from '../stores/configStore';
import useDataStore from '../stores/dataStore';

const RESOLUTION_TIERS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
const TARGET_POINTS = 2000;
const MARGIN_RATIO = 0.5;
const DEBOUNCE_MS = 150;

function pickResolution(spanMs) {
  const spanSec = spanMs / 1000;
  const idealInterval = spanSec / TARGET_POINTS;
  for (const tier of RESOLUTION_TIERS) {
    if (tier >= idealInterval) return tier;
  }
  return RESOLUTION_TIERS[RESOLUTION_TIERS.length - 1];
}

class DataCacheManager {
  /**
   * @param {Object} [options]
   * @param {number} [options.targetPoints]
   * @param {number} [options.marginRatio]
   * @param {number} [options.debounceMs]
   */
  constructor(options = {}) {
    this._targetPoints = options.targetPoints ?? TARGET_POINTS;
    this._marginRatio = options.marginRatio ?? MARGIN_RATIO;
    this._debounceMs = options.debounceMs ?? DEBOUNCE_MS;

    /** @type {Map<string, Map<number, {start: number, end: number, data: Array}>>} */
    this._cache = new Map();

    /** @type {Set<Function>} */
    this._subscribers = new Set();

    /** @type {AbortController|null} */
    this._fetchController = null;

    /** @type {number|null} */
    this._debounceTimer = null;

    /** @type {number} current hi-res resolution tier (seconds) */
    this._hiResolution = 1;

    /** @type {number} lo-res resolution tier (seconds) */
    this._loResolution = 1;

    /** @type {boolean} whether lo-res data has been fetched */
    this._loResFetched = false;

    /** @type {number} generation counter for staleness detection */
    this._generation = 0;

    /** @type {boolean} */
    this._loading = false;

    /** @type {Array<Function>} store unsubscribe functions */
    this._unsubscribers = [];

    this._setupSubscriptions();
  }

  // --------------- Public API ---------------

  /**
   * Subscribe to data updates.
   * @param {Function} callback - (snapshot, loading) => void
   * @returns {Function} unsubscribe
   */
  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  /**
   * Get current merged data snapshot.
   * @returns {Array<{robotId: string, data: Array}>}
   */
  getSnapshot() {
    return this._buildMergedOutput();
  }

  get loading() {
    return this._loading;
  }

  /** Force full re-fetch (e.g. after robot selection change). */
  invalidate() {
    this._cache.clear();
    this._loResFetched = false;
    this._generation++;
    this._scheduleUpdate();
  }

  /** Tear down subscriptions and pending fetches. */
  destroy() {
    for (const unsub of this._unsubscribers) unsub();
    this._unsubscribers = [];
    this._subscribers.clear();
    this._cache.clear();
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    if (this._fetchController) this._fetchController.abort();
  }

  // --------------- Store Subscriptions ---------------

  /** @private */
  _setupSubscriptions() {
    // React to left/right changes (the chart's actual display window)
    const unsubWindow = useTimelineStore.subscribe(
      (s) => ({ left: s.left, right: s.right }),
      () => this._scheduleUpdate(),
      { equalityFn: (a, b) => a.left === b.left && a.right === b.right },
    );
    this._unsubscribers.push(unsubWindow);

    const unsubRobots = useConfigStore.subscribe(
      (s) => s.selectedRobots,
      () => this.invalidate(),
      { equalityFn: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]) },
    );
    this._unsubscribers.push(unsubRobots);

    const unsubFile = useConfigStore.subscribe(
      (s) => s.fileId,
      () => this.invalidate(),
    );
    this._unsubscribers.push(unsubFile);
  }

  // --------------- Scheduling ---------------

  /** @private */
  _scheduleUpdate() {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      this._performUpdate();
    }, this._debounceMs);
  }

  // --------------- Core Update Logic ---------------

  /** @private */
  async _performUpdate() {
    const { left, right, fullRange } = useTimelineStore.getState();
    const { fileId, selectedRobots } = useConfigStore.getState();

    if (!fileId || selectedRobots.length === 0 || right <= left) return;

    const [fullStart, fullEnd] = fullRange;
    const windowSpan = right - left;
    const margin = windowSpan * this._marginRatio;

    // Hi-res zone clamped to full range
    const hiStart = Math.max(fullStart, left - margin);
    const hiEnd = Math.min(fullEnd, right + margin);

    // Compute resolution tiers
    const hiRes = pickResolution(windowSpan);
    const loRes = pickResolution(fullEnd - fullStart);

    const resChanged = hiRes !== this._hiResolution;
    this._hiResolution = hiRes;
    this._loResolution = loRes;

    // Increment generation, abort in-flight requests
    const gen = ++this._generation;
    if (this._fetchController) this._fetchController.abort();
    this._fetchController = new AbortController();
    const { signal } = this._fetchController;

    this._loading = true;
    this._notify();

    try {
      const fetches = [];

      for (const robotId of selectedRobots) {
        if (!this._cache.has(robotId)) {
          this._cache.set(robotId, new Map());
        }
        const robotCache = this._cache.get(robotId);

        // On resolution change, clear all tiers except lo-res
        if (resChanged) {
          for (const [tier] of robotCache) {
            if (tier !== loRes) robotCache.delete(tier);
          }
        }

        // Hi-res: compute missing ranges
        const hiMissing = this._missingRanges(robotCache, hiRes, hiStart, hiEnd);
        for (const [s, e] of hiMissing) {
          fetches.push(this._fetchAndStore(fileId, robotId, hiRes, s, e, signal, gen));
        }

        // Lo-res: fetch once for full range
        if (!this._loResFetched && loRes > 1) {
          const loMissing = this._missingRanges(robotCache, loRes, fullStart, fullEnd);
          for (const [s, e] of loMissing) {
            fetches.push(this._fetchAndStore(fileId, robotId, loRes, s, e, signal, gen));
          }
        }
      }

      // Evict robots no longer selected
      for (const [rid] of this._cache) {
        if (!selectedRobots.includes(rid)) this._cache.delete(rid);
      }

      if (fetches.length > 0) await Promise.all(fetches);

      if (!this._loResFetched) this._loResFetched = true;

      // Trim hi-res cache to limit memory
      this._evictDistantHiRes(selectedRobots, hiRes, hiStart, hiEnd);
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'CanceledError') return;
      console.error('[DataCacheManager] fetch error:', err);
    } finally {
      if (this._generation === gen) {
        this._loading = false;
        this._notify();
      }
    }
  }

  // --------------- Cache Helpers ---------------

  /**
   * Compute sub-ranges of [desired] not yet covered by the cache entry for this tier.
   * @private
   * @returns {Array<[number, number]>}
   */
  _missingRanges(robotCache, resolution, desiredStart, desiredEnd) {
    const entry = robotCache.get(resolution);
    if (!entry) return [[desiredStart, desiredEnd]];

    const ranges = [];
    if (desiredStart < entry.start) ranges.push([desiredStart, entry.start]);
    if (desiredEnd > entry.end) ranges.push([entry.end, desiredEnd]);
    return ranges;
  }

  /**
   * Fetch data from API and merge into cache.
   * @private
   */
  async _fetchAndStore(fileId, robotId, resolution, start, end, signal, gen) {
    const data = await getFileData(fileId, {
      robotIds: [robotId],
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      sampleInterval: resolution,
      signal,
    });

    if (this._generation !== gen || signal.aborted) return;

    const robotCache = this._cache.get(robotId);
    if (!robotCache) return;

    const existing = robotCache.get(resolution);
    if (!existing) {
      robotCache.set(resolution, { start, end, data });
    } else {
      robotCache.set(resolution, {
        start: Math.min(existing.start, start),
        end: Math.max(existing.end, end),
        data: this._mergeSorted(existing.data, data),
      });
    }

    // Progressive notification after each chunk
    this._notify();
  }

  /**
   * Merge two timestamp-sorted arrays, deduplicating.
   * @private
   */
  _mergeSorted(a, b) {
    const result = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      const tA = new Date(a[i].timestamp).getTime();
      const tB = new Date(b[j].timestamp).getTime();
      if (tA < tB) result.push(a[i++]);
      else if (tA > tB) result.push(b[j++]);
      else { result.push(b[j]); i++; j++; }
    }
    while (i < a.length) result.push(a[i++]);
    while (j < b.length) result.push(b[j++]);
    return result;
  }

  /**
   * Trim hi-res cache to a bounded region around the current view.
   * @private
   */
  _evictDistantHiRes(selectedRobots, hiRes, hiStart, hiEnd) {
    const padding = (hiEnd - hiStart) * 0.5;
    const keepStart = hiStart - padding;
    const keepEnd = hiEnd + padding;

    for (const robotId of selectedRobots) {
      const robotCache = this._cache.get(robotId);
      if (!robotCache) continue;
      const entry = robotCache.get(hiRes);
      if (!entry) continue;

      if (entry.start < keepStart || entry.end > keepEnd) {
        const trimmed = entry.data.filter((row) => {
          const t = new Date(row.timestamp).getTime();
          return t >= keepStart && t <= keepEnd;
        });
        robotCache.set(hiRes, {
          start: Math.max(entry.start, keepStart),
          end: Math.min(entry.end, keepEnd),
          data: trimmed,
        });
      }
    }
  }

  // --------------- Output & Notification ---------------

  /**
   * Build merged output: lo-res outside hi-res range, hi-res inside.
   * @private
   * @returns {Array<{robotId: string, data: Array}>}
   */
  _buildMergedOutput() {
    const { selectedRobots } = useConfigStore.getState();
    const result = [];

    for (const robotId of selectedRobots) {
      const robotCache = this._cache.get(robotId);
      if (!robotCache) {
        result.push({ robotId, data: [] });
        continue;
      }

      const hiEntry = robotCache.get(this._hiResolution);
      const loEntry = robotCache.get(this._loResolution);

      // If same tier or no lo-res, just return hi-res
      if (this._hiResolution === this._loResolution || !loEntry) {
        result.push({ robotId, data: hiEntry ? hiEntry.data : [] });
        continue;
      }

      const hiStart = hiEntry ? hiEntry.start : Infinity;
      const hiEnd = hiEntry ? hiEntry.end : -Infinity;
      const hiData = hiEntry ? hiEntry.data : [];

      const loBefore = loEntry.data.filter(
        (row) => new Date(row.timestamp).getTime() < hiStart,
      );
      const loAfter = loEntry.data.filter(
        (row) => new Date(row.timestamp).getTime() > hiEnd,
      );

      result.push({ robotId, data: [...loBefore, ...hiData, ...loAfter] });
    }

    return result;
  }

  /** @private */
  _notify() {
    const snapshot = this._buildMergedOutput();

    // Push to dataStore for existing consumers (BatteryChart etc.)
    const ds = useDataStore.getState();
    if (this._loading) {
      ds.setLoading(true);
    } else {
      ds.setRobotData(snapshot);
    }

    // Also notify direct subscribers
    for (const cb of this._subscribers) {
      try {
        cb(snapshot, this._loading);
      } catch (err) {
        console.error('[DataCacheManager] subscriber error:', err);
      }
    }
  }
}

export default DataCacheManager;
