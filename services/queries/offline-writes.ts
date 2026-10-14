import { offlineRuntime } from "../../lib/offline/instance";
import { useOfflineLocalReady } from "../../lib/offline/react";
import type { WritableResourceTable } from "../../lib/offline/schema";

/**
 * Escrituras de catálogos por la base local (modo sin conexión, beta). Cada una devuelve `null`/`false`
 * cuando el modo está apagado, la tabla aún no se descargó o se agotaron los IDs reservados: el hook
 * sigue entonces su camino online de siempre, sin cambios.
 */

/** React Query pausa las mutaciones sin red salvo `always`; solo se pide cuando hay base local lista. */
export function useOfflineNetworkMode(workspaceId: number | null | undefined): "always" | "online" {
  return useOfflineLocalReady(workspaceId) ? "always" : "online";
}

/**
 * Un monto que la base local no puede guardar exacto (fracción de centavo) no es un error del usuario:
 * el servidor sí lo acepta, así que se sigue el camino online en vez de fallar.
 */
function isUnsupportedMoney(error: unknown): boolean {
  return error instanceof Error && /fracción de centavo|decimal válido/.test(error.message);
}

/** Quita `undefined` (JSON los descarta al enviar; el espejo local no debe guardarlos). */
function clean(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

export async function localCreate(
  workspaceId: number | null | undefined,
  table: WritableResourceTable,
  fields: Record<string, unknown>,
): Promise<{ id: number } | null> {
  if (!workspaceId) return null;
  try {
    const row = await offlineRuntime.createRow(workspaceId, table, clean(fields));
    return row ? { id: Number(row.id) } : null;
  } catch (error) {
    if (isUnsupportedMoney(error)) return null;
    throw error;
  }
}

export async function localUpdate(
  workspaceId: number | null | undefined,
  table: WritableResourceTable,
  id: number,
  fields: Record<string, unknown>,
): Promise<boolean> {
  if (!workspaceId) return false;
  try {
    return Boolean(await offlineRuntime.updateRow(workspaceId, table, id, clean(fields)));
  } catch (error) {
    if (isUnsupportedMoney(error)) return false;
    throw error;
  }
}

/** Mayor `sort_order` de la copia local (para numerar el siguiente igual que lo hace el camino online). null = sin copia lista. */
export async function localMaxSortOrder(workspaceId: number | null | undefined, table: "categories"): Promise<number | null> {
  if (!workspaceId) return null;
  const rows = await offlineRuntime.listRows(workspaceId, table);
  if (!rows) return null;
  return rows.reduce((max, row) => Math.max(max, Number(row.sort_order ?? 0) || 0), 0);
}

/** Filas de `table` que apuntan a `id` por `column` en la copia local; null = sin copia lista. */
export function localReferences(
  workspaceId: number | null | undefined,
  table: "movements" | "subscriptions" | "categories" | "budgets" | "movement_templates" | "recurring_income" | "obligations",
  column: string,
  id: number,
): Promise<number | null> {
  if (!workspaceId) return Promise.resolve(null);
  return offlineRuntime.countReferences(workspaceId, table, column, id);
}

export async function localDelete(
  workspaceId: number | null | undefined,
  table: WritableResourceTable,
  id: number,
): Promise<boolean> {
  if (!workspaceId) return false;
  return offlineRuntime.deleteRow(workspaceId, table, id);
}
