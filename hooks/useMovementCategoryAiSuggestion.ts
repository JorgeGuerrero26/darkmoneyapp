import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestMovementCategoryAiSuggestion,
  type MovementCategoryAiRecommendation,
  type MovementCategoryAiSuggestionInput,
} from "../services/queries/workspace-data";

type Params = {
  enabled: boolean;
  input: MovementCategoryAiSuggestionInput | null;
  minConfidence?: number;
  debounceMs?: number;
};

type State = {
  recommendation: MovementCategoryAiRecommendation | null;
  isLoading: boolean;
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
  const [state, setState] = useState<State>({ recommendation: null, isLoading: false });
  const latestKeyRef = useRef<string | null>(null);
  const key = useMemo(() => (input ? cacheKey(input) : null), [input]);

  useEffect(() => {
    if (!enabled || !input || !key || input.description.trim().length < 3 || input.categories.length === 0) {
      latestKeyRef.current = null;
      setState({ recommendation: null, isLoading: false });
      return;
    }

    latestKeyRef.current = key;
    if (responseCache.has(key)) {
      const cached = responseCache.get(key) ?? null;
      setState({
        recommendation: cached && cached.confidence >= minConfidence ? cached : null,
        isLoading: false,
      });
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true }));
    const timer = setTimeout(() => {
      void requestMovementCategoryAiSuggestion(input)
        .then((response) => {
          const recommendation = response.ok ? response.recommendation : null;
          responseCache.set(key, recommendation);
          if (latestKeyRef.current !== key) return;
          setState({
            recommendation: recommendation && recommendation.confidence >= minConfidence ? recommendation : null,
            isLoading: false,
          });
        })
        .catch(() => {
          responseCache.set(key, null);
          if (latestKeyRef.current !== key) return;
          setState({ recommendation: null, isLoading: false });
        });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, enabled, input, key, minConfidence]);

  return state;
}
