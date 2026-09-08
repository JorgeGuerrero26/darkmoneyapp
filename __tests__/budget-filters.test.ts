import { isBudgetExpired } from "../features/budgets/lib/budgetFilters";

const TODAY = "2026-07-16";

const budget = (over = {}) =>
  ({
    id: 1,
    name: "Comida",
    scopeKind: "general",
    scopeLabel: "General",
    categoryName: null,
    accountName: null,
    notes: null,
    isPinned: false,
    isNearLimit: false,
    isOverLimit: false,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    ...over,
  }) as any;

describe("isBudgetExpired", () => {
  it("vencido solo si periodEnd es anterior a hoy", () => {
    expect(isBudgetExpired(budget({ periodEnd: "2026-07-15" }), TODAY)).toBe(true);
    expect(isBudgetExpired(budget({ periodEnd: TODAY }), TODAY)).toBe(false);
    expect(isBudgetExpired(budget({ periodEnd: "2026-08-01" }), TODAY)).toBe(false);
  });
});
