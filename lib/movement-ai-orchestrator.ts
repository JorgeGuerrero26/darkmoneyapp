import { requestMovementCategoryAiSuggestion } from "../services/queries/workspace-data";
import { scoreCategoryFromDescription, type PatternMaps } from "./movement-patterns";

/**
 * Shared category-AI orchestrator used by both the headless Android task
 * (background, partial patternMaps) and the runtime sync hook (foreground,
 * full snapshot). Keeping the decision logic in one place ensures the quick
 * register suggestions match the quality of the main movement form.
 *
 * Pure module: do NOT import React, hooks, or RN bridges from here.
 */

export const LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD = 0.6;

export type CategoryCandidate = {
  id: number;
  name: string;
  kind: "expense" | "income" | "both";
};

export type CategoryAiRecommendationResult =
  | {
    /**
     * `local_confident` — no AI call was made; local score is strong enough.
     * `local_only` — local available but weak; AI was skipped (no Pro / no workspace).
     * `ai_resolved` — AI returned a recommendation.
     * `ai_unavailable` — AI call failed or returned nothing usable.
     * `skipped` — input was insufficient (no description, no categories, etc.).
     */
    status: "local_confident" | "local_only" | "ai_resolved" | "ai_unavailable" | "skipped";
    recommendation: unknown | null;
    localSuggestion: {
      categoryId: number;
      categoryName: string;
      confidence: number;
      reasons: string[];
    } | null;
  };

export type CategoryAiOrchestratorInput = {
  workspaceId: number;
  movementType: "expense" | "income";
  description: string;
  amount: number | null;
  currencyCode: string;
  occurredAt: string;
  surface: "movement_form" | "notification_form" | "android_overlay";
  categories: CategoryCandidate[];
  patternMaps: PatternMaps;
  /**
   * Whether to call the remote AI when local confidence is insufficient.
   * Headless tasks may want this true; runtime sync passes this based on Pro entitlement.
   */
  canCallAi: boolean;
};

/**
 * Computes the local category score and (optionally) calls the remote AI.
 * The caller is responsible for persisting the result (e.g. via the native bridge).
 */
export async function orchestrateCategoryAiRecommendation(
  input: CategoryAiOrchestratorInput,
): Promise<CategoryAiRecommendationResult> {
  const description = input.description.trim();
  if (!description || input.categories.length === 0) {
    return { status: "skipped", recommendation: null, localSuggestion: null };
  }

  const scoredLocal = scoreCategoryFromDescription(description, input.patternMaps);
  const localCategory = scoredLocal
    ? input.categories.find((category) => category.id === scoredLocal.categoryId) ?? null
    : null;
  const localSuggestion = scoredLocal && localCategory
    ? {
      categoryId: localCategory.id,
      categoryName: localCategory.name,
      confidence: scoredLocal.confidence,
      reasons: scoredLocal.reasons,
    }
    : null;

  if (localSuggestion && localSuggestion.confidence >= LOCAL_CATEGORY_AI_CONFIDENCE_THRESHOLD) {
    return { status: "local_confident", recommendation: null, localSuggestion };
  }

  if (!input.canCallAi) {
    return { status: "local_only", recommendation: null, localSuggestion };
  }

  const response = await requestMovementCategoryAiSuggestion({
    workspaceId: input.workspaceId,
    surface: input.surface,
    movementType: input.movementType,
    amount: input.amount,
    currencyCode: input.currencyCode,
    description,
    occurredAt: input.occurredAt,
    categories: input.categories,
    localSuggestion,
  }).catch(() => null);

  if (!response?.ok || !response.recommendation) {
    return { status: "ai_unavailable", recommendation: null, localSuggestion };
  }
  return { status: "ai_resolved", recommendation: response.recommendation, localSuggestion };
}

/**
 * Helper to filter a categories array by movement type compatibility.
 * Reuses the same logic used in both the headless task and the runtime sync.
 */
export function filterCategoriesForMovementType(
  categories: ReadonlyArray<{ id: number; name: string; kind: string; isActive?: boolean }>,
  movementType: "expense" | "income",
): CategoryCandidate[] {
  const compatible = movementType === "income" ? "income" : "expense";
  const out: CategoryCandidate[] = [];
  const seen = new Set<number>();
  for (const category of categories) {
    if (category.isActive === false) continue;
    if (category.kind !== "both" && category.kind !== compatible) continue;
    const id = Number(category.id);
    const name = String(category.name ?? "").trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, kind: category.kind === "income" || category.kind === "both" ? category.kind : "expense" });
  }
  return out;
}
