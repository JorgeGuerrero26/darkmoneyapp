import { filterDateFrom, filterDateTo } from "../../../lib/date";
import type { MovementStatus, MovementType } from "../../../types/domain";

/**
 * Dimensiones de filtrado de la lista de movimientos. Se serializan en el
 * queryKey de React Query, así que mantener orden estable de propiedades
 * cuando se construye desde la pantalla.
 */
export type MovementFilters = {
  type?: MovementType;
  types?: MovementType[];
  status?: MovementStatus;
  accountId?: number;
  categoryId?: number;
  uncategorized?: boolean;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  movementIds?: number[];
};

/**
 * Subset del fluent de supabase que `applyMovementFilters` necesita.
 * Permite tests con mocks sin depender del cliente real.
 */
export type MovementFiltersBuilder<T> = {
  in: (column: string, values: readonly (string | number)[]) => T;
  eq: (column: string, value: string | number) => T;
  gte: (column: string, value: string) => T;
  lte: (column: string, value: string) => T;
  or: (filter: string) => T;
  is: (column: string, value: null) => T;
  ilike: (column: string, pattern: string) => T;
};

/**
 * Aplica los filtros de movimientos a un query builder fluent (supabase u
 * otro). Función pura, sin red, testeable con un mock que registra llamadas.
 *
 * Reglas:
 *  - `types[]` tiene prioridad sobre `type` (multi-select gana sobre single).
 *  - `uncategorized` excluye categoryId y restringe a tipos cashflow.
 *  - `accountId` busca como origen O destino.
 *  - `search` aplica ilike sobre description.
 */
export function applyMovementFilters<T extends MovementFiltersBuilder<T>>(
  query: T,
  filters: MovementFilters,
): T {
  let q: T = query;
  if (filters.types?.length) q = q.in("movement_type", filters.types);
  else if (filters.type) q = q.eq("movement_type", filters.type);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.dateFrom) q = q.gte("occurred_at", filterDateFrom(filters.dateFrom));
  if (filters.dateTo) q = q.lte("occurred_at", filterDateTo(filters.dateTo));
  if (filters.accountId) {
    q = q.or(
      `source_account_id.eq.${filters.accountId},destination_account_id.eq.${filters.accountId}`,
    );
  }
  if (filters.uncategorized) {
    q = q
      .is("category_id", null)
      .in("movement_type", ["income", "refund", "expense", "subscription_payment", "obligation_payment"]);
  } else if (filters.categoryId) {
    q = q.eq("category_id", filters.categoryId);
  }
  if (filters.search) {
    q = q.ilike("description", `%${filters.search}%`);
  }
  if (filters.movementIds?.length) {
    q = q.in("id", filters.movementIds);
  }
  return q;
}
