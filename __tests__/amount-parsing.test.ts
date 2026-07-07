import { parseAmountInput, parsePositiveAmountInput } from "../lib/amount-parsing";

describe("parseAmountInput", () => {
  test("decimales simples con punto y coma", () => {
    expect(parseAmountInput("67.50")).toBe(67.5);
    expect(parseAmountInput("67,50")).toBe(67.5);
    expect(parseAmountInput("67,5")).toBe(67.5);
  });

  test("símbolos de moneda y espacios se ignoran", () => {
    expect(parseAmountInput("S/ 1 234,56")).toBe(1234.56);
    expect(parseAmountInput("US$ 99.99")).toBe(99.99);
  });

  test("miles formato US y europeo (regla: el último separador es el decimal)", () => {
    expect(parseAmountInput("1,234.56")).toBe(1234.56);
    expect(parseAmountInput("1.234,56")).toBe(1234.56);
    expect(parseAmountInput("1.234.567")).toBe(1234567);
  });

  test('"1,234" como monto es miles; como rate es decimal', () => {
    expect(parseAmountInput("1,234")).toBe(1234);
    expect(parseAmountInput("3,672", { kind: "rate" })).toBe(3.672);
  });

  test("agrupaciones inválidas se rechazan", () => {
    expect(parseAmountInput("1.23.4,5")).toBeNull();
    expect(parseAmountInput("12.3456,7")).toBeNull();
  });

  test("entradas sin dígitos o vacías", () => {
    expect(parseAmountInput("")).toBeNull();
    expect(parseAmountInput("S/")).toBeNull();
    expect(parseAmountInput(null)).toBeNull();
    expect(parseAmountInput(undefined)).toBeNull();
  });

  test("negativos conservan el signo", () => {
    expect(parseAmountInput("-25.50")).toBe(-25.5);
  });
});

describe("parsePositiveAmountInput", () => {
  test("rechaza cero y negativos", () => {
    expect(parsePositiveAmountInput("0")).toBeNull();
    expect(parsePositiveAmountInput("-10")).toBeNull();
    expect(parsePositiveAmountInput("10")).toBe(10);
  });
});
