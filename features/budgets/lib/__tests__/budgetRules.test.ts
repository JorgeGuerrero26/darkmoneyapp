import {
  budgetRowNote,
  budgetRuleKey,
  daysLeft,
  expectedPace,
  groupBudgetsIntoRules,
} from "../budgetRules";
import { buildBudgetsHeadline, closedMonthsSummary } from "../budgetsHeadline";
import type { BudgetOverview } from "../../../../types/domain";

const money = (amount: number) => `S/ ${amount.toFixed(2)}`;

function budget(over: Partial<BudgetOverview> = {}): BudgetOverview {
  return {
    id: 1,
    workspaceId: 1,
    name: "Alimentación",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    currencyCode: "PEN",
    categoryId: 5,
    accountId: null,
    scopeKind: "category",
    scopeLabel: "Categoría",
    limitAmount: 400,
    spentAmount: 322.12,
    remainingAmount: 77.88,
    usedPercent: 81,
    alertPercent: 80,
    movementCount: 28,
    rolloverEnabled: false,
    isActive: true,
    isNearLimit: true,
    isOverLimit: false,
    isPinned: false,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

describe("budgetRuleKey", () => {
  it("el mismo presupuesto en tres meses es UNA regla", () => {
    const mayo = budget({ id: 3, periodStart: "2026-05-01", periodEnd: "2026-05-31" });
    const junio = budget({ id: 4, periodStart: "2026-06-01", periodEnd: "2026-07-01" });
    expect(budgetRuleKey(mayo)).toBe(budgetRuleKey(junio));
  });

  it("con y sin tilde siguen siendo la misma regla", () => {
    // En los datos reales dos de tres filas venian escritas "Alimentacion".
    expect(budgetRuleKey(budget({ name: "Alimentacion" }))).toBe(budgetRuleKey(budget({ name: "Alimentación" })));
  });

  it("otra categoria es otro presupuesto aunque se llame igual", () => {
    expect(budgetRuleKey(budget({ categoryId: 9 }))).not.toBe(budgetRuleKey(budget()));
  });
});

describe("groupBudgetsIntoRules", () => {
  const mayo = budget({ id: 3, periodStart: "2026-05-01", periodEnd: "2026-05-31", spentAmount: 500 });
  const junio = budget({ id: 4, periodStart: "2026-06-01", periodEnd: "2026-07-01", spentAmount: 300 });
  const julio = budget({ id: 5, periodStart: "2026-07-02", periodEnd: "2026-08-01", spentAmount: 452.32 });
  const setiembre = budget({ id: 6, periodStart: "2026-09-01", periodEnd: "2026-09-30" });

  it("el caso reportado: tres filas eran un presupuesto con tres meses", () => {
    const rules = groupBudgetsIntoRules([mayo, junio, julio], "2026-09-08");
    expect(rules).toHaveLength(1);
    expect(rules[0].current).toBeNull();
    expect(rules[0].closed.map((b) => b.id)).toEqual([5, 4, 3]);
  });

  it("separa el mes en curso de los cerrados", () => {
    const rules = groupBudgetsIntoRules([mayo, junio, julio, setiembre], "2026-09-08");
    expect(rules[0].current?.id).toBe(6);
    expect(rules[0].closed).toHaveLength(3);
  });

  it("dos presupuestos distintos son dos reglas", () => {
    const transporte = budget({ id: 7, name: "Transporte", categoryId: 9, limitAmount: 150 });
    expect(groupBudgetsIntoRules([setiembre, transporte], "2026-09-08")).toHaveLength(2);
  });

  it("si dos periodos se solapan, gana el que empezo despues", () => {
    // "1 jun - 1 jul" y "2 jul - 1 ago" se solapaban un dia en los datos reales.
    const a = budget({ id: 1, periodStart: "2026-09-01", periodEnd: "2026-09-30" });
    const b = budget({ id: 2, periodStart: "2026-09-05", periodEnd: "2026-10-04" });
    expect(groupBudgetsIntoRules([a, b], "2026-09-08")[0].current?.id).toBe(2);
  });
});

describe("expectedPace y daysLeft", () => {
  it("a mitad de mes se espera la mitad", () => {
    expect(expectedPace({ periodStart: "2026-09-01", periodEnd: "2026-09-30" }, "2026-09-15")).toBeCloseTo(0.5, 1);
  });

  it("dias transcurridos entre dias del periodo, contando ambos extremos", () => {
    // El 8 de septiembre son 8 de 30, no 7 de 29: restar las fechas a secas dejaba fuera hoy y
    // daba 24%, o sea S/ 96.55 esperados donde lo correcto es S/ 107.
    const pace = expectedPace({ periodStart: "2026-09-01", periodEnd: "2026-09-30" }, "2026-09-08");
    expect(Math.round(pace * 100)).toBe(27);
    expect(Math.round(400 * pace)).toBe(107);
  });

  it("el primer dia ya cuenta como transcurrido, y el ultimo cierra el periodo", () => {
    const mes = { periodStart: "2026-09-01", periodEnd: "2026-09-30" };
    expect(expectedPace(mes, "2026-09-01")).toBeCloseTo(1 / 30, 3);
    expect(expectedPace(mes, "2026-09-30")).toBe(1);
  });

  it("cuenta los dias que faltan, nunca negativos", () => {
    expect(daysLeft({ periodEnd: "2026-09-30" }, "2026-09-08")).toBe(22);
    expect(daysLeft({ periodEnd: "2026-08-01" }, "2026-09-08")).toBe(0);
  });
});

describe("budgetRowNote", () => {
  it("pasado: dice cuanto y cuanto falta, que es lo que decide si hay que actuar", () => {
    const nota = budgetRowNote(budget({ spentAmount: 859.22 }), "2026-09-08", money);
    expect(nota).toBe("Te pasaste S/ 459.22, y quedan 22 días.");
  });

  it("por encima del ritmo: lo dice en soles, no en color", () => {
    // 27% del mes sobre 400 son 107 esperados; gastados 322.12 -> 215 por delante.
    const nota = budgetRowNote(budget(), "2026-09-08", money);
    expect(nota).toContain("S/ 215.45");
    expect(nota).toContain("por encima del ritmo");
  });

  it("dentro del ritmo no dice nada: una fila sin problema no necesita frase", () => {
    expect(budgetRowNote(budget({ spentAmount: 50 }), "2026-09-08", money)).toBe("");
  });

  it("el singular del ultimo dia", () => {
    const nota = budgetRowNote(budget({ spentAmount: 500, periodEnd: "2026-09-09" }), "2026-09-08", money);
    expect(nota).toContain("queda 1 día");
  });
});

describe("buildBudgetsHeadline", () => {
  const alimentacion = budget({ spentAmount: 322.12, limitAmount: 400 });
  const transporte = budget({ id: 7, name: "Transporte", categoryId: 9, spentAmount: 63, limitAmount: 150 });

  it("suma lo simultaneo: dos presupuestos de septiembre", () => {
    const head = buildBudgetsHeadline({ active: [alimentacion, transporte], periodLabel: "Septiembre", formatAmount: money });
    expect(head.spent).toBeCloseTo(385.12);
    expect(head.limit).toBe(550);
    expect(head.support).toBe("Septiembre, dos presupuestos activos. Ninguno se ha pasado.");
  });

  it("atribuye el exceso al presupuesto, sin netear contra el que va sobrado", () => {
    const head = buildBudgetsHeadline({
      active: [budget({ spentAmount: 859.22 }), transporte],
      periodLabel: "Septiembre",
      formatAmount: money,
    });
    // 459.22 es lo que se paso Alimentacion. El margen de Transporte no lo compensa.
    expect(head.support).toContain("Te pasaste S/ 459.22 en Alimentación.");
    expect(head.hasOverspend).toBe(true);
  });

  it("con varios excedidos los nombra en vez de dar una cifra cruzada", () => {
    const head = buildBudgetsHeadline({
      active: [budget({ spentAmount: 900 }), budget({ id: 7, name: "Transporte", categoryId: 9, limitAmount: 150, spentAmount: 200 })],
      periodLabel: "Septiembre",
      formatAmount: money,
    });
    expect(head.support).toBe("Septiembre, dos presupuestos activos. Te pasaste en Alimentación y Transporte.");
  });

  it("sin ninguno vigente no inventa un total", () => {
    const head = buildBudgetsHeadline({ active: [], periodLabel: "Septiembre", formatAmount: money });
    expect(head).toMatchObject({ spent: 0, limit: 0, hasOverspend: false });
    expect(head.support).toBe("Septiembre, ningún presupuesto activo.");
  });
});

describe("closedMonthsSummary", () => {
  it("resume el historial en una linea en vez de una fila por mes", () => {
    const closed = [budget({ spentAmount: 500 }), budget({ spentAmount: 452 }), budget({ spentAmount: 300 })];
    expect(closedMonthsSummary(closed)).toBe("Te pasaste en 2 de los 3 últimos meses");
  });

  it("dentro del limite lo dice igual de corto", () => {
    const closed = [budget({ spentAmount: 100 }), budget({ spentAmount: 120 }), budget({ spentAmount: 90 })];
    expect(closedMonthsSummary(closed)).toBe("Dentro del límite los 3 últimos meses");
  });

  it("sin historial no dice nada", () => {
    expect(closedMonthsSummary([])).toBe("");
  });
});
