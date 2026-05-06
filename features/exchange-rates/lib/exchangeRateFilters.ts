import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { ExchangeRateRecord } from "../../../services/queries/workspace-data";

export type ExchangeRateListSection = ResourceSection<ExchangeRateRecord, string>;
export type ExchangeRateAdvancedFilter = "all" | "manual" | "synced" | "updated_today" | "stale";

export const EXCHANGE_RATE_ADVANCED_FILTERS: Array<{ label: string; value: ExchangeRateAdvancedFilter }> = [
  { label: "Todos", value: "all" },
  { label: "Manuales", value: "manual" },
  { label: "Sincronizados", value: "synced" },
  { label: "Actualizados hoy", value: "updated_today" },
  { label: "Por actualizar", value: "stale" },
];

export function exchangeRateAdvancedFilterLabel(filter: ExchangeRateAdvancedFilter) {
  return EXCHANGE_RATE_ADVANCED_FILTERS.find((item) => item.value === filter)?.label ?? filter;
}

export function isExchangeRateSameLocalDay(left: string, right: Date) {
  const date = new Date(left);
  if (Number.isNaN(date.getTime())) return false;
  return date.toLocaleDateString("en-CA") === right.toLocaleDateString("en-CA");
}

export function filterExchangeRates(
  rates: ExchangeRateRecord[],
  currencyFilter: string,
  searchText: string,
  advancedFilter: ExchangeRateAdvancedFilter = "all",
  today = new Date(),
) {
  const query = searchText.trim().toLowerCase();

  return rates.filter((rate) => {
    const from = rate.fromCurrencyCode.toUpperCase();
    const to = rate.toCurrencyCode.toUpperCase();
    if (currencyFilter !== "all" && from !== currencyFilter && to !== currencyFilter) return false;
    if (advancedFilter === "manual" && rate.source !== "manual") return false;
    if (advancedFilter === "synced" && rate.source === "manual") return false;
    if (advancedFilter === "updated_today" && !isExchangeRateSameLocalDay(rate.effectiveAt, today)) return false;
    if (advancedFilter === "stale" && isExchangeRateSameLocalDay(rate.effectiveAt, today)) return false;
    if (!query) return true;

    return (
      from.toLowerCase().includes(query) ||
      to.toLowerCase().includes(query) ||
      `${from} ${to}`.toLowerCase().includes(query) ||
      `${from}:${to}`.toLowerCase().includes(query) ||
      String(rate.rate).includes(query) ||
      (rate.notes ?? "").toLowerCase().includes(query)
    );
  });
}

export function buildExchangeRateSections(rates: ExchangeRateRecord[]): ExchangeRateListSection[] {
  const grouped = new Map<string, ExchangeRateRecord[]>();

  for (const rate of rates) {
    const key = `${rate.fromCurrencyCode}:${rate.toCurrencyCode}`;
    grouped.set(key, [...(grouped.get(key) ?? []), rate]);
  }

  const hideHeader = grouped.size <= 1;
  return Array.from(grouped.entries()).map(([key, data]) => ({
    key,
    label: key.replace(":", " → "),
    data,
    headerVariant: hideHeader ? "hidden" : "default",
  }));
}

export function getExchangeRatePairCount(rates: ExchangeRateRecord[]) {
  return new Set(rates.map((rate) => `${rate.fromCurrencyCode}:${rate.toCurrencyCode}`)).size;
}
