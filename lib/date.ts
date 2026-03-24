/**
 * Perú siempre es UTC-5 (sin horario de verano / DST).
 * PERU_OFFSET_MS: cuántos ms hay que RESTAR al UTC para obtener hora Perú.
 */
const PERU_OFFSET_MS = 5 * 60 * 60 * 1000;

/** "YYYY-MM-DD" para HOY en hora de Perú (no en UTC del dispositivo) */
export function todayPeru(): string {
  return new Date(Date.now() - PERU_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Convierte "YYYY-MM-DD" a timestamp ISO para guardar en DB.
 *
 * Siempre usa la hora actual del celular (en zona Perú) combinada con
 * la fecha elegida por el usuario. Así los movimientos del mismo día
 * quedan ordenados por hora real de creación.
 *
 * Ejemplo: usuario elige "2025-03-19" a las 15:45 hora Perú →
 *   guarda "2025-03-19T20:45:00.000Z" (15:45 Perú = 20:45 UTC)
 */
export function dateStrToISO(dateStr: string): string {
  // Hora actual en Perú (restar 5 h al UTC del dispositivo)
  const peruNow = new Date(Date.now() - PERU_OFFSET_MS);
  const h   = peruNow.getUTCHours();
  const min = peruNow.getUTCMinutes();
  const s   = peruNow.getUTCSeconds();
  const ms  = peruNow.getUTCMilliseconds();

  // Combinar fecha elegida + hora Perú → convertir a UTC (sumar 5 h)
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h + 5, min, s, ms)).toISOString();
}

/**
 * Extrae "YYYY-MM-DD" en hora Perú desde un timestamp UTC almacenado en DB.
 * Resta 5 h para convertir UTC → hora Perú antes de leer la fecha.
 *
 * Ejemplos:
 *   "2025-03-20T17:00:00Z" → "2025-03-20" (mediodía Perú) ✓
 *   "2025-03-20T23:00:00Z" → "2025-03-20" (6 pm Perú)     ✓
 *   "2025-03-20T00:00:00Z" → "2025-03-19" (7 pm Perú día ant.) — dato viejo mal guardado
 */
export function isoToDateStr(isoString: string): string {
  const peruMs = new Date(isoString).getTime() - PERU_OFFSET_MS;
  return new Date(peruMs).toISOString().slice(0, 10);
}

/**
 * Crea un objeto Date LOCAL para mostrar una fecha almacenada en DB.
 * Parsea solo la parte de fecha (ignora la hora) para evitar desfases en render.
 */
export function parseDisplayDate(isoString: string): Date {
  const s = isoToDateStr(isoString);
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Convierte "YYYY-MM-DD" al inicio del día en UTC equivalente de hora Perú.
 * Usar en el filtro gte("occurred_at", ...) de Supabase.
 * Medianoche Perú = 05:00 UTC del mismo día.
 */
export function filterDateFrom(dateStr: string): string {
  return `${dateStr}T05:00:00.000Z`;
}

/**
 * Convierte "YYYY-MM-DD" al fin del día en UTC equivalente de hora Perú.
 * Usar en el filtro lte("occurred_at", ...) de Supabase.
 * Fin de día Perú (23:59:59.999) = 04:59:59.999 UTC del día siguiente.
 */
export function filterDateTo(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const nextDayStartUTC = Date.UTC(y, m - 1, d + 1, 5, 0, 0);
  return new Date(nextDayStartUTC - 1).toISOString();
}
