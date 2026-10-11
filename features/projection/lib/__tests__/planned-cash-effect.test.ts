import { plannedCashEffect as appEffect } from "../planned-cash-effect";
import { plannedCashEffect as denoEffect } from "../../../../supabase/functions/_shared/cashflow-calendar";

const types = new Map<number, string>([
  [1, "bank"],
  [2, "savings"],
  [3, "investment"],
  [4, "credit_card"],
]);

const transfer = (from: number, to: number, amount = 500) => ({
  movementType: "transfer",
  sourceAccountId: from,
  destinationAccountId: to,
  sourceAmount: amount,
  destinationAmount: amount,
});

describe.each([
  ["app", appEffect],
  ["asistente", denoEffect],
])("plannedCashEffect (%s)", (_name, effect) => {
  it("el aporte a una cuenta de inversión sale de la caja", () => {
    expect(effect(transfer(1, 3), types)).toEqual({ signedAmount: -500, accountId: 1 });
  });

  it("rescatar de inversión a una cuenta líquida vuelve a la caja", () => {
    expect(effect(transfer(3, 1, 800), types)).toEqual({ signedAmount: 800, accountId: 1 });
  });

  it("entre cuentas líquidas no cambia la caja", () => {
    expect(effect(transfer(1, 2), types)).toBeNull();
  });

  it("hacia una tarjeta no se cuenta: su pago ya sale por el ciclo de la tarjeta", () => {
    expect(effect(transfer(1, 4), types)).toBeNull();
  });

  it("sin conocer el tipo de una cuenta no inventa un efecto", () => {
    expect(effect(transfer(1, 99), types)).toBeNull();
  });

  it("un gasto o un ingreso conservan su signo", () => {
    expect(effect({ movementType: "expense", sourceAccountId: 1, sourceAmount: 40 }, types)).toEqual({
      signedAmount: -40,
      accountId: 1,
    });
    expect(effect({ movementType: "income", destinationAccountId: 2, destinationAmount: 90 }, types)).toEqual({
      signedAmount: 90,
      accountId: 2,
    });
  });
});
