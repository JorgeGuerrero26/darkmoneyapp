import type { DashboardMovementRow } from "./dashboard-row";

/**
 * Movimientos del inicio leídos de la copia del teléfono (modo sin conexión, beta).
 *
 * Las consultas del inicio (últimos 90 días, historial anual, proyección y detalle de un día) iban siempre al
 * servidor: sin internet, un gasto recién guardado no aparecía en los totales del mes. Con la copia local lista
 * salen de ella, con el MISMO filtro, orden y forma que la consulta del servidor, así que el resto del inicio no
 * nota la diferencia. Puro, sin React Native: se prueba solo.
 */

type ServerRow = Record<string, unknown>;

export type LocalDashboardRange = {
  /** Desde (incluido), ISO. */
  from: string;
  /** Hasta (excluido), ISO. Sin él, hasta hoy y lo que venga. */
  until?: string | null;
  /** Solo movimientos aplicados (el detalle de un día); el resto también trae pendientes y anulados, como el servidor. */
  postedOnly?: boolean;
};

function amount(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

function nullableAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function idOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Filtra y ordena como la consulta del servidor: rango [from, until), más reciente primero y, a igual fecha, id mayor primero. */
export function selectLocalDashboardRows(rows: readonly ServerRow[], range: LocalDashboardRange): ServerRow[] {
  const from = Date.parse(range.from);
  const until = range.until ? Date.parse(range.until) : Number.POSITIVE_INFINITY;
  const at = (row: ServerRow) => Date.parse(String(row.occurred_at));
  return rows
    .filter((row) => {
      const time = at(row);
      if (Number.isNaN(time) || time < from || time >= until) return false;
      return !range.postedOnly || row.status === "posted";
    })
    .sort((a, b) => at(b) - at(a) || Number(b.id) - Number(a.id));
}

function baseFields(row: ServerRow) {
  return {
    id: Number(row.id),
    movementType: String(row.movement_type),
    status: String(row.status),
    occurredAt: String(row.occurred_at),
    sourceAccountId: idOrNull(row.source_account_id),
    destinationAccountId: idOrNull(row.destination_account_id),
    categoryId: idOrNull(row.category_id),
    spendTypeId: idOrNull(row.spend_type_id),
    counterpartyId: idOrNull(row.counterparty_id),
    description: typeof row.description === "string" ? row.description : "",
  };
}

/** Misma forma que `useDashboardMovementsQuery` (montos ausentes = 0). */
export function toDashboardMovementRow(row: ServerRow): DashboardMovementRow {
  return { ...baseFields(row), sourceAmount: amount(row.source_amount), destinationAmount: amount(row.destination_amount) };
}

/** Misma forma que el detalle de un día (montos ausentes = null). */
export function toDashboardDayRow(row: ServerRow): Omit<DashboardMovementRow, "sourceAmount" | "destinationAmount"> & {
  sourceAmount: number | null;
  destinationAmount: number | null;
} {
  return { ...baseFields(row), sourceAmount: nullableAmount(row.source_amount), destinationAmount: nullableAmount(row.destination_amount) };
}

export function localDashboardMovements(rows: readonly ServerRow[], range: LocalDashboardRange): DashboardMovementRow[] {
  return selectLocalDashboardRows(rows, range).map(toDashboardMovementRow);
}
