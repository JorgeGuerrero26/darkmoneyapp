import { addDays, endOfMonth, format, startOfMonth } from "date-fns";

import { parseDisplayDate, todayPeru } from "../../../lib/date";
import type { SubscriptionSummary } from "../../../types/domain";

export type SubscriptionDueDateFilter = "all" | "overdue" | "today" | "next7" | "month" | "custom";

export type SubscriptionDueDateRange = {
  from?: string;
  to?: string;
  label: string;
};

export const SUBSCRIPTION_DUE_DATE_FILTERS: Array<{ label: string; value: SubscriptionDueDateFilter }> = [
  { label: "Todo", value: "all" },
  { label: "Vencidas", value: "overdue" },
  { label: "Hoy", value: "today" },
  { label: "Próx. 7 días", value: "next7" },
  { label: "Este mes", value: "month" },
  { label: "Rango / día", value: "custom" },
];

function toYmd(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function normalizeRange(from: string, to: string) {
  if (!from || !to) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

export function getSubscriptionDueDateRange(
  filter: SubscriptionDueDateFilter,
  customFrom: string,
  customTo: string,
  today = todayPeru(),
): SubscriptionDueDateRange | null {
  const todayDate = parseDisplayDate(today);

  switch (filter) {
    case "overdue":
      return { to: toYmd(addDays(todayDate, -1)), label: "Vencidas" };
    case "today":
      return { from: today, to: today, label: "Hoy" };
    case "next7":
      return { from: today, to: toYmd(addDays(todayDate, 7)), label: "Próx. 7 días" };
    case "month":
      return {
        from: toYmd(startOfMonth(todayDate)),
        to: toYmd(endOfMonth(todayDate)),
        label: "Este mes",
      };
    case "custom": {
      const range = normalizeRange(customFrom, customTo);
      if (!range) return null;
      return {
        ...range,
        label: range.from === range.to ? range.from : `${range.from} - ${range.to}`,
      };
    }
    case "all":
    default:
      return null;
  }
}

export function filterSubscriptionsByDueDate(
  subscriptions: SubscriptionSummary[],
  range: SubscriptionDueDateRange | null,
) {
  if (!range) return subscriptions;

  return subscriptions.filter((subscription) => {
    const dueDate = toYmd(parseDisplayDate(subscription.nextDueDate));
    if (range.from && dueDate < range.from) return false;
    if (range.to && dueDate > range.to) return false;
    return true;
  });
}
