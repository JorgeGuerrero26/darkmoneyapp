import type { MovementRecord } from "../../types/domain";
import type { MovementFilters } from "../../features/movements/lib/filters";
import type { MovementFormInput, MovementUpdateInput } from "../../features/movements/lib/movement-input-types";
import { movementInputToFields, movementUpdateToFields } from "./movement-fields";
import {
  computeAccountBalances,
  getMovementRecord,
  getServerShapedRow,
  listMovementRecords,
  type LocalAccountBalance,
  type LocalMovementPage,
} from "./movement-store";
import { createMovementLocal, deleteMovementLocal, updateMovementLocal } from "./movement-writes";
import { countInbox, countOutbox, listInbox, resolveInbox, type InboxEntry } from "./outbox";
import type { SqlDriver } from "./sql-driver";
import { SyncEngine } from "./sync-engine";
import type { SyncReport, SyncTransport } from "./sync-types";
import { listRowsLocal } from "./resource-store";
import { createRowLocal, updateRowLocal, deleteRowLocal } from "./resource-writes";
import type { MirroredTable, WritableResourceTable } from "./schema";
import { listPendingChanges, pendingRowTimes, type PendingChange } from "./pending";
import { ONLINE_ONLY_COMPOUND_NOTICE } from "./status-copy";

export type OfflineAvailability = "disabled" | "unavailable" | "starting" | "ready" | "error";

export type OfflineState = {
  availability: OfflineAvailability;
  online: boolean;
  syncing: boolean;
  /** La base local ya tiene la copia completa del espacio activo: solo entonces se lee de ella. */
  hydrated: boolean;
  workspaceId: number | null;
  /** Cambios guardados en el teléfono que todavía no confirmó el servidor. */
  pending: number;
  /** Cuántos cambios había por enviar al empezar el ciclo actual (para decir "Enviando 2 de 3"). 0 = no se está enviando. */
  sendingTotal: number;
  /** Cambios que el servidor no aceptó (bandeja). */
  rejected: number;
  /** Cambios aplicados que conviene revisar (otra persona había cambiado el monto). */
  review: number;
  lastSyncAt: number | null;
  lastError: string | null;
};

export type SyncReason = "start" | "network" | "foreground" | "interval" | "write" | "manual";

export type RuntimeDeps = {
  isAvailable: () => boolean;
  openDriver: (userId: string) => Promise<SqlDriver | null>;
  deleteDatabase: (userId: string) => Promise<void>;
  transport: SyncTransport;
  now?: () => number;
  /** Espera tras una escritura antes de sincronizar: junta varias altas seguidas en un solo envío. */
  writeDebounceMs?: number;
};

export type RuntimeHooks = {
  /** Cambió algo que la UI muestra (una escritura local o datos recién descargados). */
  onDataChanged?: (tables: string[]) => void | Promise<void>;
  /** Terminó un ciclo que envió cambios: el momento de refrescar lo que solo el servidor calcula. */
  onPushed?: (report: SyncReport) => void | Promise<void>;
};

const INITIAL_STATE: OfflineState = {
  availability: "disabled",
  online: true,
  syncing: false,
  hydrated: false,
  workspaceId: null,
  pending: 0,
  sendingTotal: 0,
  rejected: 0,
  review: 0,
  lastSyncAt: null,
  lastError: null,
};

export type RuntimeConfig = {
  enabled: boolean;
  userId: string | null;
  /** El espacio que el usuario tiene abierto: se sincroniza primero y es el que se lee/escribe. */
  workspaceId: number | null;
  /**
   * Todos los espacios de los que es miembro. Se mantienen al día en segundo plano para que cambiar de
   * espacio ya encuentre la copia local lista, y para que lo pendiente de un espacio se envíe aunque el
   * usuario ya esté en otro. Sin esto, un cambio guardado en el espacio A quedaba sin enviar al pasar al B.
   */
  workspaceIds?: number[];
};

/**
 * Une el motor con la app: abre la base del usuario, decide cuándo sincronizar, expone el estado
 * y ofrece las operaciones locales que usan las mutaciones y las consultas de movimientos.
 *
 * Sin dependencias de React Native: las piezas de plataforma (expo-sqlite, red, ciclo de vida,
 * React Query) entran por `deps` y `hooks`, así que toda la lógica se prueba con SQLite en memoria.
 */
export class OfflineRuntime {
  private state: OfflineState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();
  private hooks: RuntimeHooks = {};
  private engine: SyncEngine | null = null;
  private db: SqlDriver | null = null;
  private userId: string | null = null;
  private config: RuntimeConfig = { enabled: false, userId: null, workspaceId: null, workspaceIds: [] };
  private queue: Promise<unknown> = Promise.resolve();
  private writeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private readonly writeDebounceMs: number;

  constructor(private readonly deps: RuntimeDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.writeDebounceMs = deps.writeDebounceMs ?? 1000;
  }

  // ─── Estado observable ──────────────────────────────────────────────────────────────────────

  getState = (): OfflineState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private patch(partial: Partial<OfflineState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener());
  }

  setHooks(hooks: RuntimeHooks) {
    this.hooks = hooks;
  }

  setOnline(online: boolean) {
    if (this.state.online === online) return;
    this.patch({ online });
    if (online) void this.requestSync("network");
  }

  // ─── Ciclo de vida ──────────────────────────────────────────────────────────────────────────

  /** Idempotente y en orden: se puede llamar en cada render del puente sin riesgo de carreras. */
  configure(config: RuntimeConfig): Promise<void> {
    const job = this.queue.then(() => this.applyConfig(config));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async applyConfig(next: RuntimeConfig): Promise<void> {
    const prev = this.config;
    this.config = next;

    if (!next.enabled || !next.userId) {
      if (this.engine) await this.closeEngine();
      this.patch({
        ...INITIAL_STATE,
        online: this.state.online,
        availability: "disabled",
      });
      return;
    }
    if (!this.deps.isAvailable()) {
      this.patch({ ...INITIAL_STATE, online: this.state.online, availability: "unavailable" });
      return;
    }

    if (this.engine && this.userId !== next.userId) await this.closeEngine();

    if (!this.engine) {
      this.patch({ availability: "starting", lastError: null });
      try {
        const db = await this.deps.openDriver(next.userId);
        if (!db) {
          this.patch({ availability: "unavailable" });
          return;
        }
        const engine = new SyncEngine({
          db,
          transport: this.deps.transport,
          now: this.now,
          onChange: (change) => {
            if (change.kind === "data") void this.notifyData(change.tables);
            void this.refreshCounts();
          },
        });
        await engine.start();
        this.db = db;
        this.engine = engine;
        this.userId = next.userId;
      } catch (error) {
        this.patch({ availability: "error", lastError: error instanceof Error ? error.message : String(error) });
        return;
      }
    }

    const workspaceChanged =
      prev.workspaceId !== next.workspaceId ||
      this.state.workspaceId !== next.workspaceId ||
      (prev.workspaceIds ?? []).join(",") !== (next.workspaceIds ?? []).join(",");
    const hydrated = next.workspaceId != null ? await this.engine!.isHydrated(next.workspaceId) : false;
    this.patch({ availability: "ready", workspaceId: next.workspaceId, hydrated });
    await this.refreshCounts();
    if (next.workspaceId != null && (workspaceChanged || !prev.enabled)) void this.requestSync("start");
  }

  private async closeEngine() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = null;
    const db = this.db;
    this.engine = null;
    this.db = null;
    this.userId = null;
    if (db) await db.close().catch(() => undefined);
  }

  /**
   * Cerrar sesión: un último intento de enviar lo pendiente y, solo si no queda nada sin enviar,
   * se borra la base del usuario (no deben quedar datos financieros ajenos en el teléfono). Si
   * quedan cambios sin confirmar se conserva: borrarlos sería perder trabajo del usuario.
   */
  async signOutCleanup(): Promise<{ wiped: boolean; pending: number }> {
    const userId = this.userId;
    if (!userId || !this.engine || this.config.workspaceId == null) return { wiped: false, pending: 0 };
    await this.requestSync("manual");
    const pending = await countOutbox(this.engine.driver);
    if (pending > 0) return { wiped: false, pending };
    await this.configure({ enabled: this.config.enabled, userId: null, workspaceId: null });
    await this.deps.deleteDatabase(userId);
    return { wiped: true, pending: 0 };
  }

  // ─── Sincronización ─────────────────────────────────────────────────────────────────────────

  async requestSync(reason: SyncReason): Promise<SyncReport | null> {
    const engine = this.engine;
    const workspaceId = this.state.workspaceId;
    if (!engine || workspaceId == null || this.state.availability !== "ready") return null;
    // Sin red no tiene sentido intentarlo, salvo que el usuario lo pida (el botón da el motivo real).
    if (!this.state.online && reason !== "manual") return null;

    const sendingTotal = this.db ? await countOutbox(this.db).catch(() => 0) : 0;
    this.patch({ syncing: true, sendingTotal });
    let report: SyncReport | null = null;
    let otherError: string | null = null;
    try {
      report = await engine.syncNow(workspaceId);
      // Los demás espacios, uno tras otro: mantienen su copia al día y envían lo que quedó pendiente
      // en ellos. Un fallo aquí no tumba el ciclo del espacio abierto.
      for (const other of await this.otherWorkspaces(workspaceId)) {
        if (this.engine !== engine) break;
        const otherReport = await engine.syncNow(other).catch((error: unknown) => ({
          error: error instanceof Error ? error.message : String(error),
          pushed: 0,
        }));
        if (otherReport.error && !otherError) otherError = otherReport.error;
        if (report && otherReport.pushed > 0 && !otherReport.error) {
          report = { ...report, pushed: report.pushed + otherReport.pushed, applied: report.applied + ((otherReport as { applied?: number }).applied ?? 0) };
        }
      }
    } finally {
      const hydrated = await engine.isHydrated(workspaceId).catch(() => false);
      this.patch({
        syncing: false,
        sendingTotal: 0,
        hydrated,
        lastSyncAt: report && !report.error ? this.now() : this.state.lastSyncAt,
        lastError: report?.error ?? otherError,
      });
      await this.refreshCounts();
    }
    if (report && report.pushed > 0 && !report.error) void this.hooks.onPushed?.(report);
    return report;
  }

  /**
   * Algo se escribió por otra vía (un alta online, un pago de obligación, una categoría nueva):
   * la base local todavía no lo tiene. Se pone al día en breve, junto con otras escrituras que
   * lleguen seguidas, sin esperar al latido de 5 minutos.
   */
  nudge() {
    if (this.state.availability === "ready") this.scheduleWriteSync();
  }

  private scheduleWriteSync() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.requestSync("write");
    }, this.writeDebounceMs);
  }

  /** Espacios, además del abierto, que hay que sincronizar: los miembros y cualquiera con cambios sin enviar. */
  private async otherWorkspaces(active: number): Promise<number[]> {
    const ids = new Set<number>(this.config.workspaceIds ?? []);
    if (this.db) {
      const rows = await this.db.all<{ workspace_id: number }>(
        "select distinct workspace_id from outbox where status in ('pending','sending')",
      );
      for (const row of rows) ids.add(Number(row.workspace_id));
    }
    ids.delete(active);
    return [...ids];
  }

  private async refreshCounts() {
    const db = this.db;
    if (!db) return;
    try {
      // Total del usuario, no solo del espacio abierto: lo pendiente en otro espacio también cuenta.
      const [pending, inbox] = await Promise.all([countOutbox(db), countInbox(db)]);
      this.patch({ pending, rejected: inbox.rejected, review: inbox.review });
    } catch {
      // Un conteo fallido no debe romper nada; el siguiente ciclo lo corrige.
    }
  }

  private async notifyData(tables: string[]) {
    try {
      await this.hooks.onDataChanged?.(tables);
    } catch {
      // La UI se refresca en el siguiente evento si esto falla.
    }
  }

  // ─── Lectura local ──────────────────────────────────────────────────────────────────────────

  /** ¿Se puede leer movimientos de la base local para este espacio? Solo con la copia completa. */
  canReadLocal(workspaceId: number | null | undefined): boolean {
    return (
      this.state.availability === "ready" &&
      this.state.hydrated &&
      workspaceId != null &&
      this.state.workspaceId === workspaceId &&
      this.db !== null
    );
  }

  listMovements(workspaceId: number, filters: MovementFilters, page: number, pageSize: number): Promise<LocalMovementPage> {
    return listMovementRecords(this.requireDb(), workspaceId, filters, page, pageSize);
  }

  getMovement(id: number): Promise<MovementRecord | null> {
    return getMovementRecord(this.requireDb(), id);
  }

  async accountBalances(workspaceId: number): Promise<LocalAccountBalance[] | null> {
    if (!this.canReadLocal(workspaceId)) return null;
    return computeAccountBalances(this.requireDb(), workspaceId);
  }

  private requireDb(): SqlDriver {
    if (!this.db) throw new Error("La base local no está lista.");
    return this.db;
  }

  /** P1: ninguna mitad de un flujo compuesto puede empezar sin internet. Apagado = sin cambios. */
  assertCompoundOnline(notice: string = ONLINE_ONLY_COMPOUND_NOTICE): void {
    if (this.config.enabled && !this.state.online) throw new Error(notice);
  }

  private async resourceContext(workspaceId: number, table: MirroredTable) {
    const engine = this.engine, db = this.db, userId = this.userId;
    if (!this.canReadLocal(workspaceId) || !engine || !db || !userId) return null;
    if (!await engine.isTableHydrated(workspaceId, table)) return null;
    // Una espera en SQLite no puede convertir una operación del usuario anterior en otra del nuevo.
    if (this.engine !== engine || this.db !== db || this.userId !== userId || !this.canReadLocal(workspaceId)) return null;
    return { db, userId };
  }

  async listRows(workspaceId: number, table: MirroredTable) {
    const context = await this.resourceContext(workspaceId, table);
    return context ? listRowsLocal(context.db, table, workspaceId, context.userId) : null;
  }

  /**
   * Cuántas filas de `table` apuntan a `id` por `column` (p. ej. movimientos de una categoría). Sirve para
   * repetir en local las comprobaciones previas al borrado. null = tabla aún sin descargar.
   */
  async countReferences(workspaceId: number, table: MirroredTable, column: string, id: number): Promise<number | null> {
    const context = await this.resourceContext(workspaceId, table);
    if (!context || !/^[a-z_]+$/.test(column)) return null;
    const row = await context.db.get<{ n: number }>(
      `select count(*) as n from ${table} where workspace_id = ? and json_extract(data, '$.${column}') = ?`,
      [workspaceId, id],
    );
    return Number(row?.n ?? 0);
  }

  /** Cambios sin enviar de todos los espacios, del más reciente al más antiguo (hoja de pendientes). */
  async listPendingChanges(): Promise<PendingChange[]> {
    return this.db ? listPendingChanges(this.db) : [];
  }

  /** Cuándo se guardó cada fila pendiente de una tabla del espacio (para marcarla en su lista). */
  async pendingRowTimes(workspaceId: number, table: string): Promise<Array<{ id: number; at: string }>> {
    if (!this.canReadLocal(workspaceId) || !this.db) return [];
    return pendingRowTimes(this.db, workspaceId, table);
  }

  /** IDs de las filas de una tabla con operaciones sin enviar (para mostrar lo local encima de lo del servidor). */
  async pendingRowIds(workspaceId: number, table: string): Promise<number[]> {
    if (!this.canReadLocal(workspaceId) || !this.db) return [];
    const rows = await this.db.all<{ row_id: number }>(
      "select distinct row_id from outbox where workspace_id = ? and table_name = ? and status in ('pending','sending')",
      [workspaceId, table],
    );
    return rows.map((row) => Number(row.row_id));
  }

  /** ¿Hay cambios sin enviar en alguna de estas tablas? Decide si un número del servidor puede estar desfasado. */
  async hasPendingOps(workspaceId: number, tables: string[]): Promise<boolean> {
    if (!this.canReadLocal(workspaceId) || !this.db || tables.length === 0) return false;
    const marks = tables.map(() => "?").join(",");
    const row = await this.db.get<{ n: number }>(
      `select count(*) as n from outbox where workspace_id = ? and table_name in (${marks})`,
      [workspaceId, ...tables],
    );
    return Number(row?.n ?? 0) > 0;
  }

  async createRow(workspaceId: number, table: WritableResourceTable, fields: Record<string, unknown>) {
    const context = await this.resourceContext(workspaceId, table);
    if (!context) return null;
    const row = await createRowLocal(context.db, { workspaceId, table, userId: context.userId, fields, nowIso: new Date(this.now()).toISOString() });
    if (row) await this.afterWrite(table);
    return row;
  }

  async updateRow(workspaceId: number, table: WritableResourceTable, id: number, fields: Record<string, unknown>) {
    const context = await this.resourceContext(workspaceId, table);
    if (!context) return null;
    const row = await updateRowLocal(context.db, { workspaceId, table, userId: context.userId, id, fields, nowIso: new Date(this.now()).toISOString() });
    if (row) await this.afterWrite(table);
    return row;
  }

  async deleteRow(workspaceId: number, table: WritableResourceTable, id: number) {
    const context = await this.resourceContext(workspaceId, table);
    if (!context) return false;
    if (table === "subscriptions" && await context.db.get("select 1 from movements where workspace_id=? and json_extract(data, '$.subscription_id')=? limit 1", [workspaceId, id])) {
      this.assertCompoundOnline();
      return false; // Con red, conservar el borrado online de la suscripción y sus pagos.
    }
    const done = await deleteRowLocal(context.db, { workspaceId, table, userId: context.userId, id, nowIso: new Date(this.now()).toISOString() });
    if (done) await this.afterWrite(table);
    return done;
  }

  // ─── Escritura local ────────────────────────────────────────────────────────────────────────

  /** null = no se pudo localmente (sin IDs reservados, base no lista): que siga el camino online. */
  async createMovement(workspaceId: number, input: MovementFormInput): Promise<MovementRecord | null> {
    const confirmedArrival = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      && input.metadata.recurring_income_confirmed_arrival;
    if (this.config.enabled && (input.movementType === "subscription_payment" || input.subscriptionId != null || confirmedArrival)) {
      this.assertCompoundOnline();
      return null; // Con red, estas operaciones también siguen el camino online completo.
    }
    if (!this.canReadLocal(workspaceId) || !this.userId) return null;
    const row = await createMovementLocal(this.requireDb(), {
      workspaceId,
      userId: this.userId,
      fields: movementInputToFields(input),
      nowIso: new Date(this.now()).toISOString(),
    });
    if (!row) return null;
    await this.afterWrite();
    return getMovementRecord(this.requireDb(), row.id);
  }

  async updateMovement(workspaceId: number, id: number, input: MovementUpdateInput): Promise<boolean> {
    if (!this.canReadLocal(workspaceId) || !this.userId) return false;
    if (await this.isCompoundMovement(id) || input.movementType === "subscription_payment") {
      this.assertCompoundOnline();
      return false;
    }
    const row = await updateMovementLocal(this.requireDb(), {
      workspaceId,
      userId: this.userId,
      id,
      fields: movementUpdateToFields(input),
      nowIso: new Date(this.now()).toISOString(),
    });
    if (!row) return false;
    await this.afterWrite();
    return true;
  }

  voidMovement(workspaceId: number, id: number): Promise<boolean> {
    return this.updateMovement(workspaceId, id, { status: "voided" });
  }

  async deleteMovement(workspaceId: number, id: number): Promise<boolean> {
    if (!this.canReadLocal(workspaceId)) return false;
    if (await this.isCompoundMovement(id)) {
      this.assertCompoundOnline();
      return false;
    }
    const done = await deleteMovementLocal(this.requireDb(), {
      workspaceId,
      id,
      nowIso: new Date(this.now()).toISOString(),
    });
    if (!done) return false;
    await this.afterWrite();
    return true;
  }

  private async isCompoundMovement(id: number): Promise<boolean> {
    const db = this.requireDb();
    const row = await getServerShapedRow(db, "movements", id);
    if (!row) return false;
    const metadata = row.metadata as Record<string, unknown> | null;
    if (row.subscription_id != null || row.movement_type === "subscription_payment" || metadata?.recurring_income_confirmed_arrival) return true;
    // Un movimiento antiguo puede estar vinculado al historial sin llevar el metadata nuevo.
    return Boolean(await db.get("select 1 from recurring_income_occurrences where json_extract(data, '$.movement_id') = ? limit 1", [id]));
  }

  private async afterWrite(table: string = "movements") {
    await this.refreshCounts();
    await this.notifyData([table]);
    this.scheduleWriteSync();
  }

  // ─── Bandeja ────────────────────────────────────────────────────────────────────────────────

  inbox(): Promise<InboxEntry[]> {
    return this.db ? listInbox(this.db) : Promise.resolve([]);
  }

  async resolveInboxEntry(id: number): Promise<void> {
    if (!this.db) return;
    await resolveInbox(this.db, id);
    await this.refreshCounts();
  }
}
