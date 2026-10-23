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
  let release: () => void = () => {};
  const cap = new Promise<void>((resolve) => { release = resolve; });
  const timer = setTimeout(() => release(), timeoutMs);
  await Promise.race([runtime.requestSync("write").catch(() => null), cap]);
  clearTimeout(timer); // si el envío terminó antes, el tope no debe quedar vivo
  return !(await stillPending());
}

/** Lo que necesita `whenSent`: además, avisar cuando cambia el estado del motor (tras cada envío). */
export type WatchableSendState = Pick<SendStateSource, "pendingRowIds"> & { subscribe(listener: () => void): () => void };

/**
 * Espera, SIN bloquear a nadie, a que la fila salga del teléfono: para escrituras de fondo que apuntan a ella en el servidor
 * (el aprendizaje de la categoría de un movimiento, por ejemplo). A diferencia de `waitUntilSent`, no se rinde a los pocos
 * segundos ni sin internet: se resuelve `true` cuando la fila ya no está pendiente (vuelve la red, se envía) y `false` solo si
 * pasa `maxWaitMs`. Vive en memoria: si la app se cierra antes, lo que esperaba se pierde (nunca se escribe a destiempo).
 */
export function whenSent(
  runtime: WatchableSendState,
  workspaceId: number,
  table: string,
  rowId: number,
  maxWaitMs = 30 * 60_000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    let checking = false;
    let again = false;
    let unsubscribe: () => void = () => {};
    const finish = (sent: boolean) => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimeout(timer);
      resolve(sent);
    };
    const check = async () => {
      if (done) return;
      if (checking) {
        again = true;
        return;
      }
      checking = true;
      try {
        // Un fallo al leer la copia local no cuenta como «enviado»: se vuelve a mirar en el próximo cambio.
        const pending = await runtime.pendingRowIds(workspaceId, table).catch(() => null);
        if (pending && !pending.includes(rowId)) finish(true);
      } finally {
        checking = false;
        if (again && !done) {
          again = false;
          void check();
        }
      }
    };
    const timer = setTimeout(() => finish(false), maxWaitMs);
    unsubscribe = runtime.subscribe(() => void check());
    void check();
  });
}
