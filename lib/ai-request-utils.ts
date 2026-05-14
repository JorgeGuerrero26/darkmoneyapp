export const INTERACTIVE_AI_TIMEOUT_MS = 6_500;
export const AI_LOADING_MIN_VISIBLE_MS = 900;

export function isInteractiveAiEdgeFunction(name: string): boolean {
  return [
    "movement-category-ai-suggestion",
    "movement-description-ai-cleanup",
    "movement-counterparty-ai-suggestion",
    "movement-recurring-ai-suggestion",
    "notification-movement-ai-classifier",
    "movement-risk-ai-explanation",
    "movement-budget-ai-recommendation",
    "daily-ai-digest",
  ].includes(name);
}

export async function waitForMinimumVisibleTime(startedAt: number, minMs = AI_LOADING_MIN_VISIBLE_MS) {
  const remaining = minMs - (Date.now() - startedAt);
  if (remaining <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, remaining));
}
