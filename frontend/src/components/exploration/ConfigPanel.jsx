import useConfigStore from '../../stores/configStore';

function StatusBar({ ok, warning, error }) {
  const okPct = (ok * 100).toFixed(0);
  const warnPct = (warning * 100).toFixed(0);
  const errPct = (error * 100).toFixed(0);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-2 w-20 rounded-full overflow-hidden bg-gray-100">
        {ok > 0 && (
          <div className="bg-emerald-400" style={{ width: `${ok * 100}%` }} />
        )}
        {warning > 0 && (
          <div className="bg-amber-400" style={{ width: `${warning * 100}%` }} />
        )}
        {error > 0 && (
          <div className="bg-red-400" style={{ width: `${error * 100}%` }} />
        )}
      </div>
      <span className="text-[10px] text-gray-400 whitespace-nowrap">
        {okPct}/{warnPct}/{errPct}
      </span>
    </div>
  );
}

export default function ConfigPanel() {
  const fileMeta = useConfigStore((s) => s.fileMeta);
  const robots = useConfigStore((s) => s.robots);
  const selectedRobots = useConfigStore((s) => s.selectedRobots);
  const toggleRobot = useConfigStore((s) => s.toggleRobot);
  const selectAll = useConfigStore((s) => s.selectAll);
  const selectNone = useConfigStore((s) => s.selectNone);

  if (!fileMeta) return null;

  const allSelected = robots.length > 0 && selectedRobots.length === robots.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* File info */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {fileMeta.original_filename}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {fileMeta.row_count.toLocaleString()} 行数据
            {' / '}
            {fileMeta.robot_count} 台机器人
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            全选
          </button>
          <span className="text-xs text-gray-300">|</span>
          <button
            onClick={selectNone}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
          >
            清除
          </button>
        </div>
      </div>

      {/* Robot stats table */}
      <div className="border-t border-gray-100 pt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="pb-2 pr-3 font-medium w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => allSelected ? selectNone() : selectAll()}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
              </th>
              <th className="pb-2 pr-3 font-medium">机器人</th>
              <th className="pb-2 pr-3 font-medium text-right">数据点</th>
              <th className="pb-2 pr-3 font-medium text-right">平均电量</th>
              <th className="pb-2 pr-3 font-medium text-right">最低电量</th>
              <th className="pb-2 pr-3 font-medium text-right">错误次数</th>
              <th className="pb-2 pr-3 font-medium">设备A状态</th>
              <th className="pb-2 font-medium">设备B状态</th>
            </tr>
          </thead>
          <tbody>
            {robots.map((robot) => {
              const checked = selectedRobots.includes(robot.robot_id);
              return (
                <tr
                  key={robot.robot_id}
                  onClick={() => toggleRobot(robot.robot_id)}
                  className={`border-b border-gray-50 cursor-pointer transition-colors ${
                    checked ? 'bg-indigo-50/50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleRobot(robot.robot_id)}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="py-2 pr-3 font-medium text-gray-800">
                    {robot.robot_id}
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-600 tabular-nums">
                    {robot.data_points.toLocaleString()}
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-600 tabular-nums">
                    {robot.avg_battery.toFixed(1)}%
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-600 tabular-nums">
                    <span className={robot.min_battery < 20 ? 'text-red-500 font-medium' : ''}>
                      {robot.min_battery.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <span className={robot.error_count > 0 ? 'text-red-500 font-medium' : 'text-gray-600'}>
                      {robot.error_count}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <StatusBar
                      ok={robot.device_a_ok_ratio}
                      warning={robot.device_a_warning_ratio}
                      error={robot.device_a_error_ratio}
                    />
                  </td>
                  <td className="py-2">
                    <StatusBar
                      ok={robot.device_b_ok_ratio}
                      warning={robot.device_b_warning_ratio}
                      error={robot.device_b_error_ratio}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedRobots.length === 0 && (
        <p className="text-sm text-amber-600 mt-2">请至少选择一台机器人</p>
      )}
    </div>
  );
}
