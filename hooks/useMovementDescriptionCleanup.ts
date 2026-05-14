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

  const key = useMemo(() => (input ? cacheKey(input) : null), [input]);

  useEffect(() => {
    if (!enabled || !input || !key) {
      latestKeyRef.current = null;
      setState({ cleanup: null, isLoading: false });
      return;
    }

    if (localCleanup && localCleanup.confidence >= localConfidenceThreshold) {
      latestKeyRef.current = null;
      setState({
        cleanup: shouldShowDescriptionCleanup(input.rawDescription, localCleanup.cleanedDescription) ? localCleanup : null,
        isLoading: false,
      });
      return;
    }

    if (!proAccessEnabled) {
      latestKeyRef.current = null;
      setState({
        cleanup: localCleanup && shouldShowDescriptionCleanup(input.rawDescription, localCleanup.cleanedDescription) ? localCleanup : null,
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
      cleanup: localCleanup && shouldShowDescriptionCleanup(input.rawDescription, localCleanup.cleanedDescription) ? localCleanup : null,
      isLoading: true,
    });
    const timer = setTimeout(() => {
      void requestMovementDescriptionCleanup(input)
        .then((response) => {
          const cleanup = response.ok && response.cleanedDescription && shouldShowDescriptionCleanup(input.rawDescription, response.cleanedDescription)
            ? {
              cleanedDescription: response.cleanedDescription,
              confidence: Math.max(0, Math.min(1, response.confidence)),
              reasons: response.reasons,
              source: "deepseek" as const,
            }
            : localCleanup && shouldShowDescriptionCleanup(input.rawDescription, localCleanup.cleanedDescription)
              ? localCleanup
              : null;
          responseCache.set(key, cleanup);
          if (latestKeyRef.current !== key) return;
          setState({ cleanup, isLoading: false });
        })
        .catch(() => {
          const cleanup = localCleanup && shouldShowDescriptionCleanup(input.rawDescription, localCleanup.cleanedDescription) ? localCleanup : null;
          responseCache.set(key, cleanup);
          if (latestKeyRef.current !== key) return;
          setState({ cleanup, isLoading: false });
        });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, enabled, input, key, localCleanup, localConfidenceThreshold, proAccessEnabled]);

  return state;
}
