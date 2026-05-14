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
  const [state, setState] = useState<State>({ suggestion: null, isLoading: false });
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

  const key = useMemo(() => (input ? cacheKey(input) : null), [input]);

  useEffect(() => {
    if (!enabled || !input || !key) {
      latestKeyRef.current = null;
      setState({ suggestion: null, isLoading: false });
      return;
    }

    if (localSuggestion && localSuggestion.confidence >= localConfidenceThreshold) {
      latestKeyRef.current = null;
      setState({ suggestion: localSuggestion, isLoading: false });
      return;
    }

    if (!proAccessEnabled) {
      latestKeyRef.current = null;
      setState({ suggestion: localSuggestion, isLoading: false });
      return;
    }

    latestKeyRef.current = key;
    if (responseCache.has(key)) {
      setState({ suggestion: responseCache.get(key) ?? localSuggestion, isLoading: false });
      return;
    }

    setState({ suggestion: localSuggestion, isLoading: true });
    const timer = setTimeout(() => {
      void requestMovementCounterpartyAiSuggestion(input)
        .then((response) => {
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
            : localSuggestion;
          const suggestion = recommendation?.type === "none" ? null : recommendation ?? null;
          responseCache.set(key, suggestion);
          if (latestKeyRef.current !== key) return;
          setState({ suggestion, isLoading: false });
        })
        .catch(() => {
          responseCache.set(key, localSuggestion);
          if (latestKeyRef.current !== key) return;
          setState({ suggestion: localSuggestion, isLoading: false });
        });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, enabled, input, key, localConfidenceThreshold, localSuggestion, minAiConfidence, proAccessEnabled]);

  return state;
}
