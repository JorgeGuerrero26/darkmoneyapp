import type { BudgetOverview, ExchangeRateSummary } from "../types/domain";
import { isoToDateStr } from "./date";
import { movementActsAsExpense, movementIsTransfer } from "./movement-display";

export type BudgetScopedMovement = {
  id: number;
  movementType: string;
  occurredAt: string;
  description: string | null;
  categoryId: number | null;
  categoryName: string | null;
  sourceAccountId: number | null;
  sourceAccountName: string | null;
  sourceCurrencyCode: string | null;
  sourceAmount: number | null;
  destinationAccountId: number | null;
  destinationAccountName: string | null;
  destinationCurrencyCode: string | null;
  destinationAmount: number | null;
};

export type BudgetContribution = {
  movementId: number;
  occurredAt: string;
  movementType: string;
  description: string;
  categoryName: string | null;
  accountName: string | null;
  nativeAmount: number;
  nativeCurrencyCode: string;
  amountInBudgetCurrency: number;
  shareOfBudget: number;
  shareOfSpent: number;
};

export type BudgetComputedMetrics = {
  spentAmount: number;
  remainingAmount: number;
  usedPercent: number;
  movementCount: number;
  contributions: BudgetContribution[];
  averageMovementAmount: number;
  maxMovementAmount: number;
};

type BudgetMetricsContext = {
  workspaceBaseCurrencyCode: string;
  exchangeRates: ExchangeRateSummary[];
};

type ExpenseSide = {
  amount: number;
  currencyCode: string;
  accountId: number | null;
  accountName: string | null;
};

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeCurrency(code: string | null | undefined, fallback: string) {
  const normalized = code?.trim().toUpperCase();
  return normalized && normalized.length > 0 ? normalized : fallback.trim().toUpperCase();
}

function buildRateMap(rates: ExchangeRateSummary[]) {
  const map = new Map<string, number>();
  for (const rate of rates) {
    const from = rate.fromCurrencyCode.trim().toUpperCase();
    const to = rate.toCurrencyCode.trim().toUpperCase();
    if (!from || !to || !Number.isFinite(rate.rate) || rate.rate <= 0) continue;
    const key = `${from}:${to}`;
    if (!map.has(key)) map.set(key, rate.rate);
  }
  return map;
}

function resolveRate(
  rateMap: Map<string, number>,
  fromCurrencyCode: string,
  toCurrencyCode: string,
  workspaceBaseCurrencyCode: string,
): number | null {
  const from = fromCurrencyCode.trim().toUpperCase();
  const to = toCurrencyCode.trim().toUpperCase();
  const base = workspaceBaseCurrencyCode.trim().toUpperCase();
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

function convertAmount(
  amount: number,
  fromCurrencyCode: string,
  toCurrencyCode: string,
  rateMap: Map<string, number>,
  workspaceBaseCurrencyCode: string,
): number {
  const rate = resolveRate(rateMap, fromCurrencyCode, toCurrencyCode, workspaceBaseCurrencyCode);
  if (!rate) return amount;
  return amount * rate;
}

function readExpenseSide(
  movement: BudgetScopedMovement,
  workspaceBaseCurrencyCode: string,
): ExpenseSide | null {
  if (movementIsTransfer(movement) || !movementActsAsExpense(movement)) return null;

  const rawAmount = Math.abs(Number(movement.sourceAmount ?? movement.destinationAmount ?? 0));
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) return null;

  return {
    amount: rawAmount,
    currencyCode: normalizeCurrency(
      movement.sourceCurrencyCode ?? movement.destinationCurrencyCode,
      workspaceBaseCurrencyCode,
    ),
    accountId: movement.sourceAccountId ?? movement.destinationAccountId ?? null,
    accountName: movement.sourceAccountName ?? movement.destinationAccountName ?? null,
  };
}

function movementMatchesBudget(
  budget: BudgetOverview,
  movement: BudgetScopedMovement,
  expenseSide: ExpenseSide,
) {
  const occurredOn = isoToDateStr(movement.occurredAt);
  if (occurredOn < budget.periodStart || occurredOn > budget.periodEnd) return false;
  if (budget.categoryId != null && movement.categoryId !== budget.categoryId) return false;
  if (budget.accountId != null && expenseSide.accountId !== budget.accountId) return false;
  return true;
}

export function buildBudgetComputedMetrics(
  budget: BudgetOverview,
  movements: BudgetScopedMovement[],
  context: BudgetMetricsContext,
): BudgetComputedMetrics {
  const rateMap = buildRateMap(context.exchangeRates);
  const budgetCurrencyCode = normalizeCurrency(budget.currencyCode, context.workspaceBaseCurrencyCode);
  const rawContributions: BudgetContribution[] = [];

  for (const movement of movements) {
    const expenseSide = readExpenseSide(movement, context.workspaceBaseCurrencyCode);
    if (!expenseSide) continue;
    if (!movementMatchesBudget(budget, movement, expenseSide)) continue;

    const converted = convertAmount(
      expenseSide.amount,
      expenseSide.currencyCode,
      budgetCurrencyCode,
      rateMap,
      context.workspaceBaseCurrencyCode,
    );

    rawContributions.push({
      movementId: movement.id,
      occurredAt: movement.occurredAt,
      movementType: movement.movementType,
      description: movement.description?.trim() || "Sin descripción",
      categoryName: movement.categoryName,
      accountName: expenseSide.accountName,
      nativeAmount: round2(expenseSide.amount),
      nativeCurrencyCode: expenseSide.currencyCode,
      amountInBudgetCurrency: round2(converted),
      shareOfBudget: 0,
      shareOfSpent: 0,
    });
  }

  rawContributions.sort(
    (left, right) =>
      right.occurredAt.localeCompare(left.occurredAt) ||
      right.amountInBudgetCurrency - left.amountInBudgetCurrency ||
      right.movementId - left.movementId,
  );

  const spentAmount = round2(
    rawContributions.reduce((sum, contribution) => sum + contribution.amountInBudgetCurrency, 0),
  );
  const remainingAmount = round2(budget.limitAmount - spentAmount);
  const usedPercent = budget.limitAmount > 0 ? round2((spentAmount / budget.limitAmount) * 100) : 0;
  const movementCount = rawContributions.length;
  const averageMovementAmount =
    movementCount > 0 ? round2(spentAmount / movementCount) : 0;
  const maxMovementAmount = round2(
    rawContributions.reduce(
      (max, contribution) => Math.max(max, contribution.amountInBudgetCurrency),
      0,
    ),
  );

  const contributions = rawContributions.map((contribution) => ({
    ...contribution,
    shareOfBudget:
      budget.limitAmount > 0 ? round2((contribution.amountInBudgetCurrency / budget.limitAmount) * 100) : 0,
    shareOfSpent:
      spentAmount > 0 ? round2((contribution.amountInBudgetCurrency / spentAmount) * 100) : 0,
  }));

  return {
    spentAmount,
    remainingAmount,
    usedPercent,
    movementCount,
    contributions,
    averageMovementAmount,
    maxMovementAmount,
  };
}

export function applyBudgetComputedMetrics(
  budget: BudgetOverview,
  metrics: BudgetComputedMetrics,
): BudgetOverview {
  const isOverLimit = metrics.usedPercent >= 100;
  const isNearLimit = !isOverLimit && budget.alertPercent > 0 && metrics.usedPercent >= budget.alertPercent;

  return {
    ...budget,
    spentAmount: metrics.spentAmount,
    remainingAmount: metrics.remainingAmount,
    usedPercent: metrics.usedPercent,
    movementCount: metrics.movementCount,
    isNearLimit,
    isOverLimit,
  };
}

export function buildBudgetMetricsMap(
  budgets: BudgetOverview[],
  movements: BudgetScopedMovement[],
  context: BudgetMetricsContext,
) {
  const map = new Map<number, BudgetComputedMetrics>();
  for (const budget of budgets) {
    map.set(budget.id, buildBudgetComputedMetrics(budget, movements, context));
  }
  return map;
}
