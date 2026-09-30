import type { BudgetOverview, ObligationSummary, SharedObligationSummary, SubscriptionSummary } from "../../../../types/domain";
import { simpleBudgetWarnings, simpleReceivables, simpleTopCategories, simpleUpcomingItems } from "../simple-view";

const now = new Date(2026, 8, 30, 12);

describe("resumen simple", () => {
  it("muestra solo presupuestos vigentes sobre 80% y conserva sus nombres reales", () => {
    const budget = (id: number, usedPercent: number, start: string, end: string) => ({
      id, name: "Alimentación mensual", isActive: true, limitAmount: 400,
      spentAmount: usedPercent * 4, usedPercent, periodStart: start, periodEnd: end,
    }) as BudgetOverview;
    const visible = simpleBudgetWarnings([
      budget(1, 115, "2026-09-01", "2026-09-30"),
      budget(2, 81, "2026-09-01", "2026-09-30"),
      budget(3, 95, "2026-08-01", "2026-08-31"),
      budget(4, 70, "2026-09-01", "2026-09-30"),
    ], now);
    expect(visible.map((item) => item.id)).toEqual([1, 2]);
    expect(visible.every((item) => item.name === "Alimentación mensual")).toBe(true);
  });

  it("ordena pagos y cobros por fecha, sin incluir cobros ya pasados", () => {
    const items = simpleUpcomingItems({
      obligations: [], creditCards: [], recurringIncome: [], now,
      subscriptions: [
        { id: 1, name: "Posterior", status: "active", amount: 20, currencyCode: "PEN", nextDueDate: "2026-10-03" },
        { id: 2, name: "Hoy", status: "active", amount: 10, currencyCode: "PEN", nextDueDate: "2026-09-30" },
        { id: 3, name: "Pasado", status: "active", amount: 15, currencyCode: "PEN", nextDueDate: "2026-09-29" },
      ] as SubscriptionSummary[],
    });
    expect(items.map((item) => item.title)).toEqual(["Hoy", "Posterior"]);
  });

  it("calcula Te deben desde la perspectiva del usuario", () => {
    const mine = { id: 1, direction: "receivable", status: "active", pendingAmount: 100, currencyCode: "PEN", counterparty: "Ana", dueDate: "2026-10-30" } as ObligationSummary;
    const sharedDebt = { ...mine, id: 2, pendingAmount: 200, viewerMode: "shared_viewer" } as SharedObligationSummary;
    const sharedCredit = { ...mine, id: 3, direction: "payable", pendingAmount: 300, viewerMode: "shared_viewer", counterparty: "Luis" } as SharedObligationSummary;
    const result = simpleReceivables([mine, sharedDebt, sharedCredit], (amount) => amount);
    expect(result).toMatchObject({ count: 2, peopleCount: 2, total: 400 });
  });

  it("ordena las categorías del mes por soles y corrige las tildes heredadas", () => {
    expect(simpleTopCategories(new Map([[1, 20], [2, 50], [null, 30]]), new Map([[1, "Alimentacion"], [2, "Tecnologia"]])))
      .toEqual([{ id: 2, name: "Tecnología", amount: 50 }, { id: null, name: "Sin categoría", amount: 30 }, { id: 1, name: "Alimentación", amount: 20 }]);
  });
});
