import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Las piezas puras del selector de fecha y hora (revisión 21, mockup AL).
 *
 * RN-free a propósito: la cuadrícula del mes y las etiquetas se pueden probar sueltas, que es lo
 * que evita repetir el error de las revisiones anteriores —un calendario que dice el mes cuatro
 * veces, o un "Martes, 1 De Septiembre" con *title case* inglés aplicado al español—.
 */

/** Domingo primero, como el mockup. */
export const WEEKDAY_INITIALS = ["D", "L", "M", "M", "J", "V", "S"] as const;

/**
 * Los días de un mes repartidos en semanas, con huecos delante hasta el primer día.
 *
 * `null` es un hueco: la primera semana empieza donde le toca al día 1, no en la primera casilla.
 */
export function monthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** "Septiembre 2026" — con la inicial en mayúscula y el resto no, que es como se escribe. */
export function monthTitle(year: number, month: number) {
  const label = format(new Date(year, month, 1), "LLLL yyyy", { locale: es });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * La fecha como se dice, no como se escribe en un formulario.
 *
 * "Hoy", "Ayer" y "Anteayer" ganan al formato largo porque es lo que uno diría; el resto va en
 * formato corto —"1 sep"—. El largo, "1 de septiembre de 2026", no cabía en media fila con un
 * icono de 44px delante y terminaba truncado en "1 de septiembre 2…".
 */
export function relativeDateLabel(dateStr: string, today: string): string {
  const date = parseISO(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  const base = parseISO(today);
  if (!Number.isNaN(base.getTime())) {
    const days = Math.round((base.getTime() - date.getTime()) / 86_400_000);
    if (days === 0) return "Hoy";
    if (days === 1) return "Ayer";
    if (days === 2) return "Anteayer";
    // Un movimiento puede fecharse adelante; sin esto, mañana se leia como "2 sep".
    if (days === -1) return "Mañana";
  }
  // El año solo cuando no es el mismo: dentro del año en curso es ruido.
  const sameYear = !Number.isNaN(base.getTime()) && base.getFullYear() === date.getFullYear();
  return format(date, sameYear ? "d MMM" : "d MMM yyyy", { locale: es });
}

/** "Hoy, 16:07" — el dato completo en una fila, que es como la fila lo enseña. */
export function dateTimeLabel(dateStr: string, timeStr: string | null, today: string): string {
  const date = relativeDateLabel(dateStr, today);
  return timeStr ? `${date}, ${timeStr}` : date;
}

/** Los tres atajos de arriba, con su fecha ya resuelta. */
export function dateShortcuts(today: string): { label: string; date: string }[] {
  const base = parseISO(today);
  if (Number.isNaN(base.getTime())) return [];
  return [0, 1, 2].map((back) => {
    const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() - back);
    return {
      label: back === 0 ? "Hoy" : back === 1 ? "Ayer" : "Anteayer",
      date: format(date, "yyyy-MM-dd"),
    };
  });
}
