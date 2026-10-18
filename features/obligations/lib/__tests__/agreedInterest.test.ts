import { agreedInterest } from "../agreedInterest";

describe("interés pactado (total a devolver − monto)", () => {
  it("1500 que se devuelven como 1550: 50 de interés, 3.33 %", () => {
    expect(agreedInterest({ principal: 1500, returnTotal: 1550 })).toEqual({ interestAmount: 50, interestPercent: 3.33, belowPrincipal: false });
  });
  it("sin interés cuando el total es igual al monto (lo que se llena solo)", () => {
    expect(agreedInterest({ principal: 1500, returnTotal: 1500 })).toEqual({ interestAmount: 0, interestPercent: null, belowPrincipal: false });
  });
  it("un total menor que el monto se marca, sin interés", () => {
    expect(agreedInterest({ principal: 1500, returnTotal: 1400 })).toEqual({ interestAmount: 0, interestPercent: null, belowPrincipal: true });
  });
  it("sin monto o sin total no hay nada que calcular", () => {
    expect(agreedInterest({ principal: 0, returnTotal: 100 }).interestAmount).toBe(0);
    expect(agreedInterest({ principal: 100, returnTotal: 0 })).toEqual({ interestAmount: 0, interestPercent: null, belowPrincipal: false });
  });
  it("no acumula errores de coma flotante", () => {
    expect(agreedInterest({ principal: 0.1, returnTotal: 0.3 }).interestAmount).toBe(0.2);
  });
});
