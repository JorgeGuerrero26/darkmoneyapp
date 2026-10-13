import { buildDayMovements, dayMovementBounds, type DayMovementInput } from "../day-movements-model";

const ctx = { displayCurrency: "PEN", baseCurrency: "PEN", exchangeRateMap: new Map([["USD:PEN", 3.75]]) };
const row = (id: number, patch: Partial<DayMovementInput> = {}): DayMovementInput => ({
  id, status: "posted", occurredAt: "2026-09-30T22:00:00Z", movementType: "expense",
  sourceAmount: 10, destinationAmount: null, sourceCurrencyCode: "PEN", ...patch,
});

test("groups incoming obligation payments and refunds without counting openings or transfers in savings", () => {
  const result = buildDayMovements([
    row(1), row(2, { movementType: "income", sourceAmount: null, destinationAmount: 100, destinationCurrencyCode: "PEN" }),
    row(3, { movementType: "obligation_payment", sourceAmount: null, destinationAmount: 25, destinationCurrencyCode: "PEN" }),
    row(4, { movementType: "transfer", sourceAmount: 500 }), row(5, { movementType: "obligation_opening", sourceAmount: 900 }),
    row(6, { movementType: "subscription_payment", sourceAmount: 12 }),
  ], "2026-09-30", ctx);
  expect(result.income).toEqual({ amount: 125, count: 2, excludedCount: 0 });
  expect(result.expense.amount).toBe(22);
  expect(result.transfer.amount).toBe(500);
  expect(result.savings).toBe(103);
});

test("keeps native currency and excludes foreign or unknown currency without a rate", () => {
  const result = buildDayMovements([row(1, { sourceAmount: 5, sourceCurrencyCode: "USD" }), row(2, { sourceCurrencyCode: "EUR" }), row(3, { sourceCurrencyCode: null })], "2026-09-30", ctx);
  expect(result.expense.amount).toBe(18.75);
  expect(result.excludedCount).toBe(2);
  expect(result.groups.expense.find((item) => item.movement.id === 1)?.amount).toBe(5);
  expect(result.groups.expense.find((item) => item.movement.id === 1)?.currencyCode).toBe("USD");
});

test("uses Peru's half-open day and ignores non-posted rows and invalid timestamps", () => {
  const result = buildDayMovements([
    row(1, { occurredAt: "2026-10-01T04:59:59.999Z" }), row(2, { occurredAt: "2026-10-01T05:00:00Z" }),
    row(3, { status: "pending" }), row(4, { occurredAt: "bad" }), row(5, { occurredAt: "2026-09-30T04:59:59Z" }),
  ], "2026-09-30", ctx);
  expect(result.groups.expense.map((item) => item.movement.id)).toEqual([1]);
  expect(dayMovementBounds("2026-09-30")).toEqual({ from: "2026-09-30T05:00:00.000Z", until: "2026-10-01T05:00:00.000Z" });
  expect(() => dayMovementBounds("2026-02-30")).toThrow("Día inválido");
});

test("allows inverse and base-bridge rates, but rejects invalid rates", () => {
  const result = buildDayMovements([row(1, { sourceCurrencyCode: "USD", sourceAmount: 10 })], "2026-09-30", {
    displayCurrency: "EUR", baseCurrency: "PEN", exchangeRateMap: new Map([["PEN:USD", 0.25], ["PEN:EUR", 0.2]]),
  });
  expect(result.expense.amount).toBe(8);
  for (const rate of [0, -2, NaN, Infinity]) {
    expect(buildDayMovements([row(1, { sourceCurrencyCode: "USD" })], "2026-09-30", { ...ctx, exchangeRateMap: new Map([["USD:PEN", rate]]) }).excludedCount).toBe(1);
  }
});

test("preserves a converted zero, sorts by instant and id, and rounds savings after subtraction", () => {
  const result = buildDayMovements([
    row(1, { occurredAt: "2026-09-30T14:00:00-05:00", sourceAmount: 0 }),
    row(2, { occurredAt: "2026-09-30T20:00:00Z", sourceAmount: 0.995 }),
    row(3, { movementType: "income", sourceAmount: null, destinationAmount: 1.005, destinationCurrencyCode: "PEN" }),
  ], "2026-09-30", ctx);
  expect(result.groups.expense.map((item) => item.movement.id)).toEqual([2, 1]);
  expect(result.excludedCount).toBe(0);
  expect(result.savings).toBe(0.01);
});
