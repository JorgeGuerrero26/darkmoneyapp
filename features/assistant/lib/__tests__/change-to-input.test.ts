import type { MovementChange } from "../../../../services/queries/assistant";
import { movementChangeLines, movementChangeToUpdate } from "../change-to-input";

const base = {
  movementId: 7,
  currency: "PEN",
  before: {
    amount: 20,
    description: "Taxi",
    categoryName: "Transporte",
    accountName: "BCP",
    counterpartyName: null,
    date: "2026-10-20",
  },
};
const money = (amount: number) => `S/ ${amount.toFixed(2)}`;

describe("movementChangeToUpdate", () => {
  it("en un gasto el monto y la cuenta van del lado de origen", () => {
    const change: MovementChange = {
      ...base,
      action: "update",
      movementType: "expense",
      after: { amount: 25, accountId: 3, accountName: "Efectivo" },
    };
    expect(movementChangeToUpdate(change)).toEqual({ sourceAmount: 25, sourceAccountId: 3 });
  });

  it("en un ingreso van del lado de destino", () => {
    const change: MovementChange = {
      ...base,
      action: "update",
      movementType: "income",
      after: { amount: 500, accountId: 4, accountName: "Ahorros" },
    };
    expect(movementChangeToUpdate(change)).toEqual({ destinationAmount: 500, destinationAccountId: 4 });
  });

  it("solo manda lo que cambia, nunca el tipo", () => {
    const change: MovementChange = {
      ...base,
      action: "update",
      movementType: "expense",
      after: { categoryId: 9, categoryName: "Comida", occurredAt: "2026-10-19T17:00:00.000Z", date: "2026-10-19" },
    };
    const input = movementChangeToUpdate(change);
    expect(input).toEqual({ categoryId: 9, occurredAt: "2026-10-19T17:00:00.000Z" });
    expect(input).not.toHaveProperty("movementType");
  });
});

describe("movementChangeLines", () => {
  it("una corrección muestra antes → ahora y de qué movimiento se trata", () => {
    const change: MovementChange = { ...base, action: "update", movementType: "expense", after: { amount: 25 } };
    expect(movementChangeLines(change, money)).toEqual([
      { label: "Monto", value: "S/ 20.00 → S/ 25.00" },
      { label: "Movimiento", value: "Taxi" },
      { label: "Del", value: "2026-10-20" },
    ]);
  });

  it("un borrado muestra lo que identifica al movimiento", () => {
    const change: MovementChange = { ...base, action: "delete", movementType: "expense", after: {} };
    expect(movementChangeLines(change, money)).toEqual([
      { label: "Fecha", value: "2026-10-20" },
      { label: "Detalle", value: "Taxi" },
      { label: "Categoría", value: "Transporte" },
      { label: "Cuenta", value: "BCP" },
    ]);
  });
});
