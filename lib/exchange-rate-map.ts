/**
 * Currency conversion helpers used across modules (accounts, dashboard, budgets, …).
 *
 * Each rate is a directional triple {from → to: rate}. The map exposes:
 *   - direct lookups (`from:to`)
 *   - inverse lookups (`1 / map[to:from]`) when no direct rate exists
 *   - identity (`from === to → 1`)
 *
 * Pure module — no React, no React Native imports.
 */

export type ExchangeRateInput = {
  fromCurrencyCode: string;
  toCurrencyCode: string;
  rate: number;
};

export type ExchangeRateMap = Map<string, number>;

/**
 * Build a directional map keyed by `FROM:TO`. Only the first positive rate
 * for a given pair is kept (subsequent duplicates are ignored).
 */
export function buildRateMap(rates: readonly ExchangeRateInput[]): ExchangeRateMap {
  const map: ExchangeRateMap = new Map();
  for (const rate of rates) {
    if (!(rate.rate > 0)) continue;
    const key = `${rate.fromCurrencyCode.toUpperCase()}:${rate.toCurrencyCode.toUpperCase()}`;
    if (!map.has(key)) map.set(key, rate.rate);
  }
  return map;
}

/**
 * Resolve the multiplier to convert `from → to`. Returns 1 when:
 *   - currencies are equal
 *   - no direct nor inverse rate is available (caller decides whether to warn)
 */
export function resolveConversion(map: ExchangeRateMap, from: string, to: string): number {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;
  const direct = map.get(`${f}:${t}`);
  if (direct) return direct;
  const inverse = map.get(`${t}:${f}`);
  if (inverse) return 1 / inverse;
  return 1;
}

/**
 * Cheap "do we know how to convert?" check. Equal currencies count as
 * convertible. Used to disable currency selector options that would silently
 * fall back to a 1:1 placeholder.
 */
export function hasConversionRate(map: ExchangeRateMap, from: string, to: string): boolean {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return true;
  return map.has(`${f}:${t}`) || map.has(`${t}:${f}`);
}
