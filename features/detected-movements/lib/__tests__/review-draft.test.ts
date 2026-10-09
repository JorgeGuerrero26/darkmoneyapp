/** @jest-environment node */
import { applyPersonalProposal, buildDetectionDraft, detectionMissingFields, transferDestinationDraft } from "../review-draft";
import type { AccountSummary, CategorySummary, ExchangeRateSummary } from "../../../../types/domain";
import type { DetectedMovementSuggestion } from "../../../../services/queries/notification-detection";

const accounts = [{ id: 1, name: "Sueldo", currencyCode: "PEN", isArchived: false },
  { id: 2, name: "Principal", currencyCode: "PEN", isArchived: false },
  { id: 3, name: "Dólares", currencyCode: "USD", isArchived: false }] as AccountSummary[];
const categories = [{ id: 9, name: "Alimentación", kind: "expense", isActive: true }] as CategorySummary[];
const receipt = { id: 1, movementType: "expense", financialAppKey: "bcp", amount: 12.5,
  currencyCode: "PEN", description: "Tambo", occurredAt: "2026-10-08T02:15:00Z", metadata: null } as DetectedMovementSuggestion;

describe("propuestas de detecciones", () => {
  it("uses the destination account as the income's primary account", () => {
    const draft = buildDetectionDraft({ ...receipt, movementType: "income", metadata: { destinationAccountId: 2 } }, accounts, categories, []);
    expect(draft.accountId).toBe(2); expect(draft.destinationAccountId).toBeNull();
  });
  it("keeps manual fields in remembered drafts while refreshing other learned proposals", () => {
    const baseline = buildDetectionDraft(receipt, accounts, categories, []);
    const current = { ...baseline, accountId: 2, categoryId: 9, manualFields: ["account", "category"] as const };
    const result = applyPersonalProposal({ ...current, manualFields: [...current.manualFields] }, baseline,
      { accountId: 1, categoryId: null, destinationAccountId: null, accountEvidence: "history", destinationEvidence: null },
      { accountId: null, categoryId: 9, destinationAccountId: null }, null);
    expect(result.draft.accountId).toBe(2); expect(result.draft.categoryId).toBe(9);
  });
  it("keeps an explicit destination over a habit but accepts receipt evidence", () => {
    const baseline = buildDetectionDraft({ ...receipt, movementType: "transfer", metadata: { sourceAccountId: 1, destinationAccountId: 2 } }, accounts, categories, []);
    const proposal = { accountId: 1, categoryId: null, destinationAccountId: 3, accountEvidence: "history" as const, destinationEvidence: "history" as const };
    const previous = { accountId: null, categoryId: null, destinationAccountId: null };
    expect(applyPersonalProposal(baseline, baseline, proposal, previous, { sourceAccountId: 1, destinationAccountId: 2 }).draft.destinationAccountId).toBe(2);
    expect(applyPersonalProposal(baseline, baseline, { ...proposal, destinationEvidence: "receipt" }, previous, { sourceAccountId: 1, destinationAccountId: 2 }).draft.destinationAccountId).toBe(3);
  });
  it("pide elegir cuando varias cuentas sirven y no hay configuración", () => {
    const draft = buildDetectionDraft(receipt, accounts, categories, []);
    expect(draft.accountId).toBeNull();
    expect(detectionMissingFields(draft, accounts)).toContain("Elige una cuenta");
    expect(draft.date).toBe("2026-10-07");
    expect(draft.time).toBe("21:15");
  });
  it("usa la cuenta configurada y descarta una de moneda equivocada o archivada", () => {
    const settings = [{ financialAppKey: "bcp" as const, enabled: true, defaultAccountId: 2 }];
    expect(buildDetectionDraft(receipt, accounts, categories, settings).accountId).toBe(2);
    settings[0].defaultAccountId = 3;
    expect(buildDetectionDraft(receipt, accounts, categories, settings).accountId).toBeNull();
    settings[0].defaultAccountId = 2;
    expect(buildDetectionDraft(receipt, accounts.map((a) => ({ ...a, isArchived: a.id === 2 })), categories, settings).accountId).toBe(1);
  });
  it("no inventa destino de transferencia y valida los campos de otra moneda", () => {
    const draft = buildDetectionDraft({ ...receipt, movementType: "transfer", metadata: { sourceAccountId: 1 } }, accounts, categories, []);
    expect(draft.accountId).toBe(1);
    expect(draft.destinationAccountId).toBeNull();
    expect(detectionMissingFields(draft, accounts)).toEqual(["Elige el destino"]);
    draft.destinationAccountId = 3;
    expect(detectionMissingFields(draft, accounts)).toEqual(["Indica cuánto llega", "Revisa el tipo de cambio"]);
    draft.destinationAmount = "3.33"; draft.fxRate = "3.75";
    expect(detectionMissingFields(draft, accounts)).toEqual([]);
  });
  it("no muestra Guardar directo si falta categoría, pero permite revisarla como opcional", () => {
    const draft = buildDetectionDraft({ ...receipt, metadata: { accountId: 1 } }, accounts, categories, []);
    expect(detectionMissingFields(draft, accounts)).toEqual(["Elige una categoría"]);
    expect(detectionMissingFields(draft, accounts, false)).toEqual([]);
  });
  it("propone el cambio persistido al transferir dólares y limpia un destino desconocido", () => {
    const draft = buildDetectionDraft({ ...receipt, movementType: "transfer", currencyCode: "USD", amount: 100, metadata: { sourceAccountId: 3 } }, accounts, categories, []);
    const rates = [{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.75, effectiveAt: "2026-10-07" }] as ExchangeRateSummary[];
    const converted = transferDestinationDraft(draft, 1, accounts, rates, "PEN");
    expect(converted.destinationAmount).toBe("375.00");
    expect(converted.fxRate).toBe("3.75");
    expect(detectionMissingFields(converted, accounts)).toEqual([]);
    const cleared = transferDestinationDraft(converted, null, accounts, rates, "PEN");
    expect(cleared.destinationAmount).toBe("");
    expect(cleared.fxRate).toBe("");
  });
  it("no inventa tipos de cambio si no hay datos persistidos", () => {
    const draft = buildDetectionDraft({ ...receipt, movementType: "transfer", metadata: { sourceAccountId: 1 } }, accounts, categories, []);
    const converted = transferDestinationDraft(draft, 3, accounts, [], "PEN");
    expect(converted.fxRate).toBe("");
    expect(detectionMissingFields(converted, accounts)).toEqual(["Indica cuánto llega", "Revisa el tipo de cambio"]);
  });
});
