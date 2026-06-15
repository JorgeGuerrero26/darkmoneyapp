import { differenceInDays, startOfDay, startOfMonth, startOfWeek, subDays, subMonths } from "date-fns";

import { convertParityAmount, resolveParityRate } from "../../../lib/currency-conversion";
import {
  movementActsAsExpense,
  movementActsAsIncome,
  movementDisplayAccountId,
  movementDisplayAmount,
} from "../../../lib/movement-amounts";
import type { DashboardMovementRow } from "./dashboard-row";
import type { ExchangeRateSummary } from "../../../types/domain";

import type { ConversionCtx, Period } from "./types";

export function pctChange(current: number, prev: number) {
  if (prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

export function isIncome(m: DashboardMovementRow) {
  if (m.status !== "posted") return false;
  if (m.movementType === "obligation_opening") return false;
  return movementActsAsIncome(m);
}

export function isExpense(m: DashboardMovementRow) {
  if (m.status !== "posted") return false;
  if (m.movementType === "obligation_opening") return false;
  return movementActsAsExpense(m);
}

export function isTransfer(m: DashboardMovementRow) {
  return m.status === "posted" && m.movementType === "transfer";
}

export function isCategorizedCashflow(m: DashboardMovementRow) {
  if (m.status !== "posted") return false;
  return (
    m.movementType === "income" ||
    m.movementType === "refund" ||
    m.movementType === "expense" ||
    m.movementType === "subscription_payment" ||
    m.movementType === "obligation_payment"
  );
}

export function inRange(m: DashboardMovementRow, start: Date, end: Date) {
  const d = new Date(m.occurredAt);
  return d >= start && d <= end;
}

export function sortMovementsRecentFirst(movements: DashboardMovementRow[]) {
  return [...movements].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || b.id - a.id,
  );
}

export function movementPreviewActionLabel(movement: DashboardMovementRow) {
  if (movement.status === "pending" || movement.status === "planned") return "Aplicar";
  if (isCategorizedCashflow(movement) && movement.categoryId == null) return "Categorizar";
  return "Editar";
}

export function getPeriodBounds(
  period: Period,
  now: Date,
): { curStart: Date; curEnd: Date; prevStart: Date; prevEnd: Date } {
  if (period === "today") {
    const curStart = startOfDay(now);
    const curEnd = now;
    const yesterday = subDays(now, 1);
    const prevStart = startOfDay(yesterday);
    const prevEnd = yesterday;
    return { curStart, curEnd, prevStart, prevEnd };
  }
  if (period === "week") {
    const curStart = startOfWeek(now, { weekStartsOn: 1 });
    const curEnd = now;
    const daysSinceStart = differenceInDays(now, curStart);
    const prevStart = subDays(curStart, 7);
    const prevEnd = subDays(now, 7);
    void daysSinceStart;
    return { curStart, curEnd, prevStart, prevEnd };
  }
  if (period === "month") {
    const curStart = startOfMonth(now);
    const curEnd = now;
    const prevMonthDate = subMonths(now, 1);
    const prevStart = startOfMonth(prevMonthDate);
    const dayOfMonth = now.getDate();
    const prevEnd = new Date(
      prevMonthDate.getFullYear(),
      prevMonthDate.getMonth(),
      dayOfMonth,
      now.getHours(),
      now.getMinutes(),
      now.getSeconds(),
    );
    return { curStart, curEnd, prevStart, prevEnd };
  }
  // last_30
  const curStart = subDays(now, 29);
  const curEnd = now;
  const prevStart = subDays(now, 59);
  const prevEnd = subDays(now, 30);
  return { curStart, curEnd, prevStart, prevEnd };
}

export function buildExchangeRateMap(rates: ExchangeRateSummary[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rates) {
    const key = `${r.fromCurrencyCode.toUpperCase()}:${r.toCurrencyCode.toUpperCase()}`;
    if (!map.has(key) && r.rate > 0) map.set(key, r.rate);
  }
  return map;
}

/**
 * Tasa from→to con el algoritmo estándar de paridad (directa → inversa →
 * puente vía moneda base → null). Devuelve null cuando no hay tasa: el caller
 * decide cómo manejarlo (sumar 0 + contar como no convertido), nunca 1 a ciegas.
 */
export function resolveRate(
  map: Map<string, number>,
  from: string,
  to: string,
  baseCurrency: string,
): number | null {
  return resolveParityRate(map, from, to, baseCurrency);
}

export function convertAmt(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: string,
  map: Map<string, number>,
  baseCurrency: string,
): number | null {
  return convertParityAmount({
    amount,
    currencyCode: fromCurrency,
    baseCurrencyCode: baseCurrency,
    targetCurrencyCode: toCurrency,
    exchangeRateMap: map,
  });
}

export function incomeAmt(m: DashboardMovementRow, ctx: ConversionCtx): number {
  const raw = movementDisplayAmount(m);
  const accountId = movementDisplayAccountId(m);
  const currency = accountId ? ctx.accountCurrencyMap.get(accountId) : undefined;
  return convertAmt(raw, currency, ctx.displayCurrency, ctx.exchangeRateMap, ctx.baseCurrency) ?? 0;
}

export function expenseAmt(m: DashboardMovementRow, ctx: ConversionCtx): number {
  const raw = movementDisplayAmount(m);
  const accountId = movementDisplayAccountId(m);
  const currency = accountId ? ctx.accountCurrencyMap.get(accountId) : undefined;
  return convertAmt(raw, currency, ctx.displayCurrency, ctx.exchangeRateMap, ctx.baseCurrency) ?? 0;
}

export function transferAmt(m: DashboardMovementRow, ctx: ConversionCtx): number {
  const raw = movementDisplayAmount(m);
  const accountId = movementDisplayAccountId(m);
  const currency = accountId ? ctx.accountCurrencyMap.get(accountId) : undefined;
  return convertAmt(raw, currency, ctx.displayCurrency, ctx.exchangeRateMap, ctx.baseCurrency) ?? 0;
}
