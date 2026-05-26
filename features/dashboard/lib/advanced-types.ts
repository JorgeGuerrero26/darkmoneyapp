import type { DashboardMovementRow } from "./dashboard-row";

export type DashboardCategorySuggestion = {
  movementId: number;
  description: string;
  occurredAt: string;
  amount: number;
  suggestedCategoryId: number;
  suggestedCategoryName: string;
  confidence: number;
  matchedSamples: number;
  reasons: string[];
};

export type DashboardProjectionModel = {
  expectedBalance: number;
  conservativeBalance: number;
  optimisticBalance: number;
  monteCarloLowBalance: number;
  monteCarloMedianBalance: number;
  monteCarloHighBalance: number;
  pressureThreshold: number;
  pressureProbability: number;
  committedInflow: number;
  committedOutflow: number;
  variableIncomeProjection: number;
  variableExpenseProjection: number;
  confidence: number;
  confidenceLabel: string;
  remainingDays: number;
};

export type DashboardAnomalyFinding = {
  key: string;
  movementId: number;
  title: string;
  body: string;
  meta: string;
  level: "strong" | "review";
  score: number;
  reasons: string[];
};

export type MovementPreviewSheetState = {
  title: string;
  subtitle: string;
  scopeLabel: string;
  emptyTitle?: string;
  emptyBody?: string;
  movements: DashboardMovementRow[];
  suggestion?: {
    movementId: number;
    description: string;
    categoryId: number;
    categoryName: string;
    confidencePct: number;
  };
};

export type ExplanationTone = "positive" | "warning" | "danger";

export function explanationToneLabel(tone: ExplanationTone) {
  if (tone === "positive") return "Lectura favorable";
  if (tone === "danger") return "Lectura en presión";
  return "Lectura para vigilar";
}
