import { buildMovementsIndex, forEachInRange } from "../../features/dashboard/selectors/movements-index";
import {
  selectCategoryTotals,
  selectDailyBreakdown,
  selectMonthlyPulse,
  selectPeriodTotals,
} from "../../features/dashboard/selectors/dashboard-stats-selectors";
import type { ConversionCtx } from "../../features/dashboard/lib/types";

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
  amount: number;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

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
    amount,
    sourceAmount: amount,
    destinationAmount: null,
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
    amount,
    sourceAmount: null,
    destinationAmount: amount,
  };
}

function transfer(id: number, amount: number, occurredAt: string): Movement {
  return {
    id,
    movementType: "transfer",
    status: "posted",
    occurredAt,
    sourceAccountId: 1,
    destinationAccountId: 2,
    categoryId: null,
    counterpartyId: null,
    description: `transfer ${id}`,
    amount,
    sourceAmount: amount,
    destinationAmount: amount,
  };
}

function ctxOf(displayCurrency = "PEN"): ConversionCtx {
  return {
    accountCurrencyMap: new Map<number, string>(),
    exchangeRateMap: new Map<string, number>(),
    displayCurrency,
  };
}

function runBuildIndex() {
  const movements: Movement[] = [
    expense(1, 100, "2026-05-20T10:00:00Z"),
    income(2, 500, "2026-05-20T15:00:00Z"),
    expense(3, 80, "2026-05-19T09:00:00Z"),
    transfer(4, 200, "2026-05-21T12:00:00Z"),
  ];

  const index = buildMovementsIndex(movements as never);
  assert(index.all.length === 4, "index.all debe contener los 4 movimientos");
  assert(index.byDate.size === 3, "byDate debe tener 3 buckets de fecha");
  assert(index.byMonth.size === 1, "byMonth debe tener 1 bucket (mayo 2026)");
  const may20 = index.byDate.get("2026-05-20");
  assert(may20 && may20.length === 2, "2026-05-20 debe tener 2 movimientos");
  assert(may20!.every((m) => m.dateKey === "2026-05-20"), "todos deben tener mismo dateKey");
}

function runForEachInRange() {
  const movements: Movement[] = [
    expense(1, 10, "2026-05-01T00:00:00Z"),
    expense(2, 20, "2026-05-15T00:00:00Z"),
    expense(3, 30, "2026-06-15T00:00:00Z"),
  ];
  const index = buildMovementsIndex(movements as never);
  const visited: number[] = [];
  forEachInRange(index, new Date("2026-05-01T00:00:00Z"), new Date("2026-05-31T23:59:59Z"), (i) => {
    visited.push(i.movement.id);
  });
  visited.sort();
  assert(visited.length === 2, `debe visitar 2 movimientos, visitó ${visited.length}`);
  assert(visited[0] === 1 && visited[1] === 2, "debe visitar ids 1 y 2");
}

function runForEachInRangeLongSpan() {
  // Span > 60 días para forzar la rama de scan O(n)
  const movements: Movement[] = [
    expense(1, 10, "2025-01-15T00:00:00Z"),
    expense(2, 20, "2026-05-15T00:00:00Z"),
    expense(3, 30, "2027-01-15T00:00:00Z"),
  ];
  const index = buildMovementsIndex(movements as never);
  const visited: number[] = [];
  forEachInRange(index, new Date("2025-06-01T00:00:00Z"), new Date("2026-12-31T23:59:59Z"), (i) => {
    visited.push(i.movement.id);
  });
  assert(visited.length === 1 && visited[0] === 2, "scan O(n) debe devolver solo id 2");
}

function runPeriodTotals() {
  const movements: Movement[] = [
    income(1, 1000, "2026-05-05T10:00:00Z"),
    expense(2, 300, "2026-05-06T10:00:00Z"),
    expense(3, 200, "2026-05-07T10:00:00Z"),
    transfer(4, 999, "2026-05-08T10:00:00Z"), // transfers no deben afectar income/expense
  ];
  const index = buildMovementsIndex(movements as never);
  const totals = selectPeriodTotals(
    index,
    new Date("2026-05-01T00:00:00Z"),
    new Date("2026-05-31T23:59:59Z"),
    ctxOf(),
  );
  assert(totals.income === 1000, `income esperado 1000, recibido ${totals.income}`);
  assert(totals.expense === 500, `expense esperado 500, recibido ${totals.expense}`);
  assert(totals.net === 500, `net esperado 500, recibido ${totals.net}`);
}

function runEmptyPeriodTotals() {
  const index = buildMovementsIndex([] as never);
  const totals = selectPeriodTotals(index, new Date(), new Date(), ctxOf());
  assert(totals.income === 0 && totals.expense === 0 && totals.net === 0, "totales en workspace vacío deben ser 0");
}

function runDailyBreakdown() {
  const now = new Date("2026-05-25T23:00:00Z");
  const movements: Movement[] = [
    expense(1, 100, "2026-05-25T10:00:00Z"),
    income(2, 200, "2026-05-25T15:00:00Z"),
    expense(3, 50, "2026-05-23T10:00:00Z"),
    expense(4, 999, "2026-05-10T10:00:00Z"), // fuera de los últimos 7 días
  ];
  const index = buildMovementsIndex(movements as never);
  const breakdown = selectDailyBreakdown(index, now, ctxOf(), 7);
  assert(breakdown.length === 7, "debe devolver 7 días");
  const last = breakdown[6];
  assert(last.income === 200, "último día debe tener income 200");
  assert(last.expense === 100, "último día debe tener expense 100");
  const totalExpense = breakdown.reduce((s, d) => s + d.expense, 0);
  assert(totalExpense === 150, `expense total 7d esperado 150, recibido ${totalExpense}`);
}

function runMonthlyPulse() {
  const now = new Date("2026-05-25T00:00:00Z");
  const movements: Movement[] = [
    expense(1, 100, "2026-05-10T00:00:00Z"),
    expense(2, 200, "2026-04-10T00:00:00Z"),
    income(3, 500, "2026-03-10T00:00:00Z"),
  ];
  const index = buildMovementsIndex(movements as never);
  const pulse = selectMonthlyPulse(index, now, ctxOf(), 6);
  assert(pulse.length === 6, "monthly pulse debe devolver 6 meses");
  const may = pulse[5];
  const april = pulse[4];
  const march = pulse[3];
  assert(may.expense === 100, "mayo expense 100");
  assert(april.expense === 200, "abril expense 200");
  assert(march.income === 500, "marzo income 500");
}

function runCategoryTotals() {
  const movements: Movement[] = [
    expense(1, 100, "2026-05-10T00:00:00Z", 10),
    expense(2, 50, "2026-05-11T00:00:00Z", 10),
    expense(3, 200, "2026-05-12T00:00:00Z", 20),
    expense(4, 30, "2026-05-13T00:00:00Z", null),
    income(5, 999, "2026-05-14T00:00:00Z"), // ingresos no deben aparecer
  ];
  const index = buildMovementsIndex(movements as never);
  const totals = selectCategoryTotals(
    index,
    new Date("2026-05-01T00:00:00Z"),
    new Date("2026-05-31T23:59:59Z"),
    ctxOf(),
  );
  assert(totals.get(10) === 150, "categoría 10 debe sumar 150");
  assert(totals.get(20) === 200, "categoría 20 debe sumar 200");
  assert(totals.get(null) === 30, "categoría null debe sumar 30");
  assert(!totals.has(99), "categoría inexistente no debe aparecer");
}

function runIndexPerformance() {
  // Smoke check: 5000 movimientos no deben tardar más de un par de segundos
  const movements: Movement[] = [];
  for (let i = 0; i < 5000; i++) {
    const day = (i % 28) + 1;
    const dayStr = day.toString().padStart(2, "0");
    movements.push(expense(i, 1, `2026-05-${dayStr}T10:00:00Z`));
  }
  const start = Date.now();
  const index = buildMovementsIndex(movements as never);
  const buildMs = Date.now() - start;
  assert(buildMs < 2000, `build de 5K mov debe ser <2s, fueron ${buildMs}ms`);
  assert(index.all.length === 5000, "all debe tener 5000");
  assert(index.byDate.size === 28, "byDate debe tener 28 buckets");
}

runBuildIndex();
runForEachInRange();
runForEachInRangeLongSpan();
runPeriodTotals();
runEmptyPeriodTotals();
runDailyBreakdown();
runMonthlyPulse();
runCategoryTotals();
runIndexPerformance();

console.log("dashboard selector smoke tests passed");
