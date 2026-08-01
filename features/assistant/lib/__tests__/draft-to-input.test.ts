import { draftDedupeKey, draftToMovementInput } from "../draft-to-input";
import type { AssistantDraft } from "../../../../services/queries/assistant";

const base: AssistantDraft = {
  operation: "expense",
  amount: 5,
  currency: "PEN",
  accountName: "Cuenta Principal",
  destinationAccountName: null,
  categoryName: "Transporte",
  counterpartyName: null,
  subscriptionId: null,
  subscriptionName: null,
  obligationId: null,
  obligationCounterparty: null,
  occurredAt: null,
  description: "Taxi",
  missing: [],
};

const ids = { sourceAccountId: 1, categoryId: 9, counterpartyId: null, todayIso: "2026-07-21T12:00:00.000Z" };

describe("draftToMovementInput", () => {
  it("gasto → source y dedupe con fecha de hoy", () => {
    const input = draftToMovementInput(base, ids);
    expect(input.movementType).toBe("expense");
    expect(input.sourceAccountId).toBe(1);
    expect(input.sourceAmount).toBe(5);
    expect(input.categoryId).toBe(9);
    expect(input.destinationAccountId).toBeNull();
    expect(input.dedupeKey).toMatch(/^assistant:/);
    expect(input.occurredAt).toBe("2026-07-21T12:00:00.000Z");
  });

  it("ingreso → el destino recibe el monto", () => {
    const input = draftToMovementInput({ ...base, operation: "income" }, ids);
    expect(input.movementType).toBe("income");
    expect(input.destinationAccountId).toBe(1);
    expect(input.destinationAmount).toBe(5);
    expect(input.sourceAccountId).toBeNull();
  });

  it("transfer → source y destination, sin categoría", () => {
    const input = draftToMovementInput(
      { ...base, operation: "transfer", destinationAccountName: "Interbank" },
      { ...ids, destinationAccountId: 2 },
    );
    expect(input.sourceAccountId).toBe(1);
    expect(input.destinationAccountId).toBe(2);
    expect(input.sourceAmount).toBe(5);
    expect(input.destinationAmount).toBe(5);
    expect(input.categoryId).toBeNull();
  });

  it("occurredAt del draft se respeta (mediodía para evitar corrimiento de día)", () => {
    const input = draftToMovementInput({ ...base, occurredAt: "2026-06-01" }, ids);
    expect(input.occurredAt).toBe("2026-06-01T12:00:00.000Z");
  });

  it("dedupeKey es estable para el mismo draft", () => {
    expect(draftDedupeKey(base)).toBe(draftDedupeKey({ ...base }));
  });
});
