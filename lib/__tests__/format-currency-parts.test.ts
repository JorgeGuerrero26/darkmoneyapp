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

/**
 * Regresion del iPhone: la fila mostraba "PEN 42.90" mientras el encabezado del dia, a dos
 * centimetros, mostraba "S/ 168.40".
 *
 * Causa: `formatCurrencyParts` usaba `Intl.formatToParts` y `formatCurrency` usa `format()`.
 * En Node las dos devuelven "S/" — por eso los tests pasaban —, pero el ICU recortado de
 * Hermes hace que `formatToParts` devuelva el CODIGO de la moneda. Un test que solo mire las
 * piezas por separado nunca lo detecta; hay que atarlas al texto que ya funciona.
 */
describe("las piezas salen del mismo sitio que la cifra de siempre", () => {
  it("el simbolo es exactamente el que usa formatCurrency", () => {
    for (const code of ["PEN", "USD"]) {
      const parts = formatCurrencyParts(1234.56, code);
      const soloSimbolo = formatCurrency(1234.56, code).replace(/[\d.,\s]/g, "");
      expect(parts.symbol.replace(/\s/g, "")).toBe(soloSimbolo);
    }
  });

  it("nunca devuelve el codigo cuando la moneda tiene simbolo propio", () => {
    expect(formatCurrencyParts(23.8, "PEN").symbol).not.toBe("PEN");
  });

  it("el simbolo no arrastra digitos ni separadores", () => {
    const { symbol } = formatCurrencyParts(1234.56, "PEN");
    expect(symbol).not.toMatch(/\d/);
    expect(symbol).not.toMatch(/[.,]/);
  });
});
