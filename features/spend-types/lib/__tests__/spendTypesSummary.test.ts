import { buildSpendTypesSummary } from "../spendTypesSummary";

describe("buildSpendTypesSummary", () => {
  it("el estado real de hoy: tres tipos y ninguna categoria los usa", () => {
    const s = buildSpendTypesSummary(3, 0, 21);
    expect(s.coverage).toBe(0);
    expect(s.support).toBe("3 tipos. Ninguna de tus 21 categorías dice de qué tipo es todavía.");
  });

  it("a medias dice cuantas van", () => {
    expect(buildSpendTypesSummary(3, 14, 21).support).toBe("3 tipos. 14 de 21 categorías dicen de qué tipo son.");
  });

  it("completo lo celebra sin dar el conteo otra vez", () => {
    const s = buildSpendTypesSummary(3, 21, 21);
    expect(s.coverage).toBe(1);
    expect(s.support).toBe("3 tipos. Todas tus categorías dicen de qué tipo son.");
  });

  it("sin tipos no habla de cobertura: no hay nada con que cubrir", () => {
    expect(buildSpendTypesSummary(0, 0, 21).support).toBe("Sin tipos todavía.");
  });

  it("sin categorias no divide por cero", () => {
    const s = buildSpendTypesSummary(3, 0, 0);
    expect(s.coverage).toBe(0);
    expect(s.support).toContain("Todavía no tienes categorías");
  });

  it("respeta el singular de un tipo suelto", () => {
    expect(buildSpendTypesSummary(1, 0, 21).support).toContain("1 tipo.");
  });
});
