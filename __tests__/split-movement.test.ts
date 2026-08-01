import {
  hasSplitGroup,
  splitLineDescription,
  splitLineMetadata,
  validateSplit,
} from "../features/movements/lib/split-movement";

const line = (categoryId: number | null, amount: string) => ({ categoryId, amount });

describe("validateSplit", () => {
  test("split válido: suma exacta con categorías en todas las líneas", () => {
    const result = validateSplit([line(1, "60"), line(2, "40")], 100);
    expect(result.valid).toBe(true);
    expect(result.remaining).toBe(0);
  });

  test("acepta decimales con coma y tolera redondeo de centavos", () => {
    expect(validateSplit([line(1, "33,33"), line(2, "66,67")], 100).valid).toBe(true);
    expect(validateSplit([line(1, "33.33"), line(2, "66.66")], 100).valid).toBe(false);
  });

  test("reporta cuánto falta o cuánto sobra", () => {
    const missing = validateSplit([line(1, "60"), line(2, "30")], 100);
    expect(missing.valid).toBe(false);
    expect(missing.remaining).toBe(10);
    expect(missing.error).toContain("Faltan 10.00");

    const over = validateSplit([line(1, "60"), line(2, "50")], 100);
    expect(over.valid).toBe(false);
    expect(over.error).toContain("pasaste por 10.00");
  });

  test("cada línea necesita monto positivo y categoría", () => {
    expect(validateSplit([line(1, ""), line(2, "40")], 100).error).toContain("monto");
    expect(validateSplit([line(null, "60"), line(2, "40")], 100).error).toContain("categoría");
  });

  test("requiere total válido y al menos 2 líneas", () => {
    expect(validateSplit([line(1, "60"), line(2, "40")], 0).error).toContain("monto total");
    expect(validateSplit([line(1, "100")], 100).error).toContain("2 líneas");
  });
});

describe("splitLineDescription", () => {
  test("agrega el índice legible", () => {
    expect(splitLineDescription("Supermercado", 0, 2)).toBe("Supermercado (1/2)");
    expect(splitLineDescription("  ", 1, 3)).toBe("Gasto dividido (2/3)");
  });
});

describe("hasSplitGroup", () => {
  it("true solo cuando metadata trae split_group", () => {
    expect(hasSplitGroup({ split_group: "abc" })).toBe(true);
    expect(hasSplitGroup({ source: "notification_detection" })).toBe(false);
    expect(hasSplitGroup(null)).toBe(false);
    expect(hasSplitGroup(undefined)).toBe(false);
    expect(hasSplitGroup("x")).toBe(false);
    expect(hasSplitGroup([1, 2])).toBe(false);
  });
});

describe("splitLineMetadata", () => {
  it("mergea metadata existente con los campos de split (1-indexed)", () => {
    expect(splitLineMetadata({ source: "detection" }, "g1", 0, 3)).toEqual({
      source: "detection",
      split_group: "g1",
      split_index: 1,
      split_total: 3,
    });
  });
  it("metadata no-objeto se ignora", () => {
    expect(splitLineMetadata(null, "g1", 2, 3)).toEqual({ split_group: "g1", split_index: 3, split_total: 3 });
  });
});
