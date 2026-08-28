import { supabase } from "./supabase";

/**
 * Resuelve el token de sesión **antes** de que empiece a contar el reloj de una consulta.
 *
 * ## El problema que arregla
 *
 * `supabase.rpc(...)` resuelve el token por dentro, y para eso toma el **lock de auth** de
 * supabase-js. Al volver de segundo plano ese lock está contendido: la app está refrescando la
 * sesión justo cuando las consultas arrancan. Cada consulta espera su turno.
 *
 * Eso no sería grave si no fuera porque `withTimeout(supabase.rpc(...), 12_000)` empieza a
 * contar **al crear la promesa**, o sea antes del token. Así que el presupuesto de 12 s se lo
 * come una espera de lock en la que la red no ha hecho absolutamente nada, y la consulta muere
 * por "timeout" con la base respondiendo en 160 ms.
 *
 * Medido en `app_error_logs`: en las 5 ráfagas de las últimas dos semanas, las tres consultas de
 * obligaciones aparecen SIEMPRE juntas (29, 28 y 22 apariciones), y el episodio del 2026-08-27
 * a las 21:47 cierra con `auth: foreground reconcile devolvió null con sesión local viva` — el
 * lock contendido, en el mismo segundo.
 *
 * ## Por qué se coalesce
 *
 * Si las tres consultas piden el token a la vez, se turnan en el lock y la última espera el
 * triple. Compartiendo una sola promesa, el lock se toma **una vez** y las tres salen juntas.
 */
let warming: Promise<void> | null = null;
let lastWarmAt = 0;

/** Un token recién resuelto sigue siendo válido: no hace falta volver a pedir el lock. */
const WARM_TTL_MS = 30_000;

/**
 * Techo de espera. Si el lock no se libera en este plazo se sigue igualmente: la consulta hará
 * su propio intento y fallará con un error de red de verdad, que es información útil. Colgarse
 * aquí para siempre sería peor que el problema original.
 */
const WARM_MAX_MS = 8_000;

export function resetAuthWarmupForTests() {
  warming = null;
  lastWarmAt = 0;
}

export async function warmAuthToken(): Promise<void> {
  if (!supabase) return;
  if (Date.now() - lastWarmAt < WARM_TTL_MS) return;
  if (warming) return warming;

  warming = (async () => {
    try {
      await Promise.race([
        supabase.auth.getSession(),
        new Promise((resolve) => setTimeout(resolve, WARM_MAX_MS)),
      ]);
      lastWarmAt = Date.now();
    } catch {
      // Da igual por qué falló: la consulta lo intentará por su cuenta y su error sí será real.
    } finally {
      warming = null;
    }
  })();

  return warming;
}
