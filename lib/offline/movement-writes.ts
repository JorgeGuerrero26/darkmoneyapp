import { enqueueOp } from "./outbox";
import { takePoolId } from "./id-pool";
import { getServerShapedRow, upsertMovementRows, deleteMirrorRows, type ServerRow } from "./movement-store";
import type { SqlDriver } from "./sql-driver";

const TABLE = "movements";

export type CreateLocalInput = {
  workspaceId: number;
  userId: string;
  fields: Record<string, unknown>;
  nowIso?: string;
};

/**
 * Alta local: toma un ID reservado, escribe la fila en el espejo y encola el insert, todo en una
 * sola transacción (o queda todo o no queda nada).
 *
 * Devuelve null si el bloque de IDs se agotó: quien llama decide (caer al camino online).
 * Si ya hay una fila con la misma `client_dedupe_key`, devuelve esa en vez de duplicar; es la
 * misma garantía que da el índice único del servidor.
 */
export async function createMovementLocal(db: SqlDriver, input: CreateLocalInput): Promise<ServerRow | null> {
  const now = input.nowIso ?? new Date().toISOString();
  return db.transaction(async (tx) => {
    const dedupeKey = input.fields.client_dedupe_key;
    if (typeof dedupeKey === "string" && dedupeKey) {
      const existing = await tx.get<{ data: string }>(
        `select data from movements where workspace_id = ? and json_extract(data, '$.client_dedupe_key') = ?`,
        [input.workspaceId, dedupeKey],
      );
      if (existing) return JSON.parse(existing.data) as ServerRow;
    }

    const id = await takePoolId(tx, input.workspaceId, TABLE);
    if (id == null) return null;

    const row = {
      ...input.fields,
      id,
      workspace_id: input.workspaceId,
      created_by_user_id: input.userId,
      updated_by_user_id: input.userId,
      created_at: now,
      updated_at: now,
    } as ServerRow;
    await upsertMovementRows(tx, [row]);
    await enqueueOp(tx, {
      table: TABLE,
      kind: "insert",
      workspaceId: input.workspaceId,
      rowId: id,
      fields: input.fields,
      now,
    });
    return row;
  });
}

export type UpdateLocalInput = {
  workspaceId: number;
  userId: string;
  id: number;
  fields: Record<string, unknown>;
  nowIso?: string;
};

/** Edición local. Devuelve null si la fila no está en el espejo. */
export async function updateMovementLocal(db: SqlDriver, input: UpdateLocalInput): Promise<ServerRow | null> {
  const now = input.nowIso ?? new Date().toISOString();
  return db.transaction(async (tx) => {
    const current = await getServerShapedRow(tx, TABLE, input.id);
    if (!current) return null;
    // `updated_at` del espejo sigue siendo el que conoce el servidor: es la base del conflicto.
    const next = { ...current, ...input.fields, updated_by_user_id: input.userId } as ServerRow;
    await upsertMovementRows(tx, [next]);
    await enqueueOp(tx, {
      table: TABLE,
      kind: "update",
      workspaceId: input.workspaceId,
      rowId: input.id,
      fields: input.fields,
      baseUpdatedAt: current.updated_at,
      now,
    });
    return next;
  });
}

export type DeleteLocalInput = { workspaceId: number; id: number; nowIso?: string };

/** Borrado local: la fila desaparece de las listas al instante; el servidor se entera en el siguiente envío. */
export async function deleteMovementLocal(db: SqlDriver, input: DeleteLocalInput): Promise<boolean> {
  const now = input.nowIso ?? new Date().toISOString();
  return db.transaction(async (tx) => {
    const current = await getServerShapedRow(tx, TABLE, input.id);
    if (!current) return false;
    await deleteMirrorRows(tx, TABLE, [input.id]);
    await enqueueOp(tx, {
      table: TABLE,
      kind: "delete",
      workspaceId: input.workspaceId,
      rowId: input.id,
      baseUpdatedAt: current.updated_at,
      now,
    });
    return true;
  });
}
