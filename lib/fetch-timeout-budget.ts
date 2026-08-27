/**
 * Cuánto plazo damos a cada llamada HTTP de supabase-js antes de abortarla.
 *
 * Abortar es una decisión SOLO del cliente: el servidor nunca se entera y termina de ejecutar
 * la sentencia igual. Por eso el plazo no puede ser el mismo para todo:
 *
 *   - Una LECTURA cortada pronto es barata: React Query reintenta sola y en silencio, y 12 s
 *     evita que la app se vea congelada tras un cambio de red (incidente 2026-07-27).
 *   - Una ESCRITURA cortada pronto fabrica ambigüedad: el servidor puede confirmar el INSERT
 *     justo después de que el cliente se rinda. Medido el 2026-08-26 a las 19:37 — el
 *     movimiento "Moto" quedó guardado a los ~12 s y al usuario se le mostró "No pudimos
 *     confirmar si se guardó" sobre un registro que existía.
 *
 * Con el usuario ya mirando el spinner, esperar unos segundos más es mucho mejor que dejarlo
 * dudando si registrarlo otra vez.
 *
 * Módulo aparte y sin dependencias a propósito: `lib/supabase.ts` arrastra AsyncStorage y el
 * keystore, que no se pueden cargar en un test unitario.
 */

export const READ_TIMEOUT_MS = 12_000;
export const WRITE_TIMEOUT_MS = 25_000;

const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function resolveFetchTimeoutMs(url: string, method: string | undefined): number {
  if (!WRITE_METHODS.has((method ?? "GET").toUpperCase())) return READ_TIMEOUT_MS;
  // Solo escrituras de tabla. Los RPC viajan por POST pero son mayormente lecturas, y en
  // /auth/v1 un refresh colgado 25 s congelaría el arranque entero.
  if (!url.includes("/rest/v1/")) return READ_TIMEOUT_MS;
  if (url.includes("/rest/v1/rpc/")) return READ_TIMEOUT_MS;
  return WRITE_TIMEOUT_MS;
}
