import {
  addInbox,
  completeOp,
  listSendable,
  markSending,
  pendingRowIds,
  rebaseFollowingOps,
  releaseOps,
  resetStuckOps,
  type OutboxOp,
} from "./outbox";
import { addPoolIds, idsToReserve, poolSize } from "./id-pool";
import {
  deleteMirrorRows,
  getServerShapedRow,
  localIds,
  upsertMirrorRows,
  type ServerRow,
} from "./movement-store";
import { MIRRORED_TABLES, isMirroredTable, migrate, type MirroredTable } from "./schema";
import type { SqlDriver, SqlExecutor } from "./sql-driver";
import type { PullCursor, PushOp, PushResult, SyncChange, SyncReport, SyncTransport } from "./sync-types";

const PULL_PAGE_LIMIT = 1000;
const PUSH_BATCH_LIMIT = 100;
/** Seguro contra un servidor que siga diciendo has_more sin avanzar. */
const MAX_PULL_PAGES = 50;
const LIVE_IDS_EVERY_MS = 5 * 60_000;

type Deps = {
  db: SqlDriver;
  transport: SyncTransport;
  /** Reloj inyectable para las pruebas. */
  now?: () => number;
  onChange?: (change: SyncChange) => void;
};

/**
 * Códigos SQLSTATE que significan "el servidor no pudo ahora", no "tu cambio es inválido".
 * Una operación rechazada por esto vuelve a la cola en vez de a la bandeja.
 */
export function isTransientRejection(result: PushResult): boolean {
  const state = result.sqlstate ?? "";
  return state.startsWith("08") || state.startsWith("53") || state.startsWith("57") || state.startsWith("40");
}

function describeOp(op: OutboxOp, row: ServerRow | null): string {
  const description = (row?.description ?? op.fields.description) as string | undefined;
  const amount = (row?.source_amount ?? row?.destination_amount ?? op.fields.source_amount ?? op.fields.destination_amount) as
    | number
    | string
    | null
    | undefined;
  const verb = op.kind === "insert" ? "Nuevo" : op.kind === "update" ? "Edición de" : "Borrado de";
  return [verb, description || "movimiento", amount != null ? `(${amount})` : ""].filter(Boolean).join(" ");
}

export class SyncEngine {
  private readonly db: SqlDriver;
  private readonly transport: SyncTransport;
  private readonly now: () => number;
  private readonly onChange: (change: SyncChange) => void;
  private running: Promise<SyncReport> | null = null;
  private rerun: number | null = null;
  private starting: Promise<void> | null = null;

  constructor(deps: Deps) {
    this.db = deps.db;
    this.transport = deps.transport;
    this.now = deps.now ?? (() => Date.now());
    this.onChange = deps.onChange ?? (() => undefined);
  }

  /** Prepara la base (migraciones) y rescata operaciones que quedaron "enviándose" tras un cierre brusco. */
  start(): Promise<void> {
    // Una sola vez aunque varias partes lo pidan a la vez (la primera sincronización y la lectura).
    this.starting ??= (async () => {
      await migrate(this.db);
      await resetStuckOps(this.db);
    })();
    return this.starting;
  }

  get driver(): SqlDriver {
    return this.db;
  }

  async isHydrated(workspaceId: number): Promise<boolean> {
    await this.start();
    const row = await this.db.get<{ value: string }>(`select value from meta where key = ?`, [`hydrated:${workspaceId}`]);
    return row?.value === "1";
  }

  /**
   * Un ciclo completo: reponer IDs → enviar la cola → traer cambios → reconciliar borrados.
   * Reentrante: si se pide mientras corre, se agenda UNA repetición al terminar (nada se pierde y
   * no se acumulan ciclos).
   */
  syncNow(workspaceId: number): Promise<SyncReport> {
    if (this.running) {
      this.rerun = workspaceId;
      return this.running;
    }
    const run = this.runCycle(workspaceId).finally(() => {
      this.running = null;
      const again = this.rerun;
      this.rerun = null;
      if (again != null) void this.syncNow(again);
    });
    this.running = run;
    return run;
  }

  private async runCycle(workspaceId: number): Promise<SyncReport> {
    await this.start();
    const report: SyncReport = {
      pushed: 0,
      applied: 0,
      rejected: 0,
      review: 0,
      retried: 0,
      pulledRows: 0,
      hydrated: await this.isHydrated(workspaceId),
      error: null,
    };
    try {
      await this.refillPool(workspaceId);
      try {
        await this.push(workspaceId, report);
      } catch (error) {
        // Un fallo al enviar no impide intentar traer cambios; el error se informa al final.
        report.error = error instanceof Error ? error.message : String(error);
      }
      await this.pull(workspaceId, report);
      await this.reconcileDeletions(workspaceId, report);
    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error);
    }
    return report;
  }

  // ─── IDs ────────────────────────────────────────────────────────────────────────────────────

  private async refillPool(workspaceId: number): Promise<void> {
    const size = await poolSize(this.db, workspaceId, "movements");
    const wanted = idsToReserve(size);
    if (wanted === 0) return;
    try {
      const ids = await this.transport.reserveIds(workspaceId, "movements", wanted);
      await addPoolIds(this.db, workspaceId, "movements", ids);
    } catch {
      // Sin red no se puede reponer; se reintenta en el siguiente ciclo. No frena el envío.
    }
  }

  // ─── Envío ──────────────────────────────────────────────────────────────────────────────────

  private async push(workspaceId: number, report: SyncReport): Promise<void> {
    // Varios lotes seguidos hasta vaciar lo enviable. Cada operación solo se envía una vez por
    // ciclo (las que fallan por red quedan con espera y no vuelven a salir hasta que toque).
    for (let guard = 0; guard < 50; guard++) {
      const ops = await listSendable(this.db, workspaceId, PUSH_BATCH_LIMIT, new Date(this.now()).toISOString());
      if (ops.length === 0) return;
      await markSending(
        this.db,
        ops.map((op) => op.opId),
      );
      const request: PushOp[] = ops.map((op) => ({
        op_id: op.opId,
        table: op.table,
        kind: op.kind,
        workspace_id: op.workspaceId,
        row_id: op.rowId,
        fields: op.fields,
        base_updated_at: op.baseUpdatedAt,
      }));

      let results: PushResult[];
      try {
        results = await this.transport.pushBatch(request);
      } catch (error) {
        // El lote entero no llegó a resolverse: nada se pierde, todo vuelve a la cola con espera.
        await releaseOps(
          this.db,
          ops.map((op) => op.opId),
          this.now(),
        );
        report.retried += ops.length;
        throw error;
      }
      report.pushed += ops.length;
      await this.applyResults(ops, results, report);
    }
  }

  private async applyResults(ops: OutboxOp[], results: PushResult[], report: SyncReport): Promise<void> {
    const byId = new Map(results.map((result) => [result.op_id, result]));
    const touched = new Set<string>();
    let inboxChanged = false;
    const transient: string[] = [];

    await this.db.transaction(async (tx) => {
      for (const op of ops) {
        const result = byId.get(op.opId);
        if (!result) {
          // El servidor no devolvió esta operación: se trata como no resuelta.
          transient.push(op.opId);
          continue;
        }
        if (result.status === "rejected" && isTransientRejection(result)) {
          transient.push(op.opId);
          continue;
        }
        touched.add(op.table);

        if (result.status === "rejected") {
          const row = await getServerShapedRow(tx, op.table, op.rowId);
          await completeOp(tx, op.opId);
          await addInbox(tx, {
            opId: op.opId,
            table: op.table,
            rowId: op.rowId,
            kind: op.kind,
            status: "rejected",
            code: result.code ?? "error",
            message: result.message ?? null,
            summary: describeOp(op, row),
          });
          inboxChanged = true;
          report.rejected += 1;
          await this.undoLocalAfterRejection(tx, op);
          continue;
        }

        // applied | merged | review | noop
        report.applied += 1;
        await completeOp(tx, op.opId);
        if (isMirroredTable(op.table)) {
          if (op.kind === "insert" && result.row && Number(result.row.id) !== op.rowId) {
            // Dedupe del servidor: ya existía esta misma fila con otro ID. Se descarta la copia
            // local (ID reservado que no se usó) y se adopta la del servidor.
            await deleteMirrorRows(tx, op.table, [op.rowId]);
            await upsertMirrorRows(tx, op.table, [result.row]);
          } else if (op.kind === "delete") {
            await deleteMirrorRows(tx, op.table, [op.rowId]);
          } else if (result.row) {
            const stillPending = (await pendingRowIds(tx, op.table)).has(op.rowId);
            // Si el usuario siguió editando la fila mientras viajaba, su versión local manda; solo
            // se corrige la base de las ediciones que quedan para que no choquen contra sí mismas.
            if (stillPending) await rebaseFollowingOps(tx, op.table, op.rowId, result.row.updated_at);
            else await upsertMirrorRows(tx, op.table, [result.row]);
          }
        }
        if (result.status === "review") {
          await addInbox(tx, {
            opId: op.opId,
            table: op.table,
            rowId: op.rowId,
            kind: op.kind,
            status: "review",
            previous: result.previous ?? null,
            summary: describeOp(op, result.row ?? null),
          });
          inboxChanged = true;
          report.review += 1;
        }
      }
    });

    if (transient.length > 0) {
      await releaseOps(this.db, transient, this.now());
      report.retried += transient.length;
    }
    if (touched.size > 0) this.onChange({ kind: "data", tables: [...touched] });
    if (inboxChanged) this.onChange({ kind: "inbox" });
    this.onChange({ kind: "queue" });
  }

  /**
   * Una operación rechazada deja la fila local en un estado que el servidor no tiene:
   *  - insert rechazado: la fila nunca existió allá → se quita de aquí (y se cancelan las
   *    operaciones que dependían de ella, que ya no tienen a qué aplicarse).
   *  - update/delete rechazado: se vuelve a pedir la tabla completa; gana lo que diga el servidor.
   */
  private async undoLocalAfterRejection(tx: SqlExecutor, op: OutboxOp): Promise<void> {
    if (!isMirroredTable(op.table)) return;
    if (op.kind === "insert") {
      await deleteMirrorRows(tx, op.table, [op.rowId]);
      await tx.run(`delete from outbox where table_name = ? and row_id = ?`, [op.table, op.rowId]);
      return;
    }
    await tx.run(`delete from sync_cursors where workspace_id = ? and table_name = ?`, [op.workspaceId, op.table]);
  }

  // ─── Traer cambios ──────────────────────────────────────────────────────────────────────────

  private async loadCursors(workspaceId: number): Promise<Record<string, PullCursor>> {
    const rows = await this.db.all<{ table_name: string; since: string | null; after_id: number }>(
      `select table_name, since, after_id from sync_cursors where workspace_id = ?`,
      [workspaceId],
    );
    const cursors: Record<string, PullCursor> = {};
    for (const table of MIRRORED_TABLES) cursors[table] = { since: null, after_id: 0 };
    for (const row of rows) cursors[row.table_name] = { since: row.since, after_id: Number(row.after_id) };
    return cursors;
  }

  private async pull(workspaceId: number, report: SyncReport): Promise<void> {
    const changed = new Set<string>();
    let complete = false;
    for (let page = 0; page < MAX_PULL_PAGES; page++) {
      const cursors = await this.loadCursors(workspaceId);
      const response = await this.transport.pullChanges(workspaceId, cursors, MIRRORED_TABLES, PULL_PAGE_LIMIT);
      let hasMore = false;

      await this.db.transaction(async (tx) => {
        for (const table of MIRRORED_TABLES) {
          const part = response.tables[table];
          if (!part) continue;
          // Filas con cambios locales sin enviar: la versión local manda hasta que se resuelvan.
          const protectedIds = await pendingRowIds(tx, table);
          const rows = part.rows.filter((row) => !protectedIds.has(Number(row.id)));
          if (rows.length > 0) {
            await upsertMirrorRows(tx, table, rows);
            changed.add(table);
          }
          report.pulledRows += part.rows.length;
          await tx.run(
            `insert or replace into sync_cursors (workspace_id, table_name, since, after_id) values (?, ?, ?, ?)`,
            [workspaceId, table, part.next.since, Number(part.next.after_id ?? 0)],
          );
          if (part.has_more) hasMore = true;
        }
      });

      if (!hasMore) {
        complete = true;
        break;
      }
    }
    if (changed.size > 0) this.onChange({ kind: "data", tables: [...changed] });
    if (!complete) throw new Error("La descarga de cambios no terminó (demasiadas páginas).");
  }

  // ─── Borrados ───────────────────────────────────────────────────────────────────────────────

  private async reconcileDeletions(workspaceId: number, report: SyncReport): Promise<void> {
    const hydrated = await this.isHydrated(workspaceId);
    const last = await this.db.get<{ value: string }>(`select value from meta where key = ?`, [`live_ids_at:${workspaceId}`]);
    const due = !hydrated || !last || this.now() - Number(last.value) >= LIVE_IDS_EVERY_MS || report.rejected > 0;
    if (!due) return;

    const live = await this.transport.liveIds(workspaceId, MIRRORED_TABLES);
    const removed: string[] = [];
    await this.db.transaction(async (tx) => {
      for (const table of MIRRORED_TABLES as readonly MirroredTable[]) {
        const serverIds = new Set((live[table] ?? []).map(Number));
        const protectedIds = await pendingRowIds(tx, table);
        const stale = (await localIds(tx, table, workspaceId)).filter((id) => !serverIds.has(id) && !protectedIds.has(id));
        if (stale.length > 0) {
          await deleteMirrorRows(tx, table, stale);
          removed.push(table);
        }
      }
      await tx.run(`insert or replace into meta (key, value) values (?, ?)`, [`live_ids_at:${workspaceId}`, String(this.now())]);
      await tx.run(`insert or replace into meta (key, value) values (?, '1')`, [`hydrated:${workspaceId}`]);
    });
    report.hydrated = true;
    if (removed.length > 0) this.onChange({ kind: "data", tables: removed });
    else if (!hydrated) this.onChange({ kind: "data", tables: [] });
  }
}
