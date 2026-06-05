import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestMovementCategoryAiSuggestion,
  type MovementCategoryAiRecommendation,
  type MovementCategoryAiSuggestionInput,
} from "../services/queries/workspace-data";
import { waitForMinimumVisibleTime } from "../lib/ai-request-utils";
import { withTimeout } from "../lib/promise-utils";

/**
 * Estado terminal observable de la IA de categoría, para que la UI sea
 * transparente con el usuario (saber si la IA está corriendo, resolvió,
 * no encontró nada, falló, o se omitió por no ser Pro).
 * - `idle`: no se intentó (deshabilitado, no-Pro, input insuficiente).
 * - `running`: llamada en vuelo.
 * - `resolved`: la IA devolvió una recomendación usable (>= minConfidence).
 * - `no_suggestion`: la IA corrió pero no produjo nada usable.
 * - `error`: la llamada falló o hizo timeout.
 */
export type CategoryAiOutcome = "idle" | "running" | "resolved" | "no_suggestion" | "error";

type Params = {
  enabled: boolean;
  input: MovementCategoryAiSuggestionInput | null;
  proAccessEnabled?: boolean;
  minConfidence?: number;
  debounceMs?: number;
  /** Tiempo máximo antes de resolver a `error`. Alineado con la ventana de staleness del runtime sync (~12s). */
  timeoutMs?: number;
};

type State = {
  recommendation: MovementCategoryAiRecommendation | null;
  isLoading: boolean;
  aiAttempted: boolean;
  outcome: CategoryAiOutcome;
};

type CachedResult = {
  recommendation: MovementCategoryAiRecommendation | null;
  outcome: Extract<CategoryAiOutcome, "resolved" | "no_suggestion" | "error">;
};

const responseCache = new Map<string, CachedResult>();

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
  proAccessEnabled,
  minConfidence = 0.65,
  debounceMs = 700,
  timeoutMs = 12_000,
}: Params): State {
  const [state, setState] = useState<State>({ recommendation: null, isLoading: false, aiAttempted: false, outcome: "idle" });
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
      setState({ recommendation: null, isLoading: false, aiAttempted: false, outcome: "idle" });
      return;
    }

    // Gate Pro centralizado (espejo de useMovementCounterpartyAiSuggestion):
    // si no es Pro no llamamos al edge function; la UI muestra solo-local sin spinner.
    if (proAccessEnabled === false) {
      latestKeyRef.current = null;
      setState({ recommendation: null, isLoading: false, aiAttempted: false, outcome: "idle" });
      return;
    }

    latestKeyRef.current = key;
    const cached = responseCache.get(key);
    if (cached) {
      setState({
        recommendation: cached.recommendation,
        isLoading: false,
        aiAttempted: true,
        outcome: cached.outcome,
      });
      return;
    }

    setState((prev) => ({ ...prev, recommendation: null, aiAttempted: false, outcome: "idle" }));
    const timer = setTimeout(() => {
      const loadingStartedAt = Date.now();
      setState((prev) => ({ ...prev, isLoading: true, outcome: "running" }));
      void (async () => {
        const currentInput = inputRef.current;
        if (!currentInput) return;
        try {
          const response = await withTimeout(
            requestMovementCategoryAiSuggestion(currentInput),
            timeoutMs,
            "movement-category-ai-suggestion",
          );
          const raw = response.ok ? response.recommendation : null;
          const recommendation = raw && raw.confidence >= minConfidence ? raw : null;
          const outcome: CachedResult["outcome"] = recommendation ? "resolved" : "no_suggestion";
          responseCache.set(key, { recommendation, outcome });
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current !== key) return;
          setState({ recommendation, isLoading: false, aiAttempted: true, outcome });
        } catch {
          responseCache.set(key, { recommendation: null, outcome: "error" });
          await waitForMinimumVisibleTime(loadingStartedAt);
          if (latestKeyRef.current !== key) return;
          setState({ recommendation: null, isLoading: false, aiAttempted: true, outcome: "error" });
        }
      })();
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [debounceMs, enabled, key, minConfidence, proAccessEnabled, timeoutMs]);

  return state;
}
