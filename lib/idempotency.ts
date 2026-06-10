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
