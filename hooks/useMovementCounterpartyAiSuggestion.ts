import { useEffect, useMemo, useRef, useState } from "react";

import {
  suggestCounterpartyLocally,
  type CounterpartySuggestionResult,
  type CounterpartySuggestionSurface,
} from "../lib/movement-counterparty-suggestions";
import {
  requestMovementCounterpartyAiSuggestion,
  type MovementCounterpartyAiInput,
} from "../services/queries/workspace-data";
import { waitForMinimumVisibleTime } from "../lib/ai-request-utils";
import type { CounterpartySummary } from "../types/domain";

type Params = {
  enabled: boolean;
  workspaceId: number | null;
  surface: CounterpartySuggestionSurface;
  description: string;
  movementType: "expense" | "income";
  amount?: number | null;
  currencyCode?: string | null;
  counterparties: CounterpartySummary[];
  proAccessEnabled?: boolean;
  localConfidenceThreshold?: number;
  minAiConfidence?: number;
  debounceMs?: number;
};

type State = {
  suggestion: CounterpartySuggestionResult | null;
  isLoading: boolean;
  aiAttempted: boolean;
};

const responseCache = new Map<string, CounterpartySuggestionResult | null>();

function cacheKey(input: MovementCounterpartyAiInput) {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    surface: input.surface,
    description: input.description.trim().toLowerCase(),
    movementType: input.movementType,
    amount: input.amount ?? null,
    currencyCode: input.currencyCode ?? null,
    counterparties: input.counterparties.map((counterparty) => [counterparty.id, counterparty.name, counterparty.type]),
    localSuggestion: input.localSuggestion,
  });
}

export function useMovementCounterpartyAiSuggestion({
  enabled,
  workspaceId,
  surface,
  description,
  movementType,
  amount,
  currencyCode,
  counterparties,
  proAccessEnabled,
  localConfidenceThreshold = 0.7,
  minAiConfidence = 0.65,
  debounceMs = 700,
}: Params): State {
  const [state, setState] = useState<State>({ suggestion: null, isLoading: false, aiAttempted: false });
  const latestKeyRef = useRef<string | null>(null);

  const localSuggestion = useMemo(() => {
    return suggestCounterpartyLocally({ description, counterparties });
  }, [counterparties, description]);

  const input = useMemo<MovementCounterpartyAiInput | null>(() => {
    if (!workspaceId) return null;
    const trimmed = description.trim();
    if (trimmed.length < 3) return null;
    return {
      workspaceId,
      surface,
      description: trimmed,
      movementType,
      amount: amount && amount > 0 ? amount : null,
      currencyCode: currencyCode ?? null,
      counterparties: counterparties
        .filter((counterparty) => !counterparty.isArchived)
        .map((counterparty) => ({
          id: counterparty.id,
          name: counterparty.name,
          type: counterparty.type,
        })),
      localSuggestion,
    };
  }, [amount, counterparties, currencyCode, description, localSuggestion, movementType, surface, workspaceId]);

  // Stable key string — prevents effect re-runs when input reference changes
  // but content hasn't changed.
  const key = useMemo(() => (input ? cacheKey(input) : null), [input]);

  // Keep input and localSuggestion in refs so async callbacks use latest values
  // without being effect dependencies.
  const inputRef = useRef(input);
  inputRef.current = input;
  const localSuggestionRef = useRef(localSuggestion);
  localSuggestionRef.current = localSuggestion;

  useEffect(() => {
    if (!enabled || !key) {
      latestKeyRef.current = null;
      setState({ suggestion: null, isLoading: false, aiAttempted: false });
      return;
    }

    const currentLocalSuggestion = localSuggestionRef.current;

    if (currentLocalSuggestion && currentLocalSuggestion.confidence >= localConfidenceThreshold) {
      latestKeyRef.current = null;
      setState({ suggestion: currentLocalSuggestion, isLoading: false, aiAttempted: false });
      return;
    }

    if (!proAccessEnabled) {
      latestKeyRef.current = null;
      setState({ suggestion: currentLocalSuggestion, isLoading: false, aiAttempted: false });
      return;
    }

    latestKeyRef.current = key;
    if (responseCache.has(key)) {
      setState({ suggestion: responseCache.get(key) ?? currentLocalSuggestion, isLoading: false, aiAttempted: true });
      return;
    }

    setState((prev) => ({ ...prev, suggestion: currentLocalSuggestion, aiAttempted: false }));
    const timer = setTimeout(() => {
      const loadingStartedAt = Date.now();
      setState((prev) => ({ ...prev, isLoading: true }));
      void (async () => {
        const currentInput = inputRef.current;
        const fallback = localSuggestionRef.current;
        if (!currentInput) return;
        try {
          const response = await requestMovementCounterpartyAiSuggestion(currentInput);
          const recommendation = response.ok && response.recommendation && response.recommendation.confidence >= minAiConfidence
            ? {
              type: response.recommendation.type,
              counterpartyId: response.recommendation.counterpartyId,
              counterpartyName: response.recommendation.counterpartyName,
              newCounterpartyName: response.recommendation.newCounterpartyName,
              counterpartyType: response.recommendation.counterpartyType,
              confidence: response.recommendation.confidence,
              reasons: response.recommendation.reasons,
              source: "deepseek" as const,
            }
            : fallback;
          const suggestion = recommendation?.type === "none" ? null : recommendation ?? null;
          responseCache.set(key, suggestion);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current !== key) return;
          setState({ suggestion, isLoading: false, aiAttempted: true });
        } catch {
          responseCache.set(key, fallback);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current !== key) return;
          setState({ suggestion: fallback, isLoading: false, aiAttempted: true });
        }
      })();
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, enabled, key, localConfidenceThreshold, minAiConfidence, proAccessEnabled]);

  return state;
}
