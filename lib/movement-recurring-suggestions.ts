import type {
  CategorySummary,
  CounterpartySummary,
  RecurringIncomeSummary,
  SubscriptionFrequency,
  SubscriptionSummary,
} from "../types/domain";
import { normalizeAnalyticsText } from "../services/analytics/movement-features";

export type MovementRecurringSuggestionSurface = "movement_form" | "notification_form" | "android_overlay";

export type MovementRecurringKind = "subscription" | "recurring_income" | "none";
export type MovementRecurringFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export type MovementRecurringHistoryItem = {
  id: number;
  movementType: string;
  occurredAt: string;
  description: string;
  amount: number;
  currencyCode?: string | null;
  categoryId?: number | null;
  counterpartyId?: number | null;
};

export type MovementRecurringSuggestionResult = {
  type: MovementRecurringKind;
  name: string | null;
  frequency: MovementRecurringFrequency | null;
  intervalCount: number | null;
  confidence: number;
  reasons: string[];
  source: "local" | "deepseek";
};

type Input = {
  movementType: "expense" | "income";
  description: string;
  amount: number | null;
  currencyCode?: string | null;
  occurredAt: string;
  category?: Pick<CategorySummary, "id" | "name"> | null;
  counterparty?: Pick<CounterpartySummary, "id" | "name"> | null;
  recentMovements: MovementRecurringHistoryItem[];
  subscriptions?: Pick<SubscriptionSummary, "name" | "amount" | "currencyCode" | "status" | "vendorPartyId" | "categoryId">[];
  recurringIncome?: Pick<RecurringIncomeSummary, "name" | "amount" | "currencyCode" | "status" | "payerPartyId" | "categoryId">[];
};

const SUBSCRIPTION_WORDS = [
  "suscripcion",
  "subscription",
  "mensualidad",
  "membresia",
  "netflix",
  "spotify",
  "disney",
  "prime",
  "icloud",
  "google",
  "youtube",
  "gym",
  "gimnasio",
  "hosting",
  "software",
  "plan",
];

const INCOME_WORDS = ["sueldo", "salario", "nomina", "planilla", "honorarios", "alquiler", "renta", "pension"];

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(left: string, right: string) {
  const a = parseDate(left);
  const b = parseDate(right);
  if (!a || !b) return null;
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86_400_000));
}

function textSimilarity(left: string, right: string) {
  const leftTokens = new Set(normalizeAnalyticsText(left).split(" ").filter((token) => token.length >= 3));
  const rightTokens = new Set(normalizeAnalyticsText(right).split(" ").filter((token) => token.length >= 3));
  const all = new Set([...leftTokens, ...rightTokens]);
  if (all.size === 0) return 0;
  let overlap = 0;
  for (const token of all) {
    if (leftTokens.has(token) && rightTokens.has(token)) overlap += 1;
  }
  return overlap / all.size;
}

function amountSimilarity(current: number | null, candidate: number) {
  if (!current || !Number.isFinite(current) || current <= 0 || !Number.isFinite(candidate) || candidate <= 0) return 0;
  const diffRatio = Math.abs(current - candidate) / Math.max(current, candidate);
  if (diffRatio <= 0.01) return 1;
  if (diffRatio <= 0.05) return 0.82;
  if (diffRatio <= 0.1) return 0.58;
  return 0;
}

function inferFrequencyFromDays(days: number | null): { frequency: MovementRecurringFrequency; intervalCount: number } | null {
  if (!days) return null;
  if (days >= 6 && days <= 8) return { frequency: "weekly", intervalCount: 1 };
  if (days >= 13 && days <= 16) return { frequency: "biweekly", intervalCount: 2 };
  if (days >= 27 && days <= 33) return { frequency: "monthly", intervalCount: 1 };
  if (days >= 84 && days <= 96) return { frequency: "quarterly", intervalCount: 1 };
  if (days >= 350 && days <= 380) return { frequency: "yearly", intervalCount: 1 };
  return null;
}

function titleFromInput(input: Input) {
  const counterpartyName = input.counterparty?.name?.trim();
  if (counterpartyName) return counterpartyName;
  const normalized = input.description.trim().replace(/\s+/g, " ");
  if (!normalized) return input.movementType === "income" ? "Ingreso fijo" : "Suscripción";
  return normalized.length > 48 ? normalized.slice(0, 48).trim() : normalized;
}

function hasExistingSimilar(input: Input) {
  const pool = input.movementType === "income" ? input.recurringIncome ?? [] : input.subscriptions ?? [];
  const counterpartyId = input.counterparty?.id ?? null;
  const categoryId = input.category?.id ?? null;
  const normalizedDescription = normalizeAnalyticsText(input.description);
  return pool.some((item) => {
    if (item.status !== "active") return false;
    const sameCurrency = !input.currencyCode || item.currencyCode.toUpperCase() === input.currencyCode.toUpperCase();
    const amountClose = amountSimilarity(input.amount, item.amount) >= 0.82;
    const sameParty = counterpartyId != null && (
      input.movementType === "income"
        ? (item as Pick<RecurringIncomeSummary, "payerPartyId">).payerPartyId === counterpartyId
        : (item as Pick<SubscriptionSummary, "vendorPartyId">).vendorPartyId === counterpartyId
    );
    const sameCategory = categoryId != null && item.categoryId === categoryId;
    const similarName = normalizedDescription && textSimilarity(normalizedDescription, item.name) >= 0.7;
    return sameCurrency && amountClose && (sameParty || sameCategory || similarName);
  });
}

export function recurringFrequencyToSubscriptionFields(
  frequency: MovementRecurringFrequency,
): { frequency: SubscriptionFrequency; intervalCount: number } {
  if (frequency === "biweekly") return { frequency: "weekly", intervalCount: 2 };
  return { frequency, intervalCount: 1 };
}

export function recurringFrequencyLabel(frequency: MovementRecurringFrequency | null) {
  switch (frequency) {
    case "weekly": return "semanal";
    case "biweekly": return "quincenal";
    case "monthly": return "mensual";
    case "quarterly": return "trimestral";
    case "yearly": return "anual";
    default: return "recurrente";
  }
}

export function suggestRecurringLocally(input: Input): MovementRecurringSuggestionResult | null {
  if (!input.description.trim() || input.movementType === "expense" && (!input.amount || input.amount <= 0)) return null;
  if (hasExistingSimilar(input)) return null;

  const normalizedDescription = normalizeAnalyticsText(input.description);
  const kind: Exclude<MovementRecurringKind, "none"> = input.movementType === "income" ? "recurring_income" : "subscription";
  const candidates = input.recentMovements
    .filter((movement) => movement.movementType === input.movementType)
    .filter((movement) => {
      const sameCounterparty = input.counterparty?.id != null && movement.counterpartyId === input.counterparty.id;
      const sameCategory = input.category?.id != null && movement.categoryId === input.category.id;
      const similarDescription = normalizedDescription && textSimilarity(normalizedDescription, movement.description) >= 0.55;
      const similarAmount = amountSimilarity(input.amount, movement.amount) >= 0.58;
      return similarAmount && (sameCounterparty || sameCategory || similarDescription);
    })
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, 4);

  const firstInterval = candidates[0] ? daysBetween(input.occurredAt, candidates[0].occurredAt) : null;
  const inferred = inferFrequencyFromDays(firstInterval);
  const lexicalHit = (kind === "subscription" ? SUBSCRIPTION_WORDS : INCOME_WORDS)
    .some((word) => normalizedDescription.includes(word));

  if (!inferred && !lexicalHit) return null;

  const reasons: string[] = [];
  let confidence = 0.42;
  if (inferred) {
    confidence += 0.22;
    reasons.push(`se repite de forma ${recurringFrequencyLabel(inferred.frequency)}`);
  }
  if (candidates.length >= 2) {
    confidence += 0.14;
    reasons.push("ya hubo movimientos parecidos");
  }
  if (input.counterparty?.id) {
    confidence += 0.08;
    reasons.push("misma contraparte");
  }
  if (lexicalHit) {
    confidence += 0.1;
    reasons.push(kind === "subscription" ? "parece un cargo fijo" : "parece un ingreso fijo");
  }

  const frequency = inferred?.frequency ?? (lexicalHit ? "monthly" : null);
  if (!frequency) return null;
  return {
    type: kind,
    name: titleFromInput(input),
    frequency,
    intervalCount: inferred?.intervalCount ?? 1,
    confidence: Math.min(0.88, confidence),
    reasons: reasons.slice(0, 3),
    source: "local",
  };
}
