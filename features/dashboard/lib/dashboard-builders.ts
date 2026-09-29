import { addDays, differenceInDays } from "date-fns";
import { obligationViewerDirection } from "../../../lib/obligation-viewer-labels";

import { movementDisplayAmount } from "../../../lib/movement-amounts";
import { parseDisplayDate } from "../../../lib/date";
import { findProbableDuplicateGroups } from "../../../services/analytics/duplicate-detection";
import type { DashboardMovementRow } from "./dashboard-row";

import { convertAmt, isCategorizedCashflow, isExpense } from "./aggregations";

export type DashboardReviewInbox = {
  uncategorizedCount: number;
  /**
   * Movimientos sin contraparte.
   *
   * Era la segunda viñeta de una tarjeta de dos líneas, sin nada que tocar, mientras 1.400 px
   * más abajo se detallaba la madurez del análisis. Son más que los movimientos útiles totales
   * y explican por qué Contactos se siente vacío: sube a primera fila de «Por revisar».
   */
  noCounterpartyCount: number;
  /** Qué parte del gasto pesa lo que está sin categoría: el número y su consecuencia juntos. */
  uncategorizedExpenseShare: number;
  pendingMovementsCount: number;
  duplicateExpenseGroups: number;
  subscriptionsAttentionCount: number;
  obligationsWithoutPlanCount: number;
  staleObligationsCount: number;
  overdueObligationsCount: number;
  totalIssues: number;
};

export function buildReviewInboxSnapshot(
  movements: DashboardMovementRow[],
  subscriptions: Array<{ accountId?: number | null; nextDueDate: string; status: string }>,
  obligations: Array<{
    pendingAmount: number;
    dueDate: string | null;
    installmentCount?: number | null;
    installmentAmount?: number | null;
    lastPaymentDate?: string | null;
    startDate?: string | null;
    status: string;
  }>,
  now: Date = new Date(),
): DashboardReviewInbox {
  const today = now;
  const uncategorizedCount = movements.filter(
    (movement) =>
      movement.status === "posted" && isCategorizedCashflow(movement) && movement.categoryId == null,
  ).length;

  const cashflowMovements = movements.filter(
    (movement) => movement.status === "posted" && isCategorizedCashflow(movement),
  );
  const noCounterpartyCount = cashflowMovements.filter((movement) => movement.counterpartyId == null).length;

  // El peso sobre el gasto, no sobre el total de movimientos: es lo que cambia si lo ordenas.
  const expenseMovements = cashflowMovements.filter(isExpense);
  const totalExpense = expenseMovements.reduce((sum, movement) => sum + Math.abs(movementDisplayAmount(movement)), 0);
  const uncategorizedExpense = expenseMovements
    .filter((movement) => movement.categoryId == null)
    .reduce((sum, movement) => sum + Math.abs(movementDisplayAmount(movement)), 0);
  const uncategorizedExpenseShare = totalExpense > 0 ? Math.round((uncategorizedExpense / totalExpense) * 100) : 0;

  const pendingMovementsCount = movements.filter((movement) => movement.status === "pending").length;

  const duplicateExpenseGroups = findProbableDuplicateGroups({
    movements: movements.filter(isExpense),
    getAmount: movementDisplayAmount,
  }).length;

  const subscriptionsAttentionCount = subscriptions.filter((subscription) => {
    if (subscription.status !== "active") return false;
    const dueDate = parseDisplayDate(subscription.nextDueDate);
    return !subscription.accountId || dueDate < today;
  }).length;

  const activeObligations = obligations.filter(
    (obligation) => obligation.pendingAmount > 0.009 && obligation.status !== "paid",
  );

  const obligationsWithoutPlanCount = activeObligations.filter(
    (obligation) =>
      !obligation.dueDate &&
      !(obligation.installmentCount && obligation.installmentCount > 0) &&
      !(obligation.installmentAmount && obligation.installmentAmount > 0),
  ).length;

  const staleObligationsCount = activeObligations.filter((obligation) => {
    const referenceDate = obligation.lastPaymentDate ?? obligation.startDate;
    if (!referenceDate) return true;
    return differenceInDays(today, parseDisplayDate(referenceDate)) > 50;
  }).length;

  const overdueObligationsCount = activeObligations.filter(
    (obligation) => obligation.dueDate && parseDisplayDate(obligation.dueDate) < today,
  ).length;

  const totalIssues =
    uncategorizedCount +
    noCounterpartyCount +
    pendingMovementsCount +
    duplicateExpenseGroups +
    subscriptionsAttentionCount +
    obligationsWithoutPlanCount +
    staleObligationsCount +
    overdueObligationsCount;

  return {
    duplicateExpenseGroups,
    obligationsWithoutPlanCount,
    overdueObligationsCount,
    pendingMovementsCount,
    staleObligationsCount,
    subscriptionsAttentionCount,
    totalIssues,
    uncategorizedCount,
    noCounterpartyCount,
    uncategorizedExpenseShare,
  };
}

export type FutureFlowWindow = {
  days: number;
  expectedInflow: number;
  expectedOutflow: number;
  estimatedBalance: number;
  scheduledCount: number;
  receivableCount: number;
  payableCount: number;
  /** Ítems cuyo monto no pudo convertirse a la moneda activa (sumaron 0). */
  unconvertedCount: number;
};

export type FutureFlowItem = {
  /** `card` y `planned` solo los produce la proyección: el pago de una tarjeta y lo anotado a futuro. */
  source: "obligation" | "subscription" | "recurring-income" | "card" | "planned";
  id: number;
  title: string;
  date: Date;
  direction: "inflow" | "outflow";
  amount: number | null;
};

/** Shared ledger for the totals and the detail sheet. A missing exchange rate stays visible. */
export function buildFutureFlowItems(
  obligations: Array<{ id?: number; title?: string; direction: string; pendingAmount: number; installmentAmount?: number | null; currencyCode: string; dueDate: string | null; status: string }>,
  subscriptions: Array<{ id?: number; name?: string; amount: number; currencyCode: string; nextDueDate: string; status: string }>,
  recurringIncome: Array<{ id?: number; name?: string; amount: number; currencyCode: string; nextExpectedDate: string; status: string }>,
  displayCurrency: string,
  exchangeRateMap: Map<string, number>,
  baseCurrency: string,
  now: Date = new Date(),
): FutureFlowItem[] {
  const horizon = addDays(now, 30);
  const inWindow = (date: Date) => date >= now && date <= horizon;
  const items: FutureFlowItem[] = [];
  for (const obligation of obligations) {
    if (!obligation.dueDate || obligation.pendingAmount <= 0.009 || obligation.status === "paid") continue;
    const date = parseDisplayDate(obligation.dueDate);
    if (!inWindow(date)) continue;
    const amount = obligation.installmentAmount && obligation.installmentAmount > 0
      ? Math.min(obligation.pendingAmount, obligation.installmentAmount) : obligation.pendingAmount;
    items.push({ source: "obligation", id: obligation.id ?? 0, title: obligation.title || "Crédito o deuda", date,
      direction: obligationViewerDirection(obligation) === "receivable" ? "inflow" : "outflow",
      amount: convertDashboardCurrency(amount, obligation.currencyCode, displayCurrency, exchangeRateMap, baseCurrency) });
  }
  for (const subscription of subscriptions) {
    if (subscription.status !== "active") continue;
    const date = parseDisplayDate(subscription.nextDueDate);
    if (!inWindow(date)) continue;
    items.push({ source: "subscription", id: subscription.id ?? 0, title: subscription.name || "Suscripción", date,
      direction: "outflow", amount: convertDashboardCurrency(subscription.amount, subscription.currencyCode, displayCurrency, exchangeRateMap, baseCurrency) });
  }
  for (const income of recurringIncome) {
    if (income.status !== "active") continue;
    const date = parseDisplayDate(income.nextExpectedDate);
    if (!inWindow(date)) continue;
    items.push({ source: "recurring-income", id: income.id ?? 0, title: income.name || "Ingreso fijo", date,
      direction: "inflow", amount: convertDashboardCurrency(income.amount, income.currencyCode, displayCurrency, exchangeRateMap, baseCurrency) });
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.title.localeCompare(b.title));
}

export function getWeekCoverageStatus(items: FutureFlowItem[], availableBalance: number): "Bajo presión" | "Cubierto" | "Estable" | "Por revisar" {
  if (items.some((item) => item.amount === null)) return "Por revisar";
  if (items.length === 0) return "Estable";
  let balance = availableBalance;
  // Payments can fall before expected income on the same date. Check the lowest balance each day.
  for (const item of [...items].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.direction === "outflow" ? -1 : 1))) {
    balance += item.direction === "inflow" ? item.amount ?? 0 : -(item.amount ?? 0);
    if (balance < -0.009) return "Bajo presión";
  }
  return "Cubierto";
}

export function convertDashboardCurrency(
  amount: number,
  fromCurrency: string,
  displayCurrency: string,
  exchangeRateMap: Map<string, number>,
  baseCurrency: string,
): number | null {
  return convertAmt(amount, fromCurrency, displayCurrency, exchangeRateMap, baseCurrency);
}

export function buildFutureFlowWindows(
  obligations: Array<{
    direction: string;
    pendingAmount: number;
    installmentAmount?: number | null;
    currencyCode: string;
    dueDate: string | null;
    status: string;
  }>,
  subscriptions: Array<{
    amount: number;
    currencyCode: string;
    nextDueDate: string;
    status: string;
  }>,
  recurringIncome: Array<{
    amount: number;
    currencyCode: string;
    nextExpectedDate: string;
    status: string;
  }>,
  displayCurrency: string,
  exchangeRateMap: Map<string, number>,
  currentVisibleBalance: number,
  baseCurrency: string = displayCurrency,
  now: Date = new Date(),
): FutureFlowWindow[] {
  const items = buildFutureFlowItems(obligations, subscriptions, recurringIncome, displayCurrency, exchangeRateMap, baseCurrency, now);
  return windowsFromFlowItems(items, currentVisibleBalance, now);
}

/**
 * Las ventanas de 7, 15 y 30 días a partir de compromisos ya colocados en el calendario.
 *
 * Separada de `buildFutureFlowWindows` para que el dashboard avanzado pueda armarlas con las
 * líneas del motor de proyección —que sí ve cuotas, atrasadas, tarjetas y lo planificado— en vez
 * de con la lectura vieja, que solo miraba la fecha final de cada deuda. Un compromiso atrasado
 * tiene fecha pasada y entra en las tres ventanas: se sigue debiendo.
 */
export function windowsFromFlowItems(
  items: readonly FutureFlowItem[],
  currentVisibleBalance: number,
  now: Date = new Date(),
): FutureFlowWindow[] {
  return [7, 15, 30].map((days) => {
    const windowItems = items.filter((item) => item.date <= addDays(now, days));
    const expectedInflow = windowItems.filter((item) => item.direction === "inflow").reduce((sum, item) => sum + (item.amount ?? 0), 0);
    const expectedOutflow = windowItems.filter((item) => item.direction === "outflow").reduce((sum, item) => sum + (item.amount ?? 0), 0);
    const receivableCount = windowItems.filter((item) => item.source === "obligation" && item.direction === "inflow").length;
    const payableCount = windowItems.filter((item) => item.source === "obligation" && item.direction === "outflow").length;
    const scheduledCount = windowItems.length;
    const unconvertedCount = windowItems.filter((item) => item.amount === null).length;

    return {
      days,
      estimatedBalance: currentVisibleBalance + expectedInflow - expectedOutflow,
      expectedInflow,
      expectedOutflow,
      payableCount,
      receivableCount,
      scheduledCount,
      unconvertedCount,
    };
  });
}
