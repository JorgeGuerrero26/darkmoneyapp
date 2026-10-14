import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { computeBudgetProgress, selectBudgetProgress, type BudgetProgressInput } from "../../../features/budgets/lib/offlineBudgetProgress";
import { computePendingSubscriptionCharges, computeSubscriptionUpcoming, selectSubscriptionNextDue, selectSubscriptionStanding, selectSubscriptionUpcoming } from "../../../features/subscriptions/lib/offlineSubscriptionState";
import { subscriptionStanding } from "../../../features/subscriptions/lib/subscriptionStanding";
import type { SubscriptionSummary } from "../../../types/domain";
import { centsText, decimalRatio, roundRatio } from "../calculation";

const gate = { enabled: true, hydrated: true, parityVerified: true, serverEffectsPending: false };
type Row = Record<string, unknown>;
const budgetInput: BudgetProgressInput = {
  workspaceId: 1, serverTimeZone: "UTC", accounts: [{ id: 1, workspace_id: 1, name: "Cuenta", currency_code: "USD" }],
  categories: [{ id: 2, workspace_id: 1, name: "Categoría", default_spend_type_id: 3 }], spendTypes: [{ id: 3, workspace_id: 1, name: "Necesidad" }],
  budgets: [{ id: 4, workspace_id: 1, name: "Mes", currency_code: "PEN", limit_amount: "1.00", alert_percent: "80.00",
    period_start: "2026-10-01", period_end: "2026-10-31", category_id: null, account_id: null, spend_type_id: 3, is_active: true }],
  movements: [{ id: 5, workspace_id: 1, status: "posted", movement_type: "expense", occurred_at: "2026-10-31T23:59:59Z",
    source_account_id: 1, category_id: 2, source_amount: "0.01", spend_type_id: null }], rates: [],
};

describe("réplicas Fase 3: centavos y respaldo del servidor", () => {
  it("redondea empates como PostgreSQL, sin coma flotante", () => {
    expect(roundRatio(5n, 2n)).toBe(3n); expect(roundRatio(-5n, 2n)).toBe(-3n);
    expect(decimalRatio("3.500000")).toEqual([3500000n, 1000000n]);
    expect(centsText(-1n)).toBe("-0.01");
  });
  it("convierte por movimiento y suma después; respeta el tipo heredado de categoría", () => {
    const input = { ...budgetInput, rates: [{ from_currency_code: "USD", to_currency_code: "PEN", rate: "2.5" }],
      movements: [...budgetInput.movements, { ...budgetInput.movements[0], id: 6 }] };
    const row = computeBudgetProgress(input)[0];
    expect(row.spent_amount).toBe("0.06"); expect(row.remaining_amount).toBe("0.94");
    expect(row.used_percent).toBe("6.00"); expect(row.movement_count).toBe(2);
    expect(row.scope_kind).toBe("spend_type"); expect(row.scope_label).toBe("Necesidad");
  });
  it("usa la tasa inversa, luego el nominal si no hay tasa, como la vista SQL", () => {
    expect(computeBudgetProgress({ ...budgetInput, rates: [{ from_currency_code: "PEN", to_currency_code: "USD", rate: "0.4" }] })[0].spent_amount).toBe("0.03");
    expect(computeBudgetProgress(budgetInput)[0].spent_amount).toBe("0.01");
  });
  it("filtra fechas UTC inclusivas, workspace, estado, tipo y alcance", () => {
    const base = budgetInput.movements[0];
    const invalid = [{ ...base, occurred_at: "2026-11-01T00:00:00Z" }, { ...base, workspace_id: 2 },
      { ...base, status: "voided" }, { ...base, movement_type: "transfer" }, { ...base, category_id: null }];
    const row = computeBudgetProgress({ ...budgetInput, movements: [base, ...invalid] })[0];
    expect(row.movement_count).toBe(1);
    expect(computeBudgetProgress({ ...budgetInput, budgets: [{ ...budgetInput.budgets[0], category_id: 999 }] })[0].spent_amount).toBe("0.00");
  });
  it("conserva el valor del servidor sin beta, datos completos, paridad o precisión", () => {
    const server = [{ id: 4, spent_amount: "123.45" }];
    for (const key of ["enabled", "hydrated", "parityVerified"] as const) {
      expect(selectBudgetProgress({ ...gate, [key]: false }, budgetInput, server).value).toBe(server);
    }
    expect(selectBudgetProgress({ ...gate, serverEffectsPending: true }, budgetInput, server).value).toBe(server);
    const unsafe = { ...budgetInput, movements: [{ ...budgetInput.movements[0], source_amount: "0.001" }] };
    expect(selectBudgetProgress(gate, unsafe, server).source).toBe("server");
    expect(selectBudgetProgress(gate, { ...budgetInput, serverTimeZone: "America/Lima" }, server).value).toBe(server);
    expect(selectBudgetProgress(gate, { ...budgetInput, budgets: [{ ...budgetInput.budgets[0], limit_amount: "999999999999999.00" }] }, server).value).toBe(server);
  });
  it("calcula límites activos, inactivos, cero y porcentaje redondeado", () => {
    const input = { ...budgetInput, movements: [{ ...budgetInput.movements[0], source_amount: "0.80" }] };
    expect(computeBudgetProgress(input)[0].is_near_limit).toBe(true);
    expect(computeBudgetProgress({ ...input, budgets: [{ ...input.budgets[0], is_active: false }] })[0].is_near_limit).toBe(false);
    expect(computeBudgetProgress({ ...input, budgets: [{ ...input.budgets[0], limit_amount: "0.00" }] })[0]).toMatchObject({ used_percent: "0.00", is_over_limit: true });
  });
  it("lee pendientes por el padre sin generar historial ni ocultar padres pausados", () => {
    const input = { workspaceId: 1, subscriptions: [{ id: 1, workspace_id: 1, name: "Plan", status: "paused", currency_code: "USD", account_id: null, category_id: null, vendor_party_id: null }],
      occurrences: [{ id: 2, subscription_id: 1, status: "scheduled", due_date: "2026-10-01", expected_amount: "1.00" },
        { id: 3, subscription_id: 1, status: "paid", expected_amount: "2.00" }, { id: 4, subscription_id: 99, status: "scheduled" }],
      accounts: [], categories: [], counterparties: [] };
    expect(computeSubscriptionUpcoming(input)).toHaveLength(1);
    expect(computeSubscriptionUpcoming(input)[0]).toMatchObject({ subscription_status: "paused", expected_amount: "1.00" });
    const server: Row[] = [];
    expect(selectSubscriptionUpcoming({ ...gate, hydrated: false }, input, server).value).toBe(server);
    expect(computePendingSubscriptionCharges(input.occurrences, 1, "2026-10-13")).toEqual({ count: 1, amount: "1.00" });
    expect(input.occurrences).toHaveLength(3);
  });
  it("mantiene el estado anterior si el presenter pierde centavos o un calendario no es válido", () => {
    const subscription = { id: 1, status: "active", amount: 1, nextDueDate: "2026-10-01", frequency: "monthly", intervalCount: 1 } as SubscriptionSummary;
    const server = { tone: "overdue", missedAmount: 0.3 } as ReturnType<typeof subscriptionStanding>;
    const args = { subscription, today: "2026-10-13", occurrences: [
      { subscription_id: 1, status: "scheduled", due_date: "2026-09-01", expected_amount: "0.10" },
      { subscription_id: 1, status: "scheduled", due_date: "2026-10-01", expected_amount: "0.20" },
    ], formatDate: (date: string) => date, formatAmount: (amount: number) => String(amount) };
    expect(selectSubscriptionStanding(gate, args, server).value).toBe(server);
    expect(selectSubscriptionNextDue(gate, { frequency: "monthly", interval_count: 1, day_of_month: 32 }, "2026-11-01").source).toBe("server");
    expect(selectSubscriptionNextDue({ ...gate, parityVerified: false }, {}, "2026-11-01").value).toBe("2026-11-01");
  });
});

// Datos privados, gitignored. En CI se omite la paridad si no existe la captura local.
const file = join(process.cwd(), ".tmp/offline-fixtures/phase3-parity.json");
const available = existsSync(file);
type Fixture = Record<string, Row[]> & { meta: { timezone: string; today: string } };
const fixtures = available ? JSON.parse(readFileSync(file, "utf8")) as Fixture : null;
const inputFrom = (f: Fixture): BudgetProgressInput => ({ workspaceId: 1, serverTimeZone: f.meta.timezone,
  budgets: f.budgets, movements: f.movements, accounts: f.accounts, categories: f.categories, spendTypes: f.spend_types, rates: f.rates });

(available ? describe : describe.skip)("Fase 3.3: paridad exacta con la captura real (READ ONLY + ROLLBACK)", () => {
  it("todos los campos de cada presupuesto coinciden con v_budget_progress", () => {
    const local = computeBudgetProgress(inputFrom(fixtures!));
    expect(local.length).toBe(fixtures!.budget_progress.length);
    for (const server of fixtures!.budget_progress) {
      const mine = local.find(row => row.id === server.id);
      expect(mine).toEqual(server);
    }
  });
  it("el historial local coincide con cada fila de v_subscription_upcoming", () => {
    const f = fixtures!;
    const local = computeSubscriptionUpcoming({ workspaceId: 1, subscriptions: f.subscriptions, occurrences: f.subscription_occurrences,
      accounts: f.accounts, categories: f.categories, counterparties: f.counterparties });
    expect(local.sort((a, b) => Number(a.occurrence_id) - Number(b.occurrence_id))).toEqual(f.subscription_upcoming);
  });
  it("cuenta y suma los pendientes exactamente como la consulta SQL real", () => {
    for (const server of fixtures!.subscription_pending) {
      const got = computePendingSubscriptionCharges(fixtures!.subscription_occurrences, Number(server.id), fixtures!.meta.today);
      expect(got.count).toBe(server.count);
      expect(decimalRatio(got.amount)[0] * decimalRatio(server.amount)[1]).toBe(decimalRatio(server.amount)[0] * decimalRatio(got.amount)[1]);
    }
  });
  it("reutiliza el calendario: seis cadencias, anclas, fin de mes y bisiesto contra SQL real", () => {
    for (const server of fixtures!.next_due_cases) {
      const result = selectSubscriptionNextDue(gate, { next_due_date: server.date, frequency: server.frequency, interval_count: server.n, day_of_month: server.anchor }, String(server.next));
      expect(result.source).toBe("local"); expect(result.value).toBe(server.next);
    }
    for (const server of fixtures!.next_due) {
      const result = selectSubscriptionNextDue(gate, fixtures!.subscriptions.find(row => Number(row.id) === Number(server.id))!, String(server.next));
      if (result.source !== "local") throw new Error(result.reason);
      expect(result.source).toBe("local"); expect(result.value).toBe(server.next);
    }
  });
  it("reutiliza el estado del módulo sobre el historial real, sin cambiar el presenter", () => {
    for (const row of fixtures!.subscriptions) {
      const subscription = { id: row.id, status: row.status, amount: Number(row.amount), nextDueDate: row.next_due_date,
        frequency: row.frequency, intervalCount: row.interval_count, dayOfMonth: row.day_of_month } as SubscriptionSummary;
      const args = { subscription, today: fixtures!.meta.today, occurrences: fixtures!.subscription_occurrences,
        formatAmount: (amount: number) => String(amount), formatDate: (date: string) => date };
      const server = subscriptionStanding({ ...args, occurrences: args.occurrences.filter(o => o.subscription_id === row.id)
        .map(o => ({ dueDate: String(o.due_date), status: String(o.status), expectedAmount: Number(o.expected_amount) })) });
      const got = selectSubscriptionStanding(gate, args, server);
      expect(got.source).toBe("local"); expect(got.value).toEqual(server);
    }
  });
});
