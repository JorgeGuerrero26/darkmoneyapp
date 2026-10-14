import type { SubscriptionFrequency, SubscriptionStatus, SubscriptionSummary } from "../../../types/domain";

export type SubscriptionFilter = "all" | "pinned" | SubscriptionStatus | SubscriptionFrequency;
export type ActiveSubscriptionFilter = Exclude<SubscriptionFilter, "all">;

export const SUBSCRIPTION_FILTERS: Array<{ label: string; value: SubscriptionFilter }> = [
  { label: "Todas", value: "all" },
  { label: "Fijadas", value: "pinned" },
  { label: "Activas", value: "active" },
  { label: "Pausadas", value: "paused" },
  { label: "Canceladas", value: "cancelled" },
  { label: "Diario", value: "daily" },
  { label: "Mensual", value: "monthly" },
  { label: "Anual", value: "yearly" },
  { label: "Semanal", value: "weekly" },
  { label: "Trimestral", value: "quarterly" },
  { label: "Cada N días", value: "custom" },
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
  const pinnedOnly = filters.includes("pinned");
  const statusFilters = filters.filter((filter): filter is SubscriptionStatus => STATUS_VALUES.has(filter as SubscriptionStatus));
  const frequencyFilters = filters.filter((filter): filter is SubscriptionFrequency =>
    FREQUENCY_VALUES.has(filter as SubscriptionFrequency),
  );

  return subscriptions.filter((subscription) => {
    if (pinnedOnly && !subscription.isPinned) return false;
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

/** Cuántos "meses" cubre un cobro: lo mismo que usa el calendario para avanzar la fecha. */
export function getSubscriptionMonthlyFactor(
  frequency: SubscriptionSummary["frequency"],
  intervalCount: number | null | undefined,
): number {
  const n = Math.max(1, Math.floor(intervalCount ?? 1) || 1);
  switch (frequency) {
    case "daily":
      return 365 / 12 / n;
    case "weekly":
      return 52 / 12 / n;
    case "quarterly":
      return 1 / (3 * n);
    case "yearly":
      return 1 / (12 * n);
    case "monthly":
      return 1 / n;
    case "custom":
    default:
      // La cadencia personalizada avanza por días.
      return 365 / 12 / n;
  }
}

/** Equivalente mensual en la moneda propia de la suscripción. */
export function getMonthlySubscriptionAmount(subscription: SubscriptionSummary) {
  return subscription.amount * getSubscriptionMonthlyFactor(subscription.frequency, subscription.intervalCount);
}

export type SubscriptionMonthlySummary = {
  total: number;
  comparableCount: number;
  /** Activas sin conversión válida a la moneda base: no entran en el total. */
  unconvertedCount: number;
};

/**
 * Total mensual en moneda base. Una suscripción entra solo con conversión persistida válida o
 * si ya está en la moneda base; nunca se suma su monto nativo como si fuera base.
 */
export function summarizeSubscriptionsMonthly(
  subscriptions: SubscriptionSummary[],
  baseCurrencyCode: string,
): SubscriptionMonthlySummary {
  const base = baseCurrencyCode.toUpperCase();
  const summary: SubscriptionMonthlySummary = { total: 0, comparableCount: 0, unconvertedCount: 0 };
  for (const subscription of subscriptions) {
    if (subscription.status !== "active") continue;
    const converted = subscription.amountInBaseCurrency;
    const amount = converted != null && Number.isFinite(converted) && converted > 0
      ? converted
      : subscription.currencyCode.toUpperCase() === base ? subscription.amount : null;
    if (amount == null) {
      summary.unconvertedCount += 1;
      continue;
    }
    summary.total += amount * getSubscriptionMonthlyFactor(subscription.frequency, subscription.intervalCount);
    summary.comparableCount += 1;
  }
  return summary;
}
