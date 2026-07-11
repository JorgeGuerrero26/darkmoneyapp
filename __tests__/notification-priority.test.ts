import { getNotificationPriority } from "../lib/notification-priority";

describe("prioridad de kinds nuevos", () => {
  it("marca los 3 kinds push como important", () => {
    expect(getNotificationPriority("possible_duplicate_charge")).toBe("important");
    expect(getNotificationPriority("cash_runway_alert")).toBe("important");
    expect(getNotificationPriority("commitments_vs_balance")).toBe("important");
  });
  it("deja los kinds informativos como informational", () => {
    for (const kind of [
      "subscription_price_increase",
      "detected_suggestions_pending",
      "expected_income_missed",
      "monthly_recap",
      "obligation_milestone",
    ]) {
      expect(getNotificationPriority(kind)).toBe("informational");
    }
  });
});
