import { createMovementLocal } from "./movement-writes";
import { runLocalGroup } from "./outbox";
import { createRowLocal, updateRowLocal } from "./resource-writes";
import type { SqlDriver } from "./sql-driver";

/** La fila o el bloque de IDs no está disponible en el teléfono: que siga el camino online. */
class NotLocal extends Error {}

export type ConfirmArrivalLocalInput = {
  workspaceId: number;
  userId: string;
  recurringIncomeId: number;
  /** Campos del movimiento de ingreso (con su `client_dedupe_key`). */
  movementFields: Record<string, unknown>;
  /** Fila del historial de llegadas (sin `movement_id`: se completa con el ID del movimiento). */
  occurrenceFields: Record<string, unknown>;
  /** Avance de la próxima fecha (y, si se pidió, del monto esperado y la cuenta). */
  recurringIncomePatch: Record<string, unknown>;
  nowIso?: string;
};

/**
 * Anotar la llegada de un ingreso fijo sin conexión: el movimiento, su fila en el historial de llegadas y el avance de la
 * próxima fecha son TRES escrituras que van juntas (un grupo atómico): llegan las tres al servidor o ninguna. El orden
 * importa: el movimiento primero, porque la fila del historial lo referencia.
 *
 * Idempotente: si ya hay un movimiento local con la misma clave (la misma llegada), devuelve ese sin escribir nada.
 * Devuelve null si no se puede hacer en el teléfono (ingreso que no está en la copia local, IDs agotados).
 */
export async function confirmArrivalLocal(db: SqlDriver, input: ConfirmArrivalLocalInput): Promise<{ movementId: number } | null> {
  const dedupeKey = input.movementFields.client_dedupe_key;
  if (typeof dedupeKey === "string" && dedupeKey) {
    const existing = await db.get<{ id: number }>(
      `select id from movements where workspace_id = ? and json_extract(data, '$.client_dedupe_key') = ?`,
      [input.workspaceId, dedupeKey],
    );
    if (existing) return { movementId: Number(existing.id) };
  }
  try {
    return await runLocalGroup(db, 3, async (tx, group) => {
      const movement = await createMovementLocal(tx, {
        workspaceId: input.workspaceId, userId: input.userId, fields: input.movementFields, nowIso: input.nowIso, group,
      });
      if (!movement) throw new NotLocal();
      const occurrence = await createRowLocal(tx, {
        workspaceId: input.workspaceId, userId: input.userId, table: "recurring_income_occurrences",
        fields: { ...input.occurrenceFields, movement_id: Number(movement.id) }, nowIso: input.nowIso, group,
      });
      if (!occurrence) throw new NotLocal();
      const income = await updateRowLocal(tx, {
        workspaceId: input.workspaceId, userId: input.userId, table: "recurring_income", id: input.recurringIncomeId,
        fields: input.recurringIncomePatch, nowIso: input.nowIso, group,
      });
      if (!income) throw new NotLocal();
      return { movementId: Number(movement.id) };
    });
  } catch (error) {
    if (error instanceof NotLocal) return null;
    throw error;
  }
}
