import type { ResourceSection } from "../../../components/ui/ResourceSectionList";
import type { ExchangeRateRecord } from "../../../services/queries/exchange-rates";
import { SUPPORTED_CURRENCY_CODES } from "../../../constants/currencies";

export function getExchangeRateCurrencyOptions(rates: ExchangeRateRecord[]) {
  const currencies = new Set<string>(SUPPORTED_CURRENCY_CODES);
  for (const rate of rates) {
    currencies.add(rate.fromCurrencyCode.toUpperCase());
    currencies.add(rate.toCurrencyCode.toUpperCase());
  }
  return Array.from(currencies).sort();
}

export type ExchangeRateListSection = ResourceSection<ExchangeRateRecord, string>;
export type ExchangeRateAdvancedFilter = "all" | "pinned" | "manual" | "synced" | "updated_today" | "stale";

export const EXCHANGE_RATE_ADVANCED_FILTERS: Array<{ label: string; value: ExchangeRateAdvancedFilter }> = [
  { label: "Todos", value: "all" },
  { label: "Fijados", value: "pinned" },
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
  advancedFilter: ExchangeRateAdvancedFilter | ExchangeRateAdvancedFilter[] = "all",
  today = new Date(),
) {
  const query = searchText.trim().toLowerCase();
  const filters = Array.isArray(advancedFilter) ? advancedFilter : [advancedFilter];
  const sources = filters.filter((value) => value === "manual" || value === "synced");
  const dates = filters.filter((value) => value === "updated_today" || value === "stale");

  return rates.filter((rate) => {
    const from = rate.fromCurrencyCode.toUpperCase();
    const to = rate.toCurrencyCode.toUpperCase();
    if (currencyFilter !== "all" && from !== currencyFilter && to !== currencyFilter) return false;
    if (filters.includes("pinned") && !rate.isPinned) return false;
    if (sources.length === 1 && (rate.source === "manual") !== sources.includes("manual")) return false;
    if (dates.length === 1 && isExchangeRateSameLocalDay(rate.effectiveAt, today) !== dates.includes("updated_today")) return false;
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
  const pinned = rates.filter((rate) => rate.isPinned);
  const rest = rates.filter((rate) => !rate.isPinned);

  const grouped = new Map<string, ExchangeRateRecord[]>();
  for (const rate of rest) {
    const key = `${rate.fromCurrencyCode}:${rate.toCurrencyCode}`;
    grouped.set(key, [...(grouped.get(key) ?? []), rate]);
  }

  const hasPinned = pinned.length > 0;
  const hideHeader = !hasPinned && grouped.size <= 1;

  const restSections: ExchangeRateListSection[] = Array.from(grouped.entries()).map(([key, data]) => ({
    key,
    label: key.replace(":", " → "),
    data,
    headerVariant: hideHeader ? "hidden" : "divider",
  }));

  return [
    ...(hasPinned ? [{
      key: "__pinned__",
      label: `Fijados (${pinned.length})`,
      data: pinned,
      headerVariant: "divider" as const,
    }] : []),
    ...restSections,
  ];
}

export function getExchangeRatePairCount(rates: ExchangeRateRecord[]) {
  return new Set(rates.map((rate) => `${rate.fromCurrencyCode}:${rate.toCurrencyCode}`)).size;
}
