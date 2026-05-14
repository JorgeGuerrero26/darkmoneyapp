import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestMovementCategoryAiSuggestion,
  type MovementCategoryAiRecommendation,
  type MovementCategoryAiSuggestionInput,
} from "../services/queries/workspace-data";
import { waitForMinimumVisibleTime } from "../lib/ai-request-utils";

type Params = {
  enabled: boolean;
  input: MovementCategoryAiSuggestionInput | null;
  minConfidence?: number;
  debounceMs?: number;
};

type State = {
  recommendation: MovementCategoryAiRecommendation | null;
  isLoading: boolean;
  aiAttempted: boolean;
};

const responseCache = new Map<string, MovementCategoryAiRecommendation | null>();

function cacheKey(input: MovementCategoryAiSuggestionInput) {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    surface: input.surface,
    movementType: input.movementType,
    amount: input.amount ?? null,
    currencyCode: input.currencyCode ?? null,
    description: input.description.trim().toLowerCase(),
    occurredAt: input.occurredAt ?? null,
    categories: input.categories.map((category) => [category.id, category.name, category.kind]),
    localSuggestion: input.localSuggestion,
  });
}

export function useMovementCategoryAiSuggestion({
  enabled,
  input,
  minConfidence = 0.65,
  debounceMs = 700,
}: Params): State {
  const [state, setState] = useState<State>({ recommendation: null, isLoading: false, aiAttempted: false });
  const latestKeyRef = useRef<string | null>(null);

  // Stable key: null when input is missing or description too short.
  // Using a string dep in the effect prevents re-runs caused by input reference instability.
  const key = useMemo(() => {
    if (!input || input.description.trim().length < 3 || input.categories.length === 0) return null;
    return cacheKey(input);
  }, [input]);

  // Keep input in a ref so the async callback always uses the latest value
  // without being an effect dependency.
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    if (!enabled || !key) {
      latestKeyRef.current = null;
      setState({ recommendation: null, isLoading: false, aiAttempted: false });
      return;
    }

    latestKeyRef.current = key;
    if (responseCache.has(key)) {
      const cached = responseCache.get(key) ?? null;
      setState({
        recommendation: cached && cached.confidence >= minConfidence ? cached : null,
        isLoading: false,
        aiAttempted: true,
      });
      return;
    }

    setState((prev) => ({ ...prev, recommendation: null, aiAttempted: false }));
    const timer = setTimeout(() => {
      const loadingStartedAt = Date.now();
      setState((prev) => ({ ...prev, isLoading: true }));
      void (async () => {
        const currentInput = inputRef.current;
        if (!currentInput) return;
        try {
          const response = await requestMovementCategoryAiSuggestion(currentInput);
          const recommendation = response.ok ? response.recommendation : null;
          responseCache.set(key, recommendation);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current !== key) return;
          setState({
            recommendation: recommendation && recommendation.confidence >= minConfidence ? recommendation : null,
            isLoading: false,
            aiAttempted: true,
          });
        } catch {
          responseCache.set(key, null);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current !== key) return;
          setState({ recommendation: null, isLoading: false, aiAttempted: true });
        }
      })();
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, enabled, key, minConfidence]);

  return state;
}
