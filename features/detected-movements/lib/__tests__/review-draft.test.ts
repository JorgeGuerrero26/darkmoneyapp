/** @jest-environment node */
import { buildDetectionDraft, detectionMissingFields } from "../review-draft";
import type { AccountSummary, CategorySummary } from "../../../../types/domain";
import type { DetectedMovementSuggestion } from "../../../../services/queries/notification-detection";

const accounts = [{ id: 1, name: "Sueldo", currencyCode: "PEN", isArchived: false },
  { id: 2, name: "Principal", currencyCode: "PEN", isArchived: false },
  { id: 3, name: "Dólares", currencyCode: "USD", isArchived: false }] as AccountSummary[];
const categories = [{ id: 9, name: "Alimentación", kind: "expense", isActive: true }] as CategorySummary[];
const receipt = { id: 1, movementType: "expense", financialAppKey: "bcp", amount: 12.5,
  currencyCode: "PEN", description: "Tambo", occurredAt: "2026-10-08T02:15:00Z", metadata: null } as DetectedMovementSuggestion;

describe("propuestas de detecciones", () => {
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
});
