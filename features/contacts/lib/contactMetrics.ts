import type {
  CounterpartyOverview,
  ObligationSummary,
  RecurringIncomeSummary,
  SubscriptionSummary,
} from "../../../types/domain";
import type { ContactMetrics } from "../../../components/domain/ContactCard";

type Args = {
  counterparties: CounterpartyOverview[];
  obligations: ObligationSummary[];
  subscriptions: SubscriptionSummary[];
  recurringIncome: RecurringIncomeSummary[];
};

function seedFromContact(contact: CounterpartyOverview): ContactMetrics {
  return {
    movementCount: contact.movementCount,
    receivablePendingTotal: 0,
    payablePendingTotal: 0,
    subscriptionCount: 0,
    recurringIncomeCount: 0,
  };
}

export function buildContactMetricsById({
  counterparties,
  obligations,
  subscriptions,
  recurringIncome,
}: Args): Map<number, ContactMetrics> {
  const map = new Map<number, ContactMetrics>();
  const contactById = new Map(counterparties.map((contact) => [contact.id, contact]));

  function ensureMetrics(contactId: number) {
    const current = map.get(contactId);
    if (current) return current;
    const contact = contactById.get(contactId);
    const next: ContactMetrics = contact
      ? seedFromContact(contact)
      : {
          movementCount: 0,
          receivablePendingTotal: 0,
          payablePendingTotal: 0,
          subscriptionCount: 0,
          recurringIncomeCount: 0,
        };
    map.set(contactId, next);
    return next;
  }

  for (const obligation of obligations) {
    if (obligation.counterpartyId == null || obligation.status === "cancelled") continue;
    const metrics = ensureMetrics(obligation.counterpartyId);
    if (obligation.direction === "receivable") {
      metrics.receivablePendingTotal += obligation.pendingAmount;
    } else {
      metrics.payablePendingTotal += obligation.pendingAmount;
    }
  }

  for (const subscription of subscriptions) {
    if (subscription.vendorPartyId == null) continue;
    ensureMetrics(subscription.vendorPartyId).subscriptionCount += 1;
  }

  for (const income of recurringIncome) {
    if (income.payerPartyId == null) continue;
    ensureMetrics(income.payerPartyId).recurringIncomeCount += 1;
  }

  return map;
}
