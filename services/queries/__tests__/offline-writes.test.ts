import { OfflineRuntime } from "../../../lib/offline/runtime";
import type { PushOp, PushResult, SyncTransport } from "../../../lib/offline/sync-types";
import { createTestDriver } from "../../../lib/offline/__tests__/helpers/node-sqlite-driver";

const state: { runtime: OfflineRuntime | null } = { runtime: null };

jest.mock("../../../lib/offline/instance", () => ({
  get offlineRuntime() {
    return state.runtime;
  },
}));

// eslint-disable-next-line import/first
import { localCreate, localDelete, localMaxSortOrder, localReferences, localUpdate } from "../offline-writes";

const WS = 1;

function fakeTransport(pushed: PushOp[][]): SyncTransport {
  let nextId = 5000;
  return {
    async reserveIds(_ws, _table, count) {
      return Array.from({ length: count }, () => nextId++);
    },
    async pullChanges(_ws, cursors, tables) {
      return {
        server_time: "2026-10-13T15:00:00.000Z",
        tables: Object.fromEntries(
          tables.map((table) => [table, { rows: [], has_more: false, next: { since: cursors[table]?.since ?? null, after_id: 0 } }]),
        ),
      };
    },
    async liveIds() {
      return {};
    },
    async pushBatch(ops) {
      pushed.push(ops);
      return ops.map<PushResult>((op) => ({
        op_id: op.op_id,
        status: "applied",
        table: op.table,
        row_id: op.row_id,
        row: op.kind === "delete" ? undefined : ({ ...op.fields, id: op.row_id, workspace_id: op.workspace_id, updated_at: "2026-10-13T15:00:01.000Z" } as never),
      }));
    },
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

async function boot(enabled = true) {
  const pushed: PushOp[][] = [];
  const drivers: Record<string, ReturnType<typeof createTestDriver>> = {};
  const runtime = new OfflineRuntime({
    isAvailable: () => true,
    openDriver: async (userId) => (drivers[userId] ??= createTestDriver()),
    deleteDatabase: async () => undefined,
    transport: fakeTransport(pushed),
    writeDebounceMs: 0,
  });
  state.runtime = runtime;
  await runtime.configure({ enabled, userId: "u1", workspaceId: WS });
  await settle();
  runtime.setOnline(false);
  return { runtime, pushed, db: drivers.u1 };
}

describe("escrituras de catálogos por la base local", () => {
  it("modo apagado: no hace nada y el hook sigue su camino online", async () => {
    await boot(false);
    expect(await localCreate(WS, "categories", { name: "x" })).toBeNull();
    expect(await localUpdate(WS, "categories", 1, { name: "y" })).toBe(false);
    expect(await localDelete(WS, "categories", 1)).toBe(false);
    expect(await localMaxSortOrder(WS, "categories")).toBeNull();
  });

  it("crea sin red con ID reservado, queda en la cola y se ve en la lectura local", async () => {
    const { runtime } = await boot();
    const created = await localCreate(WS, "categories", { workspace_id: WS, name: "Comida", kind: "expense", sort_order: 10, is_active: true });
    expect(created).toEqual({ id: expect.any(Number) });
    expect(created!.id).toBeGreaterThanOrEqual(5000);
    expect((await runtime.listRows(WS, "categories"))?.map((row) => row.name)).toEqual(["Comida"]);
    expect(runtime.getState().pending).toBe(1);
  });

  it("numera la siguiente categoría desde el mayor sort_order local", async () => {
    await boot();
    await localCreate(WS, "categories", { name: "A", kind: "expense", sort_order: 30 });
    await localCreate(WS, "categories", { name: "B", kind: "expense", sort_order: 10 });
    expect(await localMaxSortOrder(WS, "categories")).toBe(30);
  });

  it("editar descarta los campos sin definir y fusiona con la creación pendiente en una sola operación", async () => {
    const { runtime } = await boot();
    const created = await localCreate(WS, "categories", { name: "Viejo", kind: "expense", sort_order: 10 });
    expect(await localUpdate(WS, "categories", created!.id, { name: "Nuevo", color: undefined })).toBe(true);
    const rows = (await runtime.listRows(WS, "categories"))!;
    expect(rows[0]).toMatchObject({ name: "Nuevo", kind: "expense" });
    expect(runtime.getState().pending).toBe(1);
  });

  it("cuenta referencias para repetir las comprobaciones previas al borrado", async () => {
    const { runtime } = await boot();
    const category = await localCreate(WS, "categories", { name: "Comida", kind: "expense", sort_order: 10 });
    await localCreate(WS, "categories", { name: "Hija", kind: "expense", parent_id: category!.id, sort_order: 20 });
    expect(await localReferences(WS, "categories", "parent_id", category!.id)).toBe(1);
    expect(await localReferences(WS, "movements", "category_id", category!.id)).toBe(0);
    await runtime.createMovement(WS, {
      movementType: "expense", status: "posted", occurredAt: "2026-10-13T12:00:00.000Z", description: "Café",
      sourceAccountId: 1, sourceAmount: 5, destinationAccountId: null, destinationAmount: null, categoryId: category!.id,
      dedupeKey: "k1",
    });
    expect(await localReferences(WS, "movements", "category_id", category!.id)).toBe(1);
  });

  it("crear y borrar sin red: desaparece al instante y, al sincronizar, la cola queda vacía", async () => {
    const { runtime } = await boot();
    const created = await localCreate(WS, "categories", { name: "Efímera", kind: "expense", sort_order: 10 });
    expect(await localDelete(WS, "categories", created!.id)).toBe(true);
    // El alta se conserva junto al borrado a propósito (los hijos que la referencian necesitan al padre).
    expect(await runtime.listRows(WS, "categories")).toEqual([]);
    runtime.setOnline(true);
    await settle();
    expect(runtime.getState().pending).toBe(0);
  });

  it("un monto con fracción de centavo no falla: devuelve null para seguir el camino online", async () => {
    await boot();
    expect(await localCreate(WS, "accounts", { name: "Caja", type: "cash", currency_code: "PEN", opening_balance: 10.005 })).toBeNull();
  });

  it("al volver la red envía lo creado una sola vez", async () => {
    const { runtime, pushed } = await boot();
    await localCreate(WS, "counterparties", { workspace_id: WS, name: "Ana", type: "person", is_archived: false });
    runtime.setOnline(true);
    await settle();
    expect(pushed.flat().filter((op) => op.table === "counterparties")).toHaveLength(1);
    expect(runtime.getState().pending).toBe(0);
  });
});
