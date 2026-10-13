/**
 * UUID v4 para identificar operaciones de la cola (`op_id`). Hermes no trae crypto.randomUUID y
 * aquí no hace falta aleatoriedad criptográfica: solo que dos operaciones no coincidan nunca
 * (mismo criterio que `newClientDedupeKey`, lib/idempotency.ts).
 */
export function newOpId(): string {
  const hex = (count: number) =>
    Array.from({ length: count }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}
