import { currentDebt, describeCycle, hasCycle, nextPaymentDate } from "../creditCardCycle";

describe("hasCycle", () => {
  it("solo una tarjeta con día de pago tiene ciclo", () => {
    expect(hasCycle({ type: "credit_card", paymentDay: 15 })).toBe(true);
    expect(hasCycle({ type: "credit_card", paymentDay: null })).toBe(false);
    expect(hasCycle({ type: "bank", paymentDay: 15 })).toBe(false);
  });
});

describe("describeCycle", () => {
  it("con corte y pago los nombra a los dos", () => {
    expect(describeCycle({ type: "credit_card", statementDay: 25, paymentDay: 15 })).toBe("Corte 25 · pagas 15");
  });

  it("sin corte sigue diciendo lo que mueve la plata", () => {
    // Decir "Corte — · pagas 15" sería peor que callar la mitad que falta.
    expect(describeCycle({ type: "credit_card", statementDay: null, paymentDay: 15 })).toBe("Pagas el 15");
  });

  it("solo con corte dice el corte", () => {
    expect(describeCycle({ type: "credit_card", statementDay: 25, paymentDay: null })).toBe("Corte 25");
  });

  it("calla cuando no hay ciclo o no es tarjeta", () => {
    expect(describeCycle({ type: "credit_card", statementDay: null, paymentDay: null })).toBeNull();
    expect(describeCycle({ type: "bank", statementDay: 25, paymentDay: 15 })).toBeNull();
  });
});

describe("nextPaymentDate", () => {
  const on = (iso: string) => new Date(`${iso}T12:00:00`);

  it("si el día aún no llegó, es este mes", () => {
    expect(nextPaymentDate(15, on("2026-09-10"))).toEqual(new Date(2026, 8, 15));
  });

  it("el mismo día cuenta como hoy, no como el mes siguiente", () => {
    expect(nextPaymentDate(15, on("2026-09-15"))).toEqual(new Date(2026, 8, 15));
  });

  it("si ya pasó, salta al mes siguiente", () => {
    expect(nextPaymentDate(15, on("2026-09-16"))).toEqual(new Date(2026, 9, 15));
  });

  it("el día 31 cae el 28 en febrero y vuelve al 31 en marzo", () => {
    expect(nextPaymentDate(31, on("2027-02-01"))).toEqual(new Date(2027, 1, 28));
    expect(nextPaymentDate(31, on("2027-03-01"))).toEqual(new Date(2027, 2, 31));
  });

  it("año bisiesto: el 30 cae el 29", () => {
    expect(nextPaymentDate(30, on("2028-02-01"))).toEqual(new Date(2028, 1, 29));
  });

  it("cruza el año", () => {
    expect(nextPaymentDate(5, on("2026-12-20"))).toEqual(new Date(2027, 0, 5));
  });

  it("un día imposible no devuelve una fecha inventada", () => {
    expect(nextPaymentDate(0, on("2026-09-10"))).toBeNull();
    expect(nextPaymentDate(32, on("2026-09-10"))).toBeNull();
    expect(nextPaymentDate(Number.NaN, on("2026-09-10"))).toBeNull();
  });
});

describe("currentDebt", () => {
  it("el saldo negativo es lo que debes", () => {
    expect(currentDebt(-872)).toBe(872);
  });

  it("un saldo a favor no es deuda", () => {
    expect(currentDebt(120)).toBe(0);
    expect(currentDebt(0)).toBe(0);
    expect(currentDebt(null)).toBe(0);
  });
});
