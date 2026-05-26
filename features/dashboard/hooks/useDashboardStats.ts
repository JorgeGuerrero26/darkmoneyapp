import { useMemo } from "react";

import type { DashboardMovementRow } from "../../../services/queries/workspace-data";
import { getPeriodBounds } from "../lib/aggregations";
import type { ConversionCtx, Period } from "../lib/types";
import { buildMovementsIndex } from "../selectors/movements-index";
import {
  selectCategoryTotals,
  selectDailyBreakdown,
  selectMonthlyPulse,
  selectPeriodTotals,
} from "../selectors/dashboard-stats-selectors";

export function useDashboardStats(
  movements: DashboardMovementRow[],
  period: Period,
  ctx: ConversionCtx,
) {
  // Index is rebuilt only when the movements array reference changes.
  const index = useMemo(() => buildMovementsIndex(movements), [movements]);

  return useMemo(() => {
    const now = new Date();
    const { curStart, curEnd, prevStart, prevEnd } = getPeriodBounds(period, now);

    const cur = selectPeriodTotals(index, curStart, curEnd, ctx);
    const prev = selectPeriodTotals(index, prevStart, prevEnd, ctx);

    const chartDays = selectDailyBreakdown(index, now, ctx, 7);
    const monthlyPulse = selectMonthlyPulse(index, now, ctx, 6);
    const catTotals = selectCategoryTotals(index, curStart, curEnd, ctx);
    const prevCatTotals = selectCategoryTotals(index, prevStart, prevEnd, ctx);

    return {
      curStart,
      curEnd,
      income: cur.income,
      expense: cur.expense,
      net: cur.net,
      prevIncome: prev.income,
      prevExpense: prev.expense,
      chartDays,
      monthlyPulse,
      catTotals,
      prevCatTotals,
    };
  }, [index, period, ctx]);
}
