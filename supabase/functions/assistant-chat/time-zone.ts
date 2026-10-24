/**
 * Días de calendario en la zona del perfil del usuario.
 *
 * El servidor corre en UTC. Antes los rangos se pedían como `dateFrom` y `${dateTo}T23:59:59`
 * sin zona, que Postgres lee como UTC: el día terminaba a las 7 p. m. de Lima. Un gasto de las
 * 9 p. m. del último día quedaba fuera de "este mes", y uno de las 9 p. m. del día anterior al
 * inicio entraba. Igual "hoy" en la proyección pasaba a mañana desde las 7 p. m.
 */

export const DEFAULT_TIME_ZONE = "America/Lima";

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
  const candidate = typeof timeZone === "string" ? timeZone.trim() : "";
  return candidate && isValidTimeZone(candidate) ? candidate : DEFAULT_TIME_ZONE;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsIn(date: Date, timeZone: string): Parts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** "YYYY-MM-DD" del día de calendario de `date` en `timeZone`. */
export function todayInZone(timeZone: string, date = new Date()): string {
  const { year, month, day } = partsIn(date, timeZone);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Suma días a un "YYYY-MM-DD" sin pasar por la hora local del servidor. */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Minutos que `timeZone` va por delante de UTC en el instante `utcMs` (Lima: -300). */
function offsetMinutes(utcMs: number, timeZone: string): number {
  const p = partsIn(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000);
}

/** Instante UTC (ISO) en que empieza el día `ymd` en `timeZone`. */
export function dayStartUtc(ymd: string, timeZone: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Dos pasadas: si entre medianoche UTC y la local hay un cambio de horario, la segunda lo corrige.
  let instant = guess - offsetMinutes(guess, timeZone) * 60_000;
  instant = guess - offsetMinutes(instant, timeZone) * 60_000;
  return new Date(instant).toISOString();
}

/**
 * Rango de `occurred_at` para los días `from`..`to` (ambos incluidos) en `timeZone`:
 * `gte` es el inicio del primer día y `lt` el inicio del día siguiente al último.
 */
export function dayRangeUtc(from: string, to: string, timeZone: string): { gte: string; lt: string } {
  return { gte: dayStartUtc(from, timeZone), lt: dayStartUtc(addDaysYmd(to, 1), timeZone) };
}

/** Fecha larga para el modelo ("martes, 21 de octubre de 2026"). */
export function longDateInZone(timeZone: string, date = new Date()): string {
  return date.toLocaleString("es-PE", { timeZone, dateStyle: "full" });
}

/**
 * País probable a partir de la zona horaria del perfil, para elegir los criterios financieros de ese país
 * (aguinaldo o gratificación, CAT o TCEA, su regulador…). Solo una pista: la zona no prueba la residencia, por eso el
 * asistente la usa como supuesto y no como hecho. null = no se reconoce y se usan términos neutros.
 */
const COUNTRY_BY_TIME_ZONE: Record<string, string> = {
  "America/Lima": "Perú",
  "America/Bogota": "Colombia",
  "America/Guayaquil": "Ecuador",
  "America/La_Paz": "Bolivia",
  "America/Santiago": "Chile",
  "America/Argentina/Buenos_Aires": "Argentina",
  "America/Buenos_Aires": "Argentina",
  "America/Sao_Paulo": "Brasil",
  "America/Asuncion": "Paraguay",
  "America/Montevideo": "Uruguay",
  "America/Caracas": "Venezuela",
  "America/Panama": "Panamá",
  "America/Costa_Rica": "Costa Rica",
  "America/Guatemala": "Guatemala",
  "America/El_Salvador": "El Salvador",
  "America/Tegucigalpa": "Honduras",
  "America/Managua": "Nicaragua",
  "America/Santo_Domingo": "República Dominicana",
  "America/Mexico_City": "México",
  "America/Monterrey": "México",
  "America/Tijuana": "México",
  "America/Cancun": "México",
  "America/New_York": "Estados Unidos",
  "America/Chicago": "Estados Unidos",
  "America/Denver": "Estados Unidos",
  "America/Phoenix": "Estados Unidos",
  "America/Los_Angeles": "Estados Unidos",
  "America/Puerto_Rico": "Puerto Rico",
  "Europe/Madrid": "España",
  "Atlantic/Canary": "España",
  "Europe/London": "Reino Unido",
};

export function countryForTimeZone(timeZone: string): string | null {
  return COUNTRY_BY_TIME_ZONE[timeZone] ?? null;
}
