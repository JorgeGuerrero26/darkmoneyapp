export type SpendTypesSummary = {
  /** Categorías de gasto que ya tienen un tipo por defecto. */
  covered: number;
  /** Categorías de gasto en total. */
  total: number;
  /** De 0 a 1. Es lo que la métrica del inicio podrá explicar. */
  coverage: number;
  support: string;
};

/**
 * Lo que dice el encabezado de la maestra.
 *
 * **La cifra no es "cuántos tipos tienes"** —eso ya se ve contando tres filas— sino cuánto de tu
 * gasto van a poder explicar. Un tipo sin categorías que lo usen no clasifica nada, así que el
 * dato que gobierna esta pantalla es la cobertura: cuántas de tus categorías de gasto ya dicen
 * de qué tipo son.
 *
 * Y con eso el encabezado señala el trabajo que queda, que es el mismo criterio de "91
 * movimientos sin categoría pesan el 45% de tu gasto": el número y su consecuencia juntos.
 */
export function buildSpendTypesSummary(
  typeCount: number,
  categoriesWithType: number,
  expenseCategories: number,
): SpendTypesSummary {
  const coverage = expenseCategories > 0 ? categoriesWithType / expenseCategories : 0;

  if (typeCount === 0) {
    return { covered: 0, total: expenseCategories, coverage: 0, support: "Sin tipos todavía." };
  }

  const tipos = typeCount === 1 ? "1 tipo" : `${typeCount} tipos`;

  if (expenseCategories === 0) {
    return { covered: 0, total: 0, coverage: 0, support: `${tipos}. Todavía no tienes categorías de gasto.` };
  }
  if (categoriesWithType === 0) {
    return {
      covered: 0,
      total: expenseCategories,
      coverage: 0,
      support: `${tipos}. Ninguna de tus ${expenseCategories} categorías dice de qué tipo es todavía.`,
    };
  }
  if (categoriesWithType === expenseCategories) {
    return {
      covered: categoriesWithType,
      total: expenseCategories,
      coverage: 1,
      support: `${tipos}. Todas tus categorías dicen de qué tipo son.`,
    };
  }
  return {
    covered: categoriesWithType,
    total: expenseCategories,
    coverage,
    support: `${tipos}. ${categoriesWithType} de ${expenseCategories} categorías dicen de qué tipo son.`,
  };
}
