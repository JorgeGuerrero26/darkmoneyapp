import {
  buildExchangeRateMap,
  convertAmt,
  expenseAmt,
  getPeriodBounds,
  inRange,
  incomeAmt,
  isCategorizedCashflow,
  isExpense,
  isIncome,
  isTransfer,
  movementPreviewActionLabel,
  pctChange,
  resolveRate,
  sortMovementsRecentFirst,
  transferAmt,
} from "../../features/dashboard/lib/aggregations";
import type { ConversionCtx } from "../../features/dashboard/lib/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approx(actual: number, expected: number, tolerance = 0.0001) {
  return Math.abs(actual - expected) <= tolerance;
}

type Movement = {
  id: number;
  movementType: string;
  status: string;
  occurredAt: string;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
  sourceAmount: number;
  destinationAmount: number;
};

function expense(id: number, amount: number, occurredAt: string, categoryId: number | null = 10): Movement {
  return {
    id,
    movementType: "expense",
    status: "posted",
    occurredAt,
    sourceAccountId: 1,
    destinationAccountId: null,
    categoryId,
    counterpartyId: null,
    description: `gasto ${id}`,
    sourceAmount: amount,
    destinationAmount: 0,
  };
}

function income(id: number, amount: number, occurredAt: string): Movement {
  return {
    id,
    movementType: "income",
    status: "posted",
    occurredAt,
    sourceAccountId: null,
    destinationAccountId: 1,
    categoryId: null,
    counterpartyId: null,
    description: `ingreso ${id}`,
    sourceAmount: 0,
    destinationAmount: amount,
  };
}

function transfer(id: number, amount: number, occurredAt: string, src = 1, dst = 2): Movement {
  return {
    id,
    movementType: "transfer",
    status: "posted",
    occurredAt,
    sourceAccountId: src,
    destinationAccountId: dst,
    categoryId: null,
    counterpartyId: null,
    description: `transfer ${id}`,
    sourceAmount: amount,
    destinationAmount: amount,
  };
}

function runPctChange() {
  assert(pctChange(120, 100) === 20, "alza 20%");
  assert(pctChange(80, 100) === -20, "caída 20%");
  assert(pctChange(100, 0) === null, "previo cero debe ser null");
  // Para previo negativo: (curr - prev) / |prev| * 100 => (-50 - (-100)) / 100 * 100 = 50
  assert(pctChange(-50, -100) === 50, "previo negativo usa |prev|: ((-50)-(-100))/100*100 = 50");
}

function runPredicates() {
  assert(isIncome(income(1, 100, "2026-05-01") as never), "income debe ser income");
  assert(!isIncome(expense(2, 100, "2026-05-01") as never), "expense no es income");
  assert(isExpense(expense(3, 100, "2026-05-01") as never), "expense debe ser expense");
  assert(!isExpense(transfer(4, 100, "2026-05-01") as never), "transfer no es expense");
  assert(isTransfer(transfer(5, 100, "2026-05-01") as never), "transfer debe ser transfer");
  assert(isCategorizedCashflow(expense(6, 100, "2026-05-01") as never), "expense es cashflow categorizable");
  assert(!isCategorizedCashflow(transfer(7, 100, "2026-05-01") as never), "transfer no es cashflow categorizable");

  const pending = { ...expense(8, 100, "2026-05-01"), status: "pending" };
  assert(!isIncome(pending as never) && !isExpense(pending as never), "movimientos pending no cuentan como income/expense");

  const obligationOpening = { ...expense(9, 100, "2026-05-01"), movementType: "obligation_opening" };
  assert(!isIncome(obligationOpening as never) && !isExpense(obligationOpening as never), "obligation_opening no es income ni expense");
}

function runInRange() {
  const m = expense(1, 100, "2026-05-15T12:00:00Z");
  assert(inRange(m as never, new Date("2026-05-01T00:00:00Z"), new Date("2026-05-31T23:59:59Z")), "mov de mayo está en mayo");
  assert(!inRange(m as never, new Date("2026-04-01T00:00:00Z"), new Date("2026-04-30T23:59:59Z")), "mov de mayo no está en abril");
  // Borde inclusivo
  const start = new Date("2026-05-15T12:00:00Z");
  assert(inRange(m as never, start, start), "borde exacto inclusivo");
}

function runGetPeriodBounds() {
  const now = new Date("2026-05-15T12:00:00");
  const today = getPeriodBounds("today", now);
  assert(today.curEnd === now, "today.curEnd es now");
  assert(today.curStart.getHours() === 0, "today.curStart al inicio del día");

  const week = getPeriodBounds("week", now);
  assert(week.curStart < now, "week.curStart es anterior a now");
  // Semana empieza en lunes (weekStartsOn: 1). 15 mayo 2026 es viernes.
  assert(week.curStart.getDay() === 1, `week.curStart debe ser lunes, fue ${week.curStart.getDay()}`);

  const month = getPeriodBounds("month", now);
  assert(month.curStart.getDate() === 1, "month.curStart es día 1");
  assert(month.curStart.getMonth() === 4, "month.curStart es mayo (índice 4)");

  const last30 = getPeriodBounds("last_30", now);
  const diff = Math.round((last30.curEnd.getTime() - last30.curStart.getTime()) / (24 * 3600 * 1000));
  assert(diff === 29, `last_30 cubre 29 días de diff, fue ${diff}`);
}

function runSortMovementsRecentFirst() {
  const m1 = expense(1, 10, "2026-05-01T10:00:00Z");
  const m2 = expense(2, 20, "2026-05-15T10:00:00Z");
  const m3 = expense(3, 30, "2026-05-10T10:00:00Z");
  const sorted = sortMovementsRecentFirst([m1, m2, m3] as never);
  assert(sorted[0].id === 2, `más reciente primero, fue ${sorted[0].id}`);
  assert(sorted[1].id === 3, "segundo más reciente");
  assert(sorted[2].id === 1, "más antiguo al final");
}

function runSortStableTieBreaker() {
  // Mismo timestamp → ordena por id desc
  const m1 = { ...expense(1, 10, "2026-05-15T10:00:00Z") };
  const m2 = { ...expense(2, 10, "2026-05-15T10:00:00Z") };
  const sorted = sortMovementsRecentFirst([m1, m2] as never);
  assert(sorted[0].id === 2 && sorted[1].id === 1, "tie-break por id descendente");
}

function runMovementPreviewActionLabel() {
  const pending = { ...expense(1, 100, "2026-05-01"), status: "pending" };
  assert(movementPreviewActionLabel(pending as never) === "Aplicar", "pending → Aplicar");
  const planned = { ...expense(1, 100, "2026-05-01"), status: "planned" };
  assert(movementPreviewActionLabel(planned as never) === "Aplicar", "planned → Aplicar");
  const noCat = { ...expense(1, 100, "2026-05-01"), categoryId: null };
  assert(movementPreviewActionLabel(noCat as never) === "Categorizar", "posted sin cat → Categorizar");
  const ok = expense(1, 100, "2026-05-01", 10);
  assert(movementPreviewActionLabel(ok as never) === "Editar", "posted con cat → Editar");
}

function runExchangeRateAndConvert() {
  const rates = [
    { fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.75 },
    { fromCurrencyCode: "EUR", toCurrencyCode: "PEN", rate: 4.1 },
  ];
  const map = buildExchangeRateMap(rates as never);
  assert(map.size === 2, "map debe tener 2 rates");
  assert(resolveRate(map, "USD", "PEN") === 3.75, "USD→PEN directo");
  assert(approx(resolveRate(map, "PEN", "USD"), 1 / 3.75), "PEN→USD via inversa");
  assert(resolveRate(map, "PEN", "PEN") === 1, "misma moneda → 1");
  assert(resolveRate(map, "JPY", "PEN") === 1, "rate no encontrada → 1 (fallback)");

  assert(convertAmt(100, "USD", "PEN", map) === 375, "convert 100 USD → 375 PEN");
  assert(convertAmt(100, null, "PEN", map) === 100, "fromCurrency null → mantener monto");
}

function runIncomeExpenseTransferAmt() {
  const ctx: ConversionCtx = {
    accountCurrencyMap: new Map<number, string>([[1, "PEN"], [2, "USD"]]),
    exchangeRateMap: buildExchangeRateMap([{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.75 }] as never),
    displayCurrency: "PEN",
  };
  const m = income(1, 100, "2026-05-01");
  assert(incomeAmt(m as never, ctx) === 100, "income en cuenta PEN → 100 PEN");

  const ex = expense(2, 50, "2026-05-01");
  assert(expenseAmt(ex as never, ctx) === 50, "expense PEN → 50 PEN");

  const tr = { ...transfer(3, 80, "2026-05-01", 2, 1) }; // source USD, dest PEN
  // transferAmt usa sourceAccountId para convertir
  const usdToPen = transferAmt(tr as never, ctx);
  assert(approx(usdToPen, 300), `transfer 80 USD → 300 PEN, fue ${usdToPen}`);
}

runPctChange();
runPredicates();
runInRange();
runGetPeriodBounds();
runSortMovementsRecentFirst();
runSortStableTieBreaker();
runMovementPreviewActionLabel();
runExchangeRateAndConvert();
runIncomeExpenseTransferAmt();

console.log("aggregations smoke tests passed");
