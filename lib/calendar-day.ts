export const DEFAULT_TIME_ZONE = "America/Lima";

export type CalendarParts = { year: number; month: number; day: number };

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** La zona del perfil si es válida; si no, Lima. Un texto raro en la BD no puede tumbar fechas. */
export function resolveTimeZone(timeZone?: string | null): string {
  const candidate = timeZone?.trim();
  return candidate && isValidTimeZone(candidate) ? candidate : DEFAULT_TIME_ZONE;
}

/** Año, mes (1–12) y día de `date` vistos desde `timeZone`, no desde el reloj del teléfono. */
export function calendarPartsIn(date: Date, timeZone: string): CalendarParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

/** "YYYY-MM-DD" del día de calendario en `timeZone`. */
export function dayKeyIn(date: Date, timeZone: string): string {
  const { year, month, day } = calendarPartsIn(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
