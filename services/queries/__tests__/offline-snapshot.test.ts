import { QueryClient } from "@tanstack/react-query";

const mockRows: Record<string, Record<string, unknown>[] | null> = {};
let mockPending = true;
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
    hasPendingOps: async () => mockPending,
  },
}));

// eslint-disable-next-line import/first
import { applyLocalBudgetsToCache, applyLocalCatalogsToCache, applyLocalMovementHistoriesToCache, touchesSnapshotCatalogs } from "../offline-snapshot";

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
    mockPending = true;
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

  describe("presupuestos", () => {
    const seedBudgets = () => {
      Object.assign(mockRows, {
        budgets: [{
          id: 10, workspace_id: 1, name: "Comida mensual", period_start: "2026-10-01", period_end: "2026-10-31", currency_code: "PEN",
          category_id: 2, account_id: null, spend_type_id: null, limit_amount: 100, alert_percent: 80, rollover_enabled: false,
          recurrence: "none", notes: null, is_active: true, is_pinned: false, created_by_user_id: "u1", updated_by_user_id: "u1",
          created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
        }],
        movements: [{
          id: 77, workspace_id: 1, status: "posted", movement_type: "expense", occurred_at: "2026-10-13T12:00:00.000Z",
          source_amount: 30, destination_amount: null, source_account_id: 1, category_id: 2, spend_type_id: null,
        }],
        spend_types: [],
      });
    };

    const deferredKey = ["workspace-snapshot", 1, "u1", "deferred"];
    const seedDeferred = (queryClient: QueryClient) => queryClient.setQueryData(deferredKey, { budgets: [], obligations: [] });

    it("un gasto sin enviar se refleja en el avance del presupuesto", async () => {
      seedBudgets();
      const queryClient = seed();
      seedDeferred(queryClient);
      expect(await applyLocalBudgetsToCache(queryClient, 1)).toBe(true);
      const budgets = (queryClient.getQueryData(deferredKey) as { budgets: Array<Record<string, unknown>> }).budgets;
      expect(budgets).toHaveLength(1);
      expect(budgets[0]).toMatchObject({ id: 10, spentAmount: 30, remainingAmount: 70, movementCount: 1, scopeKind: "category" });
    });

    it("sin cambios pendientes no toca nada: el servidor ya es exacto", async () => {
      seedBudgets();
      mockPending = false;
      const queryClient = seed();
      seedDeferred(queryClient);
      expect(await applyLocalBudgetsToCache(queryClient, 1)).toBe(false);
    });

    it("si falta una tabla por descargar conserva lo del servidor", async () => {
      seedBudgets();
      mockRows.movements = null;
      const queryClient = seed();
      seedDeferred(queryClient);
      expect(await applyLocalBudgetsToCache(queryClient, 1)).toBe(false);
    });
  });

  describe("historiales por categoría, suscripción y contacto", () => {
    const move = (extra: Record<string, unknown>) => ({
      id: 1, workspace_id: 1, status: "posted", movement_type: "expense", occurred_at: "2026-10-14T17:54:00.000Z", source_amount: "12",
      destination_amount: null, source_account_id: 1, destination_account_id: null, category_id: 2, subscription_id: null, counterparty_id: null, ...extra,
    });
    const seedWithStale = () => {
      const queryClient = seed();
      queryClient.setQueryData(KEY, {
        ...(queryClient.getQueryData(KEY) as object),
        accounts: [{ id: 1, currencyCode: "PEN" }],
        categoryPostedMovements: [{ id: 99, categoryId: 2 }],
        subscriptionPostedMovements: [{ id: 99, subscriptionId: 7 }],
        counterpartyPostedMovements: [{ id: 99, counterpartyId: 5 }],
      });
      return queryClient;
    };
    const ids = (queryClient: QueryClient, key: "categoryPostedMovements" | "subscriptionPostedMovements" | "counterpartyPostedMovements") =>
      (get(queryClient)[key] as Array<{ id: number }>).map((m) => m.id);

    it("los rehace desde los movimientos locales: solo confirmados, por categoría, suscripción y contacto", async () => {
      Object.assign(mockRows, {
        movements: [
          move({ id: 1, category_id: 2 }),
          move({ id: 2, category_id: 2, status: "voided" }),
          move({ id: 3, category_id: null, subscription_id: 7 }),
          move({ id: 4, category_id: null, counterparty_id: 5, occurred_at: "2026-10-15T10:00:00.000Z" }),
        ],
      });
      const queryClient = seedWithStale();
      expect(await applyLocalMovementHistoriesToCache(queryClient, 1)).toBe(true);
      expect(ids(queryClient, "categoryPostedMovements")).toEqual([1]); // el anulado no cuenta y el viejo (99) ya no está
      expect(ids(queryClient, "subscriptionPostedMovements")).toEqual([3]);
      expect(ids(queryClient, "counterpartyPostedMovements")).toEqual([4]);
    });

    it("al borrar o anular un movimiento sin red, su historial se actualiza", async () => {
      Object.assign(mockRows, { movements: [move({ id: 1, category_id: 2 }), move({ id: 5, category_id: 2, occurred_at: "2026-10-13T10:00:00.000Z" })] });
      const queryClient = seedWithStale();
      await applyLocalMovementHistoriesToCache(queryClient, 1);
      expect(ids(queryClient, "categoryPostedMovements")).toEqual([1, 5]);
      // Se borra el 1 y se anula el 5 (en la copia local).
      Object.assign(mockRows, { movements: [move({ id: 5, category_id: 2, status: "voided", occurred_at: "2026-10-13T10:00:00.000Z" })] });
      await applyLocalMovementHistoriesToCache(queryClient, 1);
      expect(ids(queryClient, "categoryPostedMovements")).toEqual([]);
    });

    it("si los movimientos aún no se descargaron no toca el cache", async () => {
      mockRows.movements = null;
      const queryClient = seedWithStale();
      expect(await applyLocalMovementHistoriesToCache(queryClient, 1)).toBe(false);
      expect(ids(queryClient, "categoryPostedMovements")).toEqual([99]);
    });
  });
});
