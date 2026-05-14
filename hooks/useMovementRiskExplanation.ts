import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestMovementRiskAiExplanation,
  type MovementRiskAiExplanationInput,
} from "../services/queries/workspace-data";
import { waitForMinimumVisibleTime } from "../lib/ai-request-utils";
import {
  analyzeMovementRiskLocally,
  type MovementRiskExplanation,
  type MovementRiskItem,
} from "../lib/movement-risk-analysis";

const CACHE = new Map<string, MovementRiskExplanation | null>();

function cacheKey(input: MovementRiskAiExplanationInput) {
  return JSON.stringify({
    workspaceId: input.workspaceId,
    surface: input.surface,
    current: input.currentMovement,
    relatedIds: input.relatedMovements.map((movement) => movement.id),
    local: input.localRisk,
  });
}

type Input = {
  enabled: boolean;
  workspaceId: number | null;
  surface: MovementRiskAiExplanationInput["surface"];
  current: MovementRiskItem | null;
  history: MovementRiskItem[];
  proAccessEnabled?: boolean;
};

export function useMovementRiskExplanation({
  enabled,
  workspaceId,
  surface,
  current,
  history,
  proAccessEnabled,
}: Input) {
  const [aiExplanation, setAiExplanation] = useState<MovementRiskExplanation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const latestKeyRef = useRef<string | null>(null);

  const localRisk = useMemo(() => {
    if (!enabled) return null;
    return analyzeMovementRiskLocally(current, history);
  }, [current, enabled, history]);

  const relatedMovements = useMemo(() => {
    if (!localRisk) return [];
    return history
      .filter((movement) => localRisk.relatedMovementIds.includes(movement.id))
      .slice(0, 5);
  }, [history, localRisk]);

  const input = useMemo<MovementRiskAiExplanationInput | null>(() => {
    if (!enabled || !workspaceId || !current || !localRisk || !proAccessEnabled) return null;
    if (relatedMovements.length === 0) return null;
    return {
      workspaceId,
      surface,
      currentMovement: {
        movementType: current.movementType,
        occurredAt: current.occurredAt,
        description: current.description,
        amount: current.amount,
        categoryName: current.categoryName ?? null,
        counterpartyName: current.counterpartyName ?? null,
      },
      relatedMovements: relatedMovements.map((movement) => ({
        id: movement.id,
        movementType: movement.movementType,
        occurredAt: movement.occurredAt,
        description: movement.description,
        amount: movement.amount,
        categoryName: movement.categoryName ?? null,
        counterpartyName: movement.counterpartyName ?? null,
      })),
      localRisk: {
        kind: localRisk.kind,
        severity: localRisk.severity,
        confidence: localRisk.confidence,
        title: localRisk.title,
        explanation: localRisk.explanation,
        reasons: localRisk.reasons,
        relatedMovementIds: localRisk.relatedMovementIds,
      },
    };
  }, [current, enabled, localRisk, proAccessEnabled, relatedMovements, surface, workspaceId]);

  // Stable key string — prevents effect re-runs when input reference changes
  // but content hasn't changed.
  const key = useMemo(() => (input ? cacheKey(input) : null), [input]);

  // Keep input in a ref so the async callback uses the latest value
  // without being an effect dependency.
  const inputRef = useRef(input);
  inputRef.current = input;

  useEffect(() => {
    setAiExplanation(null);
    latestKeyRef.current = key;
    if (!key) {
      setIsLoading(false);
      return;
    }
    if (CACHE.has(key)) {
      setAiExplanation(CACHE.get(key) ?? null);
      setIsLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      const loadingStartedAt = Date.now();
      setIsLoading(true);
      void (async () => {
        const currentInput = inputRef.current;
        if (!currentInput) return;
        try {
          const response = await requestMovementRiskAiExplanation(currentInput);
          const explanation = response.ok && response.explanation && response.explanation.confidence >= 0.65
            ? { ...response.explanation, source: "deepseek" as const }
            : null;
          CACHE.set(key, explanation);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current === key) setAiExplanation(explanation);
        } catch {
          CACHE.set(key, null);
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current === key) setAiExplanation(null);
        } finally {
          if (latestKeyRef.current === key) setIsLoading(false);
        }
      })();
    }, 700);
    return () => clearTimeout(timer);
  }, [key]);

  return {
    risk: aiExplanation ?? localRisk,
    localRisk,
    isLoading,
  };
}
