import {
  buildEvidence,
  buildPeriodComparison,
  buildTradeAnalysis,
  clampAnalyzeTradeParams,
  clampComparePeriodsParams,
  normalizeBudgetDraft,
  normalizeObligationDraft,
  normalizeRecurringDraft,
  clampFact,
  clampSearchParams,
  clampSummarizeParams,
  escapeIlike,
  normalizeDraft,
  normalizeName,
  type PeriodRow,
  type TradeRow,
} from "../logic";

describe("normalizeDraft", () => {
  it("acepta un gasto completo y lista faltantes vacíos", () => {
    const d = normalizeDraft({
      operation: "expense", amount: 5, currency: "PEN",
      accountName: "Cuenta Principal", categoryName: "Transporte", description: "Taxi",
    });
    expect(d).not.toBeNull();
    expect(d!.operation).toBe("expense");
    expect(d!.amount).toBe(5);
    expect(d!.missing).toEqual([]);
  });

  it("marca 'account' faltante en gasto sin cuenta", () => {
    const d = normalizeDraft({ operation: "expense", amount: 5, currency: "PEN" });
    expect(d!.missing).toContain("account");
  });

  it("transfer exige ambas cuentas", () => {
    const d = normalizeDraft({ operation: "transfer", amount: 200, currency: "PEN", accountName: "BCP" });
    expect(d!.missing).toContain("destinationAccount");
  });

  it("pay_subscription sin id marca subscription faltante", () => {
    const d = normalizeDraft({ operation: "pay_subscription", amount: 44.9 });
    expect(d!.missing).toContain("subscription");
  });

  it("rechaza operación desconocida o monto no positivo", () => {
    expect(normalizeDraft({ operation: "hack", amount: 5 })).toBeNull();
    expect(normalizeDraft({ operation: "expense", amount: 0, currency: "PEN" })).toBeNull();
  });
});

describe("buildEmbeddingText", () => {
  it("compone descripcion|notas|categoria|contraparte|tipo y capea a 500", () => {
    const { buildEmbeddingText } = require("../logic");
    expect(
      buildEmbeddingText({ description: "Viper V3 Pro", notes: null, type: "expense", category: "Tecnología", counterparty: "Amazon" }),
    ).toBe("Viper V3 Pro | Tecnología | Amazon | expense");
    expect(buildEmbeddingText({ description: "x".repeat(600) }).length).toBe(500);
  });
});

describe("isDeepQuestion", () => {
  it("marca análisis/escenarios/comparaciones como profundas", () => {
    const { isDeepQuestion } = require("../logic");
    expect(isDeepQuestion("¿qué pasa si cancelo Netflix y Spotify?")).toBe(true);
    expect(isDeepQuestion("compara mis gastos de junio y julio")).toBe(true);
    expect(isDeepQuestion("¿me conviene pagar la deuda ahora?")).toBe(true);
    expect(isDeepQuestion("¿por qué gasté más este mes?")).toBe(true);
    expect(isDeepQuestion("analiza mis finanzas a fondo")).toBe(true);
  });

  it("consultas simples y registros NO son profundas", () => {
    const { isDeepQuestion } = require("../logic");
    expect(isDeepQuestion("cuánto gasté este mes")).toBe(false);
    expect(isDeepQuestion("registra un gasto de 15 en taxi")).toBe(false);
    expect(isDeepQuestion("cuál fue mi mayor gasto")).toBe(false);
  });
});

describe("clampFact", () => {
  it("normaliza espacios y exige 3-300 chars", () => {
    expect(clampFact("  mi primo   paga la mitad \n de Amazon ")).toBe("mi primo paga la mitad de Amazon");
    expect(clampFact("ab")).toBeNull();
    expect(clampFact("x".repeat(301))).toBeNull();
    expect(clampFact(42)).toBeNull();
  });
});

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

describe("clampComparePeriodsParams", () => {
  it("exige los 4 rangos y whitelistea groupBy", () => {
    expect(clampComparePeriodsParams({ currentFrom: "2026-07-01", currentTo: "2026-07-31" })).toBeNull();
    const ok = clampComparePeriodsParams({
      currentFrom: "2026-07-01", currentTo: "2026-07-31",
      previousFrom: "2026-06-01", previousTo: "2026-06-30",
      groupBy: "category",
    });
    expect(ok?.groupBy).toBe("category");
    expect(ok?.currentFrom).toBe("2026-07-01");
    const bad = clampComparePeriodsParams({
      currentFrom: "2026-07-01", currentTo: "2026-07-31",
      previousFrom: "2026-06-01", previousTo: "2026-06-30",
      groupBy: "sql",
    });
    expect(bad?.groupBy).toBe("none");
  });
});

describe("buildPeriodComparison", () => {
  const row = (amount: number, category: string): PeriodRow => ({
    amount, currency: "PEN", category, counterparty: null,
  });

  it("calcula delta y % de cambio por moneda", () => {
    const current = [row(300, "Comida"), row(200, "Tech")]; // 500
    const previous = [row(400, "Comida")]; // 400
    const cmp = buildPeriodComparison(current, previous, "none");
    const pen = cmp.byCurrency.find((c) => c.currency === "PEN")!;
    expect(pen.current).toBe(500);
    expect(pen.previous).toBe(400);
    expect(pen.delta).toBe(100);
    expect(pen.pctChange).toBe(25); // +100 sobre 400
    expect(cmp.movers).toBeUndefined();
  });

  it("con groupBy ordena movers por mayor cambio absoluto y % null sin base previa", () => {
    const current = [row(300, "Comida"), row(200, "Tech")];
    const previous = [row(50, "Comida")]; // Tech no existía antes
    const cmp = buildPeriodComparison(current, previous, "category");
    expect(cmp.movers?.[0]?.name).toBe("Comida"); // Δ 250 > Δ Tech 200
    expect(cmp.movers?.[0]?.delta).toBe(250);
    const tech = cmp.movers?.find((m) => m.name === "Tech")!;
    expect(tech.previous).toBe(0);
    expect(tech.pctChange).toBeNull(); // sin base previa
  });
});

describe("clampAnalyzeTradeParams", () => {
  it("exige text y limpia fechas/contacto", () => {
    expect(clampAnalyzeTradeParams({})).toBeNull();
    expect(clampAnalyzeTradeParams({ text: "   " })).toBeNull();
    const ok = clampAnalyzeTradeParams({ text: "mouse viper", counterpartyName: "Juan", dateFrom: "malo", dateTo: "2026-07-31" });
    expect(ok?.text).toBe("mouse viper");
    expect(ok?.counterpartyName).toBe("Juan");
    expect(ok?.dateFrom).toBeNull(); // fecha inválida → null
    expect(ok?.dateTo).toBe("2026-07-31");
  });
});

describe("buildTradeAnalysis", () => {
  const row = (type: string, amount: number, currency = "PEN"): TradeRow => ({ type, amount, currency });

  it("separa costo/venta y calcula ganancia y márgenes", () => {
    const rows = [row("expense", 200), row("income", 260), row("transfer", 999)]; // transfer se ignora
    const pen = buildTradeAnalysis(rows).byCurrency.find((c) => c.currency === "PEN")!;
    expect(pen.cost).toBe(200);
    expect(pen.revenue).toBe(260);
    expect(pen.profit).toBe(60);
    expect(pen.returnOnCostPct).toBe(30); // 60/200
    expect(pen.marginOnRevenuePct).toBeCloseTo(23.1, 1); // 60/260
    expect(pen.buyCount).toBe(1);
    expect(pen.sellCount).toBe(1);
  });

  it("margen null cuando falta la base (solo compra, sin venta)", () => {
    const pen = buildTradeAnalysis([row("expense", 100)]).byCurrency[0];
    expect(pen.profit).toBe(-100);
    expect(pen.returnOnCostPct).toBe(-100); // -100/100
    expect(pen.marginOnRevenuePct).toBeNull(); // venta 0
  });
});

describe("normalizeBudgetDraft", () => {
  it("null si falta el monto (el modelo debe pedirlo)", () => {
    expect(normalizeBudgetDraft({ categoryName: "Comida" }, "2026-07-23")).toBeNull();
    expect(normalizeBudgetDraft({ limitAmount: 0 }, "2026-07-23")).toBeNull();
  });

  it("resuelve el mes en curso y aplica defaults", () => {
    const d = normalizeBudgetDraft({ limitAmount: 500, categoryName: "Comida" }, "2026-07-23")!;
    expect(d.limitAmount).toBe(500);
    expect(d.currency).toBe("PEN");
    expect(d.alertPercent).toBe(80);
    expect(d.name).toBe("Comida"); // default = categoría
    expect(d.periodStart).toBe("2026-07-01");
    expect(d.periodEnd).toBe("2026-07-31");
  });

  it("next_month cruza fin de año y toma febrero con su último día", () => {
    const dec = normalizeBudgetDraft({ limitAmount: 100, period: "next_month" }, "2026-12-10")!;
    expect(dec.periodStart).toBe("2027-01-01");
    expect(dec.periodEnd).toBe("2027-01-31");
    const jan = normalizeBudgetDraft({ limitAmount: 100, period: "next_month" }, "2028-01-15")!;
    expect(jan.periodEnd).toBe("2028-02-29"); // 2028 bisiesto
    expect(jan.name).toBe("Presupuesto"); // sin categoría ni name
  });

  it("clampa alertPercent fuera de rango a 80", () => {
    expect(normalizeBudgetDraft({ limitAmount: 100, alertPercent: 250 }, "2026-07-23")!.alertPercent).toBe(80);
    expect(normalizeBudgetDraft({ limitAmount: 100, alertPercent: 60 }, "2026-07-23")!.alertPercent).toBe(60);
  });
});

describe("normalizeObligationDraft", () => {
  it("null si falta dirección o monto", () => {
    expect(normalizeObligationDraft({ principalAmount: 200 }, "2026-07-23")).toBeNull();
    expect(normalizeObligationDraft({ direction: "receivable" }, "2026-07-23")).toBeNull();
    expect(normalizeObligationDraft({ direction: "otra", principalAmount: 5 }, "2026-07-23")).toBeNull();
  });

  it("receivable con contraparte arma título e inicia hoy por defecto", () => {
    const d = normalizeObligationDraft({ direction: "receivable", principalAmount: 200, counterpartyName: "Juan" }, "2026-07-23")!;
    expect(d.title).toBe("Préstamo a Juan");
    expect(d.principalAmount).toBe(200);
    expect(d.currency).toBe("PEN");
    expect(d.startDate).toBe("2026-07-23");
    expect(d.dueDate).toBeNull();
  });

  it("payable sin contraparte usa título genérico y respeta fechas válidas", () => {
    const d = normalizeObligationDraft(
      { direction: "payable", principalAmount: 500, startDate: "2026-07-01", dueDate: "2026-08-01" },
      "2026-07-23",
    )!;
    expect(d.title).toBe("Deuda");
    expect(d.startDate).toBe("2026-07-01");
    expect(d.dueDate).toBe("2026-08-01");
  });
});

describe("normalizeRecurringDraft", () => {
  it("null si falta kind, nombre o monto", () => {
    expect(normalizeRecurringDraft({ name: "Netflix", amount: 44 }, "2026-07-23")).toBeNull();
    expect(normalizeRecurringDraft({ kind: "subscription", amount: 44 }, "2026-07-23")).toBeNull();
    expect(normalizeRecurringDraft({ kind: "subscription", name: "Netflix" }, "2026-07-23")).toBeNull();
  });

  it("suscripción mensual calcula el próximo desde el día del mes (este mes si no pasó)", () => {
    const d = normalizeRecurringDraft({ kind: "subscription", name: "Netflix", amount: 44, dayOfMonth: 30 }, "2026-07-23")!;
    expect(d.frequency).toBe("monthly");
    expect(d.nextDate).toBe("2026-07-30");
    expect(d.currency).toBe("PEN");
  });

  it("si el día ya pasó, salta al mes siguiente", () => {
    const d = normalizeRecurringDraft({ kind: "recurring_income", name: "Sueldo", amount: 3500, dayOfMonth: 5 }, "2026-07-23")!;
    expect(d.kind).toBe("recurring_income");
    expect(d.nextDate).toBe("2026-08-05");
  });

  it("respeta nextDate explícita y frecuencia whitelisteada", () => {
    const d = normalizeRecurringDraft(
      { kind: "subscription", name: "Dominio", amount: 12, frequency: "yearly", nextDate: "2027-01-10" }, "2026-07-23",
    )!;
    expect(d.frequency).toBe("yearly");
    expect(d.nextDate).toBe("2027-01-10");
    const bad = normalizeRecurringDraft({ kind: "subscription", name: "X", amount: 1, frequency: "hourly" }, "2026-07-23")!;
    expect(bad.frequency).toBe("monthly"); // fallback
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
