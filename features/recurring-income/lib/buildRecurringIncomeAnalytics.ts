import { differenceInCalendarDays, format, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { buildCurrencyBreakdown } from "../../../lib/analytics-currency";
import { parseDisplayDate } from "../../../lib/date";
import { convertAmountToWorkspaceBase } from "../../../lib/subscription-helpers";
import type { ExchangeRateSummary, RecurringIncomeOccurrenceSummary } from "../../../types/domain";

export type AnalysedArrival = RecurringIncomeOccurrenceSummary & {
  amountInBaseCurrency: number | null;
  latenessDays: number;
};

export function buildRecurringIncomeAnalytics(
  occurrences: RecurringIncomeOccurrenceSummary[],
  baseCurrencyCode: string,
  exchangeRates: ExchangeRateSummary[],
  today = new Date(),
) {
  const rows: AnalysedArrival[] = occurrences.map((occurrence) => ({
    ...occurrence,
    amountInBaseCurrency: convertAmountToWorkspaceBase(
      occurrence.amount,
      occurrence.currencyCode,
      baseCurrencyCode,
      exchangeRates,
    ),
    latenessDays: Math.max(0, differenceInCalendarDays(
      parseDisplayDate(occurrence.actualDate),
      parseDisplayDate(occurrence.expectedDate),
    )),
  })).sort((left, right) =>
    right.actualDate.localeCompare(left.actualDate)
    || (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
  );

  const months = Array.from({ length: 12 }, (_, index) => {
    const date = subMonths(new Date(today.getFullYear(), today.getMonth(), 1), 11 - index);
    return { key: format(date, "yyyy-MM"), label: format(date, "MMM yy", { locale: es }), total: 0, count: 0 };
  });
  const monthByKey = new Map(months.map((month) => [month.key, month]));
  let comparableTotal = 0;
  let comparableCount = 0;
  for (const row of rows) {
    if (row.amountInBaseCurrency == null || !Number.isFinite(row.amountInBaseCurrency)) continue;
    comparableTotal += row.amountInBaseCurrency;
    comparableCount += 1;
    const month = monthByKey.get(row.actualDate.slice(0, 7));
    if (month) {
      month.total += row.amountInBaseCurrency;
      month.count += 1;
    }
  }

  const onTimeCount = rows.filter((row) => row.status === "on_time").length;
  const lateRows = rows.filter((row) => row.status === "late");
  const positiveDelays = lateRows.filter((row) => row.latenessDays > 0);
  const averageLateDays = positiveDelays.length > 0
    ? positiveDelays.reduce((sum, row) => sum + row.latenessDays, 0) / positiveDelays.length
    : 0;

  return {
    rows,
    currencies: buildCurrencyBreakdown(rows.map((row) => ({
      currencyCode: row.currencyCode,
      amount: row.amount,
      amountInBaseCurrency: row.amountInBaseCurrency,
    }))),
    comparableTotal,
    comparableCount,
    averageBase: comparableCount > 0 ? comparableTotal / comparableCount : 0,
    months,
    onTimeCount,
    lateCount: lateRows.length,
    averageLateDays,
    punctualityPct: rows.length > 0 ? onTimeCount / rows.length * 100 : 0,
    latest: rows[0] ?? null,
  };
}
