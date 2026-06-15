/**
 * Conversión de moneda ESTÁNDAR para web y móvil (contrato de paridad).
 * Copia canónica espejo en DarkMoney/src/modules/dashboard/lib/parity/currency.ts.
 *
 * Algoritmo: directa → inversa → amountInBaseCurrency → puente por tasas vía
 * moneda base → null. NUNCA fallback silencioso a 1: los montos no convertibles
 * deben sumar 0 y contarse en un `unconvertedCount` expuesto al usuario.
 */

function lookupRate(map: Map<string, number>, from: string, to: string): number | null {
  if (from === to) return 1;
  const direct = map.get(`${from}:${to}`);
  if (direct) return direct;
  const inverse = map.get(`${to}:${from}`);
  if (inverse) return 1 / inverse;
  return null;
}

/** Tasa from→to usando directa, inversa o puente vía la moneda base. */
export function resolveParityRate(
  map: Map<string, number>,
  from: string,
  to: string,
  baseCurrency: string,
): number | null {
  const normalizedFrom = from.trim().toUpperCase();
  const normalizedTo = to.trim().toUpperCase();
  const normalizedBase = baseCurrency.trim().toUpperCase();

  const direct = lookupRate(map, normalizedFrom, normalizedTo);
  if (direct !== null) return direct;

  const toBase = lookupRate(map, normalizedFrom, normalizedBase);
  const baseToTarget = lookupRate(map, normalizedBase, normalizedTo);
  if (toBase !== null && baseToTarget !== null) return toBase * baseToTarget;

  return null;
}

export type ConvertParityAmountInput = {
  amount: number;
  /** Moneda del monto; si es null/undefined se asume la moneda base. */
  currencyCode?: string | null;
  /** Monto ya expresado en moneda base, si el backend lo provee. */
  amountInBaseCurrency?: number | null;
  baseCurrencyCode: string;
  targetCurrencyCode: string;
  exchangeRateMap: Map<string, number>;
};

/** Convierte un monto a la moneda destino, o null si no hay tasa posible. */
export function convertParityAmount({
  amount,
  currencyCode,
  amountInBaseCurrency,
  baseCurrencyCode,
  targetCurrencyCode,
  exchangeRateMap,
}: ConvertParityAmountInput): number | null {
  const base = baseCurrencyCode.trim().toUpperCase();
  const target = targetCurrencyCode.trim().toUpperCase();
  const source = (currencyCode ?? base).trim().toUpperCase();

  if (source === target) return amount;

  const directRate = lookupRate(exchangeRateMap, source, target);
  if (directRate !== null) return amount * directRate;

  if (amountInBaseCurrency !== null && amountInBaseCurrency !== undefined) {
    if (target === base) return amountInBaseCurrency;
    const baseToTarget = lookupRate(exchangeRateMap, base, target);
    if (baseToTarget !== null) return amountInBaseCurrency * baseToTarget;
  }

  const sourceToBase = lookupRate(exchangeRateMap, source, base);
  const baseToTarget = lookupRate(exchangeRateMap, base, target);
  if (sourceToBase !== null && baseToTarget !== null) {
    return amount * sourceToBase * baseToTarget;
  }

  return null;
}
