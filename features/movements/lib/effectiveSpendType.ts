export type SpendTypeCarrier = {
  /** El tipo del movimiento. Manda cuando está puesto. */
  spendTypeId?: number | null;
  categoryId?: number | null;
};

/**
 * El tipo de gasto que cuenta para las métricas.
 *
 * **El movimiento manda; si no dice nada, hereda el de su categoría.** Es lo que hace que la
 * métrica funcione en cuanto se configuran los defaults, sin volver a etiquetar el historial:
 * los 221 movimientos de Alimentación cuentan como necesidad desde que esa categoría lo diga, y
 * la cena cara de la semana pasada se corrige sola en cuanto se le pone "Deseo" a ese movimiento.
 *
 * Salió de mirar el catálogo real: de 20 categorías de gasto, las dos con más movimientos son
 * mixtas, así que ni la categoría sola ni el movimiento solo bastaban.
 */
export function effectiveSpendTypeId(
  movement: SpendTypeCarrier,
  categoryDefaults: Map<number, number | null>,
): number | null {
  if (movement.spendTypeId != null) return movement.spendTypeId;
  if (movement.categoryId == null) return null;
  return categoryDefaults.get(movement.categoryId) ?? null;
}

export type SpendTypeBreakdownRow = {
  spendTypeId: number | null;
  amount: number;
  movements: number;
  /** Parte del gasto total, de 0 a 1. */
  share: number;
};

/**
 * Cuánto pesa cada tipo de gasto.
 *
 * Lo que no tiene tipo —ni propio ni heredado— va a su propia fila con `spendTypeId: null` en
 * vez de repartirse o descartarse: un gasto sin clasificar no es "otro", es uno que todavía no
 * has dicho qué era, y esconderlo haría que los porcentajes describieran menos gasto del que
 * hubo. Mismo criterio que "Sin categoría" en el análisis de cuenta.
 */
export function buildSpendTypeBreakdown(
  movements: Array<SpendTypeCarrier & { amount: number }>,
  categoryDefaults: Map<number, number | null>,
): SpendTypeBreakdownRow[] {
  const totals = new Map<number | null, { amount: number; movements: number }>();
  let total = 0;

  for (const movement of movements) {
    const amount = Number.isFinite(movement.amount) ? Math.abs(movement.amount) : 0;
    if (amount <= 0) continue;
    const key = effectiveSpendTypeId(movement, categoryDefaults);
    const bucket = totals.get(key) ?? { amount: 0, movements: 0 };
    bucket.amount += amount;
    bucket.movements += 1;
    totals.set(key, bucket);
    total += amount;
  }

  return [...totals.entries()]
    .map(([spendTypeId, bucket]) => ({
      spendTypeId,
      amount: Math.round(bucket.amount * 100) / 100,
      movements: bucket.movements,
      share: total > 0 ? bucket.amount / total : 0,
    }))
    // Lo que más pesa primero; lo sin clasificar al final, aunque pese: es trabajo, no un dato.
    .sort((a, b) => {
      if (a.spendTypeId === null) return 1;
      if (b.spendTypeId === null) return -1;
      return b.amount - a.amount;
    });
}
