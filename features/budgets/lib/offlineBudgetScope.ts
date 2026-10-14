import { filterDateFrom, filterDateTo } from "../../../lib/date";
import { displayCategoryName } from "../../../lib/category-display-name";
import type { BudgetScopedMovement } from "../../../lib/budget-metrics";

type Row = Record<string, unknown>;

const toNumber = (value: unknown): number | null => (value == null ? null : Number(value));
const toId = (value: unknown): number | null => (value == null ? null : Number(value));

/**
 * Los movimientos que cuentan para el avance de los presupuestos de un período, leídos de la copia local
 * (servidor + lo que todavía no se envió). Misma selección y mismo orden que la consulta al servidor
 * (`fetchBudgetScopeMovements`): confirmados, dentro del período en hora de Lima, más recientes primero.
 *
 * Las fechas se comparan como instantes, no como texto: el servidor las devuelve con otro formato
 * ("+00:00") que el de los movimientos guardados en el teléfono ("Z").
 */
export function buildLocalBudgetScopeMovements(input: {
  movements: Row[];
  accounts: Row[];
  categories: Row[];
  periodStart: string;
  periodEnd: string;
}): BudgetScopedMovement[] {
  const from = Date.parse(filterDateFrom(input.periodStart));
  const to = Date.parse(filterDateTo(input.periodEnd));
  const accounts = new Map(input.accounts.map((row) => [Number(row.id), row]));
  const categories = new Map(input.categories.map((row) => [Number(row.id), row]));

  return input.movements
    .filter((row) => {
      if (row.status !== "posted") return false;
      const at = Date.parse(String(row.occurred_at));
      return !Number.isNaN(at) && at >= from && at <= to;
    })
    .sort(
      (a, b) =>
        Date.parse(String(b.occurred_at)) - Date.parse(String(a.occurred_at)) || Number(b.id) - Number(a.id),
    )
    .map((row): BudgetScopedMovement => {
      const category = row.category_id == null ? undefined : categories.get(Number(row.category_id));
      const source = row.source_account_id == null ? undefined : accounts.get(Number(row.source_account_id));
      const destination = row.destination_account_id == null ? undefined : accounts.get(Number(row.destination_account_id));
      return {
        id: Number(row.id),
        movementType: String(row.movement_type),
        occurredAt: String(row.occurred_at),
        description: typeof row.description === "string" ? row.description : null,
        categoryId: toId(row.category_id),
        categoryName: category?.name == null ? null : displayCategoryName(String(category.name)),
        spendTypeId: toId(row.spend_type_id),
        categoryDefaultSpendTypeId: toId(category?.default_spend_type_id),
        sourceAccountId: toId(row.source_account_id),
        sourceAccountName: source?.name == null ? null : String(source.name),
        sourceCurrencyCode: source?.currency_code == null ? null : String(source.currency_code),
        sourceAmount: toNumber(row.source_amount),
        destinationAccountId: toId(row.destination_account_id),
        destinationAccountName: destination?.name == null ? null : String(destination.name),
        destinationCurrencyCode: destination?.currency_code == null ? null : String(destination.currency_code),
        destinationAmount: toNumber(row.destination_amount),
      };
    });
}
