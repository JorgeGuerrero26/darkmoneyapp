import { endOfDay, endOfMonth, format, startOfDay, startOfMonth, subDays, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { expenseAmt, incomeAmt, transferAmt } from "../lib/aggregations";
import type { ConversionCtx, DashboardChartDay } from "../lib/types";
import { forEachInRange, type MovementsIndex } from "./movements-index";

export type PeriodTotals = {
  income: number;
  expense: number;
  net: number;
};

/** Compute income/expense/net over a date range using the indexed structure. */
export function selectPeriodTotals(
  index: MovementsIndex,
  start: Date,
  end: Date,
  ctx: ConversionCtx,
): PeriodTotals {
  let income = 0;
  let expense = 0;
  forEachInRange(index, start, end, (indexed) => {
    if (indexed.isIncome) income += incomeAmt(indexed.movement, ctx);
    else if (indexed.isExpense) expense += expenseAmt(indexed.movement, ctx);
  });
  return { income, expense, net: income - expense };
}

/** Compute the last `days` daily buckets ending on `now` (inclusive). */
export function selectDailyBreakdown(
  index: MovementsIndex,
  now: Date,
  ctx: ConversionCtx,
  days = 7,
): DashboardChartDay[] {
  return Array.from({ length: days }, (_, i) => {
    const d = subDays(now, days - 1 - i);
    const dayStart = startOfDay(d);
    const dayEnd = endOfDay(d);
    let income = 0;
    let expense = 0;
    let transferTotal = 0;
    forEachInRange(index, dayStart, dayEnd, (indexed) => {
      if (indexed.isIncome) income += incomeAmt(indexed.movement, ctx);
      else if (indexed.isExpense) expense += expenseAmt(indexed.movement, ctx);
      if (indexed.isTransfer) transferTotal += transferAmt(indexed.movement, ctx);
    });
    return {
      label: format(d, "dd/M"),
      dateKey: format(d, "yyyy-MM-dd"),
      dayStart,
      dayEnd,
      income,
      expense,
      transferTotal,
    };
  });
}

/** Compute the last `months` monthly aggregates ending on `now`. */
export function selectMonthlyPulse(
  index: MovementsIndex,
  now: Date,
  ctx: ConversionCtx,
  months = 6,
): { label: string; income: number; expense: number }[] {
  return Array.from({ length: months }, (_, i) => {
    const monthDate = subMonths(now, months - 1 - i);
    const monthStart = startOfMonth(monthDate);
    const monthEnd = i === months - 1 ? now : endOfMonth(monthDate);
    let income = 0;
    let expense = 0;
    forEachInRange(index, monthStart, monthEnd, (indexed) => {
      if (indexed.isIncome) income += incomeAmt(indexed.movement, ctx);
      else if (indexed.isExpense) expense += expenseAmt(indexed.movement, ctx);
    });
    return {
      label: format(monthDate, "MMM", { locale: es }),
      income,
      expense,
    };
  });
}

/** Sum expense by categoryId (null = uncategorized) for the given range. */
export function selectCategoryTotals(
  index: MovementsIndex,
  start: Date,
  end: Date,
  ctx: ConversionCtx,
): Map<number | null, number> {
  const totals = new Map<number | null, number>();
  forEachInRange(index, start, end, (indexed) => {
    if (!indexed.isExpense) return;
    const key = indexed.movement.categoryId;
    totals.set(key, (totals.get(key) ?? 0) + expenseAmt(indexed.movement, ctx));
  });
  return totals;
}
