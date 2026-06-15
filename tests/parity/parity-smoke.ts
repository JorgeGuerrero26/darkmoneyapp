/**
 * Smoke de paridad — REFERENCIA. El movil es la fuente de verdad: este script
 * ejecuta las funciones puras del dashboard movil sobre el fixture compartido y
 * GENERA parity-expected.json (con --update) que la web debe reproducir.
 *
 * Uso:
 *   npm run test:parity              -> verifica contra el expected existente
 *   npm run test:parity -- --update  -> regenera el expected
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildExchangeRateMap,
  expenseAmt,
  getPeriodBounds,
  incomeAmt,
  inRange,
  isExpense,
  isIncome,
} from "../../features/dashboard/lib/aggregations";
import { buildFutureFlowWindows, buildReviewInboxSnapshot } from "../../features/dashboard/lib/dashboard-builders";
import { buildMonthProjectionModel } from "../../features/dashboard/lib/advanced-builders";
import { buildHealthScore } from "../../features/dashboard/lib/health";
import type { ConversionCtx, Period } from "../../features/dashboard/lib/types";
import type { DashboardMovementRow } from "../../features/dashboard/lib/dashboard-row";
import { convertParityAmount } from "../../lib/currency-conversion";

type Fixture = {
  now: string;
  baseCurrency: string;
  displayCurrency: string;
  exchangeRates: Array<{ fromCurrencyCode: string; toCurrencyCode: string; rate: number; effectiveAt: string }>;
  accounts: Array<{
    id: number;
    type: string;
    currencyCode: string;
    currentBalance: number;
    currentBalanceInBaseCurrency?: number | null;
    isArchived: boolean;
    includeInNetWorth: boolean;
  }>;
  movements: DashboardMovementRow[];
  obligations: Parameters<typeof buildFutureFlowWindows>[0];
  subscriptions: Parameters<typeof buildFutureFlowWindows>[1];
  recurringIncome: Parameters<typeof buildFutureFlowWindows>[2];
  healthInputs: { averageMonthlyExpense: number; totalPayable: number };
};

const DIR = join(process.cwd(), "tests", "parity");
const fixture: Fixture = JSON.parse(readFileSync(join(DIR, "parity-fixture.json"), "utf8"));
const now = new Date(fixture.now);

const exchangeRateMap = buildExchangeRateMap(fixture.exchangeRates as never);
const accountCurrencyMap = new Map<number, string>(fixture.accounts.map((a) => [a.id, a.currencyCode]));
const ctx: ConversionCtx = {
  accountCurrencyMap,
  exchangeRateMap,
  displayCurrency: fixture.displayCurrency,
  baseCurrency: fixture.baseCurrency,
};

function round(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

// Patrimonio (espejo de netWorth en app/(app)/dashboard.tsx).
function netWorth() {
  let amount = 0;
  for (const a of fixture.accounts) {
    if (!a.includeInNetWorth || a.isArchived) continue;
    const raw = a.currentBalanceInBaseCurrency ?? a.currentBalance;
    amount +=
      convertParityAmount({
        amount: raw,
        currencyCode: fixture.baseCurrency,
        baseCurrencyCode: fixture.baseCurrency,
        targetCurrencyCode: fixture.displayCurrency,
        exchangeRateMap,
      }) ?? 0;
  }
  return amount;
}

function periodTotals(period: Period) {
  const { curStart, curEnd } = getPeriodBounds(period, now);
  let income = 0;
  let expense = 0;
  for (const m of fixture.movements) {
    if (!inRange(m, curStart, curEnd)) continue;
    if (isIncome(m)) income += incomeAmt(m, ctx);
    else if (isExpense(m)) expense += expenseAmt(m, ctx);
  }
  return { income: round(income), expense: round(expense), net: round(income - expense) };
}

const visibleBalance = netWorth();

const futureWindows = buildFutureFlowWindows(
  fixture.obligations,
  fixture.subscriptions,
  fixture.recurringIncome,
  fixture.displayCurrency,
  exchangeRateMap,
  visibleBalance,
  fixture.baseCurrency,
  now,
).map((w) => ({
  days: w.days,
  expectedInflow: round(w.expectedInflow),
  expectedOutflow: round(w.expectedOutflow),
  estimatedBalance: round(w.estimatedBalance),
  scheduledCount: w.scheduledCount,
  receivableCount: w.receivableCount,
  payableCount: w.payableCount,
  unconvertedCount: w.unconvertedCount,
}));

const projection = buildMonthProjectionModel(
  fixture.movements,
  fixture.obligations,
  fixture.subscriptions,
  fixture.recurringIncome,
  visibleBalance,
  ctx,
  now,
);

const reviewInbox = buildReviewInboxSnapshot(
  fixture.movements,
  fixture.subscriptions as never,
  fixture.obligations as never,
  now,
);

// readiness (espejo de learning en AdvancedDashboard.tsx)
function readiness() {
  const posted = fixture.movements.filter((m) => m.status === "posted");
  const useful = posted.filter((m) => m.movementType !== "obligation_opening");
  const categorizedBase = useful.filter(
    (m) =>
      m.movementType === "income" ||
      m.movementType === "refund" ||
      m.movementType === "expense" ||
      m.movementType === "subscription_payment" ||
      m.movementType === "obligation_payment",
  );
  const categorizedCount = categorizedBase.filter((m) => m.categoryId != null).length;
  const categorizedRate = categorizedBase.length > 0 ? categorizedCount / categorizedBase.length : 0;
  const sorted = [...useful].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.id - a.id,
  );
  const oldest = sorted[sorted.length - 1];
  const historyDays = oldest
    ? Math.max(1, Math.trunc((now.getTime() - new Date(oldest.occurredAt).getTime()) / 86_400_000))
    : 0;
  const readinessScore = Math.round(
    Math.min(1, useful.length / 120) * 40 +
      Math.min(1, historyDays / 120) * 25 +
      categorizedRate * 35,
  );
  return { readinessScore, historyDays, usefulCount: useful.length, categorizedRate: round(categorizedRate) };
}

// Salud: liquidMoney se DERIVA de las cuentas (regla cash/bank/savings, no archivadas)
// para que el smoke pruebe la misma regla que el call-site real, no un valor fijo.
const liquidAccountTypes = new Set(["cash", "bank", "savings"]);
const liquidMoney = fixture.accounts
  .filter((a) => liquidAccountTypes.has(a.type) && !a.isArchived)
  .reduce((sum, a) => {
    const raw = a.currentBalanceInBaseCurrency ?? a.currentBalance;
    return sum +
      (convertParityAmount({
        amount: raw,
        currencyCode: fixture.baseCurrency,
        baseCurrencyCode: fixture.baseCurrency,
        targetCurrencyCode: fixture.displayCurrency,
        exchangeRateMap,
      }) ?? 0);
  }, 0);

// Salud: usa el período "month" (mismo en web y móvil).
const monthTotals = periodTotals("month");
const health = buildHealthScore({
  liquidMoney,
  averageMonthlyExpense: fixture.healthInputs.averageMonthlyExpense,
  periodIncome: monthTotals.income,
  periodNet: monthTotals.net,
  totalPayable: fixture.healthInputs.totalPayable,
  overdueCount: reviewInbox.overdueObligationsCount,
});

const actual = {
  netWorth: round(visibleBalance),
  periods: {
    today: periodTotals("today"),
    week: periodTotals("week"),
    month: periodTotals("month"),
    last_30: periodTotals("last_30"),
  },
  futureWindows,
  monthProjection: {
    expectedBalance: round(projection.expectedBalance),
    committedInflow: round(projection.committedInflow),
    committedOutflow: round(projection.committedOutflow),
    variableIncomeProjection: round(projection.variableIncomeProjection),
    variableExpenseProjection: round(projection.variableExpenseProjection),
    remainingDays: projection.remainingDays,
  },
  reviewInbox: {
    uncategorizedCount: reviewInbox.uncategorizedCount,
    pendingMovementsCount: reviewInbox.pendingMovementsCount,
    duplicateExpenseGroups: reviewInbox.duplicateExpenseGroups,
    subscriptionsAttentionCount: reviewInbox.subscriptionsAttentionCount,
    obligationsWithoutPlanCount: reviewInbox.obligationsWithoutPlanCount,
    staleObligationsCount: reviewInbox.staleObligationsCount,
    overdueObligationsCount: reviewInbox.overdueObligationsCount,
    totalIssues: reviewInbox.totalIssues,
  },
  readiness: readiness(),
  health: {
    score: health.score,
    tone: health.tone,
    savingsRate: health.savingsRate === null ? null : round(health.savingsRate),
    coverageMonths: health.coverageMonths === null ? null : round(health.coverageMonths),
    debtToIncomeRatio: health.debtToIncomeRatio === null ? null : round(health.debtToIncomeRatio),
    indicatorScores: health.indicators.map((indicator) => indicator.score),
  },
};

const expectedPath = join(DIR, "parity-expected.json");
const shouldUpdate = process.argv.includes("--update");

if (shouldUpdate) {
  writeFileSync(expectedPath, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
  console.log("parity-expected.json regenerado (referencia movil).");
} else {
  const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    console.error("PARITY MISMATCH (movil vs expected):");
    console.error("actual:  ", actualStr);
    console.error("expected:", expectedStr);
    process.exit(1);
  }
  console.log("parity-smoke (movil): OK — coincide con el expected.");
}
