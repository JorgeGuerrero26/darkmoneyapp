import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestMovementBudgetAiRecommendation,
  type MovementBudgetAiRecommendationInput,
} from "../services/queries/workspace-data";
import { waitForMinimumVisibleTime } from "../lib/ai-request-utils";
import {
  analyzeMovementBudgetImpactLocally,
  type MovementBudgetImpact,
  type MovementBudgetInput,
} from "../lib/movement-budget-impact";
import type { BudgetOverview, ExchangeRateSummary } from "../types/domain";

const CACHE = new Map<string, MovementBudgetImpact | null>();

function cacheKey(input: MovementBudgetAiRecommendationInput) {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    surface: input.surface,
    movement: input.movement,
    budgetImpact: input.budgetImpact,
  });
}

type Input = {
  enabled: boolean;
  workspaceId: number | null;
  surface: MovementBudgetAiRecommendationInput["surface"];
  movement: (MovementBudgetInput & {
    description?: string | null;
    categoryName?: string | null;
    counterpartyName?: string | null;
    accountName?: string | null;
  }) | null;
  budgets: BudgetOverview[];
  exchangeRates: ExchangeRateSummary[];
  workspaceBaseCurrencyCode: string;
  proAccessEnabled?: boolean;
};

export function useMovementBudgetImpact({
  enabled,
  workspaceId,
  surface,
  movement,
  budgets,
  exchangeRates,
  workspaceBaseCurrencyCode,
  proAccessEnabled,
}: Input) {
  const [aiImpact, setAiImpact] = useState<MovementBudgetImpact | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const latestKeyRef = useRef<string | null>(null);

  const localImpact = useMemo(() => {
    if (!enabled) return null;
    return analyzeMovementBudgetImpactLocally({
      movement,
      budgets,
      exchangeRates,
      workspaceBaseCurrencyCode,
    });
  }, [budgets, enabled, exchangeRates, movement, workspaceBaseCurrencyCode]);

  const input = useMemo<MovementBudgetAiRecommendationInput | null>(() => {
    if (!workspaceId || !movement || !localImpact || !proAccessEnabled) return null;
    if (localImpact.severity !== "high") return null;
    return {
      workspaceId,
      surface,
      movement: {
        movementType: movement.movementType,
        occurredAt: movement.occurredAt,
        description: movement.description?.trim() || "Movimiento",
        amount: movement.amount,
        currencyCode: movement.currencyCode,
        categoryName: movement.categoryName ?? null,
        counterpartyName: movement.counterpartyName ?? null,
        accountName: movement.accountName ?? null,
      },
      budgetImpact: {
        budgetId: localImpact.budgetId,
        budgetName: localImpact.budgetName,
        currencyCode: localImpact.currencyCode,
        impactAmount: localImpact.impactAmount,
        previousSpentAmount: localImpact.previousSpentAmount,
        projectedSpentAmount: localImpact.projectedSpentAmount,
        limitAmount: localImpact.limitAmount,
        previousUsedPercent: localImpact.previousUsedPercent,
        projectedUsedPercent: localImpact.projectedUsedPercent,
        overAmount: localImpact.overAmount,
        severity: localImpact.severity,
        confidence: localImpact.confidence,
        reasons: localImpact.reasons,
      },
    };
  }, [localImpact, movement, proAccessEnabled, surface, workspaceId]);

  // Stable key string — prevents effect re-runs when input reference changes
  // but content hasn't changed.
  const key = useMemo(() => (input ? cacheKey(input) : null), [input]);

  // Keep input and localImpact in refs so async callbacks use latest values
  // without being effect dependencies.
  const inputRef = useRef(input);
  inputRef.current = input;
  const localImpactRef = useRef(localImpact);
  localImpactRef.current = localImpact;

  useEffect(() => {
    setAiImpact(null);
    latestKeyRef.current = key;
    if (!key) {
      setIsLoading(false);
      return;
    }
    if (CACHE.has(key)) {
      setAiImpact(CACHE.get(key) ?? null);
      setIsLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      const loadingStartedAt = Date.now();
      setIsLoading(true);
      void (async () => {
        const currentInput = inputRef.current;
        const currentLocalImpact = localImpactRef.current;
        if (!currentInput) return;
        try {
          const response = await requestMovementBudgetAiRecommendation(currentInput);
          const recommendation = response.ok && response.recommendation && response.recommendation.confidence >= 0.65 && currentLocalImpact
            ? {
              ...currentLocalImpact,
              severity: response.recommendation.severity,
              confidence: response.recommendation.confidence,
              title: response.recommendation.title,
              recommendation: response.recommendation.recommendation,
              reasons: response.recommendation.reasons,
              source: "deepseek" as const,
            }
            : null;
          CACHE.set(key, recommendation);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current === key) setAiImpact(recommendation);
        } catch {
          CACHE.set(key, null);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current === key) setAiImpact(null);
        } finally {
          if (latestKeyRef.current === key) setIsLoading(false);
        }
      })();
    }, 700);
    return () => clearTimeout(timer);
  }, [key]);

  return {
    impact: aiImpact ?? localImpact,
    localImpact,
    isLoading,
  };
}
