import type { ExchangeRateRecord } from "../../../services/queries/exchange-rates";

export type UsdReferenceRate = {
  /** Cuántas unidades de la moneda base equivalen a 1 USD. */
  rate: number;
  baseCurrencyCode: string;
  effectiveAt: string;
};

/**
 * Tasa USD → moneda base más reciente, para el resumen del módulo (regla del
 * proyecto: USD es la referencia por defecto para comparaciones). Acepta el par
 * en cualquier dirección (invierte si está guardado base→USD). Devuelve null si
 * la base ES USD o no hay par sincronizado.
 */
export function getUsdReferenceRate(
  rates: ExchangeRateRecord[],
  baseCurrencyCode: string,
): UsdReferenceRate | null {
  const base = baseCurrencyCode.trim().toUpperCase();
  if (!base || base === "USD") return null;

  const candidates = rates
    .filter((rate) => {
      const from = rate.fromCurrencyCode.trim().toUpperCase();
      const to = rate.toCurrencyCode.trim().toUpperCase();
      return rate.rate > 0 && ((from === "USD" && to === base) || (from === base && to === "USD"));
    })
    .sort((left, right) => new Date(right.effectiveAt).getTime() - new Date(left.effectiveAt).getTime());

  const best = candidates[0];
  if (!best) return null;
  const direct = best.fromCurrencyCode.trim().toUpperCase() === "USD";
  const resolved = direct ? best.rate : 1 / best.rate;
  if (!Number.isFinite(resolved) || resolved <= 0) return null;
  return { rate: resolved, baseCurrencyCode: base, effectiveAt: best.effectiveAt };
}
