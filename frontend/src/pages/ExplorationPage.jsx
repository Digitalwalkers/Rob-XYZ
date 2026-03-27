import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeftIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { shallow } from 'zustand/shallow';
import useConfigStore from '../stores/configStore';
import useTimelineStore from '../stores/timelineStore';
import { getFileTimeRange } from '../api/client';
import ConfigPanel from '../components/exploration/ConfigPanel';
import Timeline from '../components/exploration/Timeline';
import BatteryChart from '../components/exploration/BatteryChart';
import SpeedChart from '../components/exploration/SpeedChart';
import StatusChart from '../components/exploration/StatusChart';
import LocationChart from '../components/exploration/LocationChart';
import FeaturePanel from '../components/exploration/FeaturePanel';
import useDataCache from '../hooks/useDataCache';

export default function ExplorationPage() {
  const { id: fileId } = useParams();
  const init = useConfigStore((s) => s.init);
  const reset = useConfigStore((s) => s.reset);
  const loading = useConfigStore((s) => s.fileMeta === null);
  const [showLocation, setShowLocation] = useState(false);

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
        <div className="flex gap-6">
          {/* Left: time-series charts */}
          <div className={`space-y-6 ${showLocation ? 'flex-1 min-w-0' : 'w-full'}`}>
            <BatteryChart />
            <SpeedChart />
          </div>

          {/* Right: location chart (collapsible) */}
          {showLocation && (
            <div className="w-[420px] shrink-0">
              <LocationChart />
            </div>
          )}
        </div>

        <button
          onClick={() => setShowLocation((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <MapPinIcon className="w-4 h-4" />
          {showLocation ? '收起位置图' : '展开位置图'}
        </button>
      </div>
    </div>
  );
}
