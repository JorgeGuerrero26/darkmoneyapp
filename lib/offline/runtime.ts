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
import type { ServerRow } from "./movement-store";
import { exactCents } from "./money";
import { createRowLocal, updateRowLocal, deleteRowLocal } from "./resource-writes";
import type { MirroredTable, WritableResourceTable } from "./schema";
import { listPendingChanges, pendingRowTimes, type PendingChange } from "./pending";
import { paySubscriptionLocal } from "./subscription-pay";
import { confirmArrivalLocal, type ConfirmArrivalLocalInput } from "./income-arrival";
import { createObligationPaymentLocal, type CreateObligationPaymentLocalInput } from "./obligation-payment";
import { ONLINE_ONLY_COMPOUND_NOTICE, ONLINE_ONLY_DELETE_SUBSCRIPTION_NOTICE } from "./status-copy";

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
  /**
   * Espera, tras abrir la app, antes de sincronizar los DEMÁS espacios del usuario. El espacio abierto se sincroniza
   * enseguida; los otros son trabajo de fondo (la primera vez descargan su copia completa) y no deben competir con las
   * consultas con las que arranca la app.
   */
  otherWorkspacesDelayMs?: number;
};

export type RuntimeHooks = {
  /** Cambió algo que la UI muestra (una escritura local o datos recién descargados). */
  onDataChanged?: (tables: string[]) => void | Promise<void>;
  /** Terminó un ciclo que envió cambios: el momento de refrescar lo que solo el servidor calcula. */
  onPushed?: (report: SyncReport, reason: SyncReason) => void | Promise<void>;
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
  /** Una escritura por otra vía puede haber BORRADO filas en el servidor: la próxima sincronización las revisa. */
  private reconcileNext = false;
  private lastNudgeReconcileAt = 0;
  private readonly now: () => number;
  private readonly writeDebounceMs: number;
  private readonly otherWorkspacesDelayMs: number;
  private otherWorkspacesTimer: ReturnType<typeof setTimeout> | null = null;
  /** Reintento de un envío que no llegó (timeout, servidor lento): ver `scheduleRetry`. */
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Lecturas completas de una tabla compartidas mientras los datos no cambian. Tras un guardado, la lista, el inicio (90 días,
   * año, proyección), los presupuestos y los historiales leían TODOS los movimientos cada uno por su lado: unas 6 lecturas y
   * miles de filas descifradas y convertidas seguidas, con el teléfono ocupado justo después de guardar. Ahora la primera
   * lectura sirve a las demás. Cualquier cambio (escritura local, descarga, envío) sube la versión y la descarta.
   */
  private dataVersion = 0;
  private readonly rowsCache = new Map<string, { version: number; rows: Promise<ServerRow[] | null> }>();

  constructor(private readonly deps: RuntimeDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.writeDebounceMs = deps.writeDebounceMs ?? 1000;
    this.otherWorkspacesDelayMs = deps.otherWorkspacesDelayMs ?? 30_000;
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
    this.invalidateRows(); // cambio de usuario, de espacio o apagado: nada leído antes se reutiliza

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
            // Un envío también reescribe filas (la versión que confirma el servidor) aunque no avise de «datos».
            this.invalidateRows();
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
    if (this.otherWorkspacesTimer) clearTimeout(this.otherWorkspacesTimer);
    this.otherWorkspacesTimer = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
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
      // Al volver a la app, volver la red o pedirlo a mano se revisa también qué borró el servidor (otra persona u otro
      // dispositivo); en un guardado normal no hace falta y se evita la consulta.
      let forceReconcile = reason === "manual" || reason === "network" || reason === "foreground";
      if (reason === "write" && this.reconcileNext) {
        forceReconcile = true;
        this.reconcileNext = false;
      }
      report = await engine.syncNow(workspaceId, { forceReconcile });
      // Los demás espacios, uno tras otro: mantienen su copia al día y envían lo que quedó pendiente
      // en ellos. Un fallo aquí no tumba el ciclo del espacio abierto.
      // Al abrir la app solo el espacio abierto: los demás esperan un poco (ver `otherWorkspacesDelayMs`).
      const others = reason === "start" ? [] : await this.otherWorkspaces(workspaceId);
      if (reason === "start") this.scheduleOtherWorkspaces();
      for (const other of others) {
        if (this.engine !== engine) break;
        const otherReport = await engine.syncNow(other, { forceReconcile }).catch((error: unknown) => ({
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
      // El conteo va en el MISMO cambio que «terminó de enviar»: antes se apagaba «Enviando 1 de 1» con el conteo viejo
      // todavía puesto y la barra decía «1 por enviar» un instante con todo ya enviado.
      const counts = await this.readCounts();
      this.patch({
        syncing: false,
        sendingTotal: 0,
        hydrated,
        lastSyncAt: report && !report.error ? this.now() : this.state.lastSyncAt,
        lastError: report?.error ?? otherError,
        ...(counts ?? {}),
      });
    }
    if (report && report.pushed > 0 && !report.error) void this.hooks.onPushed?.(report, reason);
    await this.scheduleRetry();
    return report;
  }

  /**
   * Si quedó algo sin enviar porque el envío no llegó a resolverse (servidor lento, timeout), se reintenta SOLO cuando le
   * toca (5 s, 10 s, 20 s… hasta 5 min). Antes esperaba a otra escritura, a volver a la app o al latido de 5 minutos, y la
   * barra se quedaba en «1 por enviar» con internet.
   */
  private async scheduleRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const db = this.db;
    if (!db || !this.state.online || this.state.pending === 0) return;
    const row = await db.get<{ at: string | null }>(
      "select min(next_attempt_at) as at from outbox where status = 'pending' and next_attempt_at is not null",
    ).catch(() => null);
    const at = row?.at ? Date.parse(row.at) : Number.NaN;
    if (!Number.isFinite(at) || this.db !== db) return;
    const delay = Math.min(Math.max(at - this.now(), 1_000), 300_000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.requestSync("write");
    }, delay);
  }

  /**
   * Algo se escribió por otra vía (un alta online, un pago de obligación, una categoría nueva):
   * la base local todavía no lo tiene. Se pone al día en breve, junto con otras escrituras que
   * lleguen seguidas, sin esperar al latido de 5 minutos.
   */
  nudge(options?: { reconcile?: boolean }) {
    if (this.state.availability !== "ready") return;
    // Un cobro eliminado desde el detalle de una deuda borra también su movimiento EN EL SERVIDOR: la copia local no se
    // entera por la descarga normal, hay que preguntar qué filas siguen vivas. A lo más una vez cada 20 s.
    if (options?.reconcile && this.now() - this.lastNudgeReconcileAt >= 20_000) {
      this.reconcileNext = true;
      this.lastNudgeReconcileAt = this.now();
    }
    this.scheduleWriteSync();
  }

  /** Sincroniza los demás espacios un rato después de abrir la app, sin estorbar a la carga inicial. */
  private scheduleOtherWorkspaces() {
    if (this.otherWorkspacesTimer) clearTimeout(this.otherWorkspacesTimer);
    this.otherWorkspacesTimer = setTimeout(() => {
      this.otherWorkspacesTimer = null;
      void this.requestSync("interval");
    }, this.otherWorkspacesDelayMs);
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

  /** Cuántos cambios quedan por enviar y en la bandeja. null si no se pudo contar. */
  private async readCounts(): Promise<Pick<OfflineState, "pending" | "rejected" | "review"> | null> {
    const db = this.db;
    if (!db) return null;
    try {
      // Total del usuario, no solo del espacio abierto: lo pendiente en otro espacio también cuenta.
      const [pending, inbox] = await Promise.all([countOutbox(db), countInbox(db)]);
      return { pending, rejected: inbox.rejected, review: inbox.review };
    } catch {
      // Un conteo fallido no debe romper nada; el siguiente ciclo lo corrige.
      return null;
    }
  }

  private async refreshCounts() {
    const counts = await this.readCounts();
    if (counts) this.patch(counts);
  }

  /** Los datos locales cambiaron: ninguna lectura compartida anterior vale ya. */
  private invalidateRows() {
    this.dataVersion += 1;
    this.rowsCache.clear();
  }

  private async notifyData(tables: string[]) {
    this.invalidateRows();
    try {
      await this.hooks.onDataChanged?.(tables);
    } catch {
      // La UI se refresca en el siguiente evento si esto falla.
    }
  }

  /**
   * Tras una escritura del usuario: avisa a la app SIN esperarla. La app rehace con ese aviso lo que muestra (saldos,
   * historiales por categoría, presupuestos, el inicio) recorriendo todos los movimientos de la copia local, y eso tarda:
   * esperarlo dejaba «Guardando…» en pantalla hasta 5 segundos con algo que ya estaba guardado. El aviso sale en este
   * mismo instante; lo que tarda corre después, con el formulario ya cerrado.
   */
  private notifyInBackground(tables: string[]) {
    void this.notifyData(tables);
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

  async listRows(workspaceId: number, table: MirroredTable): Promise<ServerRow[] | null> {
    const key = `${this.userId ?? ""}:${workspaceId}:${table}`;
    let entry = this.rowsCache.get(key);
    if (!entry || entry.version !== this.dataVersion) {
      const version = this.dataVersion;
      const rows = (async () => {
        const context = await this.resourceContext(workspaceId, table);
        return context ? listRowsLocal(context.db, table, workspaceId, context.userId) : null;
      })();
      entry = { version, rows };
      this.rowsCache.set(key, entry);
      // Un fallo o «aún no descargada» no se comparte: la próxima vez se vuelve a intentar.
      rows.then((result) => { if (result == null && this.rowsCache.get(key) === entry) this.rowsCache.delete(key); })
        .catch(() => { if (this.rowsCache.get(key) === entry) this.rowsCache.delete(key); });
    }
    const result = await entry.rows;
    // Cada quien recibe su propia copia de las filas: nadie puede cambiar lo que ve otra pantalla.
    return result ? result.map((row) => ({ ...row })) : null;
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

  /**
   * Movimientos aplicados con ese tipo, cuenta y monto exacto (por las columnas indexadas en centavos, sin recorrer toda la
   * copia): los candidatos a duplicado al registrar un movimiento detectado. Incluye lo que aún no se envió. null = no hay
   * copia lista o el monto no es exacto en centavos (que se consulte al servidor).
   */
  async postedMovementsWithAmount(
    workspaceId: number,
    query: { movementType: string; side: "source" | "destination"; accountId: number; amount: number },
  ): Promise<Record<string, unknown>[] | null> {
    if (!this.canReadLocal(workspaceId) || !this.db) return null;
    let cents: number | null;
    try { cents = exactCents(String(query.amount)); } catch { return null; }
    if (cents == null) return null;
    const [accountColumn, centsColumn] = query.side === "source" ? ["source_account_id", "source_cents"] : ["destination_account_id", "destination_cents"];
    const rows = await this.db.all<{ data: string }>(
      `select data from movements where workspace_id = ? and movement_type = ? and status = 'posted' and ${accountColumn} = ? and ${centsColumn} = ?`,
      [workspaceId, query.movementType, query.accountId, cents],
    );
    return rows.map((row) => JSON.parse(row.data) as Record<string, unknown>);
  }

  /** ¿Esta fila se creó en el teléfono y todavía no llegó al servidor? (solo entonces se sabe que no tiene nada colgando) */
  async hasPendingInsert(workspaceId: number, table: string, rowId: number): Promise<boolean> {
    if (!this.db) return false;
    const row = await this.db.get<{ x: number }>(
      "select 1 as x from outbox where workspace_id = ? and table_name = ? and row_id = ? and kind = 'insert' and status in ('pending','sending') limit 1",
      [workspaceId, table, rowId],
    );
    return Boolean(row);
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
      this.assertCompoundOnline(ONLINE_ONLY_DELETE_SUBSCRIPTION_NOTICE);
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
    const record = await getMovementRecord(this.requireDb(), row.id);
    await this.afterWrite();
    return record;
  }

  /**
   * Pagar una suscripción en el teléfono (avance del próximo cobro + movimiento del pago, como un grupo atómico).
   * null = no se pudo localmente (modo apagado, copia no lista, IDs agotados): que siga el camino online.
   */
  async paySubscription(
    workspaceId: number,
    input: { subscriptionId: number; nextDueDate: string; movementFields: Record<string, unknown> },
  ): Promise<{ movementId: number } | null> {
    if (!this.config.enabled || !this.canReadLocal(workspaceId) || !this.userId) return null;
    if (!(await this.resourceContext(workspaceId, "subscriptions"))) return null;
    const result = await paySubscriptionLocal(this.requireDb(), {
      workspaceId,
      userId: this.userId,
      subscriptionId: input.subscriptionId,
      nextDueDate: input.nextDueDate,
      movementFields: input.movementFields,
      nowIso: new Date(this.now()).toISOString(),
    });
    if (!result) return null;
    await this.refreshCounts();
    this.notifyInBackground(["movements", "subscriptions"]);
    this.scheduleWriteSync();
    return result;
  }

  /**
   * Anotar la llegada de un ingreso fijo en el teléfono (movimiento + historial de llegadas + avance de la próxima fecha,
   * como un grupo atómico). null = no se pudo localmente (modo apagado, copia no lista, IDs agotados): sigue el camino online.
   */
  async confirmArrival(
    workspaceId: number,
    input: Omit<ConfirmArrivalLocalInput, "workspaceId" | "userId" | "nowIso">,
  ): Promise<{ movementId: number } | null> {
    if (!this.config.enabled || !this.canReadLocal(workspaceId) || !this.userId) return null;
    if (!(await this.resourceContext(workspaceId, "recurring_income"))) return null;
    if (!(await this.resourceContext(workspaceId, "recurring_income_occurrences"))) return null;
    const result = await confirmArrivalLocal(this.requireDb(), {
      ...input,
      workspaceId,
      userId: this.userId,
      nowIso: new Date(this.now()).toISOString(),
    });
    if (!result) return null;
    await this.refreshCounts();
    this.notifyInBackground(["movements", "recurring_income", "recurring_income_occurrences"]);
    this.scheduleWriteSync();
    return result;
  }

  /**
   * Registrar un pago o cobro de una obligación en el teléfono (movimiento + evento, como un grupo atómico; sin cuenta, solo el
   * evento). null = no se pudo localmente (modo apagado, copia no lista, obligación que no está en la copia, IDs agotados):
   * sigue el camino online.
   */
  async createObligationPayment(
    workspaceId: number,
    input: Omit<CreateObligationPaymentLocalInput, "workspaceId" | "userId" | "nowIso">,
  ): Promise<{ eventId: number; movementId: number | null } | null> {
    if (!this.config.enabled || !this.canReadLocal(workspaceId) || !this.userId) return null;
    if (!(await this.resourceContext(workspaceId, "obligations"))) return null;
    const result = await createObligationPaymentLocal(this.requireDb(), {
      ...input,
      workspaceId,
      userId: this.userId,
      nowIso: new Date(this.now()).toISOString(),
    });
    if (!result) return null;
    await this.refreshCounts();
    this.notifyInBackground(result.movementId != null ? ["movements", "obligation_events"] : ["obligation_events"]);
    this.scheduleWriteSync();
    return result;
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
    // El movimiento de un pago de deuda va ligado a su evento: editarlo o borrarlo solo aquí los desincronizaría.
    if (row.movement_type === "obligation_payment" || row.obligation_id != null || metadata?.obligation_event_id != null) return true;
    // Un movimiento antiguo puede estar vinculado al historial sin llevar el metadata nuevo.
    return Boolean(await db.get("select 1 from recurring_income_occurrences where json_extract(data, '$.movement_id') = ? limit 1", [id]));
  }

  private async afterWrite(table: string = "movements") {
    await this.refreshCounts();
    this.notifyInBackground([table]);
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
