import {
  buildEvidence,
  clampSearchParams,
  clampSummarizeParams,
  escapeIlike,
  normalizeName,
} from "../logic";

describe("clampSearchParams", () => {
  it("clampa limit a 1-40 y valida fechas/montos/tipo", () => {
    expect(clampSearchParams({ limit: 999 }).limit).toBe(40);
    expect(clampSearchParams({ limit: -3 }).limit).toBe(1);
    expect(clampSearchParams({}).limit).toBe(20);
    expect(clampSearchParams({ dateFrom: "2026-01-15" }).dateFrom).toBe("2026-01-15");
    expect(clampSearchParams({ dateFrom: "15/01/2026" }).dateFrom).toBeNull();
    expect(clampSearchParams({ minAmount: -5 }).minAmount).toBeNull();
    expect(clampSearchParams({ movementType: "expense" }).movementType).toBe("expense");
    expect(clampSearchParams({ movementType: "hack" }).movementType).toBeNull();
    expect(clampSearchParams({ text: "  viper v3 pro  " }).text).toBe("viper v3 pro");
    expect(clampSearchParams({ text: "" }).text).toBeNull();
  });
});

describe("clampSummarizeParams", () => {
  it("exige fechas válidas y whitelistea groupBy", () => {
    expect(clampSummarizeParams({ dateFrom: "2026-06-01" })).toBeNull();
    const ok = clampSummarizeParams({ dateFrom: "2026-06-01", dateTo: "2026-06-30", groupBy: "category" });
    expect(ok?.groupBy).toBe("category");
    const bad = clampSummarizeParams({ dateFrom: "2026-06-01", dateTo: "2026-06-30", groupBy: "sql" });
    expect(bad?.groupBy).toBe("none");
  });
});

describe("escapeIlike", () => {
  it("escapa comodines para que el texto sea literal", () => {
    expect(escapeIlike("100% _raro_ \\x")).toBe("100\\% \\_raro\\_ \\\\x");
  });
});

describe("normalizeName", () => {
  it("ignora tildes y mayúsculas para matchear categorías", () => {
    expect(normalizeName("Tecnología")).toBe("tecnologia");
    expect(normalizeName("  ALIMENTACIÓN ")).toBe("alimentacion");
    // ambos lados se normalizan igual, así "nono" matchea "Ñoño"
    expect(normalizeName("Ñoño")).toBe("nono");
  });
});

describe("buildEvidence", () => {
  it("dedupe, filtra ids inválidos y capea a 100", () => {
    const ids = [3, 3, -1, 0, NaN, ...Array.from({ length: 150 }, (_, i) => i + 10)];
    const evidence = buildEvidence("Resultados: viper", ids);
    expect(evidence?.movementIds.length).toBe(100);
    expect(evidence?.movementIds[0]).toBe(3);
    expect(buildEvidence("x", [])).toBeNull();
  });
});
