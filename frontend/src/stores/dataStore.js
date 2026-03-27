import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

const useDataStore = create(
  subscribeWithSelector((set) => ({
    // [{robotId: string, data: RobotDataRow[]}] — grouped by robot
    robotData: [],
    loading: false,

    setRobotData: (robotData) => set({ robotData, loading: false }),
    setLoading: (loading) => set({ loading }),
    reset: () => set({ robotData: [], loading: false }),
  })),
);

export default useDataStore;
