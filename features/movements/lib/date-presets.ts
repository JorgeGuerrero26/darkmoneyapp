import { calendarPartsIn, DEFAULT_TIME_ZONE } from "../../../lib/calendar-day";

function formatYmd(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10);
}

function monthRange(year: number, monthIndex: number, monthOffset: number) {
  const month = monthIndex + monthOffset;
  return {
    from: formatYmd(year, month, 1),
    to: formatYmd(year, month + 1, 0),
  };
}

/**
 * Rangos de días de calendario en la zona del perfil (Lima por defecto), los mismos que usa
 * Movimientos web y la consulta a Supabase.
 *
 * Se recalculan cada vez que cambia el día: eran una constante del módulo y, con la app viva en
 * segundo plano desde septiembre, «Este mes» seguía siendo septiembre el 1 de octubre y dejaba
 * fuera los movimientos de hoy.
 */
export function buildMovementDatePresets(referenceDate = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const { year, month } = calendarPartsIn(referenceDate, timeZone);
  const monthIndex = month - 1;
  const currentMonth = monthRange(year, monthIndex, 0);
  const previousMonth = monthRange(year, monthIndex, -1);
  const threeMonthsAgo = monthRange(year, monthIndex, -2);
  const sixMonthsAgo = monthRange(year, monthIndex, -5);

  return [
    { label: "Este mes", ...currentMonth },
    { label: "Mes anterior", ...previousMonth },
    { label: "Últimos 3 meses", from: threeMonthsAgo.from, to: currentMonth.to },
    { label: "Últimos 6 meses", from: sixMonthsAgo.from, to: currentMonth.to },
    { label: "Este año", from: `${year}-01-01`, to: currentMonth.to },
  ];
}
