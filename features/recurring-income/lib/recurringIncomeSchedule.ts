import type { RecurringIncomeFrequency } from "../../../types/domain";

type Args = {
  frequency: RecurringIncomeFrequency;
  intervalCount: number;
  /** Día del mes al que vuelve la llegada. Sale de la fecha elegida, no de un campo aparte. */
  anchorDay: number | null;
};

const PERIOD_SINGULAR: Record<RecurringIncomeFrequency, string> = {
  daily: "día",
  weekly: "semana",
  monthly: "mes",
  quarterly: "trimestre",
  yearly: "año",
  custom: "día",
};

const PERIOD_PLURAL: Record<RecurringIncomeFrequency, string> = {
  daily: "días",
  weekly: "semanas",
  monthly: "meses",
  quarterly: "trimestres",
  yearly: "años",
  custom: "días",
};

/**
 * Lo que va a pasar, dicho en una frase.
 *
 * El formulario decía **"La app usa la próxima llegada como fecha base y desde ahí repite según
 * esta frecuencia"**: describe el mecanismo interno, no el resultado. Y en otro sitio traducía
 * lo recién elegido —"Cadencia actual: cada 1 mes"—, que es la app leyéndole al usuario lo que
 * el usuario acaba de escribir.
 *
 * La regla del mes corto se dice **una vez y solo cuando aplica**: un ingreso del día 15 no
 * necesita que le expliquen febrero. Y sale de aquí, no reescrita en la pantalla, porque es la
 * misma regla que aplica el cálculo de fechas (`computeNextRecurringDate` con ancla).
 */
export function describeRecurringCadence({ frequency, intervalCount, anchorDay }: Args): string {
  const n = Math.max(1, Math.floor(intervalCount) || 1);
  const monthly = frequency === "monthly" || frequency === "quarterly" || frequency === "yearly";

  if (!monthly) {
    const unit = n === 1 ? PERIOD_SINGULAR[frequency] : PERIOD_PLURAL[frequency];
    return n === 1 ? `Se repite cada ${unit}.` : `Se repite cada ${n} ${unit}.`;
  }

  const every = n === 1
    ? `cada ${PERIOD_SINGULAR[frequency]}`
    : `cada ${n} ${PERIOD_PLURAL[frequency]}`;

  if (anchorDay === 31) return `Se repite el último día ${every}.`;
  if (anchorDay == null) return `Se repite ${every}.`;

  const shortMonths = anchorDay >= 29
    ? ` Si el mes no tiene ${anchorDay}, cae el último día.`
    : "";
  return `Se repite el ${anchorDay} ${every}.${shortMonths}`;
}
