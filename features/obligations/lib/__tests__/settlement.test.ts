import { describeOverpayment, isSettled, settlesObligation, SETTLEMENT_TOLERANCE } from "../settlement";

const money = (amount: number) => `S/ ${amount.toFixed(2)}`;

describe("isSettled", () => {
  it("cero es saldado", () => {
    expect(isSettled(0)).toBe(true);
  });

  it("un centimo de redondeo cuenta como saldado", () => {
    expect(isSettled(SETTLEMENT_TOLERANCE)).toBe(true);
    expect(isSettled(0.005)).toBe(true);
  });

  it("un centimo de verdad no lo es", () => {
    expect(isSettled(0.01)).toBe(false);
  });
});

describe("settlesObligation", () => {
  it("el pago exacto liquida", () => {
    expect(settlesObligation(280, 280)).toBe(true);
  });

  it("el pago parcial no", () => {
    expect(settlesObligation(100, 280)).toBe(false);
  });

  it("de mas tambien liquida (aunque el guardia lo rechace antes)", () => {
    expect(settlesObligation(300, 280)).toBe(true);
  });
});

describe("describeOverpayment", () => {
  it("deja pasar lo que cabe", () => {
    expect(describeOverpayment({ amount: 100, pendingAmount: 280, formatAmount: money })).toBeNull();
  });

  it("deja pasar el pago exacto", () => {
    expect(describeOverpayment({ amount: 280, pendingAmount: 280, formatAmount: money })).toBeNull();
  });

  it("deja pasar el centimo de redondeo", () => {
    expect(describeOverpayment({ amount: 280.005, pendingAmount: 280, formatAmount: money })).toBeNull();
  });

  it("frena el sobrepago y dice el maximo", () => {
    expect(describeOverpayment({ amount: 300, pendingAmount: 280, formatAmount: money }))
      .toBe("Es más de lo que queda por cubrir. El pago máximo es S/ 280.00.");
  });

  it("usa el sustantivo de quien cobra", () => {
    expect(describeOverpayment({ amount: 300, pendingAmount: 280, formatAmount: money, noun: "cobro" }))
      .toContain("El cobro máximo es S/ 280.00.");
  });

  it("sobre una cuenta ya saldada lo dice sin dar un maximo de cero", () => {
    expect(describeOverpayment({ amount: 50, pendingAmount: 0, formatAmount: money }))
      .toBe("Esta cuenta ya está saldada: no queda nada por cubrir.");
  });

  it("ignora montos vacios o invalidos: de eso ya avisa la validacion del campo", () => {
    expect(describeOverpayment({ amount: 0, pendingAmount: 280, formatAmount: money })).toBeNull();
    expect(describeOverpayment({ amount: Number.NaN, pendingAmount: 280, formatAmount: money })).toBeNull();
  });
});
