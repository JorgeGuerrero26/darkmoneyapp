/**
 * Qué consultas de la app hay que volver a leer cuando cambian estas tablas en la base local.
 *
 * Las que leen de la copia del teléfono (Categorías, tipos de gasto, plantillas, historial de ingresos,
 * movimientos del presupuesto) guardan su resultado y no se enteran solas de que se registró algo: sin
 * este aviso, Categorías seguía diciendo "0 movimientos" tras registrar un gasto sin internet.
 * `tables` vacío = cambió todo (descarga completa).
 */
const KEYS_BY_TABLE: Record<string, string[]> = {
  movements: ["movements", "movement", "categories-overview", "budget-scope-movements"],
  categories: ["categories-overview"],
  subscriptions: ["categories-overview"],
  spend_types: ["spend-types"],
  movement_templates: ["movement-templates"],
  recurring_income_occurrences: ["recurring-income-occurrences"],
  budgets: ["budget-scope-movements"],
  accounts: ["budget-scope-movements"],
};

export function queryRootsToRefresh(tables: readonly string[]): string[] {
  const picked = tables.length === 0 ? Object.values(KEYS_BY_TABLE).flat() : tables.flatMap((table) => KEYS_BY_TABLE[table] ?? []);
  return [...new Set(picked)];
}
