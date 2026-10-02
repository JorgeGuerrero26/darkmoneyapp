import { getMonthlyRecurringIncomeAmount } from "../recurringIncomeFilters";
import { summarizeRecurringIncome } from "../summarizeRecurringIncome";
import type { RecurringIncomeSummary } from "../../../../types/domain";

const income: RecurringIncomeSummary = {
  id: 1,
  workspaceId: 1,
  name: "Sueldo",
  payer: "Empresa",
  status: "active",
  amount: 100,
  currencyCode: "PEN",
  frequency: "monthly",
  frequencyLabel: "Mensual",
  intervalCount: 1,
  startDate: "2026-01-01",
  nextExpectedDate: "2026-10-15",
  remindDaysBefore: 0,
  isPinned: false,
};

describe("resumen de ingresos fijos", () => {
  it("respeta el intervalo real, incluido cada varios días", () => {
    expect(getMonthlyRecurringIncomeAmount({ ...income, intervalCount: 2 })).toBe(50);
    expect(getMonthlyRecurringIncomeAmount({ ...income, frequency: "custom", intervalCount: 10 }))
      .toBeCloseTo(100 * 365 / 120, 2);
  });

  it("no suma dólares sin conversión como si fueran soles", () => {
    const summary = summarizeRecurringIncome([
      income,
      { ...income, id: 2, currencyCode: "USD", amount: 50, amountInBaseCurrency: null, nextExpectedDate: "2026-09-15" },
      { ...income, id: 3, currencyCode: "USD", amount: 20, amountInBaseCurrency: 74, nextExpectedDate: "2026-09-15" },
      { ...income, id: 4, status: "paused", amount: 500 },
    ], "PEN", "2026-10-02");

    expect(summary.activeCount).toBe(3);
    expect(summary.pausedCount).toBe(1);
    expect(summary.monthlyTotal).toBe(174);
    expect(summary.excludedActiveCount).toBe(1);
    expect(summary.unconfirmedCount).toBe(2);
    expect(summary.excludedUnconfirmedCount).toBe(1);
    expect(summary.unconfirmedTotal).toBe(74);
  });
});
