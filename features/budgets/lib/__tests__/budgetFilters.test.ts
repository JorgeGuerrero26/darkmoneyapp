import { filterBudgetPeriods } from "../budgetFilters";
import { convertAmount } from "../budgetCurrency";
import type { BudgetOverview } from "../../../../types/domain";

function budget(id: number, overrides: Partial<BudgetOverview> = {}): BudgetOverview {
  return {
    id,
    workspaceId: 1,
    name: `Presupuesto ${id}`,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    currencyCode: "PEN",
    categoryId: null,
    accountId: null,
    scopeKind: "general",
    scopeLabel: "General",
    limitAmount: 100,
    spentAmount: 50,
    remainingAmount: 50,
    usedPercent: 50,
    alertPercent: 80,
    movementCount: 1,
    rolloverEnabled: false,
    isActive: true,
    isNearLimit: false,
    isOverLimit: false,
    isPinned: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("filterBudgetPeriods", () => {
  const rows = [
    budget(1, { name: "Alimentación", scopeKind: "category", spentAmount: 120, isPinned: true }),
    budget(2, { periodStart: "2026-09-01", periodEnd: "2026-09-30" }),
    budget(3, { scopeKind: "spend_type_account", spendTypeName: "Deseo" }),
  ];

  it("combina estado, ámbito, fijados y búsqueda", () => {
    expect(filterBudgetPeriods(rows, {
      search: "alimenta", status: "over", scope: "category", pinnedOnly: true,
    }, "2026-10-03").map((item) => item.id)).toEqual([1]);
  });

  it("permite consultar los períodos cerrados y los ámbitos de tipo de gasto", () => {
    expect(filterBudgetPeriods(rows, {
      search: "", status: "closed", scope: "all", pinnedOnly: false,
    }, "2026-10-03").map((item) => item.id)).toEqual([2]);
    expect(filterBudgetPeriods(rows, {
      search: "deseo", status: "all", scope: "spend_type_account", pinnedOnly: false,
    }, "2026-10-03").map((item) => item.id)).toEqual([3]);
  });
});

describe("convertAmount", () => {
  it("omite de un total base los importes sin tipo de cambio", () => {
    expect(convertAmount(100, "USD", "PEN", new Map())).toBeNull();
    expect(convertAmount(100, "USD", "PEN", new Map([["USD:PEN", 3.7]]))).toBeCloseTo(370);
  });
});
