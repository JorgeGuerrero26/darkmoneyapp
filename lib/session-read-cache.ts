/**
 * Caché de lecturas de la sesión, con dos capas y una ventana deliberadamente corta.
 *
 * El problema medido (2026-07-29, iPhone del usuario): la app lee la sesión **16-19 veces** en un
 * solo arranque, y cada lectura son 1+N accesos SECUENCIALES al Keychain. Salen 48-57 accesos que
 * cuestan ~250 ms — el **42%** de un arranque rápido de 588 ms. La sesión no cambia durante el
 * arranque, así que casi todo eso es desperdicio.
 *
 * Por qué NO un caché indefinido: la tarea headless de notificaciones corre en otro contexto JS y
 * también refresca y escribe la sesión. Una copia obsoleta aquí significa mandar un refresh token
 * viejo, que el servidor rechaza, y **perder la sesión del usuario**. Esta app ya se llevó ese
 * golpe (de ahí que exista `recoverSession()`).
 *
 * Las dos capas:
 *  1. **Coalescing de lecturas en vuelo** — riesgo cero: varias llamadas simultáneas a la misma
 *     key comparten una sola lectura. No cachea nada más allá de esa lectura.
 *  2. **TTL corto** — acota la ventana en la que una escritura de otro contexto puede quedar sin
 *     verse. Cubre la ráfaga del arranque y expira enseguida.
 *
 * Toda escritura o borrado en ESTE proceso invalida al instante, así que el riesgo se limita a
 * escrituras hechas por otro contexto dentro de la ventana del TTL.
 */

/** Suficiente para la ráfaga del arranque, corto para no arrastrar un token viejo. */
export const SESSION_CACHE_TTL_MS = 3000;

type Entry = { value: string | null; at: number };

export class SessionReadCache {
  private fresh = new Map<string, Entry>();
  private inFlight = new Map<string, Promise<string | null>>();

  constructor(
    private readonly ttlMs: number = SESSION_CACHE_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Devuelve el valor cacheado si sigue fresco; si hay una lectura en vuelo para la misma key se
   * engancha a ella; si no, ejecuta `read` una sola vez.
   */
  async get(key: string, read: () => Promise<string | null>): Promise<string | null> {
    const hit = this.fresh.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    let promise: Promise<string | null>;
    promise = read()
      .then((value) => {
        // Una escritura o invalidación puede desacoplar esta lectura mientras sigue en vuelo.
        // Solo la lectura que todavía está registrada puede publicar su resultado.
        if (this.inFlight.get(key) === promise) {
          this.fresh.set(key, { value, at: this.now() });
          return value;
        }

        // Si mientras tanto hubo una escritura autoritativa (incluido logout = null), tampoco
        // entregar el valor viejo al caller que inició esta lectura.
        const authoritative = this.fresh.get(key);
        return authoritative ? authoritative.value : value;
      })
      .finally(() => {
        // No borrar una lectura más nueva que empezó tras invalidar esta.
        if (this.inFlight.get(key) === promise) {
          this.inFlight.delete(key);
        }
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  /** Tras escribir en este proceso, el valor nuevo es autoritativo. */
  set(key: string, value: string | null): void {
    this.inFlight.delete(key);
    this.fresh.set(key, { value, at: this.now() });
  }

  /** Ante cualquier duda (borrado, fallo de escritura), olvidar y volver a leer del Keychain. */
  invalidate(key: string): void {
    this.inFlight.delete(key);
    this.fresh.delete(key);
  }
}
