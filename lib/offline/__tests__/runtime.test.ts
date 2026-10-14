import { OfflineRuntime, type RuntimeDeps } from "../runtime";
import type { PushOp, PushResult, SyncTransport } from "../sync-types";
import type { SqlDriver } from "../sql-driver";
import { createTestDriver } from "./helpers/node-sqlite-driver";
import { upsertMovementRows, upsertMirrorRows } from "../movement-store";

const WS = 1;
const expense = (description: string, amount: number) => ({
  movementType: "expense" as const, status: "posted" as const, occurredAt: "2026-10-12T15:00:00.000Z", description,
  sourceAccountId: 1, sourceAmount: amount, destinationAccountId: null, destinationAmount: null, dedupeKey: `k-${description}`,
});

/** Servidor falso mínimo: acepta todo y devuelve la fila como la dejaría el servidor real. */
function fakeTransport(log: { pushed: PushOp[][]; failPush: boolean; pulls: number; pulledWs?: number[]; liveIdsCalls?: number }): SyncTransport {
  let nextId = 1000;
  return {
    async reserveIds(_ws, _table, count) {
      return Array.from({ length: count }, () => nextId++);
    },
    async pullChanges(ws, cursors, tables) {
      log.pulls += 1;
      log.pulledWs?.push(ws);
      return {
        server_time: "2026-10-12T15:00:00.000Z",
        tables: Object.fromEntries(
          tables.map((table) => [table, { rows: [], has_more: false, next: { since: cursors[table]?.since ?? null, after_id: 0 } }]),
        ),
      };
    },
    async liveIds() {
      if (log.liveIdsCalls != null) log.liveIdsCalls += 1;
      return {};
    },
    async pushBatch(ops) {
      if (log.failPush) throw new Error("Network request failed");
      log.pushed.push(ops);
      return ops.map<PushResult>((op) => ({
        op_id: op.op_id,
        status: "applied",
        table: op.table,
        row_id: op.row_id,
        row: op.kind === "delete" ? undefined : ({ ...op.fields, id: op.row_id, workspace_id: op.workspace_id, updated_at: "2026-10-12T15:00:01.000Z" } as never),
      }));
    },
  };
}

function setup(overrides: Partial<RuntimeDeps> = {}) {
  const log = { pushed: [] as PushOp[][], failPush: false, pulls: 0, pulledWs: [] as number[], liveIdsCalls: 0 };
  const drivers: Record<string, SqlDriver> = {};
  const deleted: string[] = [];
  const runtime = new OfflineRuntime({
    isAvailable: () => true,
    openDriver: async (userId) => (drivers[userId] ??= createTestDriver()),
    deleteDatabase: async (userId) => {
      deleted.push(userId);
    },
    transport: fakeTransport(log),
    writeDebounceMs: 0,
    otherWorkspacesDelayMs: 0,
    ...overrides,
  });
  const changes: string[][] = [];
  runtime.setHooks({ onDataChanged: (tables) => void changes.push(tables) });
  return { runtime, log, drivers, deleted, changes };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("OfflineRuntime", () => {
  it("P1: sin red no inicia un pago/llegada ni encola una mitad; apagado mantiene el camino anterior", async () => {
    const { runtime, log } = setup();
    runtime.setOnline(false);
    expect(() => runtime.assertCompoundOnline()).not.toThrow();
    expect(await runtime.createRow(WS, "budgets", { name: "Apagado" })).toBeNull();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    expect(() => runtime.assertCompoundOnline()).toThrow("Necesitas internet");
    await expect(runtime.createMovement(WS, { ...expense("Llegada", 10), movementType: "income", metadata: { recurring_income_confirmed_arrival: true } })).rejects.toThrow("no se guardó ningún cambio");
    await expect(runtime.createMovement(WS, { ...expense("Pago vinculado", 10), subscriptionId: 7 })).rejects.toThrow("Necesitas internet");
    expect(runtime.getState().pending).toBe(0);
    expect(log.pushed).toEqual([]);
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
    expect(() => runtime.assertCompoundOnline()).not.toThrow();
  });

  it("P1: editar, anular y borrar un pago vinculado tampoco modifica una mitad offline", async () => {
    const { runtime, drivers } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle(); runtime.setOnline(false);
    await upsertMovementRows(drivers.u1, [{ id: 77, workspace_id: WS, updated_at: "2026-10-12T15:00:00Z",
      occurred_at: "2026-10-12T15:00:00Z", movement_type: "expense", status: "posted", subscription_id: 7, source_amount: 10 }]);
    await upsertMirrorRows(drivers.u1, "subscriptions", [{ id: 7, workspace_id: WS, updated_at: "2026-10-12T15:00:00Z", amount: 10 }]);
    await expect(runtime.updateMovement(WS, 77, { sourceAmount: 20 })).rejects.toThrow("Necesitas internet");
    await expect(runtime.voidMovement(WS, 77)).rejects.toThrow("Necesitas internet");
    await expect(runtime.deleteMovement(WS, 77)).rejects.toThrow("Necesitas internet");
    await expect(runtime.deleteRow(WS, "subscriptions", 7)).rejects.toThrow("Necesitas internet");
    expect((await runtime.getMovement(77))?.sourceAmount).toBe(10);
    expect(runtime.getState().pending).toBe(0);
    runtime.setOnline(true);
    expect(await runtime.updateMovement(WS, 77, { sourceAmount: 20 })).toBe(false);
    expect(await runtime.deleteRow(WS, "subscriptions", 7)).toBe(false);
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
  });

  it("lee recursos solo tras hidratar su tabla y nunca inventa un historial no descargado", async () => {
    const { runtime } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    expect(await runtime.listRows(WS, "categories")).toEqual([]);
    expect(await runtime.listRows(WS, "subscription_occurrences")).toBeNull();
    runtime.setOnline(false);
    const created = await runtime.createRow(WS, "budgets", { name: "Local", limit_amount: 12.5 });
    expect(created?.limit_amount).toBe("12.5");
    expect((await runtime.listRows(WS, "budgets"))?.map(row => row.name)).toEqual(["Local"]);
    expect(await runtime.createRow(2, "budgets", { name: "Otro" })).toBeNull();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
  });
  it("apagado: no abre nada", async () => {
    const { runtime, drivers } = setup();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
    expect(runtime.getState().availability).toBe("disabled");
    expect(Object.keys(drivers)).toHaveLength(0);
    expect(runtime.canReadLocal(WS)).toBe(false);
  });

  it("sin módulo nativo queda 'no disponible' y la app sigue como siempre", async () => {
    const { runtime } = setup({ isAvailable: () => false });
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    expect(runtime.getState().availability).toBe("unavailable");
    expect(runtime.canReadLocal(WS)).toBe(false);
    expect(await runtime.createMovement(WS, expense("x", 1))).toBeNull();
  });

  it("encendido: descarga el espacio y solo entonces lee de local", async () => {
    const { runtime } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    expect(runtime.getState()).toMatchObject({ availability: "ready", hydrated: true, workspaceId: WS, pending: 0 });
    expect(runtime.canReadLocal(WS)).toBe(true);
    expect(runtime.canReadLocal(2)).toBe(false); // otro espacio todavía sin copia local
  });

  it("registrar es instantáneo, queda pendiente y se envía solo", async () => {
    const { runtime, log, changes } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();

    const record = await runtime.createMovement(WS, expense("Café", 12));
    expect(record).toMatchObject({ description: "Café", sourceAmount: 12, status: "posted" });
    expect(runtime.getState().pending).toBe(1);
    expect(changes.flat()).toContain("movements");
    expect((await runtime.listMovements(WS, {}, 0, 30)).data.map((m) => m.description)).toEqual(["Café"]);

    await settle();
    expect(log.pushed.flat()).toHaveLength(1);
    expect(runtime.getState().pending).toBe(0);
  });

  it("sin red no envía por su cuenta, pero guarda; al volver la red sincroniza", async () => {
    const { runtime, log } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    runtime.setOnline(false);

    for (let i = 0; i < 5; i++) await runtime.createMovement(WS, expense(`Gasto ${i}`, i + 1));
    await settle();
    expect(runtime.getState().pending).toBe(5);
    expect(log.pushed).toHaveLength(0);

    runtime.setOnline(true);
    await settle();
    expect(runtime.getState().pending).toBe(0);
    expect(log.pushed.flat()).toHaveLength(5);
  });

  it("el botón manual intenta aunque se crea sin red y reporta el motivo", async () => {
    const { runtime, log } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    runtime.setOnline(false);
    await runtime.createMovement(WS, expense("A mano", 3));
    log.failPush = true;
    const report = await runtime.requestSync("manual");
    expect(report?.error).toContain("Network request failed");
    expect(runtime.getState().lastError).toContain("Network request failed");
    expect(runtime.getState().pending).toBe(1);
  });

  it("editar, anular y borrar pasan por la cola", async () => {
    const { runtime, log } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    runtime.setOnline(false);
    const created = (await runtime.createMovement(WS, expense("Original", 10)))!;
    await settle();
    runtime.setOnline(true);
    await settle();
    runtime.setOnline(false);

    expect(await runtime.updateMovement(WS, created.id, { description: "Editado", sourceAmount: 11 })).toBe(true);
    expect((await runtime.getMovement(created.id))?.description).toBe("Editado");
    expect(await runtime.voidMovement(WS, created.id)).toBe(true);
    expect((await runtime.getMovement(created.id))?.status).toBe("voided");
    expect(runtime.getState().pending).toBe(1); // las dos ediciones viajan fusionadas

    expect(await runtime.deleteMovement(WS, created.id)).toBe(true);
    expect(await runtime.getMovement(created.id)).toBeNull();
    runtime.setOnline(true);
    await settle();
    const kinds = log.pushed.flat().map((op) => op.kind);
    expect(kinds).toEqual(["insert", "delete"]);
  });

  it("nudge: tras una escritura por otra vía la base local se pone al día sin esperar el latido", async () => {
    const { runtime, log } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    const before = log.pulls;
    runtime.nudge();
    runtime.nudge(); // varias seguidas se juntan en un solo ciclo
    await settle();
    expect(log.pulls).toBe(before + 1);
  });

  it("nudge no hace nada con el modo apagado", async () => {
    const { runtime, log } = setup();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
    runtime.nudge();
    await settle();
    expect(log.pulls).toBe(0);
  });

  it("editar algo que no está en local devuelve false para caer al camino online", async () => {
    const { runtime } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    expect(await runtime.updateMovement(WS, 424242, { description: "x" })).toBe(false);
    expect(await runtime.deleteMovement(WS, 424242)).toBe(false);
  });

  it("cerrar sesión borra la base solo si no queda nada sin enviar", async () => {
    const clean = setup();
    await clean.runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    expect(await clean.runtime.signOutCleanup()).toEqual({ wiped: true, pending: 0 });
    expect(clean.deleted).toEqual(["u1"]);

    const dirty = setup();
    await dirty.runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    dirty.runtime.setOnline(false);
    await dirty.runtime.createMovement(WS, expense("Sin enviar", 7));
    dirty.log.failPush = true;
    const result = await dirty.runtime.signOutCleanup();
    expect(result).toEqual({ wiped: false, pending: 1 });
    expect(dirty.deleted).toEqual([]);
  });

  it("cambiar de usuario cierra la base anterior y abre la del nuevo", async () => {
    const { runtime, drivers } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    await runtime.createMovement(WS, expense("De u1", 5));
    await runtime.configure({ enabled: true, userId: "u2", workspaceId: WS });
    await settle();
    expect(Object.keys(drivers).sort()).toEqual(["u1", "u2"]);
    expect((await runtime.listMovements(WS, {}, 0, 30)).data).toHaveLength(0); // no se ven datos de u1
  });

  it("varios espacios: descarga los demás en segundo plano y al cambiar de espacio ya está lista la copia", async () => {
    const { runtime, log } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: 1, workspaceIds: [1, 2] });
    await settle();
    expect(new Set(log.pulledWs)).toEqual(new Set([1, 2]));
    expect(runtime.canReadLocal(2)).toBe(false); // todavía no es el espacio abierto
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: 2, workspaceIds: [1, 2] });
    expect(runtime.getState()).toMatchObject({ workspaceId: 2, hydrated: true });
    expect(runtime.canReadLocal(2)).toBe(true); // sin esperar a ninguna descarga
  });

  it("al abrir la app solo se sincroniza el espacio abierto; los demás esperan para no estorbar a la carga inicial", async () => {
    const { runtime, log } = setup({ otherWorkspacesDelayMs: 150 });
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: 1, workspaceIds: [1, 2, 3] });
    await settle();
    expect(new Set(log.pulledWs)).toEqual(new Set([1])); // todavía nada de los otros espacios
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(new Set(log.pulledWs)).toEqual(new Set([1, 2, 3])); // pasado el retardo, se ponen al día
  });

  it("si se cierra el motor antes del retardo, no sincroniza los demás espacios", async () => {
    const { runtime, log } = setup({ otherWorkspacesDelayMs: 150 });
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: 1, workspaceIds: [1, 2] });
    await settle();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: 1 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(new Set(log.pulledWs)).toEqual(new Set([1]));
  });

  it("un cambio guardado en el espacio A se envía aunque el usuario ya esté en el B", async () => {
    const { runtime, log } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: 1, workspaceIds: [1, 2] });
    await settle();
    runtime.setOnline(false);
    await runtime.createMovement(1, expense("En el espacio uno", 9));
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: 2, workspaceIds: [1, 2] });
    expect(runtime.getState().pending).toBe(1); // cuenta lo pendiente de todos los espacios
    runtime.setOnline(true);
    await settle();
    expect(runtime.getState().pending).toBe(0);
    expect(log.pushed.flat().map((op) => op.workspace_id)).toEqual([1]);
  });

  it("un espacio que falla no tumba el ciclo del espacio abierto, pero deja el motivo", async () => {
    const { runtime } = setup({
      transport: {
        ...fakeTransport({ pushed: [], failPush: false, pulls: 0 }),
        async pullChanges(ws, cursors, tables) {
          if (ws === 2) throw new Error("not a workspace member");
          return fakeTransport({ pushed: [], failPush: false, pulls: 0 }).pullChanges(ws, cursors, tables, 1000);
        },
      },
    });
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: 1, workspaceIds: [1, 2] });
    await settle();
    expect(runtime.getState()).toMatchObject({ hydrated: true });
    expect(runtime.getState().lastError).toContain("not a workspace member");
  });

  it("lo que borró el servidor se revisa al volver la red, al volver a la app y con el botón; un guardado normal no lo paga", async () => {
    const { runtime, log } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    const afterStart = log.liveIdsCalls;
    await runtime.requestSync("write");
    await runtime.requestSync("interval");
    expect(log.liveIdsCalls).toBe(afterStart); // dentro de la ventana de 5 minutos: no se pide
    await runtime.requestSync("foreground");
    expect(log.liveIdsCalls).toBe(afterStart + 1);
    await runtime.requestSync("manual");
    expect(log.liveIdsCalls).toBe(afterStart + 2);
    runtime.setOnline(false);
    runtime.setOnline(true); // "network"
    await settle();
    expect(log.liveIdsCalls).toBe(afterStart + 3);
  });

  it("apagar el interruptor suelta la base y vuelve a 'desactivado'", async () => {
    const { runtime } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
    expect(runtime.getState().availability).toBe("disabled");
    expect(runtime.canReadLocal(WS)).toBe(false);
  });
});
