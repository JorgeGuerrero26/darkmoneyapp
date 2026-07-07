import type { PatternMovement } from "../../../services/queries/movement-patterns";

/**
 * Montos frecuentes para el tipo de movimiento + cuenta seleccionados, a partir
 * del historial reciente (sugerencia de monto por historial, backlog P3).
 * Se muestran como chips tocables bajo el input de monto: el gasto repetido
 * (almuerzo, pasaje) se llena con un tap.
 *
 * Reglas:
 * - Solo cuenta movimientos del MISMO tipo y la MISMA cuenta (así el monto
 *   comparte moneda con el input; sin cuenta seleccionada no hay sugerencias).
 * - Un monto califica con 2+ ocurrencias (una sola vez no es "frecuente").
 * - Orden: más ocurrencias primero; empate → el usado más recientemente.
 */
export function getFrequentAmounts(params: {
  movements: PatternMovement[] | undefined;
  movementType: string;
  accountId: number | null;
  limit?: number;
}): number[] {
  const { movements, movementType, accountId, limit = 3 } = params;
  if (!movements?.length || !accountId) return [];

  const isIncome = movementType === "income";
  const stats = new Map<number, { count: number; lastAt: string }>();

  for (const movement of movements) {
    if (movement.movement_type !== movementType) continue;
    const matchesAccount = isIncome
      ? movement.destination_account_id === accountId
      : movement.source_account_id === accountId;
    if (!matchesAccount) continue;
    const raw = isIncome ? movement.destination_amount : movement.source_amount;
    const amount = Math.round(Number(raw ?? 0) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const entry = stats.get(amount);
    if (entry) {
      entry.count += 1;
      if (movement.occurred_at > entry.lastAt) entry.lastAt = movement.occurred_at;
    } else {
      stats.set(amount, { count: 1, lastAt: movement.occurred_at });
    }
  }

  return Array.from(stats.entries())
    .filter(([, entry]) => entry.count >= 2)
    .sort((a, b) => b[1].count - a[1].count || b[1].lastAt.localeCompare(a[1].lastAt))
    .slice(0, limit)
    .map(([amount]) => amount);
}
