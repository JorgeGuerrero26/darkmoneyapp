import type { SqlExecutor } from "./sql-driver";
import { newOpId } from "./uuid";

export type OutboxKind = "insert" | "update" | "delete";

export type OutboxOp = {
  seq: number;
  opId: string;
  table: string;
  kind: OutboxKind;
  workspaceId: number;
  rowId: number;
  fields: Record<string, unknown>;
  baseUpdatedAt: string | null;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string | null;
  status: "pending" | "sending";
};

type OutboxDbRow = {
  seq: number;
  op_id: string;
  table_name: string;
  kind: OutboxKind;
  workspace_id: number;
  row_id: number;
  fields: string;
  base_updated_at: string | null;
  created_at: string;
  attempts: number;
  next_attempt_at: string | null;
  status: "pending" | "sending";
};

function toOp(row: OutboxDbRow): OutboxOp {
  return {
    seq: Number(row.seq),
    opId: row.op_id,
    table: row.table_name,
    kind: row.kind,
    workspaceId: Number(row.workspace_id),
    rowId: Number(row.row_id),
    fields: JSON.parse(row.fields) as Record<string, unknown>,
    baseUpdatedAt: row.base_updated_at,
    createdAt: row.created_at,
    attempts: Number(row.attempts),
    nextAttemptAt: row.next_attempt_at,
    status: row.status,
  };
}

export type EnqueueInput = {
  table: string;
  kind: OutboxKind;
  workspaceId: number;
  rowId: number;
  fields?: Record<string, unknown>;
  /** `updated_at` de la fila tal como la conoce el servidor (null en un insert). */
  baseUpdatedAt?: string | null;
  now?: string;
  /** Catálogos: conservar padre insertado antes de sus hijos y borrarlo después. */
  preserveInsertForDelete?: boolean;
};

/**
 * Encola un cambio fusionándolo con el anterior de la MISMA fila si todavía no salió.
 *
 * Es parte del contrato con el servidor (docs/OFFLINE_PHASE1_PLAN.md, punto 3): dos ediciones
 * seguidas de una fila viajan como una sola operación, con la base más antigua. Si viajaran
 * separadas, la segunda llevaría una base vieja y se marcaría para revisión sin motivo.
 *
 *  - insert + update  → un insert con los campos fusionados.
 *  - update + update  → un update con los campos fusionados y la base del primero.
 *  - insert + delete  → nada: la fila nunca existió en el servidor.
 *  - update + delete  → un delete con la base del update.
 *
 * Una operación `sending` (ya enviada, sin respuesta) nunca se toca: la nueva se añade detrás
 * y su base se corrige cuando llegue la respuesta (`rebaseFollowingOps`).
 *
 * Debe llamarse dentro de una transacción.
 */
export async function enqueueOp(db: SqlExecutor, input: EnqueueInput): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const fields = input.fields ?? {};
  const prevRow = await db.get<OutboxDbRow>(
    `select * from outbox where table_name = ? and row_id = ? and status = 'pending' order by seq desc limit 1`,
    [input.table, input.rowId],
  );
  const prev = prevRow ? toOp(prevRow) : null;
  const sendingExists = Boolean(
    await db.get(`select 1 as x from outbox where table_name = ? and row_id = ? and status = 'sending' limit 1`, [
      input.table,
      input.rowId,
    ]),
  );

  if (prev && !sendingExists) {
    if (input.kind === "update" && (prev.kind === "insert" || prev.kind === "update")) {
      await db.run(`update outbox set fields = ? where seq = ?`, [JSON.stringify({ ...prev.fields, ...fields }), prev.seq]);
      return;
    }
    if (input.kind === "delete" && prev.kind === "insert" && !input.preserveInsertForDelete) {
      await db.run(`delete from outbox where seq = ?`, [prev.seq]);
      return;
    }
    if (input.kind === "delete" && prev.kind === "update") {
      await db.run(`delete from outbox where seq = ?`, [prev.seq]);
      await insertOp(db, { ...input, fields: {}, baseUpdatedAt: prev.baseUpdatedAt, now });
      return;
    }
  }
  await insertOp(db, { ...input, fields, now });
}

async function insertOp(db: SqlExecutor, input: EnqueueInput & { fields: Record<string, unknown> }) {
  await db.run(
    `insert into outbox (op_id, table_name, kind, workspace_id, row_id, fields, base_updated_at, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newOpId(),
      input.table,
      input.kind,
      input.workspaceId,
      input.rowId,
      JSON.stringify(input.fields),
      input.baseUpdatedAt ?? null,
      input.now ?? new Date().toISOString(),
    ],
  );
}

/** Operaciones listas para enviar (pendientes cuyo reintento ya toca), en el orden en que se hicieron. */
export async function listSendable(db: SqlExecutor, workspaceId: number, limit: number, nowIso: string): Promise<OutboxOp[]> {
  const rows = await db.all<OutboxDbRow>(
    `select * from outbox
     where workspace_id = ? and status = 'pending' and (next_attempt_at is null or next_attempt_at <= ?)
     order by seq limit ?`,
    [workspaceId, nowIso, limit],
  );
  return rows.map(toOp);
}

export async function markSending(db: SqlExecutor, opIds: string[]): Promise<void> {
  for (const opId of opIds) await db.run(`update outbox set status = 'sending' where op_id = ?`, [opId]);
}

export async function completeOp(db: SqlExecutor, opId: string): Promise<void> {
  await db.run(`delete from outbox where op_id = ?`, [opId]);
}

/** Backoff: 5 s, 10 s, 20 s… con tope de 5 min. */
export function backoffMs(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(attempts, 0), 300_000);
}

/** El envío no llegó a resolverse (sin red, timeout): la operación vuelve a la cola, sin perderse. */
export async function releaseOps(db: SqlExecutor, opIds: string[], nowMs: number): Promise<void> {
  for (const opId of opIds) {
    const row = await db.get<{ attempts: number }>(`select attempts from outbox where op_id = ?`, [opId]);
    const attempts = Number(row?.attempts ?? 0) + 1;
    await db.run(`update outbox set status = 'pending', attempts = ?, next_attempt_at = ? where op_id = ?`, [
      attempts,
      new Date(nowMs + backoffMs(attempts - 1)).toISOString(),
      opId,
    ]);
  }
}

/** Tras un cierre brusco, lo que quedó "enviándose" no se sabe si llegó: se reintenta (el servidor deduplica por op_id). */
export async function resetStuckOps(db: SqlExecutor): Promise<void> {
  await db.run(`update outbox set status = 'pending', next_attempt_at = null where status = 'sending'`);
}

/**
 * Tras confirmar una operación, las siguientes de la misma fila deben partir de la versión nueva
 * del servidor (si no, se verían como un conflicto contra uno mismo).
 */
export async function rebaseFollowingOps(db: SqlExecutor, table: string, rowId: number, updatedAt: string): Promise<void> {
  await db.run(`update outbox set base_updated_at = ? where table_name = ? and row_id = ? and kind <> 'insert'`, [
    updatedAt,
    table,
    rowId,
  ]);
}

export async function pendingRowIds(db: SqlExecutor, table: string): Promise<Set<number>> {
  const rows = await db.all<{ row_id: number }>(`select distinct row_id from outbox where table_name = ?`, [table]);
  return new Set(rows.map((row) => Number(row.row_id)));
}

export async function countOutbox(db: SqlExecutor, workspaceId?: number): Promise<number> {
  const row = workspaceId == null
    ? await db.get<{ n: number }>(`select count(*) as n from outbox`)
    : await db.get<{ n: number }>(`select count(*) as n from outbox where workspace_id = ?`, [workspaceId]);
  return Number(row?.n ?? 0);
}

// ─── Bandeja: cambios que el servidor no aplicó o que conviene revisar ───────────────────────

export type InboxStatus = "rejected" | "review";

export type InboxEntry = {
  id: number;
  opId: string;
  table: string;
  rowId: number | null;
  kind: OutboxKind;
  status: InboxStatus;
  code: string | null;
  message: string | null;
  previous: Record<string, unknown> | null;
  summary: string | null;
  createdAt: string;
};

export type AddInboxInput = {
  opId: string;
  table: string;
  rowId: number | null;
  kind: OutboxKind;
  status: InboxStatus;
  code?: string | null;
  message?: string | null;
  previous?: Record<string, unknown> | null;
  /** Texto corto para reconocer el cambio en la bandeja (p. ej. la descripción del movimiento). */
  summary?: string | null;
  now?: string;
};

export async function addInbox(db: SqlExecutor, input: AddInboxInput): Promise<void> {
  await db.run(
    `insert into inbox (op_id, table_name, row_id, kind, status, code, message, previous, summary, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.opId,
      input.table,
      input.rowId,
      input.kind,
      input.status,
      input.code ?? null,
      input.message ?? null,
      input.previous ? JSON.stringify(input.previous) : null,
      input.summary ?? null,
      input.now ?? new Date().toISOString(),
    ],
  );
}

type InboxDbRow = {
  id: number;
  op_id: string;
  table_name: string;
  row_id: number | null;
  kind: OutboxKind;
  status: InboxStatus;
  code: string | null;
  message: string | null;
  previous: string | null;
  summary: string | null;
  created_at: string;
};

export async function listInbox(db: SqlExecutor): Promise<InboxEntry[]> {
  const rows = await db.all<InboxDbRow>(`select * from inbox where resolved = 0 order by id desc`);
  return rows.map((row) => ({
    id: Number(row.id),
    opId: row.op_id,
    table: row.table_name,
    rowId: row.row_id == null ? null : Number(row.row_id),
    kind: row.kind,
    status: row.status,
    code: row.code,
    message: row.message,
    previous: row.previous ? (JSON.parse(row.previous) as Record<string, unknown>) : null,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}

export async function resolveInbox(db: SqlExecutor, id: number): Promise<void> {
  await db.run(`update inbox set resolved = 1 where id = ?`, [id]);
}

export async function countInbox(db: SqlExecutor): Promise<{ rejected: number; review: number }> {
  const rows = await db.all<{ status: InboxStatus; n: number }>(
    `select status, count(*) as n from inbox where resolved = 0 group by status`,
  );
  const count = (status: InboxStatus) => Number(rows.find((row) => row.status === status)?.n ?? 0);
  return { rejected: count("rejected"), review: count("review") };
}
