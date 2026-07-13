import { parseMoneyInput, validateArrivalDraft } from "../features/recurring-income/lib/arrival-validation";

const base = {
  date: "2026-07-12",
  actualAmount: 3500,
  accountId: 4,
  baseChangeMode: "none" as const,
  parsedNewBaseAmount: null,
  currentBaseAmount: 3500,
};

describe("validateArrivalDraft", () => {
  it("ok sin cambio de base", () => {
    expect(validateArrivalDraft(base)).toEqual({ ok: true, nextBaseAmount: null });
  });
  it("ok con bonificacion valida (nuevo base mayor)", () => {
    expect(validateArrivalDraft({ ...base, baseChangeMode: "bonus", parsedNewBaseAmount: 3800 }))
      .toEqual({ ok: true, nextBaseAmount: 3800 });
  });
  it("errores: fecha vacia, monto invalido, sin cuenta", () => {
    expect(validateArrivalDraft({ ...base, date: "  " })).toEqual({ ok: false, error: "La fecha real de llegada es obligatoria." });
    expect(validateArrivalDraft({ ...base, actualAmount: null })).toEqual({ ok: false, error: "Ingresa un monto real mayor a 0." });
    expect(validateArrivalDraft({ ...base, accountId: null })).toEqual({ ok: false, error: "Elige la cuenta destino para registrar el movimiento." });
  });
  it("errores de cambio de base: sin nuevo monto, bonus no mayor, descuento no menor", () => {
    expect(validateArrivalDraft({ ...base, baseChangeMode: "bonus", parsedNewBaseAmount: null }))
      .toEqual({ ok: false, error: "Ingresa el nuevo monto base para las próximas llegadas." });
    expect(validateArrivalDraft({ ...base, baseChangeMode: "bonus", parsedNewBaseAmount: 3500 }))
      .toEqual({ ok: false, error: "Si hubo bonificación permanente, el nuevo monto base debe ser mayor al actual." });
    expect(validateArrivalDraft({ ...base, baseChangeMode: "discount", parsedNewBaseAmount: 3500 }))
      .toEqual({ ok: false, error: "Si hubo descuento permanente, el nuevo monto base debe ser menor al actual." });
  });
});

describe("parseMoneyInput", () => {
  it("parsea montos positivos y rechaza invalidos", () => {
    expect(parseMoneyInput("3500")).toBe(3500);
    expect(parseMoneyInput("0")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });
});
