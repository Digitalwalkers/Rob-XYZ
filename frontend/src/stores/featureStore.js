import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  getFeatureRegistry,
  getFeatureStatus,
  getFeatureData,
  computeFeatures,
  subscribeFeatureProgress,
} from '../api/client';

const useFeatureStore = create(
  subscribeWithSelector((set, get) => ({
    registry: [],           // [{key, label, shape, timing, color, severity}]
    statuses: {},           // {[featureKey]: {status, progress}}
    enabled: {},            // {[featureKey]: boolean}
    featureData: {},        // {[featureKey]: [{robot_id, feature_key, shape, start_time, end_time, metadata_json}]}
    loadingKeys: [],        // feature keys currently being fetched
    fileId: null,
    _sseCleanup: null,

    initForFile: async (fileId, robotIds) => {
      // Cleanup previous SSE if any
      const prev = get()._sseCleanup;
      if (prev) prev();

      set({ fileId, registry: [], statuses: {}, enabled: {}, featureData: {}, loadingKeys: [], _sseCleanup: null });

      const [registry, initialStatusList] = await Promise.all([
        getFeatureRegistry(),
        getFeatureStatus(fileId),
      ]);

      // If all features are pending, trigger computation for this file
      let statusList = initialStatusList;
      const allPending = statusList.every((s) => s.status === 'pending');
      if (allPending && statusList.length > 0) {
        await computeFeatures(fileId);
        // Re-fetch statuses after sync features complete
        statusList = await getFeatureStatus(fileId);
      }

      const statuses = {};
      const enabled = {};
      const DEFAULT_ENABLED = ['error_code.occurrence'];
      for (const s of statusList) {
        statuses[s.feature_key] = { status: s.status, progress: s.progress };
        enabled[s.feature_key] = s.status === 'completed' && DEFAULT_ENABLED.includes(s.feature_key);
      }

      set({ registry, statuses, enabled });

      // Fetch data for default-enabled features
      const autoKeys = statusList
        .filter((s) => s.status === 'completed' && DEFAULT_ENABLED.includes(s.feature_key))
        .map((s) => s.feature_key);
      if (autoKeys.length > 0 && robotIds?.length > 0) {
        get()._fetchFeatureData(fileId, autoKeys, robotIds);
      }

      // Open SSE if any features are still computing (async features)
      const hasComputing = statusList.some((s) => s.status === 'computing' || s.status === 'pending');
      if (hasComputing) {
        const cleanup = subscribeFeatureProgress(
          fileId,
          (event) => {
            // Re-fetch statuses on each update
            getFeatureStatus(fileId).then((updated) => {
              const newStatuses = {};
              for (const s of updated) {
                newStatuses[s.feature_key] = { status: s.status, progress: s.progress };
              }
              set({ statuses: newStatuses });
            });
          },
          async () => {
            // SSE done — final status refresh (don't auto-enable async features)
            const updated = await getFeatureStatus(fileId);
            const newStatuses = {};
            for (const s of updated) {
              newStatuses[s.feature_key] = { status: s.status, progress: s.progress };
            }
            set({ statuses: newStatuses, _sseCleanup: null });
          },
        );
        set({ _sseCleanup: cleanup });
      }
    },

    _fetchFeatureData: async (fileId, keys, robotIds) => {
      set((s) => ({ loadingKeys: [...new Set([...s.loadingKeys, ...keys])] }));
      try {
        const data = await getFeatureData(fileId, { featureKeys: keys, robotIds });
        // Group by feature key
        const grouped = {};
        for (const key of keys) grouped[key] = [];
        for (const item of data) {
          if (!grouped[item.feature_key]) grouped[item.feature_key] = [];
          grouped[item.feature_key].push(item);
        }
        set((s) => ({
          featureData: { ...s.featureData, ...grouped },
          loadingKeys: s.loadingKeys.filter((k) => !keys.includes(k)),
        }));
      } catch {
        set((s) => ({ loadingKeys: s.loadingKeys.filter((k) => !keys.includes(k)) }));
      }
    },

    toggleFeature: async (key) => {
      const { enabled, featureData, statuses, fileId } = get();
      const isEnabled = enabled[key];

      if (isEnabled) {
        // Disabling — just flip
        set({ enabled: { ...enabled, [key]: false } });
      } else {
        // Enabling — fetch data if not cached
        set({ enabled: { ...enabled, [key]: true } });

        if (!featureData[key] && statuses[key]?.status === 'completed' && fileId) {
          const configStore = (await import('./configStore')).default;
          const robotIds = configStore.getState().selectedRobots;
          if (robotIds.length > 0) {
            get()._fetchFeatureData(fileId, [key], robotIds);
          }
        }
      }
    },

    enableAll: () => {
      const { statuses, enabled } = get();
      const newEnabled = { ...enabled };
      for (const key of Object.keys(statuses)) {
        if (statuses[key].status === 'completed') {
          newEnabled[key] = true;
        }
      }
      set({ enabled: newEnabled });
    },

    disableAll: () => {
      const { enabled } = get();
      const newEnabled = {};
      for (const key of Object.keys(enabled)) {
        newEnabled[key] = false;
      }
      set({ enabled: newEnabled });
    },

    reset: () => {
      const cleanup = get()._sseCleanup;
      if (cleanup) cleanup();
      set({
        registry: [],
        statuses: {},
        enabled: {},
        featureData: {},
        loadingKeys: [],
        fileId: null,
        _sseCleanup: null,
      });
    },
  })),
);

export default useFeatureStore;
