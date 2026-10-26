/**
 * Detecciones registradas en el teléfono cuyo movimiento todavía no llega al servidor (modo sin conexión).
 *
 * La lista de detecciones pendientes la da el servidor, y el servidor solo marca una detección como registrada cuando
 * recibe su movimiento. Con el modo sin conexión el movimiento se guarda al instante en el teléfono y viaja unos
 * segundos después (o cuando vuelve el internet): mientras tanto la tarjeta «Movimiento detectado» seguía en el inicio
 * como si nada, invitando a guardarla otra vez.
 *
 * Regla: una detección registrada aquí se oculta mientras su movimiento siga SIN ENVIAR. En cuanto sale del teléfono, el
 * servidor manda: si ya no la lista, se olvida; si la sigue listando (el envío fue rechazado), vuelve a mostrarse.
 * Vive en memoria: al reiniciar la app se pierde, y la detección reaparece solo si el movimiento sigue sin enviar.
 */

const registered = new Map<number, number>(); // suggestionId → movementId
/** Detecciones omitidas aquí cuyo aviso al servidor todavía no termina: se ocultan hasta que termine (bien o mal). */
const resolving = new Set<number>();

export function hideWhileResolving(suggestionId: number): void {
  resolving.add(suggestionId);
}

export function stopHidingResolved(suggestionId: number): void {
  resolving.delete(suggestionId);
}

export function rememberLocallyRegistered(suggestionId: number, movementId: number): void {
  registered.set(suggestionId, movementId);
}

export function forgetLocallyRegistered(suggestionId: number): void {
  registered.delete(suggestionId);
}

/**
 * Qué detecciones registradas aquí siguen con su movimiento sin enviar. Se pregunta ANTES de pedir la lista al servidor:
 * si el envío termina entre ambas cosas, la lista del servidor ya lo refleja y no se oculta nada de más.
 */
export async function stillLocalRegistrations(isPendingInsert: (movementId: number) => Promise<boolean>): Promise<Map<number, boolean>> {
  const checked = new Map<number, boolean>(); // suggestionId → ¿su movimiento sigue sin enviar?
  for (const [suggestionId, movementId] of [...registered]) {
    checked.set(suggestionId, await isPendingInsert(movementId).catch(() => false));
  }
  return checked;
}

/**
 * Aplica la regla a la lista del servidor y olvida lo que el servidor ya resolvió (o lo que debe volver a mostrarse).
 * Una detección registrada DESPUÉS de la comprobación (mientras se pedía la lista) sigue oculta hasta la próxima.
 */
export function withoutLocallyRegistered<T extends { id: number }>(serverList: readonly T[], checked: ReadonlyMap<number, boolean>): T[] {
  const listed = new Set(serverList.map((item) => item.id));
  for (const suggestionId of [...registered.keys()]) {
    const stillLocal = checked.get(suggestionId);
    if (stillLocal === undefined) continue;
    if (!listed.has(suggestionId) || !stillLocal) registered.delete(suggestionId);
  }
  return serverList.filter((item) => !registered.has(item.id) && !resolving.has(item.id));
}

/** Solo para pruebas. */
export function resetLocallyRegistered(): void {
  registered.clear();
  resolving.clear();
}
