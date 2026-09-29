import { useCallback, useEffect, useRef, useState } from "react";

const MAX_REFRESH_MS = 15_000;

/** Only a pull gesture may show the native refresh indicator. Query refetches run silently. */
export function useGestureRefresh(onRefresh?: () => void | Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const activeRef = useRef(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const refreshByGesture = useCallback(() => {
    if (!onRefresh || activeRef.current) return;
    activeRef.current = true;
    const generation = ++generationRef.current;
    setRefreshing(true);

    const finish = () => {
      if (!activeRef.current || generationRef.current !== generation) return;
      activeRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      if (mountedRef.current) setRefreshing(false);
    };

    // A stalled request must not leave the list displaced with a spinner indefinitely.
    timeoutRef.current = setTimeout(finish, MAX_REFRESH_MS);
    void Promise.resolve().then(onRefresh).catch(() => undefined).finally(finish);
  }, [onRefresh]);

  return { refreshing, refreshByGesture };
}
