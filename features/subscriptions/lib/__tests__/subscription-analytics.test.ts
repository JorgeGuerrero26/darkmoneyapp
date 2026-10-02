import { buildSubscriptionAnalytics } from "../subscription-analytics";
import type { SubscriptionPostedMovement, SubscriptionSummary } from "../../../../types/domain";

const subscription: SubscriptionSummary = {
  id: 7,
  workspaceId: 1,
  name: "Música",
  vendor: "",
  status: "active",
  amount: 20,
  currencyCode: "PEN",
  frequency: "monthly",
  frequencyLabel: "Mensual",
  intervalCount: 1,
  startDate: "2026-01-01",
  nextDueDate: "2026-10-01",
  remindDaysBefore: 0,
  autoCreateMovement: false,
  isPinned: false,
};

function payment(id: number, occurredAt: string, amount: number, currency: string, base: number | null): SubscriptionPostedMovement {
  return {
    id,
    subscriptionId: 7,
    occurredAt,
    sourceAmount: amount,
    destinationAmount: null,
    amountCurrencyCode: currency,
    amountInBaseCurrency: base,
  };
}

describe("buildSubscriptionAnalytics", () => {
  it("separa monedas y deja fuera del total comparable los pagos sin conversión", () => {
    const analysis = buildSubscriptionAnalytics(subscription, [
      payment(1, "2026-09-05T10:00:00Z", 20, "PEN", null),
      payment(2, "2026-09-10T10:00:00Z", 10, "USD", 37),
      payment(3, "2026-09-15T10:00:00Z", 5, "USD", null),
      payment(5, "2026-09-16T10:00:00Z", 4, "USD", 0),
      { ...payment(4, "2026-09-20T10:00:00Z", 900, "PEN", 900), subscriptionId: 99 },
    ], "PEN", new Date(2026, 9, 2));

    expect(analysis.paymentCount).toBe(4);
    expect(analysis.currencies).toEqual([
      { code: "USD", total: 19, count: 3 },
      { code: "PEN", total: 20, count: 1 },
    ]);
    expect(analysis.comparableCount).toBe(2);
    expect(analysis.comparableTotal).toBe(57);
    expect(analysis.months.find((month) => month.key === "2026-09")?.total).toBe(57);
    expect(analysis.latestPayment?.id).toBe(5);
  });

  it("no inventa proyección anual para una frecuencia personalizada", () => {
    const analysis = buildSubscriptionAnalytics({ ...subscription, frequency: "custom" }, [], "PEN", new Date(2026, 9, 2));
    expect(analysis.annualEstimate).toBeNull();
    expect(analysis.monthlyEstimate).toBeNull();
    expect(analysis.paymentCount).toBe(0);
  });
});
