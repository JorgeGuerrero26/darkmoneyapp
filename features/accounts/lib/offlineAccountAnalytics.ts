import { displayCategoryName } from "../../../lib/category-display-name";
import type { AccountMovementAnalytics } from "../../../services/queries/accounts";

type Row = Record<string, unknown>;

/**
 * Movimientos de una cuenta para su analítica, leídos de la copia local (servidor + lo que todavía no se envió).
 * Misma selección y mismo orden que la consulta al servidor: confirmados que entran o salen de la cuenta, más
 * recientes primero, con un tope (`limit`).
 */
export function buildLocalAccountAnalytics(input: {
  movements: Row[];
  categories: Row[];
  accountId: number;
  limit: number;
}): AccountMovementAnalytics[] {
  const categories = new Map(input.categories.map((row) => [Number(row.id), row]));
  const amount = (value: unknown) => (value ? Number(value) : null);
  return input.movements
    .filter(
      (row) =>
        row.status === "posted" &&
        (Number(row.source_account_id) === input.accountId || Number(row.destination_account_id) === input.accountId),
    )
    .sort(
      (a, b) =>
        Date.parse(String(b.occurred_at)) - Date.parse(String(a.occurred_at)) || Number(b.id) - Number(a.id),
    )
    .slice(0, input.limit)
    .map((row): AccountMovementAnalytics => {
      const category = row.category_id == null ? undefined : categories.get(Number(row.category_id));
      return {
        id: Number(row.id),
        movementType: String(row.movement_type),
        status: String(row.status),
        occurredAt: String(row.occurred_at),
        description: (row.description as string | null) ?? null,
        sourceAccountId: row.source_account_id == null ? null : Number(row.source_account_id),
        sourceAmount: amount(row.source_amount),
        destinationAccountId: row.destination_account_id == null ? null : Number(row.destination_account_id),
        destinationAmount: amount(row.destination_amount),
        categoryId: row.category_id == null ? null : Number(row.category_id),
        categoryName: category?.name == null ? null : displayCategoryName(String(category.name)),
      };
    });
}
