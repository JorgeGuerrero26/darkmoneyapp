type Occurrence = { dueDate: string; status: string };

/**
 * Qué cobro se está pagando: el más antiguo que sigue sin pagar.
 *
 * La fecha de próximo cobro que guarda la suscripción puede ir por delante del historial (p. ej. dice 4 de octubre
 * mientras el 4 de setiembre sigue sin pagarse): el servidor calcula el próximo cobro desde el primer mes pendiente.
 * Si la hoja de pago propusiera octubre, el pago quedaría suelto y setiembre seguiría "atrasada". Con el historial
 * cargado se propone el primer pendiente; sin él (o si no hay pendientes) se usa la fecha guardada, como siempre.
 * Nunca se propone una fecha POSTERIOR a la guardada.
 */
export function oldestUnpaidDueDate(nextDueDate: string, occurrences: readonly Occurrence[] | null | undefined): string {
  const pending = (occurrences ?? []).filter((occurrence) => occurrence.status === "scheduled").map((occurrence) => occurrence.dueDate).sort();
  const oldest = pending[0];
  return oldest && oldest < nextDueDate ? oldest : nextDueDate;
}

/**
 * La fecha que lleva el movimiento del pago: la del cobro si todavía no vence, y HOY si ya venció.
 *
 * Un pago atrasado con la fecha del cobro (p. ej. 4 de setiembre, pagado en octubre) quedaba fuera del filtro «Este mes» de
 * Movimientos y no reflejaba cuándo salió el dinero. El cobro que se paga no cambia (el historial de la suscripción sigue
 * marcando ese mes como pagado); solo la fecha del movimiento, que además se puede editar en la hoja.
 */
export function defaultPaymentDate(dueDate: string, today: string): string {
  return dueDate < today ? today : dueDate;
}
