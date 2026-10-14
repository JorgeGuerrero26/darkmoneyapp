const { act, create } = require("react-test-renderer");
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
import { fetchUncategorized, useAssignCategoryToMovementsMutation } from "../uncategorized-movements";
const WS = 1;

function fakeTransport(): SyncTransport {
  let nextId = 9500;
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

describe("Categorizar movimientos sin internet", () => {
  it("lee los sin categoría de la copia local y, al asignarles una, quedan guardados en el teléfono sin tocar el servidor", async () => {
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

    const account = await localCreate(WS, "accounts", { workspace_id: WS, name: "Cuenta Principal", type: "bank", currency_code: "PEN", opening_balance: 50, include_in_net_worth: true, color: "#fff", icon: "wallet", sort_order: 0, is_archived: false });
    const category = await localCreate(WS, "categories", { workspace_id: WS, name: "Comida", kind: "expense", is_active: true, is_system: false, sort_order: 10 });
    const expense = (description: string, key: string) =>
      runtime.createMovement(WS, {
        movementType: "expense", status: "posted", occurredAt: "2026-10-14T17:54:00.000Z", description, sourceAccountId: account!.id,
        sourceAmount: 3, destinationAccountId: null, destinationAmount: null, dedupeKey: key,
      });
    const first = await expense("Menú", "k-un-1");
    const second = await expense("Café", "k-un-2");

    expect((await fetchUncategorized(WS)).map((row) => row.id).sort()).toEqual([first!.id, second!.id].sort());

    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    let mutation: ReturnType<typeof useAssignCategoryToMovementsMutation> | null = null;
    function Probe() {
      mutation = useAssignCategoryToMovementsMutation(WS);
      return null;
    }
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>); });
    await act(async () => { await mutation!.mutateAsync({ ids: [first!.id, second!.id], categoryId: category!.id }); });
    act(() => tree.unmount());

    expect(mockServerCalls).toEqual([]);
    expect(await fetchUncategorized(WS)).toEqual([]);
    const rows = (await runtime.listRows(WS, "movements"))!;
    expect(rows.filter((row) => row.category_id === category!.id)).toHaveLength(2);
    // Cada movimiento sigue siendo UNA sola operación pendiente (alta + edición se fusionan).
    expect(runtime.getState().pending).toBe(4); // cuenta + categoría + 2 movimientos
  });
});
