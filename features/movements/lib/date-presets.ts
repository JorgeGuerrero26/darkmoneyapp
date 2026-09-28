const PERU_OFFSET_MS = 5 * 60 * 60 * 1000;

function formatUtcDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthRange(referenceDate: Date, monthOffset: number) {
  const peruDate = new Date(referenceDate.getTime() - PERU_OFFSET_MS);
  const year = peruDate.getUTCFullYear();
  const month = peruDate.getUTCMonth() + monthOffset;

  return {
    from: formatUtcDate(new Date(Date.UTC(year, month, 1))),
    to: formatUtcDate(new Date(Date.UTC(year, month + 1, 0))),
  };
}

/** Mismos rangos de días de Perú que usa Movimientos web y la consulta a Supabase. */
export function buildMovementDatePresets(referenceDate = new Date()) {
  const currentMonth = monthRange(referenceDate, 0);
  const previousMonth = monthRange(referenceDate, -1);
  const threeMonthsAgo = monthRange(referenceDate, -2);
  const sixMonthsAgo = monthRange(referenceDate, -5);

  return [
    { label: "Este mes", ...currentMonth },
    { label: "Mes anterior", ...previousMonth },
    { label: "Últimos 3 meses", from: threeMonthsAgo.from, to: currentMonth.to },
    { label: "Últimos 6 meses", from: sixMonthsAgo.from, to: currentMonth.to },
    { label: "Este año", from: `${currentMonth.from.slice(0, 4)}-01-01`, to: currentMonth.to },
  ];
}
