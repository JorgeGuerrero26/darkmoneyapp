import type { AccountSummary } from "../../../types/domain";
import { findInstitution } from "../../../lib/account-institutions";

export type AccountStatusFilter = "active" | "archived" | "all";
export type AccountInstitutionFilter = string | null;

export function buildAccountInstitutionOptions(accounts: readonly AccountSummary[]) {
  return [...new Set(accounts.map((account) => account.institutionCode || null))]
    .map((value) => ({ value, label: value ? findInstitution(value)?.label ?? value : "Sin institución" }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

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
  /** Free-text search applied to name and currency. */
  searchText: string;
  typeFilters: readonly AccountTypeFilter[];
  showArchived?: boolean;
  status?: AccountStatusFilter;
  institutions?: readonly AccountInstitutionFilter[];
};

/**
 * Apply the same client-side filter the accounts list uses, as a pure function.
 *
 * - `searchText` matches `account.name` OR `account.currencyCode` (case-insensitive).
 *   So "USD" surfaces every USD account; "BCP" surfaces every account with that
 *   text in the name.
 * - `typeFilters` is treated as OR: empty array means "all types".
 * - Status defaults to active; legacy showArchived=true includes all accounts.
 * - Institutions combine with OR, and with the other filters using AND. Null means no institution.
 */
export function applyAccountFilter(
  accounts: readonly AccountSummary[],
  input: AccountFilterInput,
): AccountSummary[] {
  const q = input.searchText.toLowerCase();
  const status = input.status ?? (input.showArchived ? "all" : "active");
  return accounts.filter((a) => {
    if (status === "active" && a.isArchived) return false;
    if (status === "archived" && !a.isArchived) return false;
    if (input.institutions?.length && !input.institutions.includes(a.institutionCode || null)) return false;
    if (input.typeFilters.length > 0 && !input.typeFilters.includes(a.type as AccountTypeFilter)) {
      return false;
    }
    if (q && !a.name.toLowerCase().includes(q) && !a.currencyCode.toLowerCase().includes(q)) return false;
    return true;
  });
}
