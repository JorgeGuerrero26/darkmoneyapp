import { takePoolId } from "./id-pool";
import { createMovementLocal } from "./movement-writes";
import { enqueueOp, runLocalGroup } from "./outbox";
import { createRowLocal } from "./resource-writes";
import type { SqlDriver, SqlExecutor } from "./sql-driver";

/** El bloque de IDs no alcanza o algo no está en el teléfono: que siga el camino online. */
class NotLocal extends Error {}

export type CreateObligationLocalInput = {
  workspaceId: number;
  userId: string;
  /** Las columnas de la obligación, como las escribe el camino online (incluida `client_dedupe_key`). */
  obligationFields: Record<string, unknown>;
  /**
   * Movimiento de apertura (el dinero que sale o entra de la cuenta al nacer la deuda), como lo escribe el camino online.
   * Sin `obligation_id`: se completa con el ID de la obligación nueva.
   */
  openingMovementFields?: Record<string, unknown> | null;
  /** Interés pactado al crearla: un evento «principal_increase» SIN movimiento (no mueve dinero), como en línea. */
  interest?: { amount: number; eventDate: string; reason: string } | null;
  nowIso?: string;
};

export type CreateObligationLocalResult = { obligationId: number; movementId: number | null; interestEventId: number | null };

/**
 * Crear sin conexión una obligación que mueve dinero al nacer (prestar o pedir prestado desde una cuenta) y/o con interés.
 *
 * Son hasta TRES escrituras que van juntas (un grupo atómico): la obligación, su movimiento de apertura y el evento del
 * interés. Llegan todas al servidor o ninguna: si el servidor rechazara una, no queda una deuda sin su movimiento ni un
 * movimiento sin su deuda. Mismas columnas que el camino online (`useCreateObligationMutation`).
 *
 * La obligación y el movimiento quedan en la copia local (el saldo de la cuenta cambia al instante); el evento del interés
 * solo viaja (los eventos no se copian al teléfono) y la app lo suma al mostrar la deuda mientras no se envía.
 *
 * Mismo intento repetido (misma `client_dedupe_key`): devuelve la obligación ya creada, sin duplicarla.
 * Devuelve null si no se puede hacer en el teléfono (IDs agotados).
 */
export async function createObligationLocal(db: SqlDriver, input: CreateObligationLocalInput): Promise<CreateObligationLocalResult | null> {
  const now = input.nowIso ?? new Date().toISOString();
  const size = 1 + (input.openingMovementFields ? 1 : 0) + (input.interest ? 1 : 0);
  const dedupeKey = typeof input.obligationFields.client_dedupe_key === "string" ? input.obligationFields.client_dedupe_key : null;

  if (dedupeKey) {
    const existing = await db.get<{ id: number }>(
      `select id from obligations where workspace_id = ? and json_extract(data, '$.client_dedupe_key') = ?`,
      [input.workspaceId, dedupeKey],
    );
    if (existing) return { obligationId: Number(existing.id), movementId: null, interestEventId: null };
  }

  const write = async (tx: SqlExecutor, group: { id: string; size: number } | undefined): Promise<CreateObligationLocalResult> => {
    const obligation = await createRowLocal(tx, {
      workspaceId: input.workspaceId,
      table: "obligations",
      userId: input.userId,
      fields: input.obligationFields,
      nowIso: now,
      group,
    });
    if (!obligation) throw new NotLocal();
    const obligationId = Number(obligation.id);

    let movementId: number | null = null;
    if (input.openingMovementFields) {
      const movement = await createMovementLocal(tx, {
        workspaceId: input.workspaceId,
        userId: input.userId,
        nowIso: now,
        group,
        fields: { ...input.openingMovementFields, obligation_id: obligationId },
      });
      if (!movement) throw new NotLocal();
      movementId = Number(movement.id);
    }

    let interestEventId: number | null = null;
    if (input.interest) {
      interestEventId = await takePoolId(tx, input.workspaceId, "obligation_events");
      if (interestEventId == null) throw new NotLocal();
      await enqueueOp(tx, {
        table: "obligation_events",
        kind: "insert",
        workspaceId: input.workspaceId,
        rowId: interestEventId,
        now,
        group,
        fields: {
          obligation_id: obligationId,
          event_type: "principal_increase",
          event_date: input.interest.eventDate,
          amount: input.interest.amount,
          reason: input.interest.reason,
          notes: null,
          metadata: {},
        },
      });
    }
    return { obligationId, movementId, interestEventId };
  };

  try {
    return size >= 2 ? await runLocalGroup(db, size, write) : await db.transaction((tx) => write(tx, undefined));
  } catch (error) {
    if (error instanceof NotLocal) return null;
    throw error;
  }
}

/**
 * Eventos de obligaciones creados en el teléfono y todavía sin enviar (los eventos no se copian al teléfono: solo viajan).
 * Sirven para mostrar una deuda recién creada sin conexión con su interés y sus pagos, antes de que el servidor la calcule.
 */
export async function pendingObligationEvents(
  db: SqlExecutor,
  workspaceId: number,
): Promise<Array<{ id: number; obligationId: number; eventType: string; amount: number; eventDate: string | null }>> {
  const rows = await db.all<{ row_id: number; fields: string }>(
    `select row_id, fields from outbox where workspace_id = ? and table_name = 'obligation_events' and kind = 'insert' order by seq`,
    [workspaceId],
  );
  return rows.map((row) => {
    const fields = JSON.parse(row.fields) as Record<string, unknown>;
    return {
      id: Number(row.row_id),
      obligationId: Number(fields.obligation_id),
      eventType: String(fields.event_type ?? ""),
      amount: Number(fields.amount ?? 0),
      eventDate: fields.event_date == null ? null : String(fields.event_date),
    };
  });
}
