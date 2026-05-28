import type { AccountSummary } from "../../../types/domain";
import { resolveConversion, type ExchangeRateMap } from "../../../lib/exchange-rate-map";

/**
 * One slice of the donut: an aggregated bucket of accounts by type.
 *
 *  - `value` is always non-negative; debts are reported separately so the
 *    donut never goes through zero. Assets and liabilities are returned as
 *    two distinct groupings.
 *  - `pct` is the portion of *assets only* (denominator excludes debts).
 */
export type CompositionSlice = {
  type: string;
  label: string;
  /** Total amount in the display currency. Always >= 0. */
  value: number;
  /** % of the assets total (0..100). */
  pct: number;
  /** Tint color for the slice. Comes from a TYPE_PRESETS-compatible map. */
  color: string;
};

export type CompositionInput = {
  accounts: readonly AccountSummary[];
  baseCurrency: string;
  displayCurrency: string;
  exchangeRateMap: ExchangeRateMap;
};

export type Composition = {
  assets: CompositionSlice[];
  /** Total absolute debt (loan / negative balances), in display currency. */
  debts: number;
  /** Sum of `slice.value` across all assets, in display currency. */
  totalAssets: number;
  /** assets - debts. Net worth equivalent. */
  netWorth: number;
};

// Color palette mirrors features/accounts/components/form/AccountTypePicker.tsx
// to keep the donut visually aligned with the type-pill colors users see in
// the edit form.
const TYPE_COLORS: Record<string, string> = {
  bank:        "#4566d6",
  savings:     "#1b6a58",
  credit_card: "#8f3e3e",
  cash:        "#b48b34",
  investment:  "#8366f2",
  loan:        "#c46a31",
  loan_wallet: "#c46a31",
  other:       "#6b7280",
};

const TYPE_LABELS: Record<string, string> = {
  bank:        "Bancos",
  savings:     "Ahorro",
  credit_card: "Tarjetas",
  cash:        "Efectivo",
  investment:  "Inversiones",
  loan:        "Préstamos",
  loan_wallet: "Cartera de préstamos",
  other:       "Otras",
};

/**
 * Bucket accounts by type and return the slices for a donut chart, separated
 * into assets (positive balances) and total debt (absolute value).
 *
 * Excludes archived accounts and accounts with `includeInNetWorth = false` —
 * same exclusion rules as `computeNetWorth`.
 */
export function computeComposition(input: CompositionInput): Composition {
  const { accounts, baseCurrency, displayCurrency, exchangeRateMap } = input;
  const factor = resolveConversion(exchangeRateMap, baseCurrency, displayCurrency);

  // Bucket by type → signed total in display currency.
  const buckets = new Map<string, number>();
  for (const account of accounts) {
    if (account.isArchived || !account.includeInNetWorth) continue;
    const native = account.currentBalanceInBaseCurrency ?? account.currentBalance;
    const valueInDisplay = native * factor;
    buckets.set(account.type, (buckets.get(account.type) ?? 0) + valueInDisplay);
  }

  // Split into assets (positive) / debts (negative). Loan types always count
  // as debts even when their balance happens to be 0 or positive, so the donut
  // never confuses "outstanding debt of 0" with "asset".
  let totalAssets = 0;
  let debts = 0;
  const assetSlices: { type: string; value: number }[] = [];
  for (const [type, signedTotal] of buckets) {
    const isDebtType = type === "loan" || type === "loan_wallet";
    if (isDebtType || signedTotal < 0) {
      debts += Math.abs(signedTotal);
    } else {
      assetSlices.push({ type, value: signedTotal });
      totalAssets += signedTotal;
    }
  }

  // Order assets descending by value — biggest slice first in the donut.
  assetSlices.sort((a, b) => b.value - a.value);

  const assets: CompositionSlice[] = assetSlices.map(({ type, value }) => ({
    type,
    label: TYPE_LABELS[type] ?? type,
    value,
    pct: totalAssets > 0 ? (value / totalAssets) * 100 : 0,
    color: TYPE_COLORS[type] ?? TYPE_COLORS.other,
  }));

  return {
    assets,
    debts,
    totalAssets,
    netWorth: totalAssets - debts,
  };
}

export { TYPE_COLORS as COMPOSITION_TYPE_COLORS, TYPE_LABELS as COMPOSITION_TYPE_LABELS };
