import { format, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { todayPeru } from "./date";
import { ymdToLocalDate } from "./obligation-date-range";

export type MonthlySeriesScope = "6" | "12" | "all";

export type MonthlySeriesPoint = {
  label: string;
  key: string;
  total: number;
};

/**
 * Build a monthly series for the analytics chart. Two modes:
 *   - "6" / "12": the last N months ending in today's month (Peru timezone).
 *     Includes empty months. Label format: "ene".
 *   - "all":   only the months where items exist; if none, returns a single
 *     fallback month for the current month. Label format: "ene 26".
 *
 * Why: extracted because the chart and the cash-perspective chart had the
 * exact same loop with different `getAmount` extractors.
 */
export function buildMonthlySeries<T>(input: {
  items: T[];
  scope: MonthlySeriesScope;
  getMonthKey: (item: T) => string;
  getAmount: (item: T) => number;
}): MonthlySeriesPoint[] {
  const { items, scope, getMonthKey, getAmount } = input;

  if (scope === "all") {
    const keys = [...new Set(items.map(getMonthKey))].sort();
    const anchor = ymdToLocalDate(todayPeru());
    const fallbackKey = format(startOfMonth(anchor), "yyyy-MM");
    const monthKeys = keys.length > 0 ? keys : [fallbackKey];
    return monthKeys.map((key) => {
      const d = ymdToLocalDate(`${key}-01`);
      const label = format(d, "MMM yy", { locale: es });
      const total = items
        .filter((item) => getMonthKey(item) === key)
        .reduce((sum, item) => sum + getAmount(item), 0);
      return { label, key, total };
    });
  }

  const n = scope === "12" ? 12 : 6;
  const anchor = ymdToLocalDate(todayPeru());
  const months: MonthlySeriesPoint[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = startOfMonth(subMonths(anchor, i));
    const key = format(d, "yyyy-MM");
    const label = format(d, "MMM", { locale: es });
    const total = items
      .filter((item) => getMonthKey(item) === key)
      .reduce((sum, item) => sum + getAmount(item), 0);
    months.push({ label, key, total });
  }
  return months;
}
