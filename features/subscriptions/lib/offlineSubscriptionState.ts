import { computeNextRecurringDate } from "../../../lib/subscription-helpers";
import { centsText, selectCalculation, type CalculationGate } from "../../../lib/offline/calculation";
import { exactCents, moneyText } from "../../../lib/offline/money";
import type { SubscriptionFrequency, SubscriptionSummary } from "../../../types/domain";
import { subscriptionStanding, type StandingOccurrence, type SubscriptionStanding } from "./subscriptionStanding";

type Row = Record<string, unknown>;
export type SubscriptionStateInput = {
  workspaceId: number;
  subscriptions: Row[];
  occurrences: Row[];
  accounts: Row[];
  categories: Row[];
  counterparties: Row[];
};

/** Réplica de v_subscription_upcoming: solo historial real, sin generar cobros o avanzar fechas. */
export function computeSubscriptionUpcoming(input: SubscriptionStateInput): Row[] {
  const indexed = (rows: Row[]) => new Map(rows.filter(row => row.workspace_id === input.workspaceId).map(row => [row.id, row]));
  const parents = indexed(input.subscriptions), accounts = indexed(input.accounts), categories = indexed(input.categories), parties = indexed(input.counterparties);
  return input.occurrences.flatMap(occurrence => {
    const parent = parents.get(occurrence.subscription_id);
    if (!parent || !["scheduled", "overdue"].includes(String(occurrence.status))) return [];
    return [{ workspace_id: parent.workspace_id, occurrence_id: occurrence.id, subscription_id: parent.id, name: parent.name,
      subscription_status: parent.status, due_date: occurrence.due_date, expected_amount: moneyText(occurrence.expected_amount),
      currency_code: parent.currency_code, occurrence_status: occurrence.status, account_id: parent.account_id,
      account_name: accounts.get(parent.account_id)?.name ?? null, category_id: parent.category_id,
      category_name: categories.get(parent.category_id)?.name ?? null, vendor_party_id: parent.vendor_party_id,
      vendor_name: parties.get(parent.vendor_party_id)?.name ?? null }];
  });
}

export function selectSubscriptionUpcoming(gate: CalculationGate, input: SubscriptionStateInput, serverRows: Row[]) {
  return selectCalculation(gate, serverRows, () => computeSubscriptionUpcoming(input));
}

/** Agregado del historial que usa el presenter existente; mantiene dinero exacto como texto. */
export function computePendingSubscriptionCharges(occurrences: Row[], subscriptionId: number, today: string) {
  const pending = occurrences.filter(row => row.subscription_id === subscriptionId && row.status === "scheduled" && String(row.due_date) < today);
  let total = 0n;
  for (const row of pending) {
    const amount = exactCents(row.expected_amount);
    if (amount == null) throw new Error("El historial tiene un monto que solo se puede consultar desde el servidor.");
    total += BigInt(amount);
  }
  return { count: pending.length, amount: centsText(total) };
}

/** Reutiliza el calendario que tiene paridad con next_subscription_due(..., day_of_month). */
export function selectSubscriptionNextDue(gate: CalculationGate, subscription: Row, serverNext: string) {
  return selectCalculation(gate, serverNext, () => {
    if (!["daily", "weekly", "monthly", "quarterly", "yearly", "custom"].includes(String(subscription.frequency))) throw new Error("La frecuencia no tiene paridad verificada.");
    const interval = Number(subscription.interval_count ?? 1), anchor = subscription.day_of_month == null ? null : Number(subscription.day_of_month);
    if (!Number.isInteger(interval) || interval < 1 || (anchor != null && (!Number.isInteger(anchor) || anchor < 1 || anchor > 31))) throw new Error("El calendario requiere el valor del servidor.");
    return computeNextRecurringDate(String(subscription.next_due_date), subscription.frequency as SubscriptionFrequency, interval, anchor);
  });
}

/** Reutiliza el presenter del módulo sin cambiar el trabajo del dueño ni inventar ocurrencias. */
export function selectSubscriptionStanding(gate: CalculationGate, args: {
  subscription: SubscriptionSummary;
  today: string;
  occurrences: Row[];
  formatAmount: (amount: number) => string;
  formatDate: (date: string) => string;
}, serverStanding: SubscriptionStanding) {
  return selectCalculation(gate, serverStanding, () => {
    const { subscription, today } = args;
    const history = args.occurrences.filter(row => row.subscription_id === subscription.id);
    const expected = computePendingSubscriptionCharges(history, subscription.id, today);
    const occurrences: StandingOccurrence[] = history.map(row => {
      const amount = exactCents(row.expected_amount);
      if (amount == null) throw new Error("El historial requiere el valor exacto del servidor.");
      return { dueDate: String(row.due_date), status: String(row.status), expectedAmount: amount / 100 };
    });
    const standing = subscriptionStanding({ ...args, occurrences });
    if (subscription.status === "active" && subscription.nextDueDate < today && expected.count > 0 &&
      (standing.missedCharges !== expected.count || exactCents(standing.missedAmount) !== exactCents(expected.amount))) {
      throw new Error("El total calculado no conserva los centavos exactos del historial.");
    }
    return standing;
  });
}
