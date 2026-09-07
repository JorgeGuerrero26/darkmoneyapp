import { parseMoneyInput, validateArrivalDraft } from "../features/recurring-income/lib/arrival-validation";

const base = {
  date: "2026-07-12",
  actualAmount: 3500,
  accountId: 4,
  baseChangeMode: "once" as const,
  currentBaseAmount: 3500,
};

describe("validateArrivalDraft", () => {
  it("una llegada normal no toca lo que se espera de las proximas", () => {
    expect(validateArrivalDraft(base)).toEqual({ ok: true, nextBaseAmount: null });
  });

  it("solo esta vez: llego otro monto y el esperado se queda como estaba", () => {
    expect(validateArrivalDraft({ ...base, actualAmount: 3800 }))
      .toEqual({ ok: true, nextBaseAmount: null });
  });

  it("desde ahora: lo que se espera pasa a ser lo que acaba de llegar", () => {
    // Ya no se pide un "nuevo monto base" aparte: si dice que de ahora en adelante llega esto,
    // lo que llega ES lo que declaró arriba.
    expect(validateArrivalDraft({ ...base, actualAmount: 3800, baseChangeMode: "forever" }))
      .toEqual({ ok: true, nextBaseAmount: 3800 });
  });

  it("desde ahora sin diferencia no cambia nada: seria el mismo monto", () => {
    expect(validateArrivalDraft({ ...base, baseChangeMode: "forever" }))
      .toEqual({ ok: true, nextBaseAmount: null });
  });

  it("y tampoco por un redondeo de centimos", () => {
    expect(validateArrivalDraft({ ...base, actualAmount: 3500.001, baseChangeMode: "forever" }))
      .toEqual({ ok: true, nextBaseAmount: null });
  });

  it("errores: fecha vacia, monto invalido, sin cuenta", () => {
    expect(validateArrivalDraft({ ...base, date: "  " })).toEqual({ ok: false, error: "La fecha real de llegada es obligatoria." });
    expect(validateArrivalDraft({ ...base, actualAmount: null })).toEqual({ ok: false, error: "Ingresa un monto real mayor a 0." });
    expect(validateArrivalDraft({ ...base, accountId: null })).toEqual({ ok: false, error: "Elige la cuenta destino para registrar el movimiento." });
  });
});

describe("parseMoneyInput", () => {
  it("parsea montos positivos y rechaza invalidos", () => {
    expect(parseMoneyInput("3500")).toBe(3500);
    expect(parseMoneyInput("0")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
  });
});
