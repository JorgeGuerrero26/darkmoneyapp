import { detectionFormFields } from "../form-feedback";
import type { DetectionDraft } from "../review-draft";
import type { AccountSummary } from "../../../../types/domain";

const accounts = [{ id: 1, currencyCode: "PEN", isArchived: false }, { id: 2, currencyCode: "USD", isArchived: false }, { id: 3, currencyCode: "PEN", isArchived: true }] as AccountSummary[];
const draft: DetectionDraft = { movementType: "expense", amount: "23.60", description: "Anthropic", accountId: 1, destinationAccountId: null, destinationAmount: "", fxRate: "", categoryId: null, date: "2026-10-09", time: "20:51" };
describe("detection field feedback", () => {
  it("a missing account has one missing state and no invalid state", () => {
    const fields = detectionFormFields({ ...draft, accountId: null }, accounts, "2026-10-11");
    expect(fields.accountId.missing).toBe("Elige una cuenta");
    expect(fields.accountId.invalid).toBeNull();
  });
  it("an unavailable account is invalid rather than missing", () => {
    const fields = detectionFormFields({ ...draft, accountId: 3 }, accounts, "2026-10-11");
    expect(fields.accountId.missing).toBeNull();
    expect(fields.accountId.invalid).toBeTruthy();
  });
  it("blocks a future expense on the date and permits a future income", () => {
    expect(detectionFormFields({ ...draft, date: "2026-10-14" }, accounts, "2026-10-11").date.invalid).toBe("Un gasto no puede tener fecha futura");
    expect(detectionFormFields({ ...draft, movementType: "income", date: "2026-10-14" }, accounts, "2026-10-11").date.invalid).toBeNull();
  });
  it("requires destination and exchange data only for cross-currency transfers", () => {
    const fields = detectionFormFields({ ...draft, movementType: "transfer", destinationAccountId: 2 }, accounts, "2026-10-11");
    expect(fields.destinationAmount.missing).toBeTruthy();
    expect(fields.fxRate.missing).toBeTruthy();
    expect(fields.destinationAccountId.invalid).toBeNull();
    expect(detectionFormFields({ ...draft, movementType: "transfer", destinationAccountId: 1 }, accounts, "2026-10-11").destinationAccountId.invalid).toBeTruthy();
  });
});
