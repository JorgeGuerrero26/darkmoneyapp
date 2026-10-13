import { incomeOptionalFields } from "../optional-form-fields";
import { collectDeductions } from "../incomeBreakdown";
import { collectChanges } from "../scheduledChanges";

describe("optional income fields", () => {
  it("requires added rows to be completed instead of silently losing them", () => {
    const fields = incomeOptionalFields("", [{ key: "a", name: "AFP", amount: "" }], [{ key: "b", date: "", amount: "120" }]);
    expect(fields.grossAmount.invalid).toBeNull();
    expect(fields["deduction-amount-a"].missing).toBeTruthy();
    expect(fields["change-date-b"].missing).toBeTruthy();
    expect(incomeOptionalFields("", [], [])).toEqual({ grossAmount: { value: "", invalid: null } });
  });
  it("rejects duplicates and impossible dates without blocking a valid breakdown difference", () => {
    const fields = incomeOptionalFields("500", [{ key: "a", name: "AFP", amount: "50" }], [
      { key: "b", date: "2026-10-12", amount: "1,200.50" },
      { key: "c", date: "2026-10-12", amount: "1300" },
      { key: "d", date: "2026-02-30", amount: "1400" },
    ]);
    expect(fields["change-date-c"].invalid).toBeTruthy();
    expect(fields["change-date-d"].invalid).toBeTruthy();
    expect(fields.grossAmount.invalid).toBeNull();
    expect(collectChanges([{ key: "b", date: "2026-10-12", amount: "1,200.50" }])[0].amount).toBe(1200.5);
    expect(collectDeductions([{ key: "a", name: "AFP", amount: "1,200.50" }])[0].amount).toBe(1200.5);
  });
});
