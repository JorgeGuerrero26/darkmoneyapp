import type { SubscriptionFrequency, SubscriptionStatus, SubscriptionSummary } from "../../../types/domain";

export type SubscriptionFilter = "all" | SubscriptionStatus | SubscriptionFrequency;
export type ActiveSubscriptionFilter = Exclude<SubscriptionFilter, "all">;

export const SUBSCRIPTION_FILTERS: Array<{ label: string; value: SubscriptionFilter }> = [
  { label: "Todas", value: "all" },
  { label: "Activas", value: "active" },
  { label: "Pausadas", value: "paused" },
  { label: "Canceladas", value: "cancelled" },
  { label: "Diario", value: "daily" },
  { label: "Mensual", value: "monthly" },
  { label: "Anual", value: "yearly" },
  { label: "Semanal", value: "weekly" },
  { label: "Trimestral", value: "quarterly" },
  { label: "Personalizado", value: "custom" },
];

const STATUS_VALUES = new Set<SubscriptionStatus>(["active", "paused", "cancelled"]);
const FREQUENCY_VALUES = new Set<SubscriptionFrequency>([
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
]);

export function subscriptionFilterLabel(filter: ActiveSubscriptionFilter) {
  return SUBSCRIPTION_FILTERS.find((item) => item.value === filter)?.label ?? filter;
}

export function filterSubscriptions(
  subscriptions: SubscriptionSummary[],
  filters: ActiveSubscriptionFilter[],
  searchText: string,
) {
  const query = searchText.trim().toLowerCase();
  const statusFilters = filters.filter((filter): filter is SubscriptionStatus => STATUS_VALUES.has(filter as SubscriptionStatus));
  const frequencyFilters = filters.filter((filter): filter is SubscriptionFrequency =>
    FREQUENCY_VALUES.has(filter as SubscriptionFrequency),
  );

  return subscriptions.filter((subscription) => {
    if (statusFilters.length > 0 && !statusFilters.includes(subscription.status)) return false;
    if (frequencyFilters.length > 0 && !frequencyFilters.includes(subscription.frequency)) return false;

    if (!query) return true;
    const haystack = [
      subscription.name,
      subscription.vendor,
      subscription.description ?? "",
      subscription.notes ?? "",
      subscription.categoryName ?? "",
      subscription.accountName ?? "",
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

export function getMonthlySubscriptionAmount(subscription: SubscriptionSummary, useBaseCurrency = false) {
  const amount = useBaseCurrency && subscription.amountInBaseCurrency != null
    ? subscription.amountInBaseCurrency
    : subscription.amount;

  switch (subscription.frequency) {
    case "yearly":
      return amount / 12;
    case "weekly":
      return (amount * 52) / 12;
    case "quarterly":
      return amount / 3;
    case "daily":
      return amount * 30;
    case "monthly":
    case "custom":
    default:
      return amount;
  }
}
