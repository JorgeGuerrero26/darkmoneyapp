const { act, create } = require("react-test-renderer");
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OfflineRuntime } from "../../../lib/offline/runtime";
import type { PushOp, PushResult, SyncTransport } from "../../../lib/offline/sync-types";
import { createTestDriver } from "../../../lib/offline/__tests__/helpers/node-sqlite-driver";

const state: { runtime: OfflineRuntime | null } = { runtime: null };
const mockServerCalls: string[] = [];

// Sin red: cualquier consulta al servidor es un error del test.
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
import { useCreateObligationPaymentMutation } from "../obligations-impl";
// eslint-disable-next-line import/first
import { useUiStore } from "../../../store/ui-store";

const WS = 1;

function fakeTransport(): SyncTransport {
  let nextId = 9800;
  return {
    async reserveIds(_ws, _table, count) {
      return Array.from({ length: count }, () => nextId++);
    },
    async pullChanges(_ws, cursors, tables) {
      return {
        server_time: "2026-10-31T17:00:00.000Z",
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
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function boot() {
  mockServerCalls.length = 0;
  const runtime = new OfflineRuntime({
    isAvailable: () => true,
    openDriver: async () => createTestDriver(),
    deleteDatabase: async () => undefined,
    transport: fakeTransport(),
    writeDebounceMs: 0,
    otherWorkspacesDelayMs: 0,
  });
  state.runtime = runtime;
  await runtime.configure({ enabled: true, userId: "u1", workspaceId: WS });
  await wait(30);
  return runtime;
}

describe("cobrar una deuda con el modo sin conexión", () => {
  it("se guarda en el teléfono sin el aviso «Actualizando pago» y sin sumar el cobro dos veces al saldo", async () => {
    const runtime = await boot();
    runtime.setOnline(false);
    const account = await localCreate(WS, "accounts", {
      workspace_id: WS, name: "Cuenta Sueldo", type: "bank", currency_code: "PEN", opening_balance: 100, is_archived: false,
    });
    const counterparty = await localCreate(WS, "counterparties", { workspace_id: WS, name: "Kevin", type: "person", is_archived: false });
    const obligation = await localCreate(WS, "obligations", {
      workspace_id: WS, title: "Préstamo a Kevin", direction: "receivable", origin_type: "manual", status: "active",
      counterparty_id: counterparty!.id, currency_code: "PEN", principal_amount: 50, start_date: "2026-10-01",
    });

    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    // El motor ya dejó en el cache el saldo exacto con el cobro incluido (100 + 20).
    queryClient.setQueryData(["workspace-snapshot", WS, "core"], {
      workspaces: [{ id: WS, baseCurrencyCode: "PEN" }],
      accounts: [{ id: account!.id, currencyCode: "PEN", currentBalance: 120, currentBalanceInBaseCurrency: 120 }],
      exchangeRates: [],
      categoryPostedMovements: [],
      subscriptionPostedMovements: [],
    });
    const showNotice = jest.spyOn(useUiStore.getState(), "showActivityNotice");

    let mutation: ReturnType<typeof useCreateObligationPaymentMutation> | null = null;
    function Probe() {
      mutation = useCreateObligationPaymentMutation(WS);
      return null;
    }
    let tree: ReturnType<typeof create>;
    act(() => { tree = create(<QueryClientProvider client={queryClient}><Probe /></QueryClientProvider>); });
    await act(async () => {
      await mutation!.mutateAsync({
        obligationId: obligation!.id, amount: 20, paymentDate: "2026-10-31", accountId: account!.id, createMovement: true, direction: "receivable",
      });
      // El aviso aparecía a los 220 ms si la actualización seguía en curso.
      await wait(300);
    });
    act(() => tree.unmount());

    expect(mockServerCalls).toEqual([]);
    expect(showNotice).not.toHaveBeenCalled();
    const core = queryClient.getQueryData<{ accounts: Array<{ currentBalance: number }> }>(["workspace-snapshot", WS, "core"]);
    expect(core?.accounts[0].currentBalance).toBe(120);
    expect(await runtime.pendingRowIds(WS, "obligation_events")).toHaveLength(1);
    showNotice.mockRestore();
    await runtime.configure({ enabled: false, userId: "u1", workspaceId: WS });
    queryClient.clear();
  });
});
