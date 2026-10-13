import { dateField, optionalNumberField, parseFormAmountInput, positiveAmountField } from "../form-field-rules";

describe("form input rules", () => {
  it("accepts comma decimals and grouping without silently deleting text", () => {
    expect(parseFormAmountInput("1,234.56")).toBe(1234.56);
    expect(parseFormAmountInput("1.234,56")).toBe(1234.56);
    expect(parseFormAmountInput("12,50")).toBe(12.5);
    expect(parseFormAmountInput("12abc")).toBeNull();
    expect(parseFormAmountInput(undefined)).toBeNull();
    expect(positiveAmountField("12abc").invalid).toBeTruthy();
  });
  it("preserves exchange rate precision and signed opening balances", () => {
    expect(parseFormAmountInput("3.672", "rate")).toBe(3.672);
    expect(optionalNumberField("-12,50").invalid).toBeNull();
    expect(optionalNumberField("-12,50", { positive: true }).invalid).toBeTruthy();
    expect(optionalNumberField("0", { nonnegative: true }).invalid).toBeNull();
    expect(optionalNumberField("", { positive: true }).invalid).toBeNull();
  });
  it("rejects impossible calendar dates and preserves optional blank dates", () => {
    expect(dateField("2026-02-30").invalid).toBeTruthy();
    expect(dateField("2024-02-29").invalid).toBeNull();
    expect(dateField("2026-02-29").invalid).toBeTruthy();
    expect(dateField("", { optional: true }).missing).toBeNull();
    expect(dateField("2026-10-10", { min: "2026-10-11" }).invalid).toBeTruthy();
  });
});
