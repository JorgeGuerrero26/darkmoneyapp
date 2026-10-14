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
import { useDeleteObligationMutation } from "../obligations-impl";
// eslint-disable-next-line import/first
import { withLocalObligations } from "../offline-obligations";
// eslint-disable-next-line import/first
import { buildOfflineObligationSummary } from "../../../features/obligations/lib/offlineObligations";

const WS = 1;

function fakeTransport(): SyncTransport {
  let nextId = 9800;
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

async function boot() {
  mockServerCalls.length = 0;
  const drivers: Record<string, ReturnType<typeof createTestDriver>> = {};
  const runtime = new OfflineRuntime({
    isAvailable: () => true,
    openDriver: async (userId) => (drivers[userId] ??= createTestDriver()),
    deleteDatabase: async () => undefined,
    transport: fakeTransport(),
    writeDebounceMs: 0,
    otherWorkspacesDelayMs: 0,
  });
  state.runtime = runtime;
  await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
  await settle();
  return runtime;
}

const obligationFields = (counterpartyId: number) => ({
  workspace_id: WS, title: "Prueba deuda", direction: "receivable", origin_type: "manual", status: "active", counterparty_id: counterpartyId,
  currency_code: "PEN", principal_amount: 1, start_date: "2026-10-14",
});

async function runDelete(id: number) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let mutation: ReturnType<typeof useDeleteObligationMutation> | null = null;
  function Probe() {
    mutation = useDeleteObligationMutation(WS);
    return null;
  }
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>); });
  let error: Error | null = null;
  await act(async () => {
    try {
      await mutation!.mutateAsync(id);
    } catch (e) {
      error = e as Error;
    }
  });
  act(() => tree.unmount());
  return error as Error | null;
}

describe("eliminar una obligación sin internet", () => {
  it("una creada en el teléfono y aún sin enviar se borra ahí mismo, sin servidor y sin dejar nada en cola de espera", async () => {
    const runtime = await boot();
    runtime.setOnline(false);
    const counterparty = await localCreate(WS, "counterparties", { workspace_id: WS, name: "Juan", type: "person", is_archived: false });
    const created = await localCreate(WS, "obligations", obligationFields(counterparty!.id));
    expect(await runtime.hasPendingInsert(WS, "obligations", created!.id)).toBe(true);

    const cached = buildOfflineObligationSummary({ ...obligationFields(counterparty!.id), id: created!.id }, new Map([[counterparty!.id, "Juan"]]));
    expect(await withLocalObligations(WS, [cached], new Map())).toHaveLength(1);

    expect(await runDelete(created!.id)).toBeNull();

    expect(mockServerCalls).toEqual([]);
    expect(await runtime.listRows(WS, "obligations")).toEqual([]);
    // La lista que muestra la pantalla ya no la trae, aunque el cache la tuviera como nueva.
    expect(await withLocalObligations(WS, [cached], new Map())).toEqual([]);
  });

  it("una que ya está en el servidor exige internet: avisa con claridad y no borra ni encola nada", async () => {
    const runtime = await boot();
    const counterparty = await localCreate(WS, "counterparties", { workspace_id: WS, name: "Juan", type: "person", is_archived: false });
    const created = await localCreate(WS, "obligations", obligationFields(counterparty!.id));
    await runtime.requestSync("manual"); // ya llegó al servidor
    expect(await runtime.hasPendingInsert(WS, "obligations", created!.id)).toBe(false);
    runtime.setOnline(false);

    const error = await runDelete(created!.id);

    expect(error?.message).toContain("Necesitas internet para eliminar esta obligación");
    expect(mockServerCalls).toEqual([]);
    expect((await runtime.listRows(WS, "obligations"))!.map((row) => row.id)).toEqual([created!.id]);
    expect(runtime.getState().pending).toBe(0);
  });
});
