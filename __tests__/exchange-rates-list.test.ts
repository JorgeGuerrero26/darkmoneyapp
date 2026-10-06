import { buildExchangeRateSections, filterExchangeRates, getExchangeRatePairCount } from "../features/exchange-rates/lib/exchangeRateFilters";
import type { ExchangeRateRecord } from "../services/queries/exchange-rates";
const rate = (id: number, props: Partial<ExchangeRateRecord> = {}): ExchangeRateRecord => ({
  id, fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.7,
  effectiveAt: new Date(2026, 9, 6, 12).toISOString(), source: "manual", notes: null, isPinned: false, ...props,
});

it("combina moneda, fuente, fecha y fijados", () => {
  const input = [rate(1, { isPinned: true }), rate(2), rate(3, { isPinned: true, source: "provider" }), rate(4, { isPinned: true, effectiveAt: new Date(2026, 9, 5).toISOString() })];
  expect(filterExchangeRates(input, "PEN", "", ["manual", "pinned", "updated_today"], new Date(2026, 9, 6)).map((item) => item.id)).toEqual([1]);
  expect(filterExchangeRates(input, "USD", "", ["stale"], new Date(2026, 9, 6)).map((item) => item.id)).toEqual([4]);
  expect(filterExchangeRates(input, "EUR", "", [])).toEqual([]);
});

it("conserva filtros simples y agrupa cada tasa una sola vez", () => {
  const input = [rate(1, { isPinned: true }), rate(2), rate(3, { fromCurrencyCode: "EUR" })];
  expect(filterExchangeRates(input, "all", "", "pinned").map((item) => item.id)).toEqual([1]);
  const sections = buildExchangeRateSections(input);
  expect(sections.flatMap((item) => item.data.map((row) => row.id))).toEqual([1, 2, 3]);
  expect(sections.every((item) => item.headerVariant === "divider")).toBe(true);
  expect(getExchangeRatePairCount(filterExchangeRates(input, "EUR", ""))).toBe(1);
});
