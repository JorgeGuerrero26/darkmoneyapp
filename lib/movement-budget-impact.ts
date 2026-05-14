import type { BudgetOverview, ExchangeRateSummary } from "../types/domain";

export type MovementBudgetImpactSource = "local" | "deepseek";

export type MovementBudgetInput = {
  movementType: string;
  occurredAt: string;
  description?: string | null;
  amount: number;
  currencyCode: string;
  categoryId?: number | null;
  categoryName?: string | null;
  counterpartyName?: string | null;
  accountId?: number | null;
  accountName?: string | null;
};

export type MovementBudgetImpact = {
  budgetId: number;
  budgetName: string;
  currencyCode: string;
  impactAmount: number;
  previousSpentAmount: number;
  projectedSpentAmount: number;
  limitAmount: number;
  previousUsedPercent: number;
  projectedUsedPercent: number;
  overAmount: number;
  severity: "low" | "medium" | "high";
  confidence: number;
  title: string;
  recommendation: string;
  reasons: string[];
  source: MovementBudgetImpactSource;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function ymd(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function buildRateMap(rates: ExchangeRateSummary[]) {
  const map = new Map<string, number>();
  for (const rate of rates) {
    const from = rate.fromCurrencyCode.trim().toUpperCase();
    const to = rate.toCurrencyCode.trim().toUpperCase();
    if (!from || !to || !Number.isFinite(rate.rate) || rate.rate <= 0) continue;
    if (!map.has(`${from}:${to}`)) map.set(`${from}:${to}`, rate.rate);
  }
  return map;
}

function resolveRate(rateMap: Map<string, number>, fromCurrencyCode: string, toCurrencyCode: string, baseCurrencyCode: string): number | null {
  const from = fromCurrencyCode.trim().toUpperCase();
  const to = toCurrencyCode.trim().toUpperCase();
  const base = baseCurrencyCode.trim().toUpperCase();
  if (!from || !to) return null;
  if (from === to) return 1;
  const direct = rateMap.get(`${from}:${to}`);
  if (direct) return direct;
  const inverse = rateMap.get(`${to}:${from}`);
  if (inverse) return 1 / inverse;
  if (from !== base && to !== base) {
    const toBase = resolveRate(rateMap, from, base, base);
    const baseToTarget = resolveRate(rateMap, base, to, base);
    if (toBase && baseToTarget) return toBase * baseToTarget;
  }
  return null;
}

function convertAmount(amount: number, fromCurrencyCode: string, toCurrencyCode: string, exchangeRates: ExchangeRateSummary[], baseCurrencyCode: string) {
  const rate = resolveRate(buildRateMap(exchangeRates), fromCurrencyCode, toCurrencyCode, baseCurrencyCode);
  return round2(amount * (rate ?? 1));
}

function severityFromPercent(
  projectedUsedPercent: number,
  previousUsedPercent: number,
  alertPercent: number,
): MovementBudgetImpact["severity"] {
  if (projectedUsedPercent >= 100) return "high";
  if (projectedUsedPercent >= Math.max(90, alertPercent || 90)) return "high";
  if (projectedUsedPercent >= Math.max(80, alertPercent || 80)) return "medium";
  if (previousUsedPercent < (alertPercent || 80) && projectedUsedPercent >= (alertPercent || 80)) return "medium";
  return "low";
}

function localTitle(severity: MovementBudgetImpact["severity"], projectedUsedPercent: number) {
  if (projectedUsedPercent >= 100) return "Presupuesto superado";
  if (severity === "high") return "Presupuesto al límite";
  if (severity === "medium") return "Presupuesto sensible";
  return "Impacto de presupuesto";
}

export function analyzeMovementBudgetImpactLocally(input: {
  movement: MovementBudgetInput | null;
  budgets: BudgetOverview[];
  exchangeRates: ExchangeRateSummary[];
  workspaceBaseCurrencyCode: string;
}): MovementBudgetImpact | null {
  const movement = input.movement;
  if (!movement || movement.movementType !== "expense" || movement.amount <= 0) return null;
  const occurredOn = ymd(movement.occurredAt);
  const candidates = input.budgets
    .filter((budget) => budget.isActive)
    .filter((budget) => occurredOn >= budget.periodStart && occurredOn <= budget.periodEnd)
    .filter((budget) => budget.categoryId == null || budget.categoryId === movement.categoryId)
    .filter((budget) => budget.accountId == null || budget.accountId === movement.accountId)
    .map((budget) => {
      const impactAmount = convertAmount(
        movement.amount,
        movement.currencyCode,
        budget.currencyCode,
        input.exchangeRates,
        input.workspaceBaseCurrencyCode,
      );
      const projectedSpentAmount = round2(budget.spentAmount + impactAmount);
      const projectedUsedPercent = budget.limitAmount > 0 ? round2((projectedSpentAmount / budget.limitAmount) * 100) : 0;
      const previousUsedPercent = budget.usedPercent;
      const severity = severityFromPercent(projectedUsedPercent, previousUsedPercent, budget.alertPercent);
      const overAmount = Math.max(0, round2(projectedSpentAmount - budget.limitAmount));
      const confidence = severity === "high" ? 0.88 : severity === "medium" ? 0.74 : 0.55;
      const reasons = [
        projectedUsedPercent >= 100 ? "supera el límite" : null,
        previousUsedPercent < budget.alertPercent && projectedUsedPercent >= budget.alertPercent ? "cruza la alerta" : null,
        budget.categoryName ? `categoría ${budget.categoryName}` : null,
        budget.accountName ? `cuenta ${budget.accountName}` : null,
      ].filter((reason): reason is string => Boolean(reason));
      return {
        budgetId: budget.id,
        budgetName: budget.name,
        currencyCode: budget.currencyCode,
        impactAmount,
        previousSpentAmount: round2(budget.spentAmount),
        projectedSpentAmount,
        limitAmount: round2(budget.limitAmount),
        previousUsedPercent,
        projectedUsedPercent,
        overAmount,
        severity,
        confidence,
        title: localTitle(severity, projectedUsedPercent),
        recommendation: overAmount > 0
          ? `Este movimiento dejaría "${budget.name}" sobre el límite por ${budget.currencyCode} ${overAmount.toFixed(2)}.`
          : `Este movimiento dejaría "${budget.name}" al ${Math.round(projectedUsedPercent)}% del presupuesto.`,
        reasons: reasons.length ? reasons : ["impacta un presupuesto activo"],
        source: "local" as const,
      };
    })
    .filter((impact) => impact.severity !== "low")
    .sort((left, right) => {
      const severityScore = { high: 2, medium: 1, low: 0 };
      return severityScore[right.severity] - severityScore[left.severity] || right.projectedUsedPercent - left.projectedUsedPercent;
    });

  return candidates[0] ?? null;
}
