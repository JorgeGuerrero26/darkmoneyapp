import type { ProjectedMonth } from "../../../projection/lib/cashflow-calendar";
import { firstNegativeMonth, upcomingSubscriptionCharges, visibleProjectionMonths } from "../flow-view";

const now = new Date(2026, 8, 29, 14);

function month(key: string, balance: number, charges: Array<{ date: string; amount: number }> = []): ProjectedMonth {
  return {
    monthKey: key,
    openingBalance: 0,
    closingBalance: balance,
    inflows: [],
    outflows: charges.map((charge, index) => ({ kind: "subscription", source: "scheduled", label: `Plan ${index}`, refId: index + 1, dueDate: charge.date, amount: charge.amount })),
    inflowTotal: 0,
    outflowTotal: charges.reduce((sum, charge) => sum + charge.amount, 0),
    netFlow: -charges.reduce((sum, charge) => sum + charge.amount, 0),
    scheduledShare: 1,
    unconvertedCount: 0,
    isPartial: false,
  };
}

describe("Flujo", () => {
  it("highlights the first month that actually crosses below zero", () => {
    const months = [month("2026-09", 100), month("2026-10", 20), month("2026-11", -15), month("2026-12", -30)];
    expect(firstNegativeMonth(months)?.monthKey).toBe("2026-11");
    expect(visibleProjectionMonths(months, false).map((item) => item.monthKey)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(visibleProjectionMonths(months, true)).toHaveLength(4);
  });

  it("lists today's charge and calculates the total from precisely the visible 30-day charges", () => {
    const months = [
      month("2026-09", 100, [{ date: "2026-09-29", amount: 20 }]),
      month("2026-10", 80, [{ date: "2026-10-10", amount: 15 }, { date: "2026-10-30", amount: 50 }]),
    ];
    const charges = upcomingSubscriptionCharges(months, now);
    expect(charges.map((item) => item.amount)).toEqual([20, 15]);
    expect(charges.reduce((sum, item) => sum + (item.amount ?? 0), 0)).toBe(35);
  });
});
