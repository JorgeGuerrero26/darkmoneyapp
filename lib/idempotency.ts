/**
 * Claves de idempotencia para inserts (movements.client_dedupe_key).
 *
 * No requiere aleatoriedad criptográfica: solo evita colisiones entre intentos
 * de registro distintos del mismo workspace (Hermes no trae crypto.randomUUID).
 */
export function newClientDedupeKey(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}:${time}-${rand}`;
}

type IdempotentWriteError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

/**
 * ¿El error dice "no sé si se guardó"?
 *
 * Un corte de transporte tras enviar la petición es AMBIGUO: el servidor pudo aplicarla y
 * perderse solo la respuesta. Un error con código SQL (RLS, validación, constraint) no: ahí
 * consta que no se guardó.
 *
 * La distinción importa en los dos sentidos. En un insert habilita confirmar por clave
 * idempotente. En un update decide si se puede revertir el cambio optimista: revertir tras un
 * abort le enseña al usuario los datos viejos junto a un error mientras el servidor ya tiene
 * los nuevos (reportado el 2026-08-13 al editar un movimiento).
 */
export function isAmbiguousTransportError(
  error: IdempotentWriteError | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code?.trim()) return false;

  const message = [error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    message.includes("abort") ||
    message.includes("timeout") ||
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("fetcherror") ||
    message.includes("networkerror")
  );
}

/**
 * Un timeout/error de transporte después de enviar un POST es ambiguo: el servidor
 * puede haber confirmado el insert aunque la respuesta no haya vuelto. Solo esos
 * errores permiten consultar la clave idempotente; errores SQL/RLS/validación no.
 */
export function shouldConfirmIdempotentWrite(
  dedupeKey: string | null | undefined,
  error: IdempotentWriteError | null | undefined,
): boolean {
  if (!dedupeKey) return false;
  return isAmbiguousTransportError(error);
}

/**
 * ¿El backend está despertando?
 *
 * PostgREST devuelve estos códigos cuando no pudo hablar con la base o recargar su caché de
 * esquema: el statement **nunca llegó a ejecutarse**. Por eso reintentar es seguro incluso en
 * escrituras no idempotentes — no hay nada que duplicar. El propio mensaje de PGRST002 lo dice:
 * "Could not query the database for the schema cache. Retrying."
 *
 * Pasa al abrir la app tras horas en segundo plano, que es justo cuando el usuario va deprisa a
 * registrar algo: medido el 2026-08-14 a las 06:41 (7 consultas en 2 s) y el 2026-08-25 a las
 * 06:46. Antes se mostraban como un fallo definitivo porque traían código, y
 * `isAmbiguousTransportError` descarta todo lo que lo tenga.
 */
const BACKEND_WARMUP_CODES = new Set(["PGRST001", "PGRST002", "PGRST003"]);

export function isBackendWarmingUp(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = typeof e.code === "string" ? e.code.trim() : "";
  if (BACKEND_WARMUP_CODES.has(code)) return true;
  // React Query envuelve el error en Error y el código viaja dentro del mensaje.
  const message = typeof e.message === "string" ? e.message : "";
  if (!message) return false;
  return (
    [...BACKEND_WARMUP_CODES].some((c) => message.includes(c)) ||
    message.toLowerCase().includes("schema cache")
  );
}

/**
 * Espera creciente entre intentos de confirmación. La suma (~7,7 s) es el margen que le damos
 * al servidor para terminar una escritura que el cliente ya abortó.
 */
export const IDEMPOTENT_CONFIRM_BACKOFF_MS = [0, 1_200, 2_500, 4_000];

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Tras un write ambiguo, busca la fila por su clave idempotente hasta que aparezca.
 *
 * La regla clave está en cuándo NO rendirse. Una lectura limpia que no devuelve fila parece
 * decir "el servidor contestó, no se guardó", y por eso el bucle se cortaba ahí. Es falso:
 * abortar es una decisión SOLO del cliente, el servidor nunca se entera y sigue ejecutando el
 * INSERT. El 2026-08-26 a las 19:37 el movimiento "Moto" se confirmó en la base justo cuando
 * el cliente se rindió, y el usuario recibió "no pudimos confirmar" sobre una fila que existía.
 * Ausencia de fila no es prueba de fracaso: es "todavía no".
 *
 * Solo se corta antes de tiempo si el propio SELECT falla con un error que NO es de transporte
 * (RLS, SQL, sesión): ahí la consulta está rota y repetirla no cambia nada.
 */
export async function confirmIdempotentWrite<T>(
  lookup: () => PromiseLike<{ data: T | null; error: IdempotentWriteError | null }>,
  opts?: { sleep?: (ms: number) => Promise<void>; schedule?: readonly number[] },
): Promise<T | null> {
  const sleep = opts?.sleep ?? sleepMs;
  for (const wait of opts?.schedule ?? IDEMPOTENT_CONFIRM_BACKOFF_MS) {
    if (wait > 0) await sleep(wait);
    const found = await lookup();
    if (found.data) return found.data;
    if (found.error && !isAmbiguousTransportError(found.error)) return null;
  }
  return null;
}
