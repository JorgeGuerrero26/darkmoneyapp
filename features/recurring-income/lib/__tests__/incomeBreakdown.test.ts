import {
  availableShortcuts,
  collectDeductions,
  deductionsTotal,
  describeVerdict,
  parseMoney,
  toDrafts,
  verifyBreakdown,
  type DeductionDraft,
} from "../incomeBreakdown";

const money = (value: number) => `S/ ${value.toFixed(2)}`;
const draft = (key: string, name: string, amount: string): DeductionDraft => ({ key, name, amount });

describe("collectDeductions", () => {
  it("recoge las filas completas", () => {
    expect(collectDeductions([draft("1", "AFP", "585"), draft("2", "Renta 5ta", "256")])).toEqual([
      { name: "AFP", amount: 585 },
      { name: "Renta 5ta", amount: 256 },
    ]);
  });

  it("una fila a medio llenar todavía no dice nada: se descarta sin avisar", () => {
    const rows = [draft("1", "AFP", "585"), draft("2", "EPS", ""), draft("3", "", "40"), draft("4", "  ", "  ")];
    expect(collectDeductions(rows)).toEqual([{ name: "AFP", amount: 585 }]);
  });

  it("descarta montos no positivos o ilegibles", () => {
    const rows = [draft("1", "AFP", "0"), draft("2", "ONP", "-30"), draft("3", "EPS", "abc")];
    expect(collectDeductions(rows)).toEqual([]);
  });

  it("acepta la coma decimal, que es como se teclea aquí", () => {
    expect(parseMoney("585,50")).toBe(585.5);
    expect(collectDeductions([draft("1", "AFP", "585,50")])).toEqual([{ name: "AFP", amount: 585.5 }]);
  });
});

describe("deductionsTotal", () => {
  it("suma sin arrastrar el error del punto flotante", () => {
    expect(deductionsTotal([{ name: "a", amount: 0.1 }, { name: "b", amount: 0.2 }])).toBe(0.3);
  });

  it("sin descuentos es cero", () => {
    expect(deductionsTotal([])).toBe(0);
  });
});

describe("verifyBreakdown", () => {
  const afpYRenta = [
    { name: "AFP", amount: 585 },
    { name: "Renta 5ta", amount: 256 },
  ];

  it("sin bruto no hay nada que cuadrar", () => {
    expect(verifyBreakdown(null, afpYRenta, 3659)).toEqual({ status: "empty" });
    expect(verifyBreakdown(0, afpYRenta, 3659)).toEqual({ status: "empty" });
  });

  it("el caso que cuadra", () => {
    expect(verifyBreakdown(4500, afpYRenta, 3659)).toEqual({ status: "matches", net: 3659 });
  });

  it("una diferencia de céntimos es redondeo, no un descuadre", () => {
    expect(verifyBreakdown(4500, afpYRenta, 3659.004)).toEqual({ status: "matches", net: 3659 });
  });

  it("dice cuánto y hacia qué lado difiere", () => {
    expect(verifyBreakdown(4500, afpYRenta, 3646.6)).toEqual({
      status: "differs",
      net: 3659,
      difference: 12.4,
    });
    expect(verifyBreakdown(4500, afpYRenta, 3700)).toMatchObject({ status: "differs", difference: -41 });
  });

  it("nunca devuelve un veredicto que impida guardar", () => {
    // El peor caso posible sigue siendo información, no un bloqueo.
    const verdict = verifyBreakdown(100, [{ name: "x", amount: 9999 }], 3659);
    expect(verdict.status).toBe("differs");
  });
});

describe("describeVerdict", () => {
  it("callado cuando no hay bruto", () => {
    expect(describeVerdict({ status: "empty" }, money)).toBeNull();
  });

  it("confirma el cuadre", () => {
    expect(describeVerdict({ status: "matches", net: 3659 }, money)).toContain("Coincide");
  });

  it("nombra el monto y el sentido de la diferencia", () => {
    expect(describeVerdict({ status: "differs", net: 3659, difference: 12.4 }, money)).toBe(
      "El desglose da S/ 12.40 más de lo que llega.",
    );
    expect(describeVerdict({ status: "differs", net: 3659, difference: -12.4 }, money)).toBe(
      "El desglose da S/ 12.40 menos de lo que llega.",
    );
  });
});

describe("availableShortcuts", () => {
  it("los conceptos ya usados salen de la fila", () => {
    const shortcuts = availableShortcuts([draft("1", "AFP", "585"), draft("2", "Renta 5ta", "256")]);
    expect(shortcuts).toEqual(["ONP", "EPS", "Préstamo", "Otro"]);
  });

  it("ignora mayúsculas y espacios al comparar", () => {
    expect(availableShortcuts([draft("1", "  afp  ", "585")])).not.toContain("AFP");
  });

  it("\"Otro\" nunca se gasta: no nombra un concepto, abre una fila en blanco", () => {
    const shortcuts = availableShortcuts([draft("1", "Otro", "10"), draft("2", "AFP", "585")]);
    expect(shortcuts).toContain("Otro");
  });

  it("sin nada usado están todos", () => {
    expect(availableShortcuts([])).toEqual(["AFP", "ONP", "Renta 5ta", "EPS", "Préstamo", "Otro"]);
  });
});

describe("toDrafts", () => {
  const key = (index: number) => `k${index}`;

  it("lo guardado vuelve editable", () => {
    expect(toDrafts([{ name: "AFP", amount: 585 }], key)).toEqual([{ key: "k0", name: "AFP", amount: "585.00" }]);
  });

  it("un valor corrupto no rompe el formulario, se ignora", () => {
    const stored = [{ name: "AFP", amount: 585 }, { name: "", amount: 10 }, { name: "X", amount: 0 }, null, "texto"];
    expect(toDrafts(stored, key)).toEqual([{ key: "k0", name: "AFP", amount: "585.00" }]);
  });

  it("lo que no es una lista devuelve vacío", () => {
    expect(toDrafts(null, key)).toEqual([]);
    expect(toDrafts({ name: "AFP" }, key)).toEqual([]);
  });
});
