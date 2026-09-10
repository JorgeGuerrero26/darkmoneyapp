import { buildSpendTypeMix } from "../spendTypeMix";

const soles = (value: number) => `S/ ${value.toFixed(2)}`;
const TIPOS = [
  { id: 1, name: "Necesidades", color: "#86CE96" },
  { id: 2, name: "Ahorro", color: "#9DB2DE" },
  { id: 3, name: "Deseo", color: "#C0A6D8" },
];

describe("buildSpendTypeMix", () => {
  it("sin tipos creados no hay tarjeta", () => {
    const mix = buildSpendTypeMix([{ amount: 100, categoryId: 1 }], new Map(), [], soles);
    expect(mix.state).toBe("hidden");
  });

  /**
   * El estado real del dia que se construyo: tres tipos creados y CERO categorias clasificadas,
   * con S/ 857.25 de gasto en el mes. Sin esta rama la tarjeta dibujaba una barra de un solo
   * color llamada "sin clasificar" — un grafico que no informa nada y ocupa media pantalla.
   */
  it("con tipos pero nada clasificado, invita en vez de dibujar", () => {
    const mix = buildSpendTypeMix(
      [{ amount: 857.25, categoryId: 4 }],
      new Map([[4, null]]),
      TIPOS,
      soles,
    );
    expect(mix.state).toBe("invite");
    if (mix.state === "invite") expect(mix.total).toBeCloseTo(857.25, 2);
  });

  it("los porcentajes son sobre lo clasificado, y la nota dice cuanto falta", () => {
    const mix = buildSpendTypeMix(
      [
        { amount: 600, categoryId: 1 }, // Alimentacion -> necesidad por defecto
        { amount: 200, categoryId: 2 }, // Diversion -> deseo por defecto
        { amount: 200, categoryId: null }, // sin categoria: no hay de donde heredar
      ],
      new Map([[1, 1], [2, 3]]),
      TIPOS,
      soles,
    );
    expect(mix.state).toBe("ready");
    if (mix.state !== "ready") return;
    expect(mix.segments.map((s) => [s.name, Math.round(s.share * 100)])).toEqual([
      ["Necesidades", 75],
      ["Deseo", 25],
    ]);
    expect(mix.classified).toBe(800);
    expect(mix.total).toBe(1000);
    expect(mix.coverage).toBeCloseTo(0.8, 5);
    expect(mix.footnote).toBe("Faltan S/ 200.00 por clasificar.");
  });

  it("el tipo del movimiento le gana al de su categoria", () => {
    const mix = buildSpendTypeMix(
      [
        { amount: 100, categoryId: 1 },
        { amount: 300, categoryId: 1, spendTypeId: 3 }, // la cena cara
      ],
      new Map([[1, 1]]),
      TIPOS,
      soles,
    );
    if (mix.state !== "ready") throw new Error("esperaba ready");
    expect(mix.segments.map((s) => s.name)).toEqual(["Deseo", "Necesidades"]);
    expect(mix.footnote).toBeNull();
  });

  it("todo clasificado no lleva nota al pie", () => {
    const mix = buildSpendTypeMix(
      [{ amount: 50, categoryId: 1 }],
      new Map([[1, 2]]),
      TIPOS,
      soles,
    );
    if (mix.state !== "ready") throw new Error("esperaba ready");
    expect(mix.footnote).toBeNull();
    expect(mix.coverage).toBe(1);
  });
});
