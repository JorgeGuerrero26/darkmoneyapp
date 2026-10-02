import type {
  CounterpartyOverview,
  ObligationSummary,
  RecurringIncomeSummary,
  SubscriptionSummary,
  ExchangeRateSummary,
} from "../../../types/domain";
import type { ContactMetrics } from "../../../components/domain/ContactCard";
import { buildContactMoney } from "./contact-money";

type Args = {
  counterparties: CounterpartyOverview[];
  obligations: ObligationSummary[];
  subscriptions: SubscriptionSummary[];
  recurringIncome: RecurringIncomeSummary[];
  baseCurrency: string;
  exchangeRates: ExchangeRateSummary[];
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
  baseCurrency,
  exchangeRates,
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

  for (const contact of counterparties) {
    const amounts = buildContactMoney({ obligations, subscriptions, recurringIncome, exchangeRates }, contact.id, baseCurrency);
    Object.assign(ensureMetrics(contact.id), {
      receivablePendingTotal: amounts.receivablePendingTotal, payablePendingTotal: amounts.payablePendingTotal,
      receivable: amounts.exposureLoaded ? amounts.receivable : undefined,
      payable: amounts.exposureLoaded ? amounts.payable : undefined,
      hasReceivable: amounts.exposureLoaded ? amounts.hasReceivable : contact.receivableCount > 0,
      hasPayable: amounts.exposureLoaded ? amounts.hasPayable : contact.payableCount > 0,
    });
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

export function contactHasOpenBalance(metrics: ContactMetrics | undefined) {
  return Boolean(metrics && ((metrics.hasReceivable ?? metrics.receivablePendingTotal > 0) || (metrics.hasPayable ?? metrics.payablePendingTotal > 0)));
}
