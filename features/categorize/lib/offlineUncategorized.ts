import type { UncategorizedRow } from "../../../services/queries/uncategorized-movements";

type Row = Record<string, unknown>;

/**
 * Movimientos sin categoría desde la copia local. Misma regla que la consulta al servidor: confirmados, de tipo
 * gasto o ingreso (los traspasos no llevan categoría por diseño), más recientes primero y con un tope.
 */
export function buildLocalUncategorized(movements: Row[], limit: number): UncategorizedRow[] {
  return movements
    .filter((row) => row.status === "posted" && row.category_id == null && (row.movement_type === "expense" || row.movement_type === "income"))
    .sort((a, b) => Date.parse(String(b.occurred_at)) - Date.parse(String(a.occurred_at)) || Number(b.id) - Number(a.id))
    .slice(0, limit)
    .map((row) => ({
      id: Number(row.id),
      description: (row.description as string | null) ?? null,
      occurred_at: String(row.occurred_at),
      source_amount: row.source_amount == null ? null : Number(row.source_amount),
      destination_amount: row.destination_amount == null ? null : Number(row.destination_amount),
      movement_type: String(row.movement_type),
    }));
}
