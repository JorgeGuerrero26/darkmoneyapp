import { createMovementLocal } from "./movement-writes";
import { takePoolId } from "./id-pool";
import { enqueueOp, runLocalGroup } from "./outbox";
import { getRowLocal } from "./resource-store";
import type { SqlDriver } from "./sql-driver";

/** La obligación o el bloque de IDs no está disponible en el teléfono: que siga el camino online. */
class NotLocal extends Error {}

export type CreateObligationPaymentLocalInput = {
  workspaceId: number;
  userId: string;
  obligationId: number;
  /** "receivable" = me deben (el pago es un cobro que ENTRA a la cuenta). */
  direction: "receivable" | "payable";
  amount: number;
  /** ISO completo, ya con la hora (como `dateStrToISO` del camino online). */
  occurredAt: string;
  /** `yyyy-MM-dd`, fecha del evento. */
  eventDate: string;
  accountId?: number | null;
  installmentNo?: number | null;
  description?: string | null;
  notes?: string | null;
  nowIso?: string;
};

/**
 * Registrar un pago (o cobro) de una obligación sin conexión.
 *
 * Con cuenta: el movimiento de la cuenta y el evento del pago son DOS escrituras que van juntas (un grupo atómico): llegan las
 * dos al servidor o ninguna. Si el servidor rechaza el pago (p. ej. un sobrepago), no queda ni movimiento ni evento.
 * Sin cuenta: solo el evento (una operación suelta).
 *
 * El evento no se refleja en el teléfono (el pendiente de la deuda lo calcula el servidor); solo viaja. El movimiento sí queda
 * en la copia local: el saldo de la cuenta lo incluye al instante.
 *
 * Devuelve null si no se puede hacer en el teléfono (obligación que no está en la copia local, IDs agotados).
 */
export async function createObligationPaymentLocal(
  db: SqlDriver,
  input: CreateObligationPaymentLocalInput,
): Promise<{ eventId: number; movementId: number | null } | null> {
  const isReceivable = input.direction === "receivable";
  const autoDescription =
    input.description?.trim() ||
    (isReceivable ? `Cobro de obligacion #${input.obligationId}` : `Pago de obligacion #${input.obligationId}`);
  const now = input.nowIso ?? new Date().toISOString();
  try {
    return await runInTransaction(db, input.accountId ? 2 : 1, async (tx, group) => {
      const obligation = await getRowLocal(tx, "obligations", input.workspaceId, input.obligationId, input.userId);
      if (!obligation) throw new NotLocal();
      const eventId = await takePoolId(tx, input.workspaceId, "obligation_events");
      if (eventId == null) throw new NotLocal();

      let movementId: number | null = null;
      if (input.accountId) {
        const movement = await createMovementLocal(tx, {
          workspaceId: input.workspaceId,
          userId: input.userId,
          nowIso: now,
          group,
          fields: {
            movement_type: "obligation_payment",
            status: "posted",
            occurred_at: input.occurredAt,
            description: autoDescription,
            obligation_id: input.obligationId,
            metadata: { obligation_event_id: eventId },
            source_account_id: isReceivable ? null : input.accountId,
            source_amount: isReceivable ? null : input.amount,
            destination_account_id: isReceivable ? input.accountId : null,
            destination_amount: isReceivable ? input.amount : null,
          },
        });
        if (!movement) throw new NotLocal();
        movementId = Number(movement.id);
      }

      await enqueueOp(tx, {
        table: "obligation_events",
        kind: "insert",
        workspaceId: input.workspaceId,
        rowId: eventId,
        now,
        group,
        fields: {
          obligation_id: input.obligationId,
          event_type: "payment",
          event_date: input.eventDate,
          amount: input.amount,
          installment_no: input.installmentNo ?? null,
          description: input.description?.trim() || null,
          notes: input.notes?.trim() || null,
          movement_id: movementId,
          metadata: {},
        },
      });
      return { eventId, movementId };
    });
  } catch (error) {
    if (error instanceof NotLocal) return null;
    throw error;
  }
}

/** Con 2 operaciones es un grupo atómico; con 1, una transacción normal (sin grupo). */
async function runInTransaction<T>(
  db: SqlDriver,
  size: number,
  fn: (tx: Parameters<Parameters<SqlDriver["transaction"]>[0]>[0], group: { id: string; size: number } | undefined) => Promise<T>,
): Promise<T> {
  if (size >= 2) return runLocalGroup(db, size, (tx, group) => fn(tx, group));
  return db.transaction((tx) => fn(tx, undefined));
}
