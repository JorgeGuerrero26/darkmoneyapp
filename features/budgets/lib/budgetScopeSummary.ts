/**
 * Qué limita un presupuesto, en una línea.
 *
 * La fila "Qué limitas" es la pregunta del ámbito entera, y el ámbito tiene dos mitades:
 * **qué** (una categoría o todo el gasto) y **dónde** (una cuenta o todas). La cuenta vivía en
 * "Opcionales", dos niveles adentro, así que la fila prometía responder al ámbito y solo
 * preguntaba la mitad — y un presupuesto por cuenta parecía imposible.
 *
 * Las cuatro combinaciones son los cuatro ámbitos que la base ya deriva sola:
 * `category`, `account`, `category_account` y `general`.
 */
export function budgetScopeSummary(
  categoryName: string | null,
  accountName: string | null,
): string {
  const que = categoryName?.trim() || "Todo el gasto";
  const donde = accountName?.trim();
  return donde ? `${que} · ${donde}` : que;
}

/**
 * Lo que dice la fila cuando todavía no has elegido nada.
 *
 * Vacía y no "Todas": "Todas" es una elección válida, pero tiene que ser elegida — con ese valor
 * puesto por defecto, un presupuesto llamado "Alimentación" contaba también gasolina y alquiler.
 */
export const BUDGET_SCOPE_PLACEHOLDER = "Elegir";
