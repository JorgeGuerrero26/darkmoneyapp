import type { MovementRecord } from "../../types/domain";
import type { MovementFilters } from "../../features/movements/lib/filters";
import type { MovementFormInput, MovementUpdateInput } from "../../features/movements/lib/movement-input-types";
import { movementInputToFields, movementUpdateToFields } from "./movement-fields";
import {
  computeAccountBalances,
  getMovementRecord,
  listMovementRecords,
  type LocalAccountBalance,
  type LocalMovementPage,
} from "./movement-store";
import { createMovementLocal, deleteMovementLocal, updateMovementLocal } from "./movement-writes";
import { countInbox, countOutbox, listInbox, resolveInbox, type InboxEntry } from "./outbox";
import type { SqlDriver } from "./sql-driver";
import { SyncEngine } from "./sync-engine";
import type { SyncReport, SyncTransport } from "./sync-types";

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
  onPushed?: () => void | Promise<void>;
};

const INITIAL_STATE: OfflineState = {
  availability: "disabled",
  online: true,
  syncing: false,
  hydrated: false,
  workspaceId: null,
  pending: 0,
  rejected: 0,
  review: 0,
  lastSyncAt: null,
  lastError: null,
};

export type RuntimeConfig = { enabled: boolean; userId: string | null; workspaceId: number | null };

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
  private config: RuntimeConfig = { enabled: false, userId: null, workspaceId: null };
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

    const workspaceChanged = prev.workspaceId !== next.workspaceId || this.state.workspaceId !== next.workspaceId;
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

    this.patch({ syncing: true });
    let report: SyncReport | null = null;
    try {
      report = await engine.syncNow(workspaceId);
    } finally {
      const hydrated = await engine.isHydrated(workspaceId).catch(() => false);
      this.patch({
        syncing: false,
        hydrated,
        lastSyncAt: report && !report.error ? this.now() : this.state.lastSyncAt,
        lastError: report?.error ?? null,
      });
      await this.refreshCounts();
    }
    if (report && report.pushed > 0 && !report.error) void this.hooks.onPushed?.();
    return report;
  }

  private scheduleWriteSync() {
    if (this.writeTimer) clearTimeout(this.writeTimer);
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.requestSync("write");
    }, this.writeDebounceMs);
  }

  private async refreshCounts() {
    const db = this.db;
    if (!db) return;
    try {
      const workspaceId = this.state.workspaceId ?? undefined;
      const [pending, inbox] = await Promise.all([countOutbox(db, workspaceId), countInbox(db)]);
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

  // ─── Escritura local ────────────────────────────────────────────────────────────────────────

  /** null = no se pudo localmente (sin IDs reservados, base no lista): que siga el camino online. */
  async createMovement(workspaceId: number, input: MovementFormInput): Promise<MovementRecord | null> {
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
    const done = await deleteMovementLocal(this.requireDb(), {
      workspaceId,
      id,
      nowIso: new Date(this.now()).toISOString(),
    });
    if (!done) return false;
    await this.afterWrite();
    return true;
  }

  private async afterWrite() {
    await this.refreshCounts();
    await this.notifyData(["movements"]);
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
