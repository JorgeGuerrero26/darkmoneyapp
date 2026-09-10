import { buildBudgetComputedMetrics, type BudgetScopedMovement } from "../budget-metrics";
import type { BudgetOverview } from "../../types/domain";

/**
 * El emparejamiento del gasto vive en DOS sitios: aqui y en `v_budget_progress`. Tienen que decir
 * lo mismo — si se separan, el detalle del presupuesto enseña unos movimientos y la barra cuenta
 * otros. Estos casos son los mismos que se verificaron contra la vista en produccion antes de
 * aplicar la migracion 202609110001.
 */
const CONTEXT = { workspaceBaseCurrencyCode: "PEN", exchangeRates: [] };

function budget(patch: Partial<BudgetOverview>): BudgetOverview {
  return {
    id: 1,
    workspaceId: 1,
    name: "Maximo mensual",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    currencyCode: "PEN",
    scopeKind: "spend_type",
    scopeLabel: "Deseos",
    limitAmount: 300,
    spentAmount: 0,
    remainingAmount: 300,
    usedPercent: 0,
    alertPercent: 80,
    movementCount: 0,
    rolloverEnabled: false,
    isActive: true,
    isNearLimit: false,
    isOverLimit: false,
    isPinned: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...patch,
  };
}

function gasto(patch: Partial<BudgetScopedMovement> & { id: number; sourceAmount: number }): BudgetScopedMovement {
  return {
    movementType: "expense",
    occurredAt: "2026-09-10T12:00:00.000Z",
    description: "Gasto",
    categoryId: 1,
    categoryName: "Alimentacion",
    sourceAccountId: 2,
    sourceAccountName: "Cuenta",
    sourceCurrencyCode: "PEN",
    destinationAccountId: null,
    destinationAccountName: null,
    destinationCurrencyCode: null,
    destinationAmount: null,
    ...patch,
  };
}

describe("presupuesto por tipo de gasto", () => {
  it("cuenta lo que HEREDA el tipo de su categoria, sin re-etiquetar nada", () => {
    const metrics = buildBudgetComputedMetrics(
      budget({ spendTypeId: 1 }),
      [
        gasto({ id: 1, sourceAmount: 40, categoryDefaultSpendTypeId: 1 }),
        gasto({ id: 2, sourceAmount: 25, categoryDefaultSpendTypeId: 1 }),
      ],
      CONTEXT,
    );
    expect(metrics.spentAmount).toBe(65);
  });

  /** La cena cara: misma categoria, tipo cambiado a mano. Sale de necesidades y entra en deseos. */
  it("el tipo del movimiento le gana al de su categoria, en los dos sentidos", () => {
    const movimientos = [
      gasto({ id: 1, sourceAmount: 40, categoryDefaultSpendTypeId: 1 }),
      gasto({ id: 2, sourceAmount: 34, categoryDefaultSpendTypeId: 1, spendTypeId: 3 }),
    ];
    expect(buildBudgetComputedMetrics(budget({ spendTypeId: 1 }), movimientos, CONTEXT).spentAmount).toBe(40);
    expect(buildBudgetComputedMetrics(budget({ spendTypeId: 3 }), movimientos, CONTEXT).spentAmount).toBe(34);
  });

  it("lo que no tiene tipo ni lo hereda no entra en ningun presupuesto por tipo", () => {
    const metrics = buildBudgetComputedMetrics(
      budget({ spendTypeId: 1 }),
      [gasto({ id: 1, sourceAmount: 90, categoryId: null, categoryName: null })],
      CONTEXT,
    );
    expect(metrics.spentAmount).toBe(0);
  });

  it("categoria y tipo juntos son una interseccion, no una suma", () => {
    const metrics = buildBudgetComputedMetrics(
      budget({ categoryId: 1, spendTypeId: 3 }),
      [
        gasto({ id: 1, sourceAmount: 34, categoryDefaultSpendTypeId: 1, spendTypeId: 3 }),
        gasto({ id: 2, sourceAmount: 50, categoryId: 9, categoryName: "Diversion", categoryDefaultSpendTypeId: 3 }),
        gasto({ id: 3, sourceAmount: 20, categoryDefaultSpendTypeId: 1 }),
      ],
      CONTEXT,
    );
    expect(metrics.spentAmount).toBe(34);
  });

  it("sin tipo elegido, el presupuesto sigue contando todo su ambito", () => {
    const metrics = buildBudgetComputedMetrics(
      budget({ scopeKind: "category", categoryId: 1 }),
      [
        gasto({ id: 1, sourceAmount: 40, categoryDefaultSpendTypeId: 1 }),
        gasto({ id: 2, sourceAmount: 34, categoryDefaultSpendTypeId: 1, spendTypeId: 3 }),
      ],
      CONTEXT,
    );
    expect(metrics.spentAmount).toBe(74);
  });
});
