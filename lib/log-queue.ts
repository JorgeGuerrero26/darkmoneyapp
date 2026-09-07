/**
 * La cola de registros que no llegaron a subir.
 *
 * Módulo aparte y sin dependencias a propósito, por la misma razón que `fetch-timeout-budget`:
 * `error-logger` arrastra AsyncStorage y el cliente de Supabase, que no se pueden cargar en un
 * test unitario — y esta regla, la de qué se tira cuando la cola se llena, es justo la que
 * conviene tener probada.
 */

/**
 * Cuántos registros caídos se guardan mientras no haya red.
 *
 * Suficiente para una ráfaga de arranque —el episodio del 2026-09-06 fueron once en veinte
 * segundos— y bastante poco como para que la cola no se coma el disco si el teléfono pasa el
 * día sin cobertura.
 */
export const MAX_PENDING_LOGS = 40;

/**
 * Añade al final y descarta por el principio: si hay que perder algo, que sea lo viejo. El
 * fallo que se está investigando es siempre el último.
 */
export function appendBounded<T>(queue: T[], row: T, max: number = MAX_PENDING_LOGS): T[] {
  const next = [...queue, row];
  return next.length <= max ? next : next.slice(next.length - max);
}
