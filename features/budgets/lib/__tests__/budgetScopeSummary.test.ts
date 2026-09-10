import { budgetScopeHint, budgetScopeSummary } from "../budgetScopeSummary";

describe("budgetScopeSummary", () => {
  it("una categoria sola", () => {
    expect(budgetScopeSummary("Alimentación", null)).toBe("Alimentación");
  });

  it("una cuenta sola: el presupuesto por cuenta que parecia imposible", () => {
    expect(budgetScopeSummary(null, "Cuenta Sueldo")).toBe("Todo el gasto · Cuenta Sueldo");
  });

  it("las dos juntas", () => {
    expect(budgetScopeSummary("Alimentación", "Cuenta Sueldo")).toBe("Alimentación · Cuenta Sueldo");
  });

  it("ninguna: un tope general, dicho con palabras", () => {
    expect(budgetScopeSummary(null, null)).toBe("Todo el gasto");
  });

  it("un nombre en blanco cuenta como sin elegir", () => {
    expect(budgetScopeSummary("   ", "  ")).toBe("Todo el gasto");
  });

  it("solo el tipo: la regla que la categoria no podia expresar", () => {
    expect(budgetScopeSummary(null, null, "Deseos")).toBe("Deseos");
  });

  it("categoria y tipo juntos acotan de verdad: las cenas caras", () => {
    expect(budgetScopeSummary("Alimentacion", null, "Deseos")).toBe("Alimentacion · Deseos");
  });

  it("las tres mitades del ambito", () => {
    expect(budgetScopeSummary("Alimentacion", "Cuenta Sueldo", "Deseos")).toBe(
      "Alimentacion · Deseos · Cuenta Sueldo",
    );
  });

  it("el tipo en blanco cuenta como sin elegir", () => {
    expect(budgetScopeSummary(null, null, "  ")).toBe("Todo el gasto");
  });
});

describe("budgetScopeHint", () => {
  it("la regla nueva, dicha con verbos", () => {
    expect(budgetScopeHint(null, "Deseos", null)).toBe(
      "Cuenta todo tu gasto que sea deseos, salga de la cuenta que salga.",
    );
  });

  it("categoria y tipo: las cenas caras", () => {
    expect(budgetScopeHint("Alimentacion", "Deseos", null)).toBe(
      "Cuenta lo que gastes en Alimentacion y sea deseos, salga de la cuenta que salga.",
    );
  });

  it("sin nada elegido invita a acotar por las tres vias", () => {
    expect(budgetScopeHint(null, null, null)).toContain("por tipo");
  });

  it("con cuenta, la cuenta cierra la frase", () => {
    expect(budgetScopeHint(null, "Deseos", "Cuenta Sueldo")).toBe(
      "Cuenta todo tu gasto que sea deseos, y solo desde Cuenta Sueldo.",
    );
  });
});
