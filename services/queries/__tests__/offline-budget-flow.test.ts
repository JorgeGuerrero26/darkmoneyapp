import { OfflineRuntime } from "../../../lib/offline/runtime";
import type { PushOp, PushResult, SyncTransport } from "../../../lib/offline/sync-types";
import { createTestDriver } from "../../../lib/offline/__tests__/helpers/node-sqlite-driver";

const state: { runtime: OfflineRuntime | null } = { runtime: null };

jest.mock("../../../lib/supabase", () => ({ supabase: null }));
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
import { computeLocalBudgetRows } from "../offline-budgets";

const WS = 1;

function fakeTransport(): SyncTransport {
  let nextId = 7000;
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

describe("flujo real: presupuesto y gasto creados sin red", () => {
  it("el gasto de la categoría del presupuesto cuenta en su avance", async () => {
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
    const category = await localCreate(WS, "categories", { workspace_id: WS, name: "Combustible", kind: "expense", is_active: true, is_system: false, sort_order: 10 });
    // Igual que useCreateBudgetMutation con el modo sin conexión.
    const budget = await localCreate(WS, "budgets", {
      workspace_id: WS, name: "Prueba mes", period_start: "2026-10-14", period_end: "2026-10-31", limit_amount: 100, alert_percent: 80,
      currency_code: "PEN", category_id: category!.id, account_id: null, spend_type_id: null, rollover_enabled: false, recurrence: "monthly",
      notes: null, is_active: true, is_pinned: false,
    });
    expect(budget).not.toBeNull();

    const before = await computeLocalBudgetRows(WS, []);
    expect(before).not.toBeNull();
    expect(before![0]).toMatchObject({ name: "Prueba mes", spent_amount: "0.00", remaining_amount: "100.00" });

    // Igual que useCreateMovementMutation: gasto de 1 sol de esa categoría, "hoy 12:54" hora de Lima (17:54 UTC).
    const movement = await runtime.createMovement(WS, {
      movementType: "expense", status: "posted", occurredAt: "2026-10-14T17:54:00.000Z", description: "Combustible · Cuenta Principal",
      sourceAccountId: account!.id, sourceAmount: 1, destinationAccountId: null, destinationAmount: null, categoryId: category!.id,
      dedupeKey: "k-fuel",
    });
    expect(movement).not.toBeNull();

    const after = await computeLocalBudgetRows(WS, []);
    expect(after).not.toBeNull();
    expect(after![0]).toMatchObject({ spent_amount: "1.00", remaining_amount: "99.00", movement_count: 1 });
  });
});

// eslint-disable-next-line import/first
import { fetchBudgetScopeMovements } from "../budget-analytics";
// eslint-disable-next-line import/first
import { applyBudgetComputedMetrics, buildBudgetMetricsMap } from "../../../lib/budget-metrics";
// eslint-disable-next-line import/first
import type { BudgetOverview } from "../../../types/domain";

describe("la pantalla del presupuesto (la cuenta que realmente muestra 'falta')", () => {
  it("sin internet, un gasto nuevo de la categoría baja lo que falta, igual que con internet", async () => {
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
    const category = await localCreate(WS, "categories", { workspace_id: WS, name: "Combustible", kind: "expense", is_active: true, is_system: false, sort_order: 10 });
    const budget: BudgetOverview = {
      id: 1, workspaceId: WS, createdByUserId: "u1", updatedByUserId: "u1", name: "Prueba mes", periodStart: "2026-10-14", periodEnd: "2026-10-31",
      currencyCode: "PEN", categoryId: category!.id, categoryName: "Combustible", accountId: null, accountName: null, spendTypeId: null, spendTypeName: null,
      scopeKind: "category", scopeLabel: "Categoria: Combustible", limitAmount: 100, spentAmount: 0, remainingAmount: 100, usedPercent: 0, alertPercent: 80,
      movementCount: 0, rolloverEnabled: false, recurrence: "monthly", notes: null, isActive: true, isNearLimit: false, isOverLimit: false, isPinned: false,
      createdAt: "2026-10-14T17:00:00Z", updatedAt: "2026-10-14T17:00:00Z",
    };
    const show = async () => {
      const moves = await fetchBudgetScopeMovements(WS, budget.periodStart, budget.periodEnd);
      const metrics = buildBudgetMetricsMap([budget], moves, { workspaceBaseCurrencyCode: "PEN", exchangeRates: [] });
      return applyBudgetComputedMetrics(budget, metrics.get(budget.id)!);
    };

    expect(await show()).toMatchObject({ spentAmount: 0, remainingAmount: 100 });
    await runtime.createMovement(WS, {
      movementType: "expense", status: "posted", occurredAt: "2026-10-14T17:54:00.000Z", description: "Combustible · Cuenta Principal",
      sourceAccountId: account!.id, sourceAmount: 1, destinationAccountId: null, destinationAmount: null, categoryId: category!.id, dedupeKey: "k-fuel-2",
    });
    expect(await show()).toMatchObject({ spentAmount: 1, remainingAmount: 99, movementCount: 1 });
  });
});
