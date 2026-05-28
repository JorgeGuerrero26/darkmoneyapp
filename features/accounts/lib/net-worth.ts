import type { AccountSummary } from "../../../types/domain";
import { resolveConversion, type ExchangeRateMap } from "../../../lib/exchange-rate-map";

export type NetWorthInput = {
  accounts: readonly AccountSummary[];
  /** Workspace base currency (3-letter ISO). */
  baseCurrency: string;
  /** Currency the result should be expressed in. */
  displayCurrency: string;
  /** Pre-built rate map; pass an empty one to get base-currency math only. */
  exchangeRateMap: ExchangeRateMap;
};

/**
 * Sum the net-worth contribution of all accounts in `displayCurrency`.
 *
 * Rules:
 *   - Archived accounts are excluded.
 *   - Accounts with `includeInNetWorth=false` are excluded.
 *   - Each account's `currentBalanceInBaseCurrency` (already converted to the
 *     workspace base by the snapshot builder) is then re-converted to display.
 *     If `currentBalanceInBaseCurrency` is missing, falls back to
 *     `currentBalance` (assumes account is already in base — best-effort).
 *
 * Pure — testable in isolation.
 */
export function computeNetWorth(input: NetWorthInput): number {
  const { accounts, baseCurrency, displayCurrency, exchangeRateMap } = input;
  return accounts
    .filter((a) => !a.isArchived && a.includeInNetWorth)
    .reduce((sum, a) => {
      const inBase = a.currentBalanceInBaseCurrency ?? a.currentBalance;
      return sum + inBase * resolveConversion(exchangeRateMap, baseCurrency, displayCurrency);
    }, 0);
}
