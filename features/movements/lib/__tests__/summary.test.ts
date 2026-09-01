import { summarizeMovements } from "../summary";

describe("lo que entró y lo que salió", () => {
  it("un cobro de obligación es plata que entra, no un gasto de cero", () => {
    // Movimientos 1079 y 1080 de producción, el 31 de agosto: cobros de una deuda.
    // `source_amount` es null porque no salió plata; el resumen los contaba como gasto y
    // sumaba su `sourceAmount ?? 0`, así que los 720 soles no aparecían en ningún total.
    const summary = summarizeMovements([
      { movementType: "obligation_payment", sourceAmount: null, destinationAmount: 690 },
      { movementType: "obligation_payment", sourceAmount: null, destinationAmount: 30 },
      { movementType: "expense", sourceAmount: 30, destinationAmount: null },
      { movementType: "expense", sourceAmount: 1.5, destinationAmount: null },
      { movementType: "expense", sourceAmount: 2, destinationAmount: null },
    ]);
    expect(summary.incomeTotal).toBe(720);
    expect(summary.expenseTotal).toBe(33.5);
    expect(summary.net).toBe(686.5);
    expect(summary.incomeCount).toBe(2);
    expect(summary.expenseCount).toBe(3);
  });

  it("pagar una deuda propia sí es plata que sale", () => {
    const summary = summarizeMovements([
      { movementType: "obligation_payment", sourceAmount: 350, destinationAmount: null },
    ]);
    expect(summary.expenseTotal).toBe(350);
    expect(summary.incomeTotal).toBe(0);
  });

  it("las transferencias no suman ni restan", () => {
    const summary = summarizeMovements([
      { movementType: "transfer", sourceAmount: 500, destinationAmount: 500 },
    ]);
    expect(summary).toEqual({
      incomeTotal: 0,
      expenseTotal: 0,
      incomeCount: 0,
      expenseCount: 0,
      net: 0,
    });
  });

  it("una devolución entra y la apertura de una deuda sale", () => {
    const summary = summarizeMovements([
      { movementType: "refund", sourceAmount: null, destinationAmount: 40 },
      { movementType: "obligation_opening", sourceAmount: 1002, destinationAmount: null },
    ]);
    expect(summary.incomeTotal).toBe(40);
    expect(summary.expenseTotal).toBe(1002);
    expect(summary.net).toBe(-962);
  });

  it("convierte desde la moneda base a la que se está mostrando", () => {
    const summary = summarizeMovements(
      [
        { movementType: "income", destinationAmount: 100, destinationAmountInBaseCurrency: 380 },
        { movementType: "expense", sourceAmount: 50, sourceAmountInBaseCurrency: 190 },
      ],
      0.5,
    );
    expect(summary.incomeTotal).toBe(190);
    expect(summary.expenseTotal).toBe(95);
  });
});
