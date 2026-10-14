import { takePoolId } from "./id-pool";
import { enqueueOp } from "./outbox";
import { upsertMirrorRows, deleteMirrorRows, type ServerRow } from "./movement-store";
import { getRowLocal, hasFractionalMoney } from "./resource-store";
import { assertWritableMoney } from "./money";
import { isWritableResourceTable, type WritableResourceTable } from "./schema";
import type { SqlDriver } from "./sql-driver";
import { ONLINE_ONLY_COMPOUND_NOTICE } from "./status-copy";

type Context = { workspaceId: number; userId: string; table: WritableResourceTable; nowIso?: string };
function writable(table: string) {
  if (!isWritableResourceTable(table)) throw new Error("Este historial es de solo lectura sin conexión.");
}
function authorFields(table: WritableResourceTable, userId: string): Record<string, unknown> {
  if (table === "workspace_financial_goals") return { user_id: userId };
  if (table === "movement_templates") return { created_by_user_id: userId };
  return table === "counterparty_roles" ? {} : { created_by_user_id: userId, updated_by_user_id: userId };
}

export async function createRowLocal(db: SqlDriver, input: Context & { fields: Record<string, unknown> }): Promise<ServerRow | null> {
  writable(input.table); assertWritableMoney(input.fields);
  const now = input.nowIso ?? new Date().toISOString();
  return db.transaction(async tx => {
    const id = await takePoolId(tx, input.workspaceId, input.table);
    if (id == null) return null;
    const row = { ...input.fields, ...authorFields(input.table, input.userId), id, workspace_id: input.workspaceId, created_at: now, updated_at: now } as ServerRow;
    await upsertMirrorRows(tx, input.table, [row]);
    const fields = { ...input.fields };
    // Una meta nueva necesita user_id también al enviarse; el servidor aplica su RLS por usuario.
    if (input.table === "workspace_financial_goals") fields.user_id = input.userId;
    await enqueueOp(tx, { table: input.table, workspaceId: input.workspaceId, rowId: id, kind: "insert", fields, now });
    return getRowLocal(tx, input.table, input.workspaceId, id, input.userId);
  });
}

export async function updateRowLocal(db: SqlDriver, input: Context & { id: number; fields: Record<string, unknown> }): Promise<ServerRow | null> {
  writable(input.table); assertWritableMoney(input.fields);
  return db.transaction(async tx => {
    const current = await getRowLocal(tx, input.table, input.workspaceId, input.id, input.userId);
    if (!current) return null;
    if (hasFractionalMoney(current)) throw new Error("Este monto tiene una fracción de centavo. Solo puedes consultarlo sin conexión.");
    const fields = { ...input.fields };
    // Identidad, autoría y pertenencia no son editables por un update local.
    for (const key of ["id", "workspace_id", "user_id", "created_by_user_id", "updated_by_user_id", "created_at", "updated_at"]) delete fields[key];
    await upsertMirrorRows(tx, input.table, [{ ...current, ...fields }]);
    await enqueueOp(tx, { table: input.table, workspaceId: input.workspaceId, rowId: input.id, kind: "update", fields,
      baseUpdatedAt: current.updated_at, now: input.nowIso });
    return getRowLocal(tx, input.table, input.workspaceId, input.id, input.userId);
  });
}

export async function deleteRowLocal(db: SqlDriver, input: Context & { id: number }): Promise<boolean> {
  writable(input.table);
  return db.transaction(async tx => {
    const row = await getRowLocal(tx, input.table, input.workspaceId, input.id, input.userId);
    if (!row) return false;
    if (hasFractionalMoney(row)) throw new Error("Este monto tiene una fracción de centavo. Solo puedes consultarlo sin conexión.");
    if (input.table === "subscriptions") {
      const payment = await tx.get("select 1 from movements where workspace_id = ? and json_extract(data, '$.subscription_id') = ? limit 1", [input.workspaceId, input.id]);
      // El camino online borra también movimientos vinculados: no convertirlo en un borrado distinto.
      if (payment) throw new Error(ONLINE_ONLY_COMPOUND_NOTICE);
    }
    await deleteMirrorRows(tx, input.table, [input.id]);
    await enqueueOp(tx, { table: input.table, workspaceId: input.workspaceId, rowId: input.id, kind: "delete",
      baseUpdatedAt: row.updated_at, now: input.nowIso, preserveInsertForDelete: true });
    return true;
  });
}
