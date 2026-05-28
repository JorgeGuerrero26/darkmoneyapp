import type { AccountSummary } from "../../../types/domain";

export type AccountTypeFilter =
  | "all"
  | "bank"
  | "cash"
  | "savings"
  | "credit_card"
  | "investment"
  | "loan"
  | "other";

export type AccountFilterInput = {
  /** Free-text search applied to name only (currency is *excluded* — matches caller intent). */
  searchText: string;
  typeFilters: readonly AccountTypeFilter[];
  showArchived: boolean;
};

/**
 * Apply the same client-side filter the accounts list uses, as a pure function.
 *
 * - `searchText` matches `account.name` OR `account.currencyCode` (case-insensitive).
 *   So "USD" surfaces every USD account; "BCP" surfaces every account with that
 *   text in the name.
 * - `typeFilters` is treated as OR: empty array means "all types".
 * - When `showArchived` is `false`, archived accounts are dropped regardless of other filters.
 */
export function applyAccountFilter(
  accounts: readonly AccountSummary[],
  input: AccountFilterInput,
): AccountSummary[] {
  const q = input.searchText.toLowerCase();
  return accounts.filter((a) => {
    if (!input.showArchived && a.isArchived) return false;
    if (input.typeFilters.length > 0 && !input.typeFilters.includes(a.type as AccountTypeFilter)) {
      return false;
    }
    if (q && !a.name.toLowerCase().includes(q) && !a.currencyCode.toLowerCase().includes(q)) return false;
    return true;
  });
}
