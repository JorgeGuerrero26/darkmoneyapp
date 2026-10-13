import type { SqlExecutor } from "./sql-driver";

/**
 * Bloques de IDs reales reservados al servidor (`reserve_ids`) para crear filas sin red.
 * Un ID solo se usa una vez; nunca se inventan (chocarían con la secuencia: ver Fase 0, S3).
 */
export const POOL_LOW_WATERMARK = 50;
export const POOL_TARGET = 200;
/** Tope por llamada de `reserve_ids`. */
export const POOL_MAX_RESERVE = 500;

export async function poolSize(db: SqlExecutor, workspaceId: number, table: string): Promise<number> {
  const row = await db.get<{ n: number }>(`select count(*) as n from id_pool where workspace_id = ? and table_name = ?`, [
    workspaceId,
    table,
  ]);
  return Number(row?.n ?? 0);
}

export async function addPoolIds(db: SqlExecutor, workspaceId: number, table: string, ids: number[]): Promise<void> {
  for (const id of ids) {
    await db.run(`insert or ignore into id_pool (workspace_id, table_name, id) values (?, ?, ?)`, [workspaceId, table, id]);
  }
}

/** Toma el ID más bajo disponible, o null si el bloque se agotó. Llamar dentro de una transacción. */
export async function takePoolId(db: SqlExecutor, workspaceId: number, table: string): Promise<number | null> {
  const row = await db.get<{ id: number }>(
    `select min(id) as id from id_pool where workspace_id = ? and table_name = ?`,
    [workspaceId, table],
  );
  if (row?.id == null) return null;
  await db.run(`delete from id_pool where workspace_id = ? and table_name = ? and id = ?`, [workspaceId, table, row.id]);
  return Number(row.id);
}

/** Cuántos IDs pedir para volver al objetivo (0 si todavía hay de sobra). */
export function idsToReserve(currentSize: number): number {
  if (currentSize >= POOL_LOW_WATERMARK) return 0;
  return Math.min(POOL_TARGET - currentSize, POOL_MAX_RESERVE);
}
