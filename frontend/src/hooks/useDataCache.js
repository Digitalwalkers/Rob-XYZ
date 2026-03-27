import { useState, useEffect, useRef } from 'react';
import DataCacheManager from '../services/DataCacheManager';

/**
 * Hook that manages a DataCacheManager instance.
 * Returns the latest data snapshot and loading state.
 *
 * @param {Object} [options] - Options forwarded to DataCacheManager
 * @returns {{ data: Array, loading: boolean, manager: DataCacheManager|null }}
 */
export default function useDataCache(options) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const managerRef = useRef(null);

  useEffect(() => {
    const manager = new DataCacheManager(options);
    managerRef.current = manager;

    const unsub = manager.subscribe((snapshot, isLoading) => {
      setData(snapshot);
      setLoading(isLoading);
    });

    return () => {
      unsub();
      manager.destroy();
      managerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, manager: managerRef.current };
}
