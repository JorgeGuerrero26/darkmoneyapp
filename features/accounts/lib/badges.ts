import type { AccountSummary } from "../../../types/domain";

export type AccountBadge = {
  label: string;
  tone: "danger" | "muted" | "info";
};

/**
 * Pick at most one badge per account card, prioritized: debt > out-of-net-worth > foreign currency.
 *
 * Returns `null` when:
 *   - the account is archived (the card already shows the archived overlay)
 *   - none of the three signals apply
 *
 * Pure function — safe to test in isolation.
 */
export function pickAccountBadge(
  account: AccountSummary,
  baseCurrencyCode?: string,
): AccountBadge | null {
  if (account.isArchived) return null;
  if (account.type === "loan" || account.type === "loan_wallet" || account.currentBalance < 0) {
    return { label: "Deuda", tone: "danger" };
  }
  if (!account.includeInNetWorth) {
    return { label: "Fuera de patrimonio", tone: "muted" };
  }
  if (baseCurrencyCode && account.currencyCode.toUpperCase() !== baseCurrencyCode.toUpperCase()) {
    return { label: account.currencyCode.toUpperCase(), tone: "info" };
  }
  return null;
}
