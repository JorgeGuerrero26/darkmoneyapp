import { movementActsAsIncome } from "./movement-amounts";

export type CurrencyAmount = { amount: number; currencyCode: string; amountInBaseCurrency?: number | null };

export function comparableAmount(item: CurrencyAmount, baseCurrencyCode: string): number | null {
  if (item.amountInBaseCurrency != null && Number.isFinite(item.amountInBaseCurrency)) return item.amountInBaseCurrency;
  return item.currencyCode.toUpperCase() === baseCurrencyCode.toUpperCase() && Number.isFinite(item.amount) ? item.amount : null;
}

/** Same rule as the web: keep unknown conversions in their original currency. */
export function currencyTotals(items: CurrencyAmount[], baseCurrencyCode: string): CurrencyAmount[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!Number.isFinite(item.amount)) continue;
    const converted = comparableAmount(item, baseCurrencyCode);
    const code = (converted == null ? item.currencyCode : baseCurrencyCode).toUpperCase();
    totals.set(code, (totals.get(code) ?? 0) + (converted ?? item.amount));
  }
  if (!totals.size) totals.set(baseCurrencyCode.toUpperCase(), 0);
  return [...totals].map(([currencyCode, amount]) => ({ currencyCode, amount }));
}

export function catalogMovementAmount(item: {
  movementType?: string; sourceAmount: number | null; destinationAmount: number | null;
  amount?: number;
}) {
  if (item.amount != null && Number.isFinite(item.amount)) return Math.abs(item.amount);
  const destination = movementActsAsIncome(item) || (item.movementType === "transfer" && !item.sourceAmount);
  return Math.abs((destination ? item.destinationAmount : item.sourceAmount) ?? 0);
}

export function analyticsMonthKey(value: string | Date): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima", year: "numeric", month: "2-digit" }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

export function analyticsMonthKeys(now = new Date()): string[] {
  const [year, month] = analyticsMonthKey(now).split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => new Date(Date.UTC(year, month - 12 + index, 1)).toISOString().slice(0, 7));
}
