import { categorySpendRows, expenseTitle, habitPresentation, weeklySpendPattern } from "../features/dashboard/lib/patterns-view";
import type { DashboardMovementRow } from "../features/dashboard/lib/dashboard-row";
import type { PatternCluster } from "../services/analytics/pattern-clustering";

function movement(id: number, occurredAt: string, amount: number, description = ""):
  DashboardMovementRow {
  return {
    id, occurredAt, description, sourceAmount: amount, destinationAmount: 0,
    movementType: "expense", status: "posted", sourceAccountId: 1,
    destinationAccountId: null, categoryId: null, spendTypeId: null, counterpartyId: null,
  };
}

it("averages weekday spend across the whole 90-day window, including empty Mondays", () => {
  const now = new Date("2026-09-29T12:00:00");
  const result = weeklySpendPattern([
    movement(1, "2026-09-28T10:00:00", 10),
    movement(2, "2026-09-21T10:00:00", 20),
    movement(3, "2026-09-30T11:00:00", 50, "future"),
  ], (row) => row.sourceAmount, now);
  expect(result.days[0].total).toBe(30);
  expect(result.days[0].average).toBeCloseTo(30 / 13);
  expect(result.days[0].count).toBe(2);
});

it("uses a human label when a habit inherits the account name", () => {
  const cluster: PatternCluster = {
    label: "Cuenta Principal", type: "Gasto", categoryId: null, category: "Sin categoría",
    total: 30, count: 2, average: 15, movementIds: [1, 2], lastAt: "2026-09-28T10:00:00",
    confidence: 90, variantCount: 1, reason: "nombre repetido",
  };
  const rows = new Map([[1, movement(1, cluster.lastAt, 10, cluster.label)], [2, movement(2, cluster.lastAt, 20, cluster.label)]]);
  expect(habitPresentation(cluster, rows, new Map([[1, "Cuenta Principal"]]))).toEqual({
    title: "Gasto sin descripción", accountName: "Cuenta Principal",
  });
  expect(expenseTitle("Cuenta Principal", "Cuenta Principal")).toBe("Gasto sin descripción");
  expect(expenseTitle("Cena", "Cuenta Principal")).toBe("Cena");
});

it("keeps the category total while separating the five largest from the rest", () => {
  const totals = new Map<number | null, number>([[1, 100], [2, 90], [3, 80], [4, 70], [5, 60], [6, 50]]);
  const result = categorySpendRows(totals, new Map([[1, "Impuestos"]]));
  expect(result.total).toBe(450);
  expect(result.visible).toHaveLength(5);
  expect(result.rest).toHaveLength(1);
  expect(result.rest[0].amount).toBe(50);
});
