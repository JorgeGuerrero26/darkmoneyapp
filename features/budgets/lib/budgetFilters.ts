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

/* `filterBudgets` se fue en la fase 35. Escondía los vencidos salvo bajo su propio filtro, y al
   pasar a una fila por presupuesto esa regla quedó al revés de lo que hace falta: los meses
   cerrados tienen que llegar a la lista para agruparse en su sección. Quien los separa ahora es
   buildBudgetSections. Los filtros por ámbito y estado tampoco volvieron: con una fila por
   presupuesto no había nada que filtrar. */
