import {
  movementActsAsIncome,
  movementDisplayAmount,
  movementIsTransfer,
} from "../../../lib/movement-amounts";
import type { MovementRecord } from "../../../types/domain";
import { DEFAULT_TIME_ZONE, dayKeyIn } from "../../../lib/calendar-day";

/**
 * Agrupa una lista plana de movimientos en secciones por fecha (formato fintech
 * estándar). Los movimientos ya vienen ordenados por `occurred_at DESC` desde
 * el servidor, así que recorremos en orden y emitimos una sección por día.
 *
 * Labels relativos para los últimos 6 días ("Hoy", "Ayer", "Lun 25 may"),
 * absolutos antes ("18 may 2026").
 *
 * NOTA: la shape `MovementListSection` se declara localmente para evitar
 * arrastrar React Native al tsc de tests. Es compatible con `ResourceSection`.
 */

export type MovementListSection = {
  key: string;
  label: string;
  hint?: string;
  data: MovementRecord[];
  headerVariant?: "default" | "divider" | "hidden";
  /** Neto del dia, ya formateado. Lo pinta el encabezado pegajoso a la derecha. */
  trailing?: string;
  trailingColor?: string;
  /**
   * Neto del dia SIN formatear, y su moneda.
   *
   * Se deja crudo a proposito: quien pinta decide como mostrarlo, porque el modo privacidad
   * vive en la capa de UI y esta funcion es pura. `netCurrencyCode` queda en null cuando el
   * dia mezcla monedas — sumar soles con dolares daria un total falso, y es mejor no enseñar
   * ninguno que enseñar uno inventado.
   */
  netAmount: number;
  netCurrencyCode: string | null;
};

/** YYYY-MM-DD en la zona del perfil (Lima por defecto), sin date-fns para seguir siendo puro. */
function ymdInLima(date: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return dayKeyIn(date, timeZone);
}

function dayDiff(reference: string, target: string): number {
  // Diferencia en días entre dos YYYY-MM-DD strings. Positivo si target está antes.
  const [y1, m1, d1] = reference.split("-").map(Number);
  const [y2, m2, d2] = target.split("-").map(Number);
  const refDate = Date.UTC(y1, m1 - 1, d1);
  const tgtDate = Date.UTC(y2, m2 - 1, d2);
  return Math.round((refDate - tgtDate) / 86_400_000);
}

const WEEKDAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDateLabel(ymd: string, todayYmd: string): string {
  const diff = dayDiff(todayYmd, ymd);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";

  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  if (diff > 1 && diff < 7) {
    const dow = WEEKDAYS_ES[date.getUTCDay()];
    return `${dow} ${d} ${MONTHS_ES[m - 1]}`;
  }

  const currentYear = Number(todayYmd.slice(0, 4));
  if (y === currentYear) {
    return `${d} ${MONTHS_ES[m - 1]}`;
  }
  return `${d} ${MONTHS_ES[m - 1]} ${y}`;
}

export function groupMovementsByDate(
  movements: readonly MovementRecord[],
  options?: { now?: Date; timeZone?: string },
): MovementListSection[] {
  if (movements.length === 0) return [];

  const timeZone = options?.timeZone ?? DEFAULT_TIME_ZONE;
  const todayYmd = ymdInLima(options?.now ?? new Date(), timeZone);
  const sections: MovementListSection[] = [];
  let currentKey: string | null = null;
  let currentBucket: MovementRecord[] | null = null;

  for (const movement of movements) {
    const occurredDate = new Date(movement.occurredAt);
    if (Number.isNaN(occurredDate.getTime())) continue;
    const ymd = ymdInLima(occurredDate, timeZone);

    if (ymd !== currentKey) {
      currentKey = ymd;
      currentBucket = [];
      sections.push({
        key: ymd,
        label: formatDateLabel(ymd, todayYmd),
        data: currentBucket,
        headerVariant: "divider",
        netAmount: 0,
        netCurrencyCode: null,
      });
    }
    currentBucket!.push(movement);
  }

  for (const section of sections) {
    section.netAmount = 0;
    const currencies = new Set<string>();
    for (const movement of section.data) {
      // Las transferencias no suman ni restan: la plata se mueve, no se gana ni se pierde.
      if (movementIsTransfer(movement)) continue;
      const code = movement.sourceCurrencyCode ?? movement.destinationCurrencyCode ?? null;
      if (code) currencies.add(code);
      const amount = Math.abs(movementDisplayAmount(movement));
      section.netAmount += movementActsAsIncome(movement) ? amount : -amount;
    }
    section.netCurrencyCode = currencies.size === 1 ? [...currencies][0] : null;
  }

  return sections;
}

/** Exported para tests. */
export const __testing = {
  ymdInLima,
  dayDiff,
  formatDateLabel,
};
