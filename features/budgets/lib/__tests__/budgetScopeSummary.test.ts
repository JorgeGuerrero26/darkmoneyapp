import { budgetScopeSummary } from "../budgetScopeSummary";

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
});
