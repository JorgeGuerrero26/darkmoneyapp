import { addDays, differenceInCalendarDays, parseISO } from "date-fns";

/**
 * Calcula el próximo período manteniendo la duración exacta en días.
 * Evita el problema de "addMonths" en febrero/fines de mes.
 * Ejemplos:
 *   2026-06-01..2026-06-30 → 2026-07-01..2026-07-30 (30 días)
 *   2026-01-01..2026-01-31 → 2026-02-01..2026-03-03 (31 días, cruza febrero)
 *   2026-12-15..2027-01-14 → 2027-01-15..2027-02-13 (31 días, cruza año)
 */
export function nextPeriodFor(
  periodStart: string,
  periodEnd: string,
): { periodStart: string; periodEnd: string } {
  const start = parseISO(periodStart);
  const end = parseISO(periodEnd);
  const durationDays = differenceInCalendarDays(end, start);
  const nextStart = addDays(end, 1);
  const nextEnd = addDays(nextStart, durationDays);
  return {
    periodStart: nextStart.toISOString().slice(0, 10),
    periodEnd: nextEnd.toISOString().slice(0, 10),
  };
}
