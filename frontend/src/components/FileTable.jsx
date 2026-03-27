import { useNavigate } from 'react-router-dom';
import { TrashIcon } from '@heroicons/react/24/outline';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeRange(start, end) {
  if (!start || !end) return '-';
  const s = new Date(start).toLocaleDateString('zh-CN');
  const e = new Date(end).toLocaleDateString('zh-CN');
  return s === e ? s : `${s} ~ ${e}`;
}

export default function FileTable({ files, onDelete }) {
  const navigate = useNavigate();
  if (files.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
        <p className="text-gray-500 text-lg">暂无已上传的文件</p>
        <p className="text-gray-400 text-sm mt-2">前往「上传文件」页面添加数据</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-3 font-medium text-gray-500">文件名</th>
            <th className="px-6 py-3 font-medium text-gray-500">大小</th>
            <th className="px-6 py-3 font-medium text-gray-500">行数</th>
            <th className="px-6 py-3 font-medium text-gray-500">机器人数</th>
            <th className="px-6 py-3 font-medium text-gray-500">时间范围</th>
            <th className="px-6 py-3 font-medium text-gray-500">上传时间</th>
            <th className="px-6 py-3 font-medium text-gray-500">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {files.map((file) => (
            <tr
              key={file.id}
              onClick={() => navigate(`/files/${file.id}`)}
              className="hover:bg-gray-50 transition-colors cursor-pointer"
            >
              <td className="px-6 py-4 font-medium text-gray-900">
                {file.original_filename}
              </td>
              <td className="px-6 py-4 text-gray-600">{formatBytes(file.file_size)}</td>
              <td className="px-6 py-4 text-gray-600">{file.row_count.toLocaleString()}</td>
              <td className="px-6 py-4 text-gray-600">{file.robot_count}</td>
              <td className="px-6 py-4 text-gray-600">
                {formatTimeRange(file.time_range_start, file.time_range_end)}
              </td>
              <td className="px-6 py-4 text-gray-600">{formatDate(file.created_at)}</td>
              <td className="px-6 py-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(file);
                  }}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="删除"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
