import type { DashboardMovementRow } from "./dashboard-row";

export type HistoryMonth = {
  label: string;
  income: number;
  expense: number;
  net: number;
  isFuture: boolean;
  dateFrom: string;
  dateTo: string;
};

const HAS_ACTIVITY = 0.009;

/** Ajustes de saldo no son dinero ganado ni gastado. Los registros antiguos se guardaron
 * como ingresos/gastos con la descripción «Corrección · …»; los nuevos usan su tipo propio. */
export function isHistoryBalanceCorrection(movement: Pick<DashboardMovementRow, "movementType" | "description">): boolean {
  return movement.movementType === "adjustment" || /^correcci[oó]n\s*[·:—-]\s*\S/i.test(movement.description.trim());
}

export function periodSavingsRate(months: readonly { income: number; expense: number }[]): number | null {
  const income = months.reduce((sum, month) => sum + month.income, 0);
  const expense = months.reduce((sum, month) => sum + month.expense, 0);
  return income > 0 ? (income - expense) / income * 100 : null;
}

export function observedHistoryMonths<T extends HistoryMonth>(months: readonly T[]): T[] {
  return months.filter((month) => !month.isFuture && (month.income > HAS_ACTIVITY || month.expense > HAS_ACTIVITY));
}

export function historyYearTotals(months: readonly HistoryMonth[]) {
  const observed = observedHistoryMonths(months);
  const income = observed.reduce((sum, month) => sum + month.income, 0);
  const expense = observed.reduce((sum, month) => sum + month.expense, 0);
  const net = income - expense;
  return { income, expense, net, savingsRate: periodSavingsRate(observed) };
}

export function monthReading(month: HistoryMonth, months: readonly HistoryMonth[], isCurrentMonth: boolean): string {
  const observed = observedHistoryMonths(months);
  const others = observed.filter((item) => item.dateFrom !== month.dateFrom);
  const averageIncome = others.reduce((sum, item) => sum + item.income, 0) / Math.max(others.length, 1);
  const averageExpense = others.reduce((sum, item) => sum + item.expense, 0) / Math.max(others.length, 1);
  let reading: string;
  if (Math.abs(month.net) < HAS_ACTIVITY) reading = "Entró lo mismo que salió";
  else if (month.net < 0 && averageExpense > 0 && month.expense >= averageExpense * 1.5) reading = "Gastaste mucho más de lo habitual";
  else if (month.net < 0) reading = "Salió más de lo que entró";
  else if (averageIncome > 0 && month.income >= averageIncome * 1.5) reading = "Entró más de lo habitual";
  else reading = "Con margen";
  return isCurrentMonth ? `En curso · ${reading.toLowerCase()}` : reading;
}

export function recentNetComparison(months: readonly HistoryMonth[]) {
  const observed = observedHistoryMonths(months);
  if (observed.length < 6) return null;
  const previous = observed.slice(-6, -3);
  const recent = observed.slice(-3);
  const average = (items: HistoryMonth[]) => items.reduce((sum, month) => sum + month.net, 0) / items.length;
  const previousAverage = average(previous);
  const recentAverage = average(recent);
  const delta = recentAverage - previousAverage;
  if (Math.abs(delta) < 10 || Math.abs(delta) < Math.max(Math.abs(previousAverage), 1) * 0.18) return null;
  const title = previousAverage > 0 && recentAverage >= previousAverage * 1.8
    ? recentAverage >= previousAverage * 2.2 ? "Te queda más del doble cada mes" : "Te queda el doble cada mes"
    : delta > 0 ? "Te queda más cada mes" : "Te queda menos cada mes";
  return { title, previousAverage, recentAverage, previous, recent };
}
