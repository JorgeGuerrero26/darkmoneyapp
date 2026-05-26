import {
  buildFutureFlowWindows,
  buildReviewInboxSnapshot,
  convertDashboardCurrency,
} from "../../features/dashboard/lib/dashboard-builders";
import { buildExchangeRateMap } from "../../features/dashboard/lib/aggregations";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const ONE_DAY = 24 * 60 * 60 * 1000;

function isoFromNow(days: number) {
  return new Date(Date.now() + days * ONE_DAY).toISOString();
}

function dateOnlyFromNow(days: number) {
  return new Date(Date.now() + days * ONE_DAY).toISOString().slice(0, 10);
}

type Movement = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
  sourceAmount: number;
  destinationAmount: number;
};

function expense(id: number, amount: number, occurredAt: string, categoryId: number | null = 10): Movement {
  return {
    id,
    movementType: "expense",
    status: "posted",
    occurredAt,
    sourceAccountId: 1,
    destinationAccountId: null,
    categoryId,
    counterpartyId: null,
    description: `gasto ${id}`,
    sourceAmount: amount,
    destinationAmount: 0,
  };
}

function runConvertDashboardCurrency() {
  const map = buildExchangeRateMap([{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.75 }] as never);
  assert(convertDashboardCurrency(100, "USD", "PEN", map) === 375, "USD→PEN 100→375");
  assert(convertDashboardCurrency(100, "PEN", "PEN", map) === 100, "misma moneda no convierte");
}

function runReviewInboxEmpty() {
  const review = buildReviewInboxSnapshot([], [], []);
  assert(review.totalIssues === 0, "workspace vacío sin issues");
  assert(review.uncategorizedCount === 0, "no hay sin categoría");
  assert(review.pendingMovementsCount === 0, "no hay pending");
}

function runReviewInboxUncategorized() {
  const movements = [
    expense(1, 100, "2026-05-01T00:00:00Z", null),
    expense(2, 50, "2026-05-02T00:00:00Z", null),
    expense(3, 80, "2026-05-03T00:00:00Z", 10),
  ];
  const review = buildReviewInboxSnapshot(movements as never, [], []);
  assert(review.uncategorizedCount === 2, `2 sin categoría esperados, fue ${review.uncategorizedCount}`);
}

function runReviewInboxPendingCount() {
  const movements = [
    { ...expense(1, 100, "2026-05-01T00:00:00Z"), status: "pending" },
    { ...expense(2, 50, "2026-05-02T00:00:00Z"), status: "pending" },
    expense(3, 80, "2026-05-03T00:00:00Z"),
  ];
  const review = buildReviewInboxSnapshot(movements as never, [], []);
  assert(review.pendingMovementsCount === 2, `2 pending esperados, fue ${review.pendingMovementsCount}`);
}

function runReviewInboxObligations() {
  const obligations = [
    // overdue: dueDate en el pasado + startDate reciente para no ser stale también
    { pendingAmount: 100, dueDate: dateOnlyFromNow(-5), startDate: dateOnlyFromNow(-10), status: "active" },
    // sin plan: no due date ni installment, pero con startDate reciente
    { pendingAmount: 200, dueDate: null, installmentCount: null, installmentAmount: null, startDate: dateOnlyFromNow(-10), status: "active" },
    // stale: lastPaymentDate > 50 días
    { pendingAmount: 300, dueDate: dateOnlyFromNow(10), lastPaymentDate: dateOnlyFromNow(-60), status: "active" },
    // ya pagada: no debe contar
    { pendingAmount: 0, dueDate: dateOnlyFromNow(-1), status: "paid" },
  ];
  const review = buildReviewInboxSnapshot([], [], obligations as never);
  assert(review.overdueObligationsCount === 1, `1 overdue, fue ${review.overdueObligationsCount}`);
  assert(review.obligationsWithoutPlanCount === 1, `1 sin plan, fue ${review.obligationsWithoutPlanCount}`);
  assert(review.staleObligationsCount === 1, `1 stale, fue ${review.staleObligationsCount}`);
}

function runReviewInboxSubscriptionsAttention() {
  const subscriptions = [
    // sin accountId
    { nextDueDate: dateOnlyFromNow(10), status: "active", accountId: null },
    // due date pasada
    { nextDueDate: dateOnlyFromNow(-3), status: "active", accountId: 1 },
    // ok: no debe contar
    { nextDueDate: dateOnlyFromNow(5), status: "active", accountId: 1 },
    // inactive: no cuenta
    { nextDueDate: dateOnlyFromNow(-3), status: "paused", accountId: null },
  ];
  const review = buildReviewInboxSnapshot([], subscriptions as never, []);
  assert(review.subscriptionsAttentionCount === 2, `2 subs en atención, fue ${review.subscriptionsAttentionCount}`);
}

function runFutureFlowWindows() {
  const obligations = [
    // payable en 3 días, dentro de la ventana 7
    { direction: "payable", pendingAmount: 100, currencyCode: "PEN", dueDate: dateOnlyFromNow(3), status: "active" },
    // receivable en 10 días, dentro de la ventana 15 pero no 7
    { direction: "receivable", pendingAmount: 200, currencyCode: "PEN", dueDate: dateOnlyFromNow(10), status: "active" },
    // payable en 25 días, dentro de la ventana 30
    { direction: "payable", pendingAmount: 50, currencyCode: "PEN", dueDate: dateOnlyFromNow(25), status: "active" },
    // pagada: no cuenta
    { direction: "payable", pendingAmount: 0, currencyCode: "PEN", dueDate: dateOnlyFromNow(2), status: "paid" },
    // pendingAmount < threshold: no cuenta
    { direction: "payable", pendingAmount: 0.001, currencyCode: "PEN", dueDate: dateOnlyFromNow(2), status: "active" },
  ];
  const subscriptions = [
    // sub en 5 días
    { amount: 30, currencyCode: "PEN", nextDueDate: dateOnlyFromNow(5), status: "active" },
    // sub en el pasado: no cuenta
    { amount: 999, currencyCode: "PEN", nextDueDate: dateOnlyFromNow(-1), status: "active" },
  ];
  const recurringIncome = [
    // ingreso en 6 días
    { amount: 1000, currencyCode: "PEN", nextExpectedDate: dateOnlyFromNow(6), status: "active" },
  ];

  const map = buildExchangeRateMap([] as never);
  const windows = buildFutureFlowWindows(obligations as never, subscriptions as never, recurringIncome as never, "PEN", map, 5000);

  assert(windows.length === 3, "buildFutureFlowWindows devuelve 3 ventanas (7/15/30 días)");

  const w7 = windows.find((w) => w.days === 7)!;
  assert(w7.payableCount === 1 && w7.receivableCount === 0, "ventana 7d: 1 payable, 0 receivable");
  assert(w7.expectedOutflow === 130, `7d outflow = 100 (oblig) + 30 (sub) = 130, fue ${w7.expectedOutflow}`);
  assert(w7.expectedInflow === 1000, `7d inflow = 1000 (ingreso), fue ${w7.expectedInflow}`);
  assert(w7.estimatedBalance === 5000 + 1000 - 130, "7d balance = 5870");

  const w15 = windows.find((w) => w.days === 15)!;
  assert(w15.receivableCount === 1, "ventana 15d: 1 receivable agregada");
  assert(w15.expectedInflow === 1000 + 200, `15d inflow = 1200, fue ${w15.expectedInflow}`);

  const w30 = windows.find((w) => w.days === 30)!;
  assert(w30.payableCount === 2, "ventana 30d: 2 payables");
  assert(w30.expectedOutflow === 130 + 50, `30d outflow = 180, fue ${w30.expectedOutflow}`);
}

function runFutureFlowInstallmentCap() {
  // Si installmentAmount < pendingAmount, usa installmentAmount
  const obligations = [
    { direction: "payable", pendingAmount: 1000, installmentAmount: 200, currencyCode: "PEN", dueDate: dateOnlyFromNow(3), status: "active" },
  ];
  const map = buildExchangeRateMap([] as never);
  const windows = buildFutureFlowWindows(obligations as never, [], [], "PEN", map, 0);
  const w7 = windows.find((w) => w.days === 7)!;
  assert(w7.expectedOutflow === 200, `installment cap aplicado: 200, fue ${w7.expectedOutflow}`);
}

runConvertDashboardCurrency();
runReviewInboxEmpty();
runReviewInboxUncategorized();
runReviewInboxPendingCount();
runReviewInboxObligations();
runReviewInboxSubscriptionsAttention();
runFutureFlowWindows();
runFutureFlowInstallmentCap();

console.log("dashboard builders smoke tests passed");
