import type { BudgetOverview, BudgetScopeKind } from "../../../types/domain";

export type BudgetFilter = "all" | "attention" | "pinned" | "expired" | BudgetScopeKind;
export type ActiveBudgetFilter = Exclude<BudgetFilter, "all">;

export const BUDGET_FILTERS: Array<{ label: string; value: BudgetFilter }> = [
  { label: "Todas", value: "all" },
  { label: "Fijados", value: "pinned" },
  { label: "Con alerta", value: "attention" },
  { label: "Vencidos", value: "expired" },
  { label: "General", value: "general" },
  { label: "Categoría", value: "category" },
  { label: "Cuenta", value: "account" },
  { label: "Cat + cuenta", value: "category_account" },
];

export function budgetFilterLabel(filter: ActiveBudgetFilter) {
  return BUDGET_FILTERS.find((item) => item.value === filter)?.label ?? filter;
}

/** Vencido = su período cerró antes de hoy (fechas "YYYY-MM-DD", comparación lexicográfica). */
export function isBudgetExpired(budget: Pick<BudgetOverview, "periodEnd">, todayYmd: string): boolean {
  return budget.periodEnd < todayYmd;
}

export type BudgetStatusFilter = "all" | "current" | "over" | "closed";
export type BudgetScopeFilter = "all" | BudgetScopeKind;

export const BUDGET_STATUS_LABELS: Record<BudgetStatusFilter, string> = {
  all: "Todos",
  current: "En curso",
  over: "Excedidos",
  closed: "Cerrados",
};

export const BUDGET_SCOPE_LABELS: Record<BudgetScopeFilter, string> = {
  all: "Todos",
  general: "General",
  category: "Categoría",
  account: "Cuenta",
  category_account: "Categoría y cuenta",
  spend_type: "Tipo de gasto",
  spend_type_account: "Tipo de gasto y cuenta",
};

export type BudgetListFilters = {
  search: string;
  status: BudgetStatusFilter;
  scope: BudgetScopeFilter;
  pinnedOnly: boolean;
};

/** Filter periods before grouping them into current rules and closed history. */
export function filterBudgetPeriods(
  budgets: BudgetOverview[],
  filters: BudgetListFilters,
  todayYmd: string,
): BudgetOverview[] {
  const query = filters.search.trim().toLocaleLowerCase("es");
  return budgets.filter((budget) => {
    const current = budget.periodStart <= todayYmd && budget.periodEnd >= todayYmd;
    if (filters.status === "current" && !current) return false;
    if (filters.status === "over" && !(current && budget.spentAmount > budget.limitAmount)) return false;
    if (filters.status === "closed" && !isBudgetExpired(budget, todayYmd)) return false;
    if (filters.scope !== "all" && budget.scopeKind !== filters.scope) return false;
    if (filters.pinnedOnly && !budget.isPinned) return false;
    if (!query) return true;
    return [budget.name, budget.categoryName, budget.accountName, budget.spendTypeName, budget.notes]
      .some((value) => value?.toLocaleLowerCase("es").includes(query));
  });
}
