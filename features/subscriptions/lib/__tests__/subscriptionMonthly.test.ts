import { getMonthlySubscriptionAmount, summarizeSubscriptionsMonthly } from "../subscriptionFilters";
import type { SubscriptionSummary } from "../../../../types/domain";

function sub(overrides: Partial<SubscriptionSummary>): SubscriptionSummary {
  return {
    id: 1, workspaceId: 1, name: "S", vendor: "", status: "active", amount: 120, currencyCode: "PEN",
    frequency: "monthly", frequencyLabel: "", intervalCount: 1, startDate: "2026-01-01",
    nextDueDate: "2026-10-01", remindDaysBefore: 3, autoCreateMovement: false, isPinned: false,
    ...overrides,
  };
}

describe("equivalente mensual de suscripciones", () => {
  it("respeta intervalCount", () => {
    expect(getMonthlySubscriptionAmount(sub({ intervalCount: 2 }))).toBeCloseTo(60);
    expect(getMonthlySubscriptionAmount(sub({ frequency: "yearly", intervalCount: 1 }))).toBeCloseTo(10);
    expect(getMonthlySubscriptionAmount(sub({ frequency: "quarterly", intervalCount: 2 }))).toBeCloseTo(20);
    expect(getMonthlySubscriptionAmount(sub({ frequency: "weekly", intervalCount: 2, amount: 10 }))).toBeCloseTo(10 * 52 / 12 / 2);
    expect(getMonthlySubscriptionAmount(sub({ frequency: "custom", intervalCount: 30, amount: 30 }))).toBeCloseTo(365 / 12);
  });

  it("no suma moneda extranjera sin conversión como si fuera base", () => {
    const summary = summarizeSubscriptionsMonthly([
      sub({ amount: 100 }),
      sub({ id: 2, amount: 10, currencyCode: "USD" }),
      sub({ id: 3, amount: 10, currencyCode: "USD", amountInBaseCurrency: 37 }),
      sub({ id: 4, status: "paused", amount: 999 }),
    ], "PEN");
    expect(summary.total).toBeCloseTo(137);
    expect(summary.comparableCount).toBe(2);
    expect(summary.unconvertedCount).toBe(1);
  });
});
