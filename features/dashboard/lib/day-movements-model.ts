export type DayMovementKind = "income" | "expense" | "transfer";
export type DayMovementInput = {
  id: number;
  status: string;
  occurredAt: string;
  movementType: string;
  sourceAmount: number | null;
  destinationAmount: number | null;
  sourceCurrencyCode?: string | null;
  destinationCurrencyCode?: string | null;
};
export type DayMoneyContext = {
  displayCurrency: string;
  baseCurrency: string;
  exchangeRateMap: Map<string, number>;
};
export type DayMovementEntry<T> = {
  movement: T;
  kind: DayMovementKind;
  amount: number | null;
  currencyCode: string | null;
  comparableAmount: number | null;
};

const code = (value?: string | null) => value?.trim().toUpperCase() || null;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** A calendar day in Peru, independent of the device/browser timezone. */
export function dayMovementBounds(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Día inválido.");
  const start = new Date(`${day}T05:00:00.000Z`);
  if (!Number.isFinite(start.getTime()) || start.toISOString().slice(0, 10) !== day) {
    throw new Error("Día inválido.");
  }
  return { from: start.toISOString(), until: new Date(start.getTime() + 86400000).toISOString() };
}

function directRate(map: Map<string, number>, from: string, to: string): number | null {
  if (from === to) return 1;
  const direct = map.get(`${from}:${to}`);
  if (direct != null && Number.isFinite(direct) && direct > 0) return direct;
  const inverse = map.get(`${to}:${from}`);
  return inverse != null && Number.isFinite(inverse) && inverse > 0 ? 1 / inverse : null;
}

function convert(amount: number | null, from: string | null, ctx: DayMoneyContext): number | null {
  if (amount === null || from === null) return null;
  const to = code(ctx.displayCurrency);
  const base = code(ctx.baseCurrency);
  if (!to || !base) return null;
  let rate = directRate(ctx.exchangeRateMap, from, to);
  if (rate === null && from !== base && to !== base) {
    const first = directRate(ctx.exchangeRateMap, from, base);
    const second = directRate(ctx.exchangeRateMap, base, to);
    if (first !== null && second !== null) rate = first * second;
  }
  const result = rate === null ? null : amount * rate;
  return result !== null && Number.isFinite(result) ? result : null;
}

/** Same directional rules as movement-amounts; opening an obligation is not cashflow. */
export function dayMovementKind(movement: DayMovementInput): DayMovementKind | null {
  if (movement.movementType === "obligation_opening") return null;
  if (movement.movementType === "transfer") return "transfer";
  if (movement.movementType === "income" || movement.movementType === "refund") return "income";
  if (movement.movementType === "expense" || movement.movementType === "subscription_payment") return "expense";
  if (movement.movementType !== "adjustment" && movement.movementType !== "obligation_payment") return null;
  return (movement.destinationAmount ?? 0) > (movement.sourceAmount ?? 0) ? "income" : "expense";
}

export function buildDayMovements<T extends DayMovementInput>(movements: readonly T[], day: string, ctx: DayMoneyContext) {
  const bounds = dayMovementBounds(day);
  const start = Date.parse(bounds.from);
  const until = Date.parse(bounds.until);
  const groups: Record<DayMovementKind, DayMovementEntry<T>[]> = { income: [], expense: [], transfer: [] };
  const rows = movements.filter((movement) => {
    const timestamp = Date.parse(movement.occurredAt);
    return movement.status === "posted" && timestamp >= start && timestamp < until;
  }).sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id);
  for (const movement of rows) {
    const kind = dayMovementKind(movement);
    if (!kind) continue;
    const destination = kind === "income";
    const primary = destination ? movement.destinationAmount : movement.sourceAmount;
    const secondary = destination ? movement.sourceAmount : movement.destinationAmount;
    const raw = primary ?? secondary;
    const amount = raw != null && Number.isFinite(raw) ? Math.abs(raw) : null;
    const currencyCode = code(primary == null
      ? destination ? movement.sourceCurrencyCode : movement.destinationCurrencyCode
      : destination ? movement.destinationCurrencyCode : movement.sourceCurrencyCode);
    groups[kind].push({ movement, kind, amount, currencyCode, comparableAmount: convert(amount, currencyCode, ctx) });
  }
  const totals = (kind: DayMovementKind) => {
    const entries = groups[kind];
    return {
      amount: roundMoney(entries.reduce((total, row) => total + (row.comparableAmount ?? 0), 0)),
      excludedCount: entries.filter((row) => row.comparableAmount === null).length,
      count: entries.length,
    };
  };
  const income = totals("income");
  const expense = totals("expense");
  const transfer = totals("transfer");
  // Round after subtracting raw converted sums, not after rounding the two sides.
  const savings = roundMoney(
    groups.income.reduce((sum, row) => sum + (row.comparableAmount ?? 0), 0) -
    groups.expense.reduce((sum, row) => sum + (row.comparableAmount ?? 0), 0),
  );
  return { groups, income, expense, transfer, savings, excludedCount: income.excludedCount + expense.excludedCount };
}
