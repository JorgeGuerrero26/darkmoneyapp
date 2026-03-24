/**
 * Historial de obligación: más reciente primero.
 * Si varios eventos comparten el mismo día (mismo `eventDate` sin hora o idéntico), desempata por `id` descendente.
 */
export function sortObligationEventsNewestFirst<T extends { id: number; eventDate: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) => {
    const byDate = b.eventDate.localeCompare(a.eventDate);
    if (byDate !== 0) return byDate;
    return b.id - a.id;
  });
}
