import { endOfMonth, format, startOfMonth } from "date-fns";

import { todayPeru } from "./date";

/**
 * Parse a YYYY-MM-DD string into a local Date (not UTC).
 *
 * Why: duplicated in at least 4 places (analytics modal, detail screen,
 * notification deep-link hook, event history container).
 */
export function ymdToLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns YYYY-MM-DD strings for the first and last day of today's month
 * (Peru timezone via {@link todayPeru}).
 */
export function currentMonthRangeYmd(): { from: string; to: string } {
  const today = ymdToLocalDate(todayPeru());
  return {
    from: format(startOfMonth(today), "yyyy-MM-dd"),
    to: format(endOfMonth(today), "yyyy-MM-dd"),
  };
}
