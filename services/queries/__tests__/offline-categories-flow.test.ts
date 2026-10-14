import { OfflineRuntime } from "../../../lib/offline/runtime";
import type { PushOp, PushResult, SyncTransport } from "../../../lib/offline/sync-types";
import { createTestDriver } from "../../../lib/offline/__tests__/helpers/node-sqlite-driver";

const state: { runtime: OfflineRuntime | null } = { runtime: null };
const mockServerCalls: string[] = [];

// Un servidor sin red: cualquier consulta que llegue hasta aquí es un error del test.
jest.mock("../../../lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      mockServerCalls.push(table);
      throw new Error("Network request failed");
    },
  },
}));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })) },
}));
jest.mock("../../../lib/offline/instance", () => ({
  get offlineRuntime() {
    return state.runtime;
  },
}));

// eslint-disable-next-line import/first
import { localCreate } from "../offline-writes";
// eslint-disable-next-line import/first
import { fetchCategoriesOverview } from "../workspace-data";

const WS = 1;

function fakeTransport(): SyncTransport {
  let nextId = 9000;
  return {
    async reserveIds(_ws, _table, count) {
      return Array.from({ length: count }, () => nextId++);
    },
    async pullChanges(_ws, cursors, tables) {
      return {
        server_time: "2026-10-14T17:00:00.000Z",
        tables: Object.fromEntries(tables.map((table) => [table, { rows: [], has_more: false, next: { since: cursors[table]?.since ?? null, after_id: 0 } }])),
      };
    },
    async liveIds() {
      return {};
    },
    async pushBatch(ops: PushOp[]) {
      return ops.map<PushResult>((op) => ({ op_id: op.op_id, status: "applied", table: op.table, row_id: op.row_id }));
    },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("pantalla de Categorías sin internet", () => {
  it("se arma solo con la copia del teléfono: no pide nada al servidor y cuenta lo recién guardado", async () => {
    mockServerCalls.length = 0;
    const drivers: Record<string, ReturnType<typeof createTestDriver>> = {};
    const runtime = new OfflineRuntime({
      isAvailable: () => true,
      openDriver: async (userId) => (drivers[userId] ??= createTestDriver()),
      deleteDatabase: async () => undefined,
      transport: fakeTransport(),
      writeDebounceMs: 0,
    });
    state.runtime = runtime;
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    runtime.setOnline(false);

    const account = await localCreate(WS, "accounts", { workspace_id: WS, name: "Cuenta Principal", type: "bank", currency_code: "PEN", opening_balance: 10, include_in_net_worth: true, color: "#fff", icon: "wallet", sort_order: 0, is_archived: false });
    const comida = await localCreate(WS, "categories", { workspace_id: WS, name: "Comida", kind: "expense", is_active: true, is_system: false, sort_order: 10 });
    await localCreate(WS, "categories", { workspace_id: WS, name: "Prueba borrar", kind: "expense", is_active: true, is_system: false, sort_order: 20 });
    await runtime.createMovement(WS, {
      movementType: "expense", status: "posted", occurredAt: "2026-10-14T17:54:00.000Z", description: "Almuerzo",
      sourceAccountId: account!.id, sourceAmount: 12, destinationAccountId: null, destinationAmount: null, categoryId: comida!.id, dedupeKey: "k-cat-flow",
    });

    const overview = await fetchCategoriesOverview(WS);

    expect(mockServerCalls).toEqual([]);
    expect(overview.map((category) => category.name)).toEqual(["Comida", "Prueba borrar"]);
    expect(overview.find((category) => category.name === "Comida")).toMatchObject({ movementCount: 1, subscriptionCount: 0 });
    expect(overview.find((category) => category.name === "Prueba borrar")).toMatchObject({ movementCount: 0, subscriptionCount: 0 });
  });
});

// eslint-disable-next-line import/first
import { QueryClient } from "@tanstack/react-query";
// eslint-disable-next-line import/first
import { reactToLocalDataChange } from "../../../hooks/useOfflineBridge";
// eslint-disable-next-line import/first
import { categoryCanDelete } from "../../../features/categories/lib/categoryFilters";

describe("el resumen de Categorías se pone al día al registrar un gasto sin internet", () => {
  it("'Prueba borrar' deja de poder eliminarse apenas tiene un gasto, y vuelve a poder al borrarlo", async () => {
    const drivers: Record<string, ReturnType<typeof createTestDriver>> = {};
    const runtime = new OfflineRuntime({
      isAvailable: () => true,
      openDriver: async (userId) => (drivers[userId] ??= createTestDriver()),
      deleteDatabase: async () => undefined,
      transport: fakeTransport(),
      writeDebounceMs: 0,
    });
    state.runtime = runtime;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    // Igual que el puente de la app: lo que cambia en la base local avisa a las consultas.
    runtime.setHooks({ onDataChanged: (tables) => reactToLocalDataChange(queryClient, WS, tables) });
    await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
    await settle();
    runtime.setOnline(false);

    const key = ["categories-overview", WS, "u1"];
    // staleTime largo, como STALE.medium: sin aviso, la pantalla se quedaría con el primer resultado.
    const read = () => queryClient.fetchQuery({ queryKey: key, queryFn: () => fetchCategoriesOverview(WS), staleTime: 10 * 60_000 });
    const refresh = async () => {
      await settle();
      return queryClient.fetchQuery({ queryKey: key, queryFn: () => fetchCategoriesOverview(WS), staleTime: 10 * 60_000 });
    };
    const find = (list: Awaited<ReturnType<typeof read>>) => list.find((category) => category.name === "Prueba borrar")!;

    const account = await localCreate(WS, "accounts", { workspace_id: WS, name: "Cuenta Principal", type: "bank", currency_code: "PEN", opening_balance: 10, include_in_net_worth: true, color: "#fff", icon: "wallet", sort_order: 0, is_archived: false });
    const category = await localCreate(WS, "categories", { workspace_id: WS, name: "Prueba borrar", kind: "expense", is_active: true, is_system: false, sort_order: 10 });
    let list = await refresh();
    expect(find(list)).toMatchObject({ movementCount: 0 });
    expect(categoryCanDelete(find(list), list)).toBe(true);

    const movement = await runtime.createMovement(WS, {
      movementType: "expense", status: "posted", occurredAt: "2026-10-14T17:54:00.000Z", description: "Gasto de prueba",
      sourceAccountId: account!.id, sourceAmount: 1, destinationAccountId: null, destinationAmount: null, categoryId: category!.id, dedupeKey: "k-del-1",
    });
    list = await refresh();
    expect(find(list)).toMatchObject({ movementCount: 1 });
    expect(categoryCanDelete(find(list), list)).toBe(false);

    await runtime.deleteMovement(WS, movement!.id);
    list = await refresh();
    expect(find(list)).toMatchObject({ movementCount: 0 });
    expect(categoryCanDelete(find(list), list)).toBe(true);
  });
});
