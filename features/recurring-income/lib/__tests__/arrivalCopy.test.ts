import {
  arrivalConfirmLabel,
  arrivalConfirmSentence,
  arrivalDiffSentence,
} from "../arrivalCopy";

const money = (amount: number) => `S/ ${amount.toFixed(2)}`;

describe("arrivalConfirmSentence", () => {
  it("afirma lo que va a pasar, en vez de preguntarlo en cuatro campos", () => {
    expect(arrivalConfirmSentence({ accountName: "Cuenta Sueldo", dateLabel: "29 jul" }))
      .toBe("Se anota como ingreso en Cuenta Sueldo, con fecha 29 jul.");
  });

  it("sin cuenta lo dice, en vez de afirmar algo que no puede cumplir", () => {
    expect(arrivalConfirmSentence({ accountName: null, dateLabel: "29 jul" }))
      .toBe("Se anota como ingreso con fecha 29 jul. Falta elegir la cuenta.");
  });

  it("una cuenta en blanco cuenta como sin cuenta", () => {
    expect(arrivalConfirmSentence({ accountName: "   ", dateLabel: "29 jul" }))
      .toContain("Falta elegir la cuenta");
  });
});

describe("arrivalDiffSentence", () => {
  it("dice cuanto y hacia que lado", () => {
    expect(arrivalDiffSentence(2780, 2630.5, money)).toBe("S/ 149.50 más que lo esperado.");
    expect(arrivalDiffSentence(2500, 2630.5, money)).toBe("S/ 130.50 menos que lo esperado.");
  });

  it("lo esperado exacto no gasta una linea", () => {
    expect(arrivalDiffSentence(2630.5, 2630.5, money)).toBe("");
  });
});

describe("arrivalConfirmLabel", () => {
  it("el caso normal no repite la cifra: ya esta arriba", () => {
    expect(arrivalConfirmLabel(2630.5, 2630.5, money)).toBe("Confirmar llegada");
  });

  it("si el monto cambio, el boton dice el que se va a guardar", () => {
    expect(arrivalConfirmLabel(2780, 2630.5, money)).toBe("Confirmar S/ 2780.00");
  });

  it("sin monto valido no promete una cifra", () => {
    expect(arrivalConfirmLabel(null, 2630.5, money)).toBe("Confirmar llegada");
  });
});
