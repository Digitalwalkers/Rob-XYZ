import { useEffect } from 'react';
import useFeatureStore from '../../stores/featureStore';
import useConfigStore from '../../stores/configStore';

export default function FeaturePanel() {
  const fileId = useConfigStore((s) => s.fileId);
  const selectedRobots = useConfigStore((s) => s.selectedRobots);

  const registry = useFeatureStore((s) => s.registry);
  const statuses = useFeatureStore((s) => s.statuses);
  const enabled = useFeatureStore((s) => s.enabled);
  const loadingKeys = useFeatureStore((s) => s.loadingKeys);
  const initForFile = useFeatureStore((s) => s.initForFile);
  const toggleFeature = useFeatureStore((s) => s.toggleFeature);
  const enableAll = useFeatureStore((s) => s.enableAll);
  const disableAll = useFeatureStore((s) => s.disableAll);
  const reset = useFeatureStore((s) => s.reset);

  useEffect(() => {
    if (fileId && selectedRobots.length > 0) {
      initForFile(fileId, selectedRobots);
    }
    return () => reset();
  }, [fileId]);

  if (registry.length === 0) return null;

  const completedCount = Object.values(statuses).filter((s) => s.status === 'completed').length;
  const enabledCount = Object.values(enabled).filter(Boolean).length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-700">
          特征标注
          <span className="ml-2 text-xs text-gray-400">
            {enabledCount}/{completedCount} 已启用
          </span>
        </h3>
        <div className="flex gap-2">
          <button
            onClick={enableAll}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            全选
          </button>
          <span className="text-xs text-gray-300">|</span>
          <button
            onClick={disableAll}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            清除
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {registry.map((feature) => {
          const status = statuses[feature.key];
          const isEnabled = enabled[feature.key] || false;
          const isCompleted = status?.status === 'completed';
          const isComputing = status?.status === 'computing';
          const isPending = !status || status.status === 'pending';
          const isLoading = loadingKeys.includes(feature.key);

          return (
            <label
              key={feature.key}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                isEnabled
                  ? 'border-indigo-200 bg-indigo-50/50'
                  : 'border-gray-100 hover:bg-gray-50'
              } ${!isCompleted ? 'opacity-60 cursor-default' : ''}`}
            >
              <input
                type="checkbox"
                checked={isEnabled}
                disabled={!isCompleted}
                onChange={() => toggleFeature(feature.key)}
                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />

              {/* Color dot */}
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: feature.color }}
              />

              <span className="text-sm text-gray-700 flex-1 truncate">
                {feature.label}
              </span>

              {/* Status indicator */}
              {isComputing && (
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  <span className="text-[10px] text-gray-400">{status.progress}%</span>
                </span>
              )}
              {isPending && (
                <span className="text-[10px] text-gray-400">等待中</span>
              )}
              {isLoading && (
                <span className="w-3 h-3 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
