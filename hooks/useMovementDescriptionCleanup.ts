import { useEffect, useMemo, useRef, useState } from "react";

import {
  cleanupMovementDescriptionLocally,
  shouldShowDescriptionCleanup,
  type DescriptionCleanupResult,
  type DescriptionCleanupSurface,
} from "../lib/movement-description-cleanup";
import {
  requestMovementDescriptionCleanup,
  type MovementDescriptionCleanupInput,
} from "../services/queries/workspace-data";
import { waitForMinimumVisibleTime } from "../lib/ai-request-utils";

type Params = {
  enabled: boolean;
  workspaceId: number | null;
  surface: DescriptionCleanupSurface;
  rawDescription: string;
  appLabel?: string | null;
  financialAppKey?: string | null;
  amount?: number | null;
  currencyCode?: string | null;
  proAccessEnabled?: boolean;
  localConfidenceThreshold?: number;
  debounceMs?: number;
};

type State = {
  cleanup: DescriptionCleanupResult | null;
  isLoading: boolean;
};

const responseCache = new Map<string, DescriptionCleanupResult | null>();

function cacheKey(input: MovementDescriptionCleanupInput) {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    surface: input.surface,
    rawDescription: input.rawDescription.trim().toLowerCase(),
    appLabel: input.appLabel ?? null,
    financialAppKey: input.financialAppKey ?? null,
    amount: input.amount ?? null,
    currencyCode: input.currencyCode ?? null,
  });
}

export function useMovementDescriptionCleanup({
  enabled,
  workspaceId,
  surface,
  rawDescription,
  appLabel,
  financialAppKey,
  amount,
  currencyCode,
  proAccessEnabled,
  localConfidenceThreshold = 0.7,
  debounceMs = 700,
}: Params): State {
  const [state, setState] = useState<State>({ cleanup: null, isLoading: false });
  const latestKeyRef = useRef<string | null>(null);

  const localCleanup = useMemo(() => {
    return cleanupMovementDescriptionLocally({ rawDescription, appLabel, financialAppKey });
  }, [appLabel, financialAppKey, rawDescription]);

  const input = useMemo<MovementDescriptionCleanupInput | null>(() => {
    if (!workspaceId) return null;
    const description = rawDescription.trim();
    if (description.length < 4) return null;
    return {
      workspaceId,
      surface,
      rawDescription: description,
      appLabel: appLabel ?? null,
      financialAppKey: financialAppKey ?? null,
      amount: amount && amount > 0 ? amount : null,
      currencyCode: currencyCode ?? null,
      localCleanup: localCleanup
        ? {
          cleanedDescription: localCleanup.cleanedDescription,
          confidence: localCleanup.confidence,
          reasons: localCleanup.reasons,
        }
        : null,
    };
  }, [amount, appLabel, currencyCode, financialAppKey, localCleanup, rawDescription, surface, workspaceId]);

  // Stable key string — prevents effect re-runs when input reference changes
  // but content hasn't changed.
  const key = useMemo(() => (input ? cacheKey(input) : null), [input]);

  // Keep input and localCleanup in refs so async callbacks use latest values
  // without being effect dependencies.
  const inputRef = useRef(input);
  inputRef.current = input;
  const localCleanupRef = useRef(localCleanup);
  localCleanupRef.current = localCleanup;

  useEffect(() => {
    if (!enabled || !key) {
      latestKeyRef.current = null;
      setState({ cleanup: null, isLoading: false });
      return;
    }

    const currentLocalCleanup = localCleanupRef.current;
    const currentInput = inputRef.current;

    if (currentLocalCleanup && currentLocalCleanup.confidence >= localConfidenceThreshold) {
      latestKeyRef.current = null;
      setState({
        cleanup: currentInput && shouldShowDescriptionCleanup(currentInput.rawDescription, currentLocalCleanup.cleanedDescription) ? currentLocalCleanup : null,
        isLoading: false,
      });
      return;
    }

    if (!proAccessEnabled) {
      latestKeyRef.current = null;
      setState({
        cleanup: currentInput && currentLocalCleanup && shouldShowDescriptionCleanup(currentInput.rawDescription, currentLocalCleanup.cleanedDescription) ? currentLocalCleanup : null,
        isLoading: false,
      });
      return;
    }

    latestKeyRef.current = key;
    if (responseCache.has(key)) {
      setState({ cleanup: responseCache.get(key) ?? null, isLoading: false });
      return;
    }

    setState({
      cleanup: currentInput && currentLocalCleanup && shouldShowDescriptionCleanup(currentInput.rawDescription, currentLocalCleanup.cleanedDescription) ? currentLocalCleanup : null,
      isLoading: false,
    });
    const timer = setTimeout(() => {
      const loadingStartedAt = Date.now();
      setState((prev) => ({ ...prev, isLoading: true }));
      void (async () => {
        const apiInput = inputRef.current;
        const fallbackCleanup = localCleanupRef.current;
        if (!apiInput) return;
        try {
          const response = await requestMovementDescriptionCleanup(apiInput);
          const cleanup = response.ok && response.cleanedDescription && shouldShowDescriptionCleanup(apiInput.rawDescription, response.cleanedDescription)
            ? {
              cleanedDescription: response.cleanedDescription,
              confidence: Math.max(0, Math.min(1, response.confidence)),
              reasons: response.reasons,
              source: "deepseek" as const,
            }
            : fallbackCleanup && shouldShowDescriptionCleanup(apiInput.rawDescription, fallbackCleanup.cleanedDescription)
              ? fallbackCleanup
              : null;
          responseCache.set(key, cleanup);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current !== key) return;
          setState({ cleanup, isLoading: false });
        } catch {
          const cleanup = fallbackCleanup && shouldShowDescriptionCleanup(apiInput.rawDescription, fallbackCleanup.cleanedDescription) ? fallbackCleanup : null;
          responseCache.set(key, cleanup);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current !== key) return;
          setState({ cleanup, isLoading: false });
        }
      })();
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, enabled, key, localConfidenceThreshold, proAccessEnabled]);

  return state;
}
