import { OfflineRuntime, type RuntimeDeps } from "../runtime";
import { describeSyncLine } from "../status-copy";
import type { PushOp, PushResult, SyncTransport } from "../sync-types";
import type { SqlDriver } from "../sql-driver";
import { createTestDriver } from "./helpers/node-sqlite-driver";
import { upsertMovementRows, upsertMirrorRows } from "../movement-store";

const WS = 1;
const expense = (description: string, amount: number) => ({
  movementType: "expense" as const, status: "posted" as const, occurredAt: "2026-10-12T15:00:00.000Z", description,
  sourceAccountId: 1, sourceAmount: amount, destinationAccountId: null, destinationAmount: null, dedupeKey: `k-${description}`,
});

/** Cuántas llamadas ha recibido el servidor falso: `settle` espera a que dejen de llegar (no a un tiempo fijo). */
let transportActivity = 0;

/** Servidor falso mínimo: acepta todo y devuelve la fila como la dejaría el servidor real. */
function fakeTransport(log: { pushed: PushOp[][]; failPush: boolean; pulls: number; pulledWs?: number[]; liveIdsCalls?: number }): SyncTransport {
  let nextId = 1000;
  return {
    async reserveIds(_ws, _table, count) {
      transportActivity += 1;
      return Array.from({ length: count }, () => nextId++);
    },
    async pullChanges(ws, cursors, tables) {
      transportActivity += 1;
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
      transportActivity += 1;
      if (log.liveIdsCalls != null) log.liveIdsCalls += 1;
      return {};
    },
    async pushBatch(ops) {
      transportActivity += 1;
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

/**
 * Espera a que el motor termine lo que estaba haciendo: pasa un rato SIN llamadas nuevas al servidor falso (hasta 5 s).
 * Un tiempo fijo no servía: en un servidor de CI cargado el motor tardaba más y la prueba fallaba al azar.
 */
const settle = async () => {
  const limit = Date.now() + 5000;
  let seen: number;
  do {
    seen = transportActivity;
    await new Promise((resolve) => setTimeout(resolve, 80));
  } while (transportActivity !== seen && Date.now() < limit);
};
/** Espera a que algo ocurra (hasta 5 s) en vez de adivinar cuánto tarda: en un servidor de CI cargado un tiempo fijo no alcanza. */
const until = async (condition: () => boolean, timeoutMs = 5000) => {
  const limit = Date.now() + timeoutMs;
  while (!condition() && Date.now() < limit) await new Promise((resolve) => setTimeout(resolve, 10));
};

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

  it("guardar no espera a que la app rehaga sus pantallas (dejaba «Guardando…» hasta 5 s)", async () => {
    const { runtime } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    runtime.setOnline(false);
    let notified: string[] | null = null;
    // La app rehace saldos, historiales, presupuestos e inicio con este aviso: aquí no termina nunca.
    runtime.setHooks({ onDataChanged: (tables) => { notified = tables; return new Promise<void>(() => {}); } });
    const started = Date.now();
    const record = await runtime.createMovement(WS, expense("Taxi", 9));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(record).toMatchObject({ description: "Taxi", sourceAmount: 9 });
    expect(notified).toEqual(["movements"]); // el aviso sí sale, en el mismo instante
    expect(runtime.getState().pending).toBe(1);
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
  });

  it("la barra pasa de «Enviando 1 de 1» a nada, sin mostrar «1 por enviar» con todo ya enviado", async () => {
    const { runtime } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    runtime.setOnline(false);
    await runtime.createMovement(WS, expense("Barra", 3));
    const lines: Array<string | null> = [];
    const unsubscribe = runtime.subscribe(() => {
      const text = describeSyncLine(runtime.getState())?.text ?? null;
      if (lines[lines.length - 1] !== text) lines.push(text);
    });
    runtime.setOnline(true); // vuelve la red: se envía
    await settle();
    await until(() => runtime.getState().pending === 0 && !runtime.getState().syncing);
    unsubscribe();
    const sending = lines.indexOf("Enviando 1 de 1…");
    expect(sending).toBeGreaterThanOrEqual(0);
    expect(lines.slice(sending)).not.toContain("1 por enviar");
    expect(lines[lines.length - 1]).toBeNull();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
  });

  it("si el envío no llega (servidor lento), se reintenta SOLO a los pocos segundos, sin esperar otra acción", async () => {
    const { runtime, log } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    log.failPush = true; // el servidor no responde a tiempo
    await runtime.createMovement(WS, expense("Reintento", 4));
    await until(() => runtime.getState().lastError != null && !runtime.getState().syncing);
    expect(runtime.getState().pending).toBe(1);
    expect(describeSyncLine(runtime.getState())?.text).toBe("1 por enviar · reintentando");
    log.failPush = false; // el servidor se recupera; nadie toca nada
    await until(() => runtime.getState().pending === 0, 9000); // primer reintento a los 5 s
    expect(log.pushed.flat()).toHaveLength(1);
    expect(describeSyncLine(runtime.getState())).toBeNull();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
  }, 15000);

  it("las pantallas comparten una sola lectura de la tabla hasta que algo cambia", async () => {
    const { runtime, drivers } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    runtime.setOnline(false);
    await runtime.createMovement(WS, expense("Primero", 5));
    const reads = jest.spyOn(drivers.u1, "all");
    const fullScans = () => reads.mock.calls.filter(([sql]) => String(sql).includes("select data from movements where workspace_id = ? order by id")).length;

    // Lista, inicio, año, proyección, presupuestos e historiales piden lo mismo a la vez: una sola lectura.
    const results = await Promise.all(Array.from({ length: 6 }, () => runtime.listRows(WS, "movements")));
    expect(fullScans()).toBe(1);
    expect(results.every((rows) => rows?.length === 1)).toBe(true);

    // Cada una recibe su copia: cambiar una fila no altera lo que ve la siguiente.
    results[0]![0].description = "Alterado";
    expect((await runtime.listRows(WS, "movements"))?.[0].description).toBe("Primero");
    expect(fullScans()).toBe(1);

    // Un guardado la invalida: la siguiente lectura ya trae lo nuevo.
    await runtime.createMovement(WS, expense("Segundo", 6));
    expect((await runtime.listRows(WS, "movements"))?.map((row) => row.description).sort()).toEqual(["Primero", "Segundo"]);
    expect(fullScans()).toBe(2);
    reads.mockRestore();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
  });

  it("lo que llega del servidor también invalida la lectura compartida", async () => {
    const { runtime, drivers } = setup();
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    await runtime.createMovement(WS, expense("Antes de enviar", 7));
    await runtime.listRows(WS, "movements"); // queda compartida con la versión local
    await settle(); // se envía: el servidor confirma la fila
    const reads = jest.spyOn(drivers.u1, "all");
    await runtime.listRows(WS, "movements");
    expect(reads.mock.calls.some(([sql]) => String(sql).includes("select data from movements where workspace_id = ? order by id"))).toBe(true);
    reads.mockRestore();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
  });

  it("candidatos a duplicado desde la copia local: mismo tipo, cuenta y monto exacto, aunque aún no se haya enviado", async () => {
    const { runtime } = setup();
    expect(await runtime.postedMovementsWithAmount(WS, { movementType: "expense", side: "source", accountId: 1, amount: 181 })).toBeNull(); // sin copia: al servidor
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    runtime.setOnline(false);
    await runtime.createMovement(WS, expense("PATRONAL", 181));
    await runtime.createMovement(WS, expense("Otro monto", 18.1));
    const found = await runtime.postedMovementsWithAmount(WS, { movementType: "expense", side: "source", accountId: 1, amount: 181 });
    expect(found?.map((row) => row.description)).toEqual(["PATRONAL"]);
    expect(await runtime.postedMovementsWithAmount(WS, { movementType: "expense", side: "source", accountId: 2, amount: 181 })).toEqual([]);
    expect(await runtime.postedMovementsWithAmount(WS, { movementType: "income", side: "destination", accountId: 1, amount: 181 })).toEqual([]);
    expect(await runtime.postedMovementsWithAmount(WS, { movementType: "expense", side: "source", accountId: 1, amount: 1.005 })).toBeNull(); // fracción de centavo: servidor
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
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
    await until(() => log.pulledWs.includes(2));
    expect(new Set(log.pulledWs)).toEqual(new Set([1, 2]));
    expect(runtime.canReadLocal(2)).toBe(false); // todavía no es el espacio abierto
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: 2, workspaceIds: [1, 2] });
    expect(runtime.getState()).toMatchObject({ workspaceId: 2, hydrated: true });
    expect(runtime.canReadLocal(2)).toBe(true); // sin esperar a ninguna descarga
  });

  it("al abrir la app solo se sincroniza el espacio abierto; los demás esperan para no estorbar a la carga inicial", async () => {
    const { runtime, log } = setup({ otherWorkspacesDelayMs: 1500 });
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: 1, workspaceIds: [1, 2, 3] });
    await settle();
    expect(new Set(log.pulledWs)).toEqual(new Set([1])); // todavía nada de los otros espacios
    await until(() => log.pulledWs.includes(3));
    expect(new Set(log.pulledWs)).toEqual(new Set([1, 2, 3])); // pasado el retardo, se ponen al día
  });

  it("si se cierra el motor antes del retardo, no sincroniza los demás espacios", async () => {
    const { runtime, log } = setup({ otherWorkspacesDelayMs: 1500 });
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: 1, workspaceIds: [1, 2] });
    await settle();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: 1 });
    await new Promise((resolve) => setTimeout(resolve, 1800)); // más que el retardo: si el temporizador siguiera vivo, ya habría disparado
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

  it("una escritura por otra vía (p. ej. eliminar un cobro, que borra su movimiento en el servidor) hace revisar lo borrado, a lo más cada 20 s", async () => {
    let clock = Date.parse("2026-10-16T12:00:00.000Z");
    const { runtime, log } = setup({ now: () => clock });
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    const afterStart = log.liveIdsCalls;
    runtime.nudge();
    await settle();
    expect(log.liveIdsCalls).toBe(afterStart); // un nudge normal no revisa borrados
    runtime.nudge({ reconcile: true });
    await settle();
    expect(log.liveIdsCalls).toBe(afterStart + 1);
    runtime.nudge({ reconcile: true });
    await settle();
    expect(log.liveIdsCalls).toBe(afterStart + 1); // dentro de los 20 s no se repite
    clock += 21_000;
    runtime.nudge({ reconcile: true });
    await settle();
    expect(log.liveIdsCalls).toBe(afterStart + 2);
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
