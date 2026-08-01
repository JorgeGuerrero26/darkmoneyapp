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

export function filterBudgets(
  budgets: BudgetOverview[],
  filters: ActiveBudgetFilter[],
  searchText: string,
  todayYmd: string,
) {
  const query = searchText.trim().toLowerCase();
  const scopeFilters = filters.filter(
    (filter): filter is BudgetScopeKind =>
      filter !== "attention" && filter !== "pinned" && filter !== "expired",
  );
  const attentionOnly = filters.includes("attention");
  const pinnedOnly = filters.includes("pinned");
  const expiredOnly = filters.includes("expired");

  return budgets.filter((budget) => {
    // Los vencidos son el histórico: solo aparecen bajo el filtro "Vencidos";
    // por defecto la lista muestra únicamente presupuestos vigentes o futuros.
    if (expiredOnly !== isBudgetExpired(budget, todayYmd)) return false;
    if (pinnedOnly && !budget.isPinned) return false;
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
