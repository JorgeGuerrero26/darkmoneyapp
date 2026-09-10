/**
 * Qué limita un presupuesto, en una línea.
 *
 * La fila "Qué limitas" es la pregunta del ámbito entera, y el ámbito tiene tres mitades:
 * **en qué** (una categoría o todo el gasto), **de qué tipo** (necesidad, deseo, ahorro) y
 * **dónde** (una cuenta o todas). La cuenta vivía en
 * "Opcionales", dos niveles adentro, así que la fila prometía responder al ámbito y solo
 * preguntaba la mitad — y un presupuesto por cuenta parecía imposible.
 *
 * Las cuatro combinaciones son los cuatro ámbitos que la base ya deriva sola:
 * `category`, `account`, `category_account` y `general`.
 */
export function budgetScopeSummary(
  categoryName: string | null,
  accountName: string | null,
  spendTypeName?: string | null,
): string {
  const categoria = categoryName?.trim();
  const tipo = spendTypeName?.trim();
  /* Categoría y tipo responden a preguntas distintas —en qué se fue y si hacía falta— así que
     juntas acotan de verdad ("Alimentación · Deseo" son las cenas caras) y se nombran las dos. */
  const que = categoria && tipo ? `${categoria} · ${tipo}` : categoria || tipo || "Todo el gasto";
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

/**
 * Lo que va a contar este presupuesto, dicho con verbos.
 *
 * El resumen de arriba nombra el ámbito; esto explica la **regla**, que es lo que el usuario está
 * decidiendo: "cuenta lo que gastes en Alimentación y sea un deseo" es una frase que se puede
 * comprobar contra la cabeza de uno; "Alimentación · Deseo" todavía no.
 */
export function budgetScopeHint(
  categoryName: string | null,
  spendTypeName: string | null,
  accountName: string | null,
): string {
  const categoria = categoryName?.trim();
  const tipo = spendTypeName?.trim();
  const cuenta = accountName?.trim();

  const que = categoria && tipo
    ? `lo que gastes en ${categoria} y sea ${tipo.toLowerCase()}`
    : categoria
      ? `lo que gastes en ${categoria}`
      : tipo
        ? `todo tu gasto que sea ${tipo.toLowerCase()}`
        : "todo tu gasto";

  if (cuenta) return `Cuenta ${que}, y solo desde ${cuenta}.`;
  if (!categoria && !tipo) {
    return "Cuenta todo tu gasto. Acótalo por categoría, por tipo o por cuenta si quieres.";
  }
  return `Cuenta ${que}, salga de la cuenta que salga.`;
}
