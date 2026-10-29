jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useMemo: (calculate: () => unknown) => calculate(),
}));
jest.mock("../../../../services/queries/workspace-data", () => ({
  DASHBOARD_MOVEMENTS_WINDOW_DAYS: 90,
  PROJECTION_HISTORY_MONTHS: 6,
}));

import { useCashflowProjection, type CashflowProjectionInputs } from "../../hooks/useCashflowProjection";
import { isHistoryBalanceCorrection } from "../history-view";
import { weeklySpendPattern } from "../patterns-view";
import type { DashboardMovementRow } from "../dashboard-row";

const movement = (overrides: Partial<DashboardMovementRow>): DashboardMovementRow => ({
  id: 1, movementType: "expense", status: "posted", occurredAt: "2026-09-10T12:00:00",
  sourceAmount: 100, destinationAmount: 0, sourceAccountId: 1, destinationAccountId: null,
  categoryId: null, spendTypeId: null, counterpartyId: null, description: "Comida", ...overrides,
});

describe("correcciones de saldo en el dashboard", () => {
  beforeAll(() => { jest.useFakeTimers().setSystemTime(new Date("2026-10-15T12:00:00")); });
  afterAll(() => { jest.useRealTimers(); });

  it("excluye la corrección del patrón semanal conservando el gasto real", () => {
    const regular = movement({});
    const correction = movement({ id: 2, description: "Corrección · Impuestos", sourceAmount: 1245.83 });
    const result = weeklySpendPattern([regular, correction].filter((item) => !isHistoryBalanceCorrection(item)), (item) => item.sourceAmount);
    expect(result.days.reduce((sum, day) => sum + day.total, 0)).toBe(100);
    expect(result.days.flatMap((day) => day.movements).map((item) => item.id)).toEqual([1]);
  });

  it("mantiene el gasto típico y la proyección de seis meses al agregar correcciones en efectivo y tarjeta", () => {
    const inputs: CashflowProjectionInputs = {
      movements: [], historyMovements: Array.from({ length: 6 }, (_, index) => movement({ id: index + 1, occurredAt: `2026-${String(index + 4).padStart(2, "0")}-10T12:00:00` })), historyCoveredFrom: new Date("2026-04-01T00:00:00"),
      obligations: [], subscriptions: [], recurringIncome: [], displayCurrency: "PEN", baseCurrency: "PEN",
      exchangeRateMap: new Map(), accountCurrencyMap: new Map([[1, "PEN"], [2, "PEN"]]),
      accounts: [{ id: 1, type: "bank", currencyCode: "PEN", currentBalance: 5000 }, { id: 2, type: "credit_card", currencyCode: "PEN", currentBalance: 0 }],
    };
    const baseline = useCashflowProjection(inputs, 6);
    expect(baseline.typicalSpend.typical).toBe(100);
    const corrections = inputs.historyMovements!.flatMap((item) => [
      movement({ id: item.id + 10, occurredAt: item.occurredAt, description: "Corrección · Impuestos", sourceAmount: 1245.83 }),
      movement({ id: item.id + 20, occurredAt: item.occurredAt, sourceAccountId: 2, description: "Corrección · Impuestos", sourceAmount: 1245.83 }),
    ]);
    const withCorrections = useCashflowProjection({ ...inputs, historyMovements: [...inputs.historyMovements!, ...corrections] }, 6);
    expect(withCorrections.typicalSpend).toEqual(baseline.typicalSpend);
    expect(withCorrections.projection).toEqual(baseline.projection);
  });
});
