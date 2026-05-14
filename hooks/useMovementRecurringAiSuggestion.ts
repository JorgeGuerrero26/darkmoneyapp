import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestMovementRecurringAiSuggestion,
  type MovementRecurringAiInput,
} from "../services/queries/workspace-data";
import {
  suggestRecurringLocally,
  type MovementRecurringHistoryItem,
  type MovementRecurringSuggestionResult,
  type MovementRecurringSuggestionSurface,
} from "../lib/movement-recurring-suggestions";
import type { CategorySummary, CounterpartySummary, RecurringIncomeSummary, SubscriptionSummary } from "../types/domain";

const LOCAL_CONFIDENCE_THRESHOLD = 0.7;
const AI_CONFIDENCE_THRESHOLD = 0.65;
const CACHE = new Map<string, MovementRecurringSuggestionResult | null>();

function cacheKey(input: MovementRecurringAiInput) {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    surface: input.surface,
    movementType: input.movementType,
    amount: input.amount,
    currencyCode: input.currencyCode,
    description: input.description,
    occurredAt: input.occurredAt,
    categoryId: input.category?.id ?? null,
    counterpartyId: input.counterparty?.id ?? null,
    local: input.localSuggestion,
  });
}

type Input = {
  enabled: boolean;
  workspaceId: number | null;
  surface: MovementRecurringSuggestionSurface;
  movementType: "expense" | "income";
  description: string;
  amount: number | null;
  currencyCode?: string | null;
  occurredAt: string;
  category?: Pick<CategorySummary, "id" | "name"> | null;
  counterparty?: Pick<CounterpartySummary, "id" | "name"> | null;
  recentMovements: MovementRecurringHistoryItem[];
  subscriptions: SubscriptionSummary[];
  recurringIncome: RecurringIncomeSummary[];
  proAccessEnabled?: boolean;
};

export function useMovementRecurringAiSuggestion({
  enabled,
  workspaceId,
  surface,
  movementType,
  description,
  amount,
  currencyCode,
  occurredAt,
  category,
  counterparty,
  recentMovements,
  subscriptions,
  recurringIncome,
  proAccessEnabled,
}: Input) {
  const [aiSuggestion, setAiSuggestion] = useState<MovementRecurringSuggestionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  const localSuggestion = useMemo(() => {
    if (!enabled || !description.trim() || movementType !== "expense" && movementType !== "income") return null;
    return suggestRecurringLocally({
      movementType,
      description,
      amount,
      currencyCode,
      occurredAt,
      category,
      counterparty,
      recentMovements,
      subscriptions,
      recurringIncome,
    });
  }, [
    amount,
    category,
    counterparty,
    currencyCode,
    description,
    enabled,
    movementType,
    occurredAt,
    recentMovements,
    recurringIncome,
    subscriptions,
  ]);

  const input = useMemo<MovementRecurringAiInput | null>(() => {
    if (!enabled || !workspaceId || !description.trim()) return null;
    if (localSuggestion && localSuggestion.confidence >= LOCAL_CONFIDENCE_THRESHOLD) return null;
    if (!proAccessEnabled) return null;
    return {
      workspaceId,
      surface,
      movementType,
      amount,
      currencyCode: currencyCode ?? null,
      description: description.trim(),
      occurredAt,
      category: category ? { id: category.id, name: category.name } : null,
      counterparty: counterparty ? { id: counterparty.id, name: counterparty.name } : null,
      recentMovements: recentMovements.slice(0, 30),
      subscriptions: subscriptions
        .filter((item) => item.status === "active")
        .slice(0, 40)
        .map((item) => ({
          id: item.id,
          name: item.name,
          amount: item.amount,
          currencyCode: item.currencyCode,
          frequency: item.frequency,
          intervalCount: item.intervalCount,
          vendorPartyId: item.vendorPartyId ?? null,
          categoryId: item.categoryId ?? null,
        })),
      recurringIncome: recurringIncome
        .filter((item) => item.status === "active")
        .slice(0, 40)
        .map((item) => ({
          id: item.id,
          name: item.name,
          amount: item.amount,
          currencyCode: item.currencyCode,
          frequency: item.frequency,
          intervalCount: item.intervalCount,
          payerPartyId: item.payerPartyId ?? null,
          categoryId: item.categoryId ?? null,
        })),
      localSuggestion,
    };
  }, [
    amount,
    category,
    counterparty,
    currencyCode,
    description,
    enabled,
    localSuggestion,
    movementType,
    occurredAt,
    proAccessEnabled,
    recentMovements,
    recurringIncome,
    subscriptions,
    surface,
    workspaceId,
  ]);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setAiSuggestion(null);
    setIsLoading(false);
    if (!input) return;

    const key = cacheKey(input);
    if (CACHE.has(key)) {
      setAiSuggestion(CACHE.get(key) ?? null);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      void requestMovementRecurringAiSuggestion(input)
        .then((response) => {
          if (requestIdRef.current !== requestId) return;
          const recommendation = response.ok && response.recommendation && response.recommendation.confidence >= AI_CONFIDENCE_THRESHOLD
            ? { ...response.recommendation, source: "deepseek" as const }
            : null;
          CACHE.set(key, recommendation);
          setAiSuggestion(recommendation);
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return;
          CACHE.set(key, null);
          setAiSuggestion(null);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) setIsLoading(false);
        });
    }, 750);

    return () => {
      clearTimeout(timer);
    };
  }, [input]);

  return {
    suggestion: aiSuggestion ?? localSuggestion,
    isLoading,
    localSuggestion,
  };
}
