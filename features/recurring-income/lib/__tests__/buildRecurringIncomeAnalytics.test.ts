import { buildRecurringIncomeAnalytics } from "../buildRecurringIncomeAnalytics";
import type { RecurringIncomeOccurrenceSummary } from "../../../../types/domain";

const arrival: RecurringIncomeOccurrenceSummary = {
  id: 1,
  recurringIncomeId: 1,
  workspaceId: 1,
  expectedDate: "2026-10-02",
  actualDate: "2026-10-02",
  amount: 100,
  currencyCode: "PEN",
  status: "on_time",
};

describe("analítica de ingresos fijos", () => {
  it("separa monedas sin tasa y calcula la puntualidad con todas las llegadas", () => {
    const result = buildRecurringIncomeAnalytics([
      arrival,
      { ...arrival, id: 2, expectedDate: "2026-10-01", actualDate: "2026-10-03", amount: 20, currencyCode: "USD", status: "late" },
      { ...arrival, id: 3, expectedDate: "2026-10-04", actualDate: "2026-10-05", amount: 10, currencyCode: "EUR", status: "late" },
    ], "PEN", [{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.5, effectiveAt: "2026-10-01" }], new Date(2026, 9, 6));

    expect(result.comparableTotal).toBe(170);
    expect(result.comparableCount).toBe(2);
    expect(result.averageBase).toBe(85);
    expect(result.months.at(-1)).toMatchObject({ key: "2026-10", count: 2, total: 170 });
    expect(result.currencies).toHaveLength(3);
    expect(result.onTimeCount).toBe(1);
    expect(result.lateCount).toBe(2);
    expect(result.averageLateDays).toBe(1.5);
    expect(result.punctualityPct).toBeCloseTo(100 / 3);
  });

  it("no presenta puntualidad ni importes ficticios sin llegadas", () => {
    const result = buildRecurringIncomeAnalytics([], "PEN", [], new Date(2026, 9, 6));

    expect(result.rows).toHaveLength(0);
    expect(result.currencies).toHaveLength(0);
    expect(result.comparableCount).toBe(0);
    expect(result.punctualityPct).toBe(0);
    expect(result.latest).toBeNull();
  });
});
