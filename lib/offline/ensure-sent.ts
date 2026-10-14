import type { SyncReason } from "./runtime";

/** Lo mínimo del motor que necesita esta función (así se prueba sin base de datos). */
export type SendStateSource = {
  getState(): { online: boolean };
  pendingRowIds(workspaceId: number, table: string): Promise<number[]>;
  requestSync(reason: SyncReason): Promise<unknown>;
};

/**
 * ¿Ya llegó esta fila al servidor? Para acciones que dependen de que exista allí (invitar a alguien a una obligación
 * recién creada, por ejemplo: el servicio de invitaciones la busca en el servidor).
 *
 * - No está pendiente → ya se envió (o el modo sin conexión está apagado): `true`.
 * - Está pendiente y no hay internet → `false` sin esperar.
 * - Está pendiente y hay internet → pide enviar y espera hasta `timeoutMs`; `true` si salió, `false` si no.
 */
export async function waitUntilSent(
  runtime: SendStateSource,
  workspaceId: number,
  table: string,
  rowId: number,
  timeoutMs = 8000,
): Promise<boolean> {
  const stillPending = async () => (await runtime.pendingRowIds(workspaceId, table).catch(() => [] as number[])).includes(rowId);
  if (!(await stillPending())) return true;
  if (!runtime.getState().online) return false;
  await Promise.race([
    runtime.requestSync("write").catch(() => null),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
  return !(await stillPending());
}
