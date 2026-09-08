export type BudgetRecurrence = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly" | "none";

export type BudgetPeriod = { periodStart: string; periodEnd: string };

export const BUDGET_RECURRENCE_OPTIONS: Array<{ value: BudgetRecurrence; label: string }> = [
  { value: "weekly", label: "Cada semana" },
  { value: "biweekly", label: "Cada quincena" },
  { value: "monthly", label: "Cada mes" },
  { value: "quarterly", label: "Cada 3 meses" },
  { value: "yearly", label: "Cada año" },
];

export function budgetRecurrenceLabel(recurrence: BudgetRecurrence): string {
  return BUDGET_RECURRENCE_OPTIONS.find((option) => option.value === recurrence)?.label ?? "Entre dos fechas";
}

function parse(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const date = parse(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return toYmd(date);
}

/** El último día del mes que contiene a `ymd`. */
function endOfMonth(ymd: string): string {
  const date = parse(ymd);
  return toYmd(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

function endOfQuarter(ymd: string): string {
  const date = parse(ymd);
  const lastMonthOfQuarter = Math.floor(date.getUTCMonth() / 3) * 3 + 3;
  return toYmd(new Date(Date.UTC(date.getUTCFullYear(), lastMonthOfQuarter, 0)));
}

function endOfYear(ymd: string): string {
  return `${parse(ymd).getUTCFullYear()}-12-31`;
}

/**
 * El primer período de un presupuesto que se acaba de crear.
 *
 * **Arranca hoy y cierra con el período**, no el día 1 del mes que viene ni prorrateado.
 *
 * Prorratear —dar 23/30 de 400 porque se creó el día 8— obliga a explicar en la pantalla una
 * cuenta que nadie pidió, y el número que el usuario escribió deja de ser el que ve. Y esperar
 * al día 1 deja el presupuesto inerte justo cuando acaba de crearlo: gastaría todo septiembre
 * sin que nada lo cuente. Empieza hoy, con el límite entero, y el primer período es más corto
 * que los siguientes — que es exactamente lo que dice la frase del formulario.
 */
export function firstBudgetPeriod(todayYmd: string, recurrence: BudgetRecurrence): BudgetPeriod {
  switch (recurrence) {
    case "weekly":
      return { periodStart: todayYmd, periodEnd: addDays(todayYmd, 6) };
    case "biweekly":
      return { periodStart: todayYmd, periodEnd: addDays(todayYmd, 13) };
    case "monthly":
      return { periodStart: todayYmd, periodEnd: endOfMonth(todayYmd) };
    case "quarterly":
      return { periodStart: todayYmd, periodEnd: endOfQuarter(todayYmd) };
    case "yearly":
      return { periodStart: todayYmd, periodEnd: endOfYear(todayYmd) };
    default:
      return { periodStart: todayYmd, periodEnd: todayYmd };
  }
}

/**
 * El período siguiente al que acaba de cerrar.
 *
 * Empieza el día después del cierre anterior —sin huecos ni solapes, que era otro de los
 * hallazgos: "1 jun – 1 jul" y "2 jul – 1 ago" se pisaban un día— y su fin se alinea con el
 * calendario: un presupuesto mensual va del 1 al último día del mes, pase lo que pase con el día
 * en que se creó. Por eso el segundo período ya es un mes entero aunque el primero fuera de 23
 * días.
 */
export function nextBudgetPeriod(previous: BudgetPeriod, recurrence: BudgetRecurrence): BudgetPeriod | null {
  if (recurrence === "none") return null;
  const start = addDays(previous.periodEnd, 1);
  switch (recurrence) {
    case "weekly":
      return { periodStart: start, periodEnd: addDays(start, 6) };
    case "biweekly":
      return { periodStart: start, periodEnd: addDays(start, 13) };
    case "monthly":
      return { periodStart: start, periodEnd: endOfMonth(start) };
    case "quarterly":
      return { periodStart: start, periodEnd: endOfQuarter(start) };
    case "yearly":
      return { periodStart: start, periodEnd: endOfYear(start) };
    default:
      return null;
  }
}

/**
 * La frase que el formulario enseña bajo la cadencia: qué va a pasar, en palabras.
 *
 * Sustituye a "2026-09-01 → 2026-09-30", que era formato de base de datos en la cara del
 * usuario, y a "Define desde qué fecha hasta qué fecha quieres controlar este presupuesto", que
 * describía el mecanismo en vez del resultado.
 */
export function budgetRecurrenceSentence(recurrence: BudgetRecurrence, todayYmd: string): string {
  switch (recurrence) {
    case "weekly":
      return "Empieza hoy y se renueva cada lunes. Cada semana cerrada queda en el historial.";
    case "biweekly":
      return "Empieza hoy y se renueva cada quincena. Cada quincena cerrada queda en el historial.";
    case "monthly":
      return "Empieza hoy y se renueva el 1 de cada mes. Cada mes cerrado queda en el historial.";
    case "quarterly":
      return "Empieza hoy y se renueva cada 3 meses. Cada trimestre cerrado queda en el historial.";
    case "yearly":
      return "Empieza hoy y se renueva cada 1 de enero. Cada año cerrado queda en el historial.";
    default: {
      const { periodEnd } = firstBudgetPeriod(todayYmd, "none");
      return periodEnd === todayYmd
        ? "No se repite: eliges tú desde cuándo y hasta cuándo."
        : "No se repite.";
    }
  }
}

/**
 * Con qué cadencia se creó un presupuesto que existe desde antes de que hubiera cadencia.
 *
 * Los presupuestos viejos son períodos sueltos, y su cadencia está implícita en cuánto duran:
 * un período que va del 1 al último día del mes es mensual. Se deduce del que se está editando
 * para no precargar "Entre dos fechas" en algo que el usuario venía recreando cada mes a mano —
 * que es justo el trabajo que esta pantalla viene a quitar.
 */
export function inferRecurrence(period: BudgetPeriod): BudgetRecurrence {
  const days = Math.round(
    (parse(period.periodEnd).getTime() - parse(period.periodStart).getTime()) / 86_400_000,
  ) + 1;
  if (days <= 8) return "weekly";
  if (days <= 16) return "biweekly";
  if (days <= 45) return "monthly";
  if (days <= 120) return "quarterly";
  if (days <= 400) return "yearly";
  return "none";
}
