import { formatCurrency, formatCurrencyParts } from "../format-currency";

/**
 * Rediseño fase 6 — jerarquía del monto.
 *
 * La cifra se pinta en tres pesos dentro del MISMO número: símbolo al 43 % en peso medio,
 * enteros al 100 % en tinta plena, decimales al 48 % atenuados. Para eso hay que partirla, y
 * partirla mal significa enseñar una cantidad equivocada — que en una app de finanzas es el
 * peor fallo posible. De ahí que las piezas se prueben por separado de cómo se dibujan.
 */
describe("formatCurrencyParts", () => {
  it("parte soles en simbolo, enteros y decimales", () => {
    const parts = formatCurrencyParts(18420.65, "PEN");
    expect(parts.integer).toBe("18,420");
    expect(parts.fraction).toBe(".65");
    expect(parts.symbol).not.toBe("");
  });

  it("las piezas juntas reconstruyen el formato de siempre", () => {
    for (const amount of [0, 2, 42.9, 1234.56, 18420.65, 999999.99]) {
      for (const code of ["PEN", "USD"]) {
        const parts = formatCurrencyParts(amount, code);
        const rebuilt = (parts.symbol + parts.integer + parts.fraction).replace(/\s/g, "");
        const expected = formatCurrency(Math.abs(amount), code).replace(/\s/g, "");
        expect(rebuilt).toBe(expected);
      }
    }
  });

  it("no arrastra el signo: el prefijo lo decide quien pinta", () => {
    const negative = formatCurrencyParts(-125.5, "PEN");
    const positive = formatCurrencyParts(125.5, "PEN");
    expect(negative.integer).toBe(positive.integer);
    expect(negative.integer).not.toMatch(/[-−]/);
    expect(negative.symbol).not.toMatch(/[-−]/);
  });

  it("siempre deja dos decimales, tambien en cifras redondas", () => {
    expect(formatCurrencyParts(2, "PEN").fraction).toBe(".00");
    expect(formatCurrencyParts(1750, "USD").fraction).toBe(".00");
  });

  it("una moneda desconocida no rompe la cifra", () => {
    const parts = formatCurrencyParts(42.9, "NOPE");
    expect(parts.integer).toBe("42");
    expect(parts.fraction).toBe(".9".padEnd(3, "0"));
    expect(parts.symbol).toBe("NOPE");
  });

  it("los enteros grandes conservan el separador de miles", () => {
    expect(formatCurrencyParts(1234567.89, "PEN").integer).toContain(",");
  });
});
