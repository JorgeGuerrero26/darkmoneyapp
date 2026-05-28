import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  useDashboardAiFlowMutation,
  useDashboardAiHealthMutation,
  useDashboardAiHistoryMutation,
  useDashboardAiPatternsMutation,
  useDashboardAiSummaryMutation,
} from "../../../services/queries/workspace-data";
import { isDashboardAiAdminEmail } from "../lib/constants";
import {
  getDashboardAiFlowCacheKey,
  getDashboardAiHealthCacheKey,
  getDashboardAiHistoryCacheKey,
  getDashboardAiPatternsCacheKey,
  getDashboardAiSummaryCacheKey,
  getDashboardAiToneKey,
  getDashboardAiUsageDate,
} from "../lib/ai-cache-keys";
import type { DashboardAiDailyCache, DashboardAiTone } from "../lib/dashboard-ai-content";

export type DashboardAiCacheKind = "summary" | "patterns" | "flow" | "history" | "health";

type CacheState = Record<DashboardAiCacheKind, DashboardAiDailyCache | null>;

const EMPTY_CACHE: CacheState = {
  summary: null,
  patterns: null,
  flow: null,
  history: null,
  health: null,
};

function isValidDailyCache(value: unknown, usageDate: string): value is DashboardAiDailyCache {
  if (!value || typeof value !== "object") return false;
  const cache = value as DashboardAiDailyCache;
  return cache.usageDate === usageDate && Boolean(cache.responses) && typeof cache.responses === "object";
}

export type UseDashboardAiOrchestrationInput = {
  userId?: string | null;
  userEmail?: string | null;
};

export function useDashboardAiOrchestration({ userId, userEmail }: UseDashboardAiOrchestrationInput) {
  const summaryMutation = useDashboardAiSummaryMutation();
  const patternsMutation = useDashboardAiPatternsMutation();
  const flowMutation = useDashboardAiFlowMutation();
  const historyMutation = useDashboardAiHistoryMutation();
  const healthMutation = useDashboardAiHealthMutation();

  const [caches, setCaches] = useState<CacheState>(EMPTY_CACHE);
  const [tone, setToneState] = useState<DashboardAiTone>("managerial");
  const toneLoadedRef = useRef(false);

  const toneStorageKey = useMemo(() => getDashboardAiToneKey(userId), [userId]);
  const cacheKeys = useMemo(
    () => ({
      summary: getDashboardAiSummaryCacheKey(userId),
      patterns: getDashboardAiPatternsCacheKey(userId),
      flow: getDashboardAiFlowCacheKey(userId),
      history: getDashboardAiHistoryCacheKey(userId),
      health: getDashboardAiHealthCacheKey(userId),
    }),
    [userId],
  );

  const usageDate = getDashboardAiUsageDate();
  const isAdmin = isDashboardAiAdminEmail(userEmail);

  // Reset state + load tone when user changes
  useEffect(() => {
    toneLoadedRef.current = false;
    setToneState("managerial");
    setCaches(EMPTY_CACHE);
    if (!toneStorageKey) {
      toneLoadedRef.current = true;
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(toneStorageKey)
      .then((stored) => {
        if (cancelled) return;
        if (stored === "managerial" || stored === "personal") setToneState(stored);
      })
      .finally(() => {
        if (!cancelled) toneLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [toneStorageKey]);

  // Generic cache hydrator: reads each kind from AsyncStorage on key/usageDate change
  const hydrateCache = useCallback(
    (kind: DashboardAiCacheKind, storageKey: string | null) => {
      if (!storageKey) {
        setCaches((prev) => (prev[kind] ? { ...prev, [kind]: null } : prev));
        return () => {};
      }
      let cancelled = false;
      void AsyncStorage.getItem(storageKey).then((stored) => {
        if (cancelled) return;
        if (!stored) {
          setCaches((prev) => ({ ...prev, [kind]: null }));
          return;
        }
        try {
          const parsed = JSON.parse(stored);
          if (isValidDailyCache(parsed, usageDate)) {
            setCaches((prev) => ({ ...prev, [kind]: parsed }));
          } else {
            setCaches((prev) => ({ ...prev, [kind]: null }));
            void AsyncStorage.removeItem(storageKey);
          }
        } catch {
          setCaches((prev) => ({ ...prev, [kind]: null }));
          void AsyncStorage.removeItem(storageKey);
        }
      });
      return () => {
        cancelled = true;
      };
    },
    [usageDate],
  );

  useEffect(() => hydrateCache("summary", cacheKeys.summary), [hydrateCache, cacheKeys.summary]);
  useEffect(() => hydrateCache("patterns", cacheKeys.patterns), [hydrateCache, cacheKeys.patterns]);
  useEffect(() => hydrateCache("flow", cacheKeys.flow), [hydrateCache, cacheKeys.flow]);
  useEffect(() => hydrateCache("history", cacheKeys.history), [hydrateCache, cacheKeys.history]);
  useEffect(() => hydrateCache("health", cacheKeys.health), [hydrateCache, cacheKeys.health]);

  // Persist tone
  useEffect(() => {
    if (!toneLoadedRef.current || !toneStorageKey) return;
    void AsyncStorage.setItem(toneStorageKey, tone);
  }, [tone, toneStorageKey]);

  // Persist each cache: remove when null, write JSON otherwise
  const persistCache = useCallback((kind: DashboardAiCacheKind, storageKey: string | null, value: DashboardAiDailyCache | null) => {
    if (!storageKey) return;
    if (!value) {
      void AsyncStorage.removeItem(storageKey);
      return;
    }
    void AsyncStorage.setItem(storageKey, JSON.stringify(value));
  }, []);

  useEffect(() => persistCache("summary", cacheKeys.summary, caches.summary), [persistCache, cacheKeys.summary, caches.summary]);
  useEffect(() => persistCache("patterns", cacheKeys.patterns, caches.patterns), [persistCache, cacheKeys.patterns, caches.patterns]);
  useEffect(() => persistCache("flow", cacheKeys.flow, caches.flow), [persistCache, cacheKeys.flow, caches.flow]);
  useEffect(() => persistCache("history", cacheKeys.history, caches.history), [persistCache, cacheKeys.history, caches.history]);
  useEffect(() => persistCache("health", cacheKeys.health, caches.health), [persistCache, cacheKeys.health, caches.health]);

  const setCache = useCallback(
    (
      kind: DashboardAiCacheKind,
      value:
        | DashboardAiDailyCache
        | null
        | ((current: DashboardAiDailyCache | null) => DashboardAiDailyCache | null),
    ) => {
      setCaches((prev) => {
        const next = typeof value === "function" ? value(prev[kind]) : value;
        return { ...prev, [kind]: next };
      });
    },
    [],
  );

  const setTone = useCallback((next: DashboardAiTone) => setToneState(next), []);

  return {
    tone,
    setTone,
    caches,
    setCache,
    mutations: {
      summary: summaryMutation,
      patterns: patternsMutation,
      flow: flowMutation,
      history: historyMutation,
      health: healthMutation,
    },
    isAdmin,
    usageDate,
  };
}
