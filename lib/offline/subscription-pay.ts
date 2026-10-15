import { createMovementLocal } from "./movement-writes";
import { runLocalGroup } from "./outbox";
import { updateRowLocal } from "./resource-writes";
import type { SqlDriver } from "./sql-driver";

/** La fila o el bloque de IDs no está disponible en el teléfono: que siga el camino online. */
class NotLocal extends Error {}

export type PaySubscriptionLocalInput = {
  workspaceId: number;
  userId: string;
  subscriptionId: number;
  /** Fecha del próximo cobro después de este pago. */
  nextDueDate: string;
  /** Campos del movimiento del pago (con su `client_dedupe_key`). */
  movementFields: Record<string, unknown>;
  nowIso?: string;
};

/**
 * Pagar una suscripción sin conexión: avanzar su próximo cobro y registrar el movimiento del pago son DOS escrituras
 * que van juntas (un grupo atómico): o llegan las dos al servidor o no llega ninguna.
 *
 * Idempotente: si ya hay un movimiento local con la misma clave (el mismo cobro), devuelve ese sin escribir nada.
 * Devuelve null si no se puede hacer en el teléfono (suscripción que no está en la copia local, IDs agotados).
 */
export async function paySubscriptionLocal(db: SqlDriver, input: PaySubscriptionLocalInput): Promise<{ movementId: number } | null> {
  const dedupeKey = input.movementFields.client_dedupe_key;
  if (typeof dedupeKey === "string" && dedupeKey) {
    const existing = await db.get<{ id: number }>(
      `select id from movements where workspace_id = ? and json_extract(data, '$.client_dedupe_key') = ?`,
      [input.workspaceId, dedupeKey],
    );
    if (existing) return { movementId: Number(existing.id) };
  }
  try {
    return await runLocalGroup(db, 2, async (tx, group) => {
      const subscription = await updateRowLocal(tx, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        table: "subscriptions",
        id: input.subscriptionId,
        fields: { next_due_date: input.nextDueDate },
        nowIso: input.nowIso,
        group,
      });
      if (!subscription) throw new NotLocal();
      const movement = await createMovementLocal(tx, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        fields: input.movementFields,
        nowIso: input.nowIso,
        group,
      });
      if (!movement) throw new NotLocal();
      return { movementId: Number(movement.id) };
    });
  } catch (error) {
    if (error instanceof NotLocal) return null;
    throw error;
  }
}
