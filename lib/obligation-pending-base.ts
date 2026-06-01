import {
  resolveConversion,
  type ExchangeRateMap,
} from "./exchange-rate-map";
import type {
  ObligationSummary,
  SharedObligationSummary,
} from "../types/domain";

/**
 * Return the obligation's pending amount expressed in the workspace base
 * currency. Uses the precomputed `pendingAmountInBaseCurrency` field when the
 * SQL view already provides it; otherwise falls back to converting via the
 * exchange rate map.
 *
 * Why: extracted from `app/(app)/obligations.tsx` so the conversion logic
 * lives in one place. Pairs with `lib/exchange-rate-map.ts` (buildRateMap +
 * resolveConversion) which is the SSOT for FX in the app.
 */
export function pendingAmountInBaseCurrency(
  obligation: ObligationSummary | SharedObligationSummary,
  exchangeRateMap: ExchangeRateMap,
  baseCurrency: string,
): number {
  if (
    "pendingAmountInBaseCurrency" in obligation &&
    obligation.pendingAmountInBaseCurrency != null
  ) {
    return obligation.pendingAmountInBaseCurrency;
  }

  return (
    obligation.pendingAmount *
    resolveConversion(
      exchangeRateMap,
      obligation.currencyCode.toUpperCase(),
      baseCurrency,
    )
  );
}
