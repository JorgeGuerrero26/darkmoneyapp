import type { AccountSummary, CategorySummary } from "../../../types/domain";
import type { DetectedMovementSuggestion, NotificationDetectionAppSetting } from "../../../services/queries/notification-detection";
import { filterCategoriesForMovementType } from "../../movements/lib/movement-creation-rules";
import { isoToTimeStr } from "../../../lib/date";
import { parsePositiveAmountInput } from "../../../lib/amount-parsing";

export type DetectionDraft = {
  movementType: "expense" | "income" | "transfer";
  amount: string;
  description: string;
  accountId: number | null;
  destinationAccountId: number | null;
  destinationAmount: string;
  fxRate: string;
  categoryId: number | null;
  date: string;
  time: string;
};

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function id(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Propuestas conservadoras: nunca elige otra cuenta arbitraria como destino. */
export function buildDetectionDraft(suggestion: DetectedMovementSuggestion, accounts: readonly AccountSummary[], categories: readonly CategorySummary[], settings: readonly NotificationDetectionAppSetting[]): DetectionDraft {
  const meta = object(suggestion.metadata);
  const movementType = suggestion.movementType === "unknown" ? "expense" : suggestion.movementType;
  const eligible = accounts.filter((a) => !a.isArchived && a.currencyCode === suggestion.currencyCode);
  const defaultId = settings.find((s) => s.enabled && s.financialAppKey === suggestion.financialAppKey)?.defaultAccountId;
  const proposedId = id(meta.accountId) ?? id(meta.sourceAccountId) ?? defaultId;
  const source = eligible.find((a) => a.id === proposedId) ?? (eligible.length === 1 ? eligible[0] : null);
  const destinationId = id(meta.destinationAccountId);
  const destination = accounts.find((a) => !a.isArchived && a.id === destinationId && a.id !== source?.id);
  const recommendation = object(meta.aiCategoryRecommendation);
  const proposedCategory = id(meta.categoryId) ?? id(recommendation.categoryId);
  const availableCategories = filterCategoriesForMovementType([...categories], movementType);
  const category = availableCategories.find((c) => c.id === proposedCategory);
  const occurred = new Date(suggestion.occurredAt);
  const date = Number.isNaN(occurred.getTime()) ? "" : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit" }).format(occurred);
  return {
    movementType, amount: suggestion.amount.toFixed(2), description: suggestion.description,
    accountId: source?.id ?? null, destinationAccountId: destination?.id ?? null,
    destinationAmount: destination && destination.currencyCode === source?.currencyCode ? String(suggestion.amount) : "",
    fxRate: "", categoryId: category?.id ?? null, date,
    time: Number.isNaN(occurred.getTime()) ? "" : isoToTimeStr(suggestion.occurredAt),
  };
}

export function detectionMissingFields(draft: DetectionDraft, accounts: readonly AccountSummary[], requireCategory = true): string[] {
  const missing: string[] = [];
  const source = accounts.find((a) => !a.isArchived && a.id === draft.accountId);
  const destination = accounts.find((a) => !a.isArchived && a.id === draft.destinationAccountId);
  if (!draft.description.trim()) missing.push("Escribe la descripción");
  if (!parsePositiveAmountInput(draft.amount)) missing.push("Revisa el importe");
  if (!source) missing.push(draft.movementType === "transfer" ? "Elige el origen" : "Elige una cuenta");
  if (draft.movementType === "transfer") {
    if (!destination) missing.push("Elige el destino");
    else if (source?.id === destination.id) missing.push("Elige un destino distinto del origen");
    if (source && destination && source.currencyCode !== destination.currencyCode) {
      if (!parsePositiveAmountInput(draft.destinationAmount)) missing.push("Indica cuánto llega");
      if (!parsePositiveAmountInput(draft.fxRate, { kind: "rate" })) missing.push("Revisa el tipo de cambio");
    }
  } else if (requireCategory && draft.categoryId == null) missing.push("Elige una categoría");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !/^\d{2}:\d{2}$/.test(draft.time)) missing.push("Revisa la fecha y hora");
  return missing;
}
