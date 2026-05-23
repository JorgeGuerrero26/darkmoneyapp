import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestMovementRecurringAiSuggestion,
  type MovementRecurringAiInput,
} from "../services/queries/workspace-data";
import { waitForMinimumVisibleTime } from "../lib/ai-request-utils";
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
  const [aiAttempted, setAiAttempted] = useState(false);
  const requestIdRef = useRef(0);
  const categoryId = category?.id ?? null;
  const counterpartyId = counterparty?.id ?? null;

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
  const localSuggestionBlocksAi = Boolean(localSuggestion && localSuggestion.confidence >= LOCAL_CONFIDENCE_THRESHOLD);

  // Stable key based only on scalar fields — NOT on large arrays (recentMovements/subscriptions/recurringIncome).
  // Those arrays are passed to the API via inputRef but must not cause the effect to re-run
  // when their reference changes without a content change.
  const stableKey = useMemo(() => {
    if (!enabled || !workspaceId || !description.trim() || !proAccessEnabled) return null;
    if (localSuggestionBlocksAi) return null;
    return JSON.stringify({
      workspaceId,
      surface,
      movementType,
      amount,
      currencyCode: currencyCode ?? null,
      description: description.trim(),
      occurredAt,
      categoryId,
      counterpartyId,
    });
  }, [
    enabled,
    workspaceId,
    description,
    proAccessEnabled,
    localSuggestionBlocksAi,
    surface,
    movementType,
    amount,
    currencyCode,
    occurredAt,
    categoryId,
    counterpartyId,
  ]);

  // Build the full API input (includes large arrays). Kept in a ref so the async
  // callback always uses the latest values without being an effect dependency.
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
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setAiSuggestion(null);
    setAiAttempted(false);
    if (!stableKey) {
      setIsLoading(false);
      return;
    }

    if (CACHE.has(stableKey)) {
      setAiSuggestion(CACHE.get(stableKey) ?? null);
      setIsLoading(false);
      setAiAttempted(true);
      return;
    }

    const timer = setTimeout(() => {
      const loadingStartedAt = Date.now();
      setIsLoading(true);
      void (async () => {
        const currentInput = inputRef.current;
        if (!currentInput) return;
        try {
          const response = await requestMovementRecurringAiSuggestion(currentInput);
          if (requestIdRef.current !== requestId) return;
          const recommendation = response.ok && response.recommendation && response.recommendation.confidence >= AI_CONFIDENCE_THRESHOLD
            ? { ...response.recommendation, source: "deepseek" as const }
            : null;
          CACHE.set(stableKey, recommendation);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (requestIdRef.current !== requestId) return;
          setAiSuggestion(recommendation);
        } catch {
          if (requestIdRef.current !== requestId) return;
          CACHE.set(stableKey, null);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (requestIdRef.current !== requestId) return;
          setAiSuggestion(null);
        } finally {
          if (requestIdRef.current === requestId) {
            setIsLoading(false);
            setAiAttempted(true);
          }
        }
      })();
    }, 750);

    return () => {
      clearTimeout(timer);
    };
  }, [stableKey]);

  return {
    suggestion: aiSuggestion ?? localSuggestion,
    isLoading,
    aiAttempted,
    localSuggestion,
  };
}
