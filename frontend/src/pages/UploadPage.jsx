import { useState, useCallback, useEffect } from 'react';
import FileUploader from '../components/FileUploader';
import UploadProgress from '../components/UploadProgress';
import { uploadFile, subscribeProgress, getUploads } from '../api/client';

const STATUS_CONFIG = {
  completed: { label: '已完成', color: 'text-green-600', bg: 'bg-green-50' },
  error: { label: '失败', color: 'text-red-600', bg: 'bg-red-50' },
};

function formatTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function UploadPage() {
  // Active tasks being tracked via SSE
  const [activeTasks, setActiveTasks] = useState({});
  // Historical uploads from DB
  const [history, setHistory] = useState([]);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await getUploads();
      setHistory(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleFileSelect = useCallback(async (file) => {
    const tempId = crypto.randomUUID();

    // Add to active tasks immediately
    setActiveTasks((prev) => ({
      ...prev,
      [tempId]: {
        filename: file.name,
        event: { status: 'uploading', progress: 0, message: '上传文件中...' },
      },
    }));

    try {
      const { task_id } = await uploadFile(file);

      // Replace temp ID with real task ID
      setActiveTasks((prev) => {
        const { [tempId]: task, ...rest } = prev;
        return { ...rest, [task_id]: task };
      });

      subscribeProgress(
        task_id,
        (event) => {
          setActiveTasks((prev) => ({
            ...prev,
            [task_id]: { ...prev[task_id], event },
          }));
        },
        () => {
          // When done, remove from active and refresh history
          setActiveTasks((prev) => {
            const { [task_id]: _, ...rest } = prev;
            return rest;
          });
          fetchHistory();
        },
      );
    } catch {
      setActiveTasks((prev) => ({
        ...prev,
        [tempId]: {
          filename: file.name,
          event: { status: 'error', progress: 0, message: '上传请求失败，请检查网络连接' },
        },
      }));
    }
  }, [fetchHistory]);

  const activeList = Object.entries(activeTasks);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">上传 CSV 文件</h1>

      <FileUploader onFileSelect={handleFileSelect} />

      {/* Active uploads */}
      {activeList.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-medium text-gray-500">正在处理</h2>
          {activeList.map(([id, task]) => (
            <UploadProgress key={id} task={task} />
          ))}
        </div>
      )}

      {/* Upload history */}
      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-gray-500 mb-3">上传历史</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 font-medium text-gray-500">文件名</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">状态</th>
                  <th className="px-4 py-2.5 font-medium text-gray-500">上传时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((item) => {
                  const cfg = STATUS_CONFIG[item.status] || { label: item.status, color: 'text-gray-500', bg: 'bg-gray-50' };
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-900">{item.original_filename}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {item.error_message && (
                          <span className="ml-2 text-xs text-red-500" title={item.error_message}>
                            {item.error_message.length > 30
                              ? item.error_message.slice(0, 30) + '...'
                              : item.error_message}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{formatTime(item.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
