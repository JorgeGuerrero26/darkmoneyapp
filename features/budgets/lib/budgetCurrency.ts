import type { ExchangeRateSummary } from "../../../types/domain";

export function buildRateMap(rates: ExchangeRateSummary[]) {
  const map = new Map<string, number>();
  for (const rate of rates) {
    const from = rate.fromCurrencyCode.toUpperCase();
    const to = rate.toCurrencyCode.toUpperCase();
    if (rate.rate > 0 && !map.has(`${from}:${to}`)) {
      map.set(`${from}:${to}`, rate.rate);
    }
  }
  return map;
}

export function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Map<string, number>,
) {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return amount;
  const direct = rates.get(`${from}:${to}`);
  if (direct) return amount * direct;
  const inverse = rates.get(`${to}:${from}`);
  if (inverse) return amount / inverse;
  return amount;
}
