import { addDays, endOfDay, startOfDay } from "date-fns";

import type { ProjectedMonth } from "../../projection/lib/cashflow-calendar";
import { projectionFlowItems } from "./projectionFlowItems";

export function firstNegativeMonth(months: readonly ProjectedMonth[]): ProjectedMonth | null {
  return months.find((month) => month.closingBalance < 0) ?? null;
}

/** The headline and chart cover the chosen horizon; only the ledger starts with three rows. */
export function visibleProjectionMonths(months: readonly ProjectedMonth[], expanded: boolean): readonly ProjectedMonth[] {
  return expanded ? months : months.slice(0, 3);
}

/** Use calendar occurrences so the displayed total equals the charges actually listed. */
export function upcomingSubscriptionCharges(months: readonly ProjectedMonth[], now: Date) {
  const end = endOfDay(addDays(now, 30));
  return projectionFlowItems(months, now).filter(
    (item) => item.source === "subscription" && item.direction === "outflow" && item.date >= startOfDay(now) && item.date <= end,
  );
}
