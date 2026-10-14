import { QueryClient } from "@tanstack/react-query";

const mockRows: Record<string, Record<string, unknown>[] | null> = {};
let mockBalances: Array<{ accountId: number; currentBalance: number }> | null = [];

jest.mock("../../../lib/supabase", () => ({ supabase: null }));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })) },
}));

jest.mock("../../../lib/offline/instance", () => ({
  offlineRuntime: {
    listRows: async (_ws: number, table: string) => mockRows[table] ?? null,
    accountBalances: async () => mockBalances,
  },
}));

// eslint-disable-next-line import/first
import { applyLocalCatalogsToCache, touchesSnapshotCatalogs } from "../offline-snapshot";

const KEY = ["workspace-snapshot", 1, "core"];

function seed() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(KEY, {
    workspaces: [{ id: 1, baseCurrencyCode: "PEN" }],
    accounts: [], categories: [], subscriptions: [], recurringIncome: [], exchangeRates: [],
    categoryPostedMovements: [], subscriptionPostedMovements: [],
    counterparties: [{
      id: 5, name: "Ana", type: "person", isArchived: false, isPinned: false, workspaceId: 1, phone: null, email: null,
      documentNumber: null, notes: null, roles: ["customer"], receivableCount: 3, receivablePendingTotal: 120, movementCount: 9,
    }],
  });
  return queryClient;
}

const get = (queryClient: QueryClient) => queryClient.getQueryData(KEY) as Record<string, any[]>;

describe("applyLocalCatalogsToCache", () => {
  beforeEach(() => {
    for (const key of Object.keys(mockRows)) delete mockRows[key];
    Object.assign(mockRows, {
      accounts: [{ id: 1, workspace_id: 1, name: "Efectivo", type: "cash", currency_code: "PEN", opening_balance: 10, include_in_net_worth: true, sort_order: 0, is_archived: false }],
      categories: [{ id: 2, workspace_id: 1, name: "Comida", kind: "expense", parent_id: null, is_active: true, sort_order: 0 }],
      counterparties: [{ id: 5, workspace_id: 1, name: "Ana María", type: "person", is_archived: false, is_pinned: true, phone: "999" }],
      subscriptions: [], recurring_income: [],
    });
    mockBalances = [{ accountId: 1, currentBalance: 48.8 }];
  });

  it("rehace cuentas y categorías desde la copia local, con el saldo local", async () => {
    const queryClient = seed();
    expect(await applyLocalCatalogsToCache(queryClient, 1)).toBe(true);
    const snapshot = get(queryClient);
    expect(snapshot.accounts).toHaveLength(1);
    expect(snapshot.accounts[0]).toMatchObject({ id: 1, name: "Efectivo", currentBalance: 48.8 });
    expect(snapshot.categories.map((c) => c.name)).toEqual(["Comida"]);
  });

  it("conserva el resumen financiero del contacto que solo calcula el servidor", async () => {
    const queryClient = seed();
    await applyLocalCatalogsToCache(queryClient, 1);
    expect(get(queryClient).counterparties[0]).toMatchObject({
      id: 5, name: "Ana María", isPinned: true, phone: "999",
      roles: ["customer"], receivableCount: 3, receivablePendingTotal: 120, movementCount: 9,
    });
  });

  it("un contacto nuevo local entra con totales en cero", async () => {
    const queryClient = seed();
    (mockRows.counterparties as Record<string, unknown>[]).push({ id: 99, workspace_id: 1, name: "Nuevo", type: "company", is_archived: false });
    await applyLocalCatalogsToCache(queryClient, 1);
    const created = get(queryClient).counterparties.find((c) => c.id === 99);
    expect(created).toMatchObject({ name: "Nuevo", receivableCount: 0, movementCount: 0 });
  });

  it("si alguna tabla aún no se descargó no toca el cache", async () => {
    const queryClient = seed();
    mockRows.categories = null;
    expect(await applyLocalCatalogsToCache(queryClient, 1)).toBe(false);
    expect(get(queryClient).accounts).toEqual([]);
  });

  it("sin snapshot cacheado no hace nada", async () => {
    expect(await applyLocalCatalogsToCache(new QueryClient(), 1)).toBe(false);
  });

  it("solo reacciona a tablas del snapshot", () => {
    expect(touchesSnapshotCatalogs(["categories"])).toBe(true);
    expect(touchesSnapshotCatalogs(["movements"])).toBe(false);
    expect(touchesSnapshotCatalogs(["budgets", "spend_types"])).toBe(false);
  });
});
