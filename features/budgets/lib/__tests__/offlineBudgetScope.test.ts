import { buildLocalBudgetScopeMovements } from "../offlineBudgetScope";

const accounts = [{ id: 1, name: "Cuenta Principal", currency_code: "PEN" }, { id: 2, name: "Dólares", currency_code: "USD" }];
const categories = [{ id: 4, name: "Combustible", default_spend_type_id: 7 }];
const movement = (extra: Record<string, unknown>) => ({
  id: 1, status: "posted", movement_type: "expense", occurred_at: "2026-10-14T17:54:00.000Z", description: "Gasolina",
  source_account_id: 1, source_amount: "1.00", destination_account_id: null, destination_amount: null, category_id: 4, spend_type_id: null, ...extra,
});
const build = (movements: Record<string, unknown>[], period = ["2026-10-14", "2026-10-31"]) =>
  buildLocalBudgetScopeMovements({ movements, accounts, categories, periodStart: period[0], periodEnd: period[1] });

describe("movimientos del presupuesto desde la copia local", () => {
  it("trae el gasto con los nombres y datos que usa el cálculo del presupuesto", () => {
    expect(build([movement({})])).toEqual([{
      id: 1, movementType: "expense", occurredAt: "2026-10-14T17:54:00.000Z", description: "Gasolina", categoryId: 4, categoryName: "Combustible",
      spendTypeId: null, categoryDefaultSpendTypeId: 7, sourceAccountId: 1, sourceAccountName: "Cuenta Principal", sourceCurrencyCode: "PEN",
      sourceAmount: 1, destinationAccountId: null, destinationAccountName: null, destinationCurrencyCode: null, destinationAmount: null,
    }]);
  });

  it("solo los confirmados: los anulados no cuentan", () => {
    expect(build([movement({ id: 1 }), movement({ id: 2, status: "voided" }), movement({ id: 3, status: "pending" })]).map((m) => m.id)).toEqual([1]);
  });

  it("respeta el período en hora de Lima (el día entero, de 05:00 UTC a 04:59 UTC del siguiente)", () => {
    const rows = build(
      [
        movement({ id: 1, occurred_at: "2026-10-14T04:59:59.000Z" }), // 13 oct 23:59 Lima: fuera
        movement({ id: 2, occurred_at: "2026-10-14T05:00:00.000Z" }), // 14 oct 00:00 Lima: dentro
        movement({ id: 3, occurred_at: "2026-11-01T04:59:59.000Z" }), // 31 oct 23:59 Lima: dentro
        movement({ id: 4, occurred_at: "2026-11-01T05:00:00.000Z" }), // 1 nov 00:00 Lima: fuera
      ],
    );
    expect(rows.map((m) => m.id).sort()).toEqual([2, 3]);
  });

  it("compara instantes, no texto: el formato del servidor (+00:00) y el local (Z) valen igual", () => {
    const rows = build([movement({ id: 1, occurred_at: "2026-10-20T10:00:00+00:00" }), movement({ id: 2, occurred_at: "2026-10-20T10:00:00.000Z" })]);
    expect(rows).toHaveLength(2);
  });

  it("más reciente primero y, a igual fecha, el de mayor id", () => {
    const rows = build([
      movement({ id: 1, occurred_at: "2026-10-15T10:00:00.000Z" }),
      movement({ id: 2, occurred_at: "2026-10-16T10:00:00.000Z" }),
      movement({ id: 3, occurred_at: "2026-10-16T10:00:00.000Z" }),
    ]);
    expect(rows.map((m) => m.id)).toEqual([3, 2, 1]);
  });

  it("una transferencia trae las dos cuentas con su moneda", () => {
    const [row] = build([movement({ movement_type: "transfer", source_account_id: 1, source_amount: "10", destination_account_id: 2, destination_amount: "3", category_id: null })]);
    expect(row).toMatchObject({ sourceCurrencyCode: "PEN", destinationCurrencyCode: "USD", destinationAmount: 3, categoryName: null });
  });
});
