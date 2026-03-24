import type { ExchangeRateSummary, SubscriptionFrequency } from "../types/domain";

/** Convierte un monto a la moneda base del workspace usando tasas del snapshot. */
export function convertAmountToWorkspaceBase(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  rates: ExchangeRateSummary[],
): number | null {
  if (!Number.isFinite(amount)) return null;
  const from = fromCurrency.trim().toUpperCase();
  const base = baseCurrency.trim().toUpperCase();
  if (from === base) return amount;

  const direct = rates.find(
    (r) =>
      r.fromCurrencyCode.toUpperCase() === from &&
      r.toCurrencyCode.toUpperCase() === base &&
      r.rate > 0,
  );
  if (direct) return amount * direct.rate;

  const inverse = rates.find(
    (r) =>
      r.fromCurrencyCode.toUpperCase() === base &&
      r.toCurrencyCode.toUpperCase() === from &&
      r.rate > 0,
  );
  if (inverse) return amount / inverse.rate;

  return null;
}

/** Lista: interval_count > 1 → "N × etiqueta", si no solo la etiqueta. */
export function subscriptionFrequencyListLabel(
  intervalCount: number,
  frequency: SubscriptionFrequency,
  labels: Record<SubscriptionFrequency, string>,
): string {
  const n = Math.max(1, Math.floor(intervalCount) || 1);
  const base = labels[frequency] ?? frequency;
  return n > 1 ? `${n} × ${base}` : base;
}

/**
 * Costo anual estimado desde el monto del plan (paridad con web: custom/quarterly en default → ×12).
 */
export function getSubscriptionAnnualCost(
  amount: number,
  frequency: SubscriptionFrequency,
  intervalCount: number,
): number {
  const n = Math.max(1, Math.floor(intervalCount) || 1);
  switch (frequency) {
    case "daily":
      return amount * (365 / n);
    case "weekly":
      return amount * (52 / n);
    case "monthly":
      return amount * (12 / n);
    case "quarterly":
      return amount * (4 / n);
    case "yearly":
      return amount / n;
    case "custom":
    default:
      return amount * 12;
  }
}

/** Días de calendario locales desde hoy hasta una fecha YYYY-MM-DD. */
export function calendarDaysFromTodayLocal(ymd: string): number {
  const parts = ymd.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((x) => Number.isNaN(x))) return 9999;
  const [y, m, d] = parts;
  const due = new Date(y, m - 1, d);
  const now = new Date();
  const dueT = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const todayT = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((dueT - todayT) / 86400000);
}

/** Monto para análisis: prioriza source, luego destination (valor absoluto). */
export function movementAmountForSubscriptionAnalytics(m: {
  sourceAmount: number | null;
  destinationAmount: number | null;
}): number {
  const s = m.sourceAmount;
  const d = m.destinationAmount;
  if (s != null && Number.isFinite(s) && s !== 0) return Math.abs(s);
  if (d != null && Number.isFinite(d) && d !== 0) return Math.abs(d);
  return 0;
}
