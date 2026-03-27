import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getFiles, getFileRobots } from '../api/client';

const useConfigStore = create(
  subscribeWithSelector((set) => ({
    fileId: null,
    fileMeta: null,
    robots: [],
    selectedRobots: [],

    init: async (fileId) => {
      const [files, { robots }] = await Promise.all([
        getFiles(),
        getFileRobots(fileId),
      ]);
      const fileMeta = files.find((f) => f.id === fileId) || null;
      const robotIds = robots.map((r) => r.robot_id);
      set({
        fileId,
        fileMeta,
        robots,
        selectedRobots: robotIds,
      });
    },

    setSelectedRobots: (ids) => set({ selectedRobots: ids }),

    toggleRobot: (id) =>
      set((state) => {
        const has = state.selectedRobots.includes(id);
        return {
          selectedRobots: has
            ? state.selectedRobots.filter((r) => r !== id)
            : [...state.selectedRobots, id],
        };
      }),

    selectAll: () => set((state) => ({ selectedRobots: state.robots.map((r) => r.robot_id) })),

    selectNone: () => set({ selectedRobots: [] }),

    reset: () =>
      set({
        fileId: null,
        fileMeta: null,
        robots: [],
        selectedRobots: [],
      }),
  })),
);

export default useConfigStore;
