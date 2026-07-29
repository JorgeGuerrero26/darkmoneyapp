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
 * Un timeout/error de transporte después de enviar un POST es ambiguo: el servidor
 * puede haber confirmado el insert aunque la respuesta no haya vuelto. Solo esos
 * errores permiten consultar la clave idempotente; errores SQL/RLS/validación no.
 */
export function shouldConfirmIdempotentWrite(
  dedupeKey: string | null | undefined,
  error: IdempotentWriteError | null | undefined,
): boolean {
  if (!dedupeKey || !error) return false;
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
