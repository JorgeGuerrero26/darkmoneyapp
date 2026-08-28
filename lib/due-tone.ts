import { COLORS } from "../constants/theme";

/**
 * El único sitio donde se decide qué color lleva una fecha de vencimiento.
 *
 * ## La regla
 *
 * El amarillo es **advertencia de algo que todavía no pasó pero está cerca**. Nada más.
 *
 * | Estado | Color | Por qué |
 * |---|---|---|
 * | Ya venció | clay | Es un **hecho**, no un aviso. "Venció el 4 jun · marca el pago" |
 * | Vence en ≤ 7 días | **amarillo** | Lo único que de verdad urge |
 * | Vence más adelante | gris | "Vence 31 ene 2027" no advierte de nada |
 * | Sin fecha | gris | No hay nada que anticipar |
 *
 * Sin la línea entre *vencido* y *por vencer*, el amarillo y el clay significarían los dos
 * "vencimiento" y volveríamos al problema que hizo retirar el amarillo: un token con varios
 * significados no comunica ninguno.
 *
 * ## Por qué vive aquí y no en cada pantalla
 *
 * Hoy el umbral está repartido —3 días en unos sitios, 7 en otros, 30 en otro— y el color del
 * vencimiento estaba fijo en amarillo sin mirar la fecha, así que "Vence 31 ene 2027" gritaba
 * igual que uno de mañana. **Si cada módulo decide cuándo pinta amarillo, en tres meses vuelve
 * a significar tres cosas.**
 *
 * Lo que NO es advertencia y por tanto no entra aquí: un estado *pausado* (va en gris apagado)
 * y una *tasa de cambio* (es un dato neutro, va en hueso).
 */

/** Ventana de "está cerca". Se cambia AQUÍ y en ningún otro sitio. */
export const DUE_SOON_DAYS = 7;

export type DueTone = "overdue" | "soon" | "later" | "none";

/** Días de calendario entre hoy y la fecha, en la zona del dispositivo. Negativo = ya pasó. */
function daysUntil(dueDate: string, now: Date): number {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return Number.NaN;
  // Se comparan DÍAS, no instantes: algo que vence hoy a las 09:00 sigue venciendo hoy a las
  // 23:00, no "hace 14 horas".
  const a = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

export function dueTone(dueDate: string | null | undefined, now: Date = new Date()): DueTone {
  if (!dueDate) return "none";
  const days = daysUntil(dueDate, now);
  if (Number.isNaN(days)) return "none";
  if (days < 0) return "overdue";
  return days <= DUE_SOON_DAYS ? "soon" : "later";
}

export function dueToneColor(tone: DueTone): string {
  switch (tone) {
    case "overdue":
      return COLORS.expense;
    case "soon":
      return COLORS.warning;
    default:
      return COLORS.storm;
  }
}

/** Atajo para el caso normal: de la fecha al color, sin pasar por el tono. */
export function dueDateColor(dueDate: string | null | undefined, now?: Date): string {
  return dueToneColor(dueTone(dueDate, now));
}
