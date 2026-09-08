import { budgetHeadState, budgetSeriesReading } from "../budgetVerdict";
import type { BudgetOverview } from "../../../../types/domain";

const money = (amount: number) => `S/ ${amount.toFixed(2)}`;

function budget(over: Partial<BudgetOverview> = {}): BudgetOverview {
  return {
    id: 1, workspaceId: 1, name: "Alimentación",
    periodStart: "2026-09-01", periodEnd: "2026-09-30",
    currencyCode: "PEN", categoryId: 5, accountId: null,
    scopeKind: "category", scopeLabel: "Categoría",
    limitAmount: 400, spentAmount: 322.12, remainingAmount: 77.88,
    usedPercent: 81, alertPercent: 80, movementCount: 28,
    rolloverEnabled: false, isActive: true, isNearLimit: true, isOverLimit: false,
    isPinned: false, createdAt: "", updatedAt: "",
    ...over,
  };
}

const head = (b: BudgetOverview, today = "2026-09-08", periodLabel = "Septiembre") =>
  budgetHeadState({ budget: b, todayYmd: today, formatAmount: money, periodLabel });

describe("budgetHeadState", () => {
  it("el caso reportado: cerro sin un solo movimiento y eso NO es 0% en rango", () => {
    const state = head(
      budget({ periodStart: "2026-06-01", periodEnd: "2026-07-01", spentAmount: 0, movementCount: 0 }),
      "2026-09-08",
      "Junio",
    );
    expect(state.kind).toBe("no-data");
    if (state.kind !== "no-data") return;
    expect(state.title).toBe("Junio cerró sin movimientos");
    expect(state.body).toContain("No es que no gastaras");
    expect(state.body).toContain("1 de junio");
    expect(state.body).toContain("1 de julio");
  });

  it("un periodo cerrado CON gasto da veredicto, no progreso", () => {
    const state = head(
      budget({ periodStart: "2026-05-01", periodEnd: "2026-05-31", spentAmount: 606.38, movementCount: 12 }),
      "2026-09-08",
      "Mayo",
    );
    expect(state.kind).toBe("verdict");
    if (state.kind !== "verdict") return;
    expect(state.sentence).toBe("Mayo cerró S/ 206.38 por encima del límite.");
  });

  it("y si cerro por debajo lo dice sin felicitar de mas", () => {
    const state = head(
      budget({ periodStart: "2026-05-01", periodEnd: "2026-05-31", spentAmount: 300, movementCount: 9 }),
      "2026-09-08",
      "Mayo",
    );
    expect(state.kind).toBe("verdict");
    if (state.kind !== "verdict") return;
    expect(state.sentence).toContain("dentro del límite, con S/ 100.00 sin gastar");
  });

  it("el periodo en curso enseña progreso con el ritmo de la spec", () => {
    const state = head(budget());
    expect(state.kind).toBe("progress");
    if (state.kind !== "progress") return;
    // 8/30 del mes sobre 400 = 107 esperados; 322.12 gastados -> 215 por delante.
    expect(state.sentence).toContain("quedan 22 días");
    expect(state.sentence).toContain("se esperaría S/ 106.67");
    expect(state.sentence).toContain("vas S/ 215.45 por delante");
  });

  it("dentro del ritmo dice cuanto queda y para cuantos dias, que es lo util", () => {
    const state = head(budget({ spentAmount: 50 }));
    if (state.kind !== "progress") throw new Error("deberia ser progreso");
    expect(state.sentence).toContain("Te quedan S/ 350.00");
    expect(state.sentence).toContain("al día");
  });

  it("pasarse durante el periodo se dice ahi mismo", () => {
    const state = head(budget({ spentAmount: 859.22 }));
    if (state.kind !== "progress") throw new Error("deberia ser progreso");
    expect(state.sentence).toContain("Te pasaste S/ 459.22");
  });

  it("un periodo en curso sin movimientos sigue siendo progreso: aun puede pasar algo", () => {
    expect(head(budget({ spentAmount: 0, movementCount: 0 })).kind).toBe("progress");
  });
});

describe("budgetSeriesReading", () => {
  const mes = (spent: number, movementCount = 10) => budget({ spentAmount: spent, movementCount });

  it("dos de tres por encima: dice que el limite puede estar corto", () => {
    const texto = budgetSeriesReading([mes(859.22), mes(606.38), mes(322)], money);
    expect(texto).toBe("Te pasaste en 2 de los 3 últimos meses. El límite de S/ 400.00 puede estar corto.");
  });

  it("los tres por encima se dicen sin la resta", () => {
    expect(budgetSeriesReading([mes(500), mes(600), mes(700)], money))
      .toBe("Te pasaste los 3 meses. El límite de S/ 400.00 puede estar corto.");
  });

  it("uno solo por encima no proclama que el limite este mal", () => {
    const texto = budgetSeriesReading([mes(500), mes(300), mes(200)], money);
    expect(texto).toContain("Te pasaste en 1 de los 3 últimos meses");
    expect(texto).not.toContain("puede estar corto");
  });

  it("dentro del limite se dice igual de corto", () => {
    expect(budgetSeriesReading([mes(100), mes(200)], money)).toBe("Dentro del límite los 2 últimos meses.");
  });

  it("los meses sin movimientos no cuentan: no son un resultado", () => {
    // Es el mismo error que arriba, un nivel mas abajo: un cero vacio no dice que cumpliste.
    expect(budgetSeriesReading([mes(0, 0), mes(0, 0)], money)).toBe("");
    expect(budgetSeriesReading([mes(859.22), mes(0, 0)], money)).toContain("el último mes");
  });
});
