import { addDays, endOfDay, startOfDay } from "date-fns";

import { currentDebt, hasCycle, nextPaymentDate } from "../../accounts/lib/creditCardCycle";
import { parseDisplayDate } from "../../../lib/date";
import { displayCategoryName } from "../../../lib/category-display-name";
import { obligationViewerDirection } from "../../../lib/obligation-viewer-labels";
import type { AccountSummary, BudgetOverview, ObligationSummary, RecurringIncomeSummary, SharedObligationSummary, SubscriptionSummary } from "../../../types/domain";

export type SimpleAgendaItem = {
  key: string;
  title: string;
  date: Date;
  amount: number;
  currency: string;
  flow: "in" | "out";
  kind: "obligation" | "subscription" | "income" | "card";
  id: number;
};

/** Solo presupuestos vigentes que ya merecen atención; nunca renombra datos del usuario. */
export function simpleBudgetWarnings(budgets: readonly BudgetOverview[], now: Date) {
  const day = startOfDay(now);
  return budgets
    .filter((budget) => budget.isActive && budget.limitAmount > 0 && budget.usedPercent >= 80
      && parseDisplayDate(budget.periodStart) <= day && parseDisplayDate(budget.periodEnd) >= day)
    .sort((a, b) => Number(b.spentAmount > b.limitAmount) - Number(a.spentAmount > a.limitAmount)
      || b.usedPercent - a.usedPercent)
    .slice(0, 3);
}

export function simpleTopCategories(totals: ReadonlyMap<number | null, number>, names: ReadonlyMap<number, string>) {
  return [...totals.entries()]
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, amount]) => ({ id, name: id == null ? "Sin categoría" : displayCategoryName(names.get(id) ?? "Sin categoría"), amount }));
}

export function simpleUpcomingItems(input: {
  obligations: readonly (ObligationSummary | SharedObligationSummary)[];
  subscriptions: readonly SubscriptionSummary[];
  recurringIncome: readonly RecurringIncomeSummary[];
  creditCards: readonly AccountSummary[];
  now: Date;
}) {
  const from = startOfDay(input.now);
  const until = endOfDay(addDays(from, 30));
  const items: SimpleAgendaItem[] = [];
  const add = (item: SimpleAgendaItem) => {
    if (item.date >= from && item.date <= until && item.amount > 0) items.push(item);
  };
  for (const obligation of input.obligations) {
    if (obligation.status !== "active" || !obligation.dueDate) continue;
    const flow = obligationViewerDirection(obligation) === "receivable" ? "in" : "out";
    add({ key: `ob-${obligation.id}`, id: obligation.id, kind: "obligation", flow,
      title: flow === "in" ? obligation.counterparty.trim() || obligation.title : obligation.title,
      date: parseDisplayDate(obligation.dueDate), amount: obligation.pendingAmount, currency: obligation.currencyCode });
  }
  for (const subscription of input.subscriptions) {
    if (subscription.status !== "active") continue;
    add({ key: `sub-${subscription.id}`, id: subscription.id, kind: "subscription", flow: "out",
      title: subscription.name, date: parseDisplayDate(subscription.nextDueDate), amount: subscription.amount, currency: subscription.currencyCode });
  }
  for (const income of input.recurringIncome) {
    if (income.status !== "active") continue;
    add({ key: `income-${income.id}`, id: income.id, kind: "income", flow: "in",
      title: income.name, date: parseDisplayDate(income.nextExpectedDate), amount: income.amount, currency: income.currencyCode });
  }
  for (const card of input.creditCards) {
    if (card.isArchived || !hasCycle(card)) continue;
    const amount = currentDebt(card.currentBalance);
    const date = nextPaymentDate(card.paymentDay!, input.now);
    if (date) add({ key: `card-${card.id}`, id: card.id, kind: "card", flow: "out",
      title: card.name, date: startOfDay(date), amount, currency: card.currencyCode });
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime() || a.key.localeCompare(b.key)).slice(0, 4);
}

export function simpleReceivables(obligations: readonly (ObligationSummary | SharedObligationSummary)[], convert: (amount: number, currency: string) => number | null) {
  const active = obligations.filter((item) => item.status === "active" && obligationViewerDirection(item) === "receivable" && item.pendingAmount > 0);
  const people = new Set(active.map((item) => item.counterparty.trim()).filter(Boolean));
  const dated = active.map((item) => item.dueDate && parseDisplayDate(item.dueDate)).filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime());
  const converted = active.map((item) => convert(item.pendingAmount, item.currencyCode));
  return { count: active.length, peopleCount: people.size, firstDate: dated[0] ?? null,
    total: converted.every((amount) => amount != null) ? converted.reduce<number>((sum, amount) => sum + (amount ?? 0), 0) : null };
}
