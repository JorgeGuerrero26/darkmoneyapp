import { buildMovementCreateInput } from "../movement-save-contract";

/**
 * Un ingreso dividido tiene que repartir por el lado que entra.
 *
 * El submit ponía la cifra de cada línea en `sourceAmount` porque la división solo existía para
 * gastos. Al habilitarla para ingresos —fase 38— eso habría guardado cada parte con el monto en
 * el lado equivocado: el builder anula `sourceAmount` en un ingreso, así que las partes se
 * habrían creado en cero, sin error y sin que nada lo dijera.
 */
const base = {
  movementType: "income" as const,
  status: "posted" as const,
  occurredAt: "2026-09-09T12:00:00.000Z",
  description: "Pago de Kevin",
  notes: null,
  sourceAccountId: null,
  sourceAmount: 0,
  destinationAccountId: 4,
  destinationAmount: 690,
  transferCurrenciesDiffer: false,
  fxRate: null,
  categoryId: 5,
  counterpartyId: null,
};

describe("ingreso dividido", () => {
  it("cada parte lleva su monto en la cuenta que RECIBE", () => {
    const parte = buildMovementCreateInput({ ...base, destinationAmount: 650, categoryId: 7 });
    expect(parte.destinationAmount).toBe(650);
    expect(parte.destinationAccountId).toBe(4);
    expect(parte.categoryId).toBe(7);
  });

  it("y el lado que sale queda vacio, no en cero enganoso", () => {
    const parte = buildMovementCreateInput({ ...base, destinationAmount: 40 });
    expect(parte.sourceAmount).toBeNull();
    expect(parte.sourceAccountId).toBeNull();
  });

  it("un gasto dividido sigue repartiendo por el lado que sale", () => {
    const parte = buildMovementCreateInput({
      ...base,
      movementType: "expense",
      sourceAccountId: 2,
      sourceAmount: 62.4,
      destinationAccountId: null,
      destinationAmount: 0,
    });
    expect(parte.sourceAmount).toBe(62.4);
    expect(parte.destinationAmount).toBeNull();
  });

  it("las dos partes del mockup BK suman el total del movimiento", () => {
    const partes = [650, 40].map((amount) => buildMovementCreateInput({ ...base, destinationAmount: amount }));
    const suma = partes.reduce((total, parte) => total + (parte.destinationAmount ?? 0), 0);
    expect(suma).toBe(690);
  });
});
