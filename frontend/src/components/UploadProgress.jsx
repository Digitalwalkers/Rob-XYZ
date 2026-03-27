import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import { ArrowPathIcon } from '@heroicons/react/24/outline';

const STATUS_CONFIG = {
  uploading: { label: '上传中', color: 'text-blue-600', bg: 'bg-blue-50' },
  validating: { label: '校验中', color: 'text-amber-600', bg: 'bg-amber-50' },
  processing: { label: '处理中', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  completed: { label: '已完成', color: 'text-green-600', bg: 'bg-green-50' },
  error: { label: '失败', color: 'text-red-600', bg: 'bg-red-50' },
};

export default function UploadProgress({ task }) {
  const { filename, event } = task;
  const cfg = STATUS_CONFIG[event.status] || STATUS_CONFIG.uploading;
  const isActive = !['completed', 'error'].includes(event.status);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        {/* Status icon */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.bg}`}>
          {event.status === 'completed' ? (
            <CheckCircleIcon className="w-5 h-5 text-green-600" />
          ) : event.status === 'error' ? (
            <XCircleIcon className="w-5 h-5 text-red-600" />
          ) : (
            <ArrowPathIcon className={`w-5 h-5 ${cfg.color} animate-spin`} />
          )}
        </div>

        {/* File info + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900 truncate">
              {filename}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{event.message}</p>
        </div>
      </div>

      {/* Progress bar */}
      {isActive && event.progress > 0 && (
        <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5">
          <div
            className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${event.progress}%` }}
          />
        </div>
      )}

      {/* Error message detail */}
      {event.status === 'error' && event.message && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2">{event.message}</p>
      )}
    </div>
  );
}
