import { buildAccountAnalytics } from "../account-analytics";
import type { AccountMovementAnalytics } from "../../../../services/queries/accounts";

function movement(
  overrides: Partial<AccountMovementAnalytics>,
): AccountMovementAnalytics {
  return {
    id: 1,
    movementType: "expense",
    status: "posted",
    occurredAt: "2026-09-26T17:00:00Z",
    description: null,
    sourceAccountId: 1,
    sourceAmount: 0,
    destinationAccountId: null,
    destinationAmount: null,
    categoryId: null,
    categoryName: null,
    ...overrides,
  };
}

describe("account analytics", () => {
  it("includes outgoing transfers in account flow but excludes them from spending", () => {
    const analysis = buildAccountAnalytics(1, [
      movement({ id: 1, movementType: "income", sourceAccountId: null, sourceAmount: null, destinationAccountId: 1, destinationAmount: 100 }),
      movement({ id: 2, movementType: "transfer", sourceAmount: 60, destinationAccountId: 2, destinationAmount: 60 }),
      movement({ id: 3, sourceAmount: 20, categoryName: "Comida" }),
      movement({ id: 4, sourceAmount: 5 }),
    ], 300);

    expect(analysis).toMatchObject({
      totalIn: 100,
      totalOut: 85,
      netFlow: 15,
      spent: 25,
      transferOut: 60,
      uncategorized: 5,
      uncategorizedCount: 1,
      visibleCategories: [["Comida", 20]],
    });
  });

  it("uses the Peru date for monthly totals and identifies a capped range", () => {
    const analysis = buildAccountAnalytics(1, [
      movement({ id: 1, occurredAt: "2026-10-01T01:00:00Z", sourceAmount: 10 }),
      movement({ id: 2, occurredAt: "2026-10-01T06:00:00Z", sourceAmount: 20 }),
    ], 2);

    expect(analysis?.months.map(({ key, expense }) => [key, expense])).toEqual([
      ["2026-10", 20],
      ["2026-09", 10],
    ]);
    expect(analysis?.truncated).toBe(true);
    expect(analysis?.from.getDate()).toBe(30);
    expect(analysis?.to.getDate()).toBe(1);
  });
});
