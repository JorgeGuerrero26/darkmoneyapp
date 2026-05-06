import type { BudgetOverview, BudgetScopeKind } from "../../../types/domain";

export type BudgetFilter = "all" | "attention" | BudgetScopeKind;
export type ActiveBudgetFilter = Exclude<BudgetFilter, "all">;

export const BUDGET_FILTERS: Array<{ label: string; value: BudgetFilter }> = [
  { label: "Todas", value: "all" },
  { label: "Con alerta", value: "attention" },
  { label: "General", value: "general" },
  { label: "Categoría", value: "category" },
  { label: "Cuenta", value: "account" },
  { label: "Cat + cuenta", value: "category_account" },
];

export function budgetFilterLabel(filter: ActiveBudgetFilter) {
  return BUDGET_FILTERS.find((item) => item.value === filter)?.label ?? filter;
}

export function filterBudgets(
  budgets: BudgetOverview[],
  filters: ActiveBudgetFilter[],
  searchText: string,
) {
  const query = searchText.trim().toLowerCase();
  const scopeFilters = filters.filter((filter): filter is BudgetScopeKind => filter !== "attention");
  const attentionOnly = filters.includes("attention");

  return budgets.filter((budget) => {
    if (attentionOnly && !budget.isNearLimit && !budget.isOverLimit) return false;
    if (scopeFilters.length > 0 && !scopeFilters.includes(budget.scopeKind)) return false;

    if (!query) return true;
    const haystack = [
      budget.name,
      budget.scopeLabel,
      budget.categoryName ?? "",
      budget.accountName ?? "",
      budget.notes ?? "",
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}
