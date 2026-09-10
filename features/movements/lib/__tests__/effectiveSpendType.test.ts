import { buildSpendTypeBreakdown, effectiveSpendTypeId } from "../effectiveSpendType";

/** Alimentación (5) → Necesidad (1); Diversión (9) → Deseo (2); Otros (7) sin defecto. */
const defaults = new Map<number, number | null>([[5, 1], [9, 2], [7, null]]);

describe("effectiveSpendTypeId", () => {
  it("sin tipo propio hereda el de su categoria: por eso el historial cuenta sin re-etiquetar", () => {
    expect(effectiveSpendTypeId({ categoryId: 5 }, defaults)).toBe(1);
  });

  it("el del movimiento manda: la cena cara de Alimentacion es un deseo", () => {
    expect(effectiveSpendTypeId({ categoryId: 5, spendTypeId: 2 }, defaults)).toBe(2);
  });

  it("una categoria sin defecto no inventa tipo", () => {
    expect(effectiveSpendTypeId({ categoryId: 7 }, defaults)).toBeNull();
  });

  it("sin categoria tampoco", () => {
    expect(effectiveSpendTypeId({ categoryId: null }, defaults)).toBeNull();
  });
});

describe("buildSpendTypeBreakdown", () => {
  const movimientos = [
    { categoryId: 5, amount: 300 },                    // necesidad heredada
    { categoryId: 5, amount: 100, spendTypeId: 2 },    // la cena cara: deseo
    { categoryId: 9, amount: 100 },                    // deseo heredado
    { categoryId: null, amount: 100 },                 // sin clasificar
  ];

  it("reparte por el tipo efectivo, no por la categoria", () => {
    const filas = buildSpendTypeBreakdown(movimientos, defaults);
    expect(filas.map((f) => [f.spendTypeId, f.amount])).toEqual([[1, 300], [2, 200], [null, 100]]);
  });

  it("los porcentajes describen el gasto entero", () => {
    const filas = buildSpendTypeBreakdown(movimientos, defaults);
    expect(filas.map((f) => Math.round(f.share * 100))).toEqual([50, 33, 17]);
    expect(filas.reduce((s, f) => s + f.share, 0)).toBeCloseTo(1);
  });

  it("lo sin clasificar va al final aunque pese: es trabajo, no un dato", () => {
    const filas = buildSpendTypeBreakdown(
      [{ categoryId: null, amount: 900 }, { categoryId: 5, amount: 100 }],
      defaults,
    );
    expect(filas[filas.length - 1].spendTypeId).toBeNull();
  });

  it("ignora importes en cero y no divide por cero sin datos", () => {
    expect(buildSpendTypeBreakdown([{ categoryId: 5, amount: 0 }], defaults)).toEqual([]);
  });
});
