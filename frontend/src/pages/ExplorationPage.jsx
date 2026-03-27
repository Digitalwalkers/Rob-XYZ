import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { shallow } from 'zustand/shallow';
import useConfigStore from '../stores/configStore';
import useTimelineStore from '../stores/timelineStore';
import { getFileTimeRange } from '../api/client';
import ConfigPanel from '../components/exploration/ConfigPanel';
import Timeline from '../components/exploration/Timeline';
import BatteryChart from '../components/exploration/BatteryChart';
import SpeedChart from '../components/exploration/SpeedChart';
import StatusChart from '../components/exploration/StatusChart';
import FeaturePanel from '../components/exploration/FeaturePanel';
import useDataCache from '../hooks/useDataCache';

export default function ExplorationPage() {
  const { id: fileId } = useParams();
  const init = useConfigStore((s) => s.init);
  const reset = useConfigStore((s) => s.reset);
  const loading = useConfigStore((s) => s.fileMeta === null);

  // Start the data cache manager (subscribes to stores, fetches & caches data)
  useDataCache();

  // Initialize config store on mount
  useEffect(() => {
    init(fileId);
    return () => reset();
  }, [fileId, init, reset]);

  // Cross-store subscription: selectedRobots → fetch time range → timeline store
  useEffect(() => {
    const unsub = useConfigStore.subscribe(
      (state) => state.selectedRobots,
      async (selectedRobots) => {
        if (selectedRobots.length === 0) return;
        try {
          const range = await getFileTimeRange(fileId, selectedRobots);
          if (range.start && range.end) {
            useTimelineStore.getState().setFullRange(range.start, range.end);
          }
        } catch {
          // ignore
        }
      },
      { equalityFn: shallow },
    );
    return unsub;
  }, [fileId]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/files"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        返回文件列表
      </Link>

      <div className="space-y-6">
        <ConfigPanel />
        <FeaturePanel />
        <StatusChart />
        <Timeline />
        <BatteryChart />
        <SpeedChart />
      </div>
    </div>
  );
}
