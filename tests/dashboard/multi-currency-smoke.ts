import { buildMovementsIndex } from "../../features/dashboard/selectors/movements-index";
import {
  selectCategoryTotals,
  selectPeriodTotals,
} from "../../features/dashboard/selectors/dashboard-stats-selectors";
import { convertAmt } from "../../features/dashboard/lib/aggregations";
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

function approxEqual(actual: number, expected: number, tolerance = 0.01): boolean {
  return Math.abs(actual - expected) < tolerance;
}

function expense(id: number, amount: number, occurredAt: string, accountId = 1, categoryId: number | null = 10): Movement {
  return {
    id,
    movementType: "expense",
    status: "posted",
    occurredAt,
    sourceAccountId: accountId,
    destinationAccountId: null,
    categoryId,
    counterpartyId: null,
    description: `gasto ${id}`,
    amount,
    sourceAmount: amount,
    destinationAmount: null,
  };
}

function income(id: number, amount: number, occurredAt: string, accountId = 1): Movement {
  return {
    id,
    movementType: "income",
    status: "posted",
    occurredAt,
    sourceAccountId: null,
    destinationAccountId: accountId,
    categoryId: null,
    counterpartyId: null,
    description: `ingreso ${id}`,
    amount,
    sourceAmount: null,
    destinationAmount: amount,
  };
}

/**
 * Contexto de conversión con tasa PEN→USD = 0.27.
 * - Cuenta 1 = PEN
 * - Cuenta 2 = USD (sin conversión necesaria)
 * - Display currency = USD
 */
function multiCurrencyCtx(displayCurrency = "USD"): ConversionCtx {
  return {
    accountCurrencyMap: new Map<number, string>([
      [1, "PEN"],
      [2, "USD"],
    ]),
    exchangeRateMap: new Map<string, number>([
      ["PEN:USD", 0.27],
      ["USD:PEN", 3.7],
    ]),
    displayCurrency,
  };
}

function runConvertAmtSameCurrency() {
  const map = new Map<string, number>([["PEN:USD", 0.27]]);
  const result = convertAmt(100, "USD", "USD", map);
  assert(result === 100, `mismo currency: esperado 100, recibido ${result}`);
}

function runConvertAmtDirectRate() {
  const map = new Map<string, number>([["PEN:USD", 0.27]]);
  const result = convertAmt(100, "PEN", "USD", map);
  assert(approxEqual(result, 27), `100 PEN → USD esperado 27, recibido ${result}`);
}

function runConvertAmtInverseRate() {
  // Solo existe PEN/USD, pero queremos convertir USD→PEN (inversa)
  const map = new Map<string, number>([["PEN:USD", 0.27]]);
  const result = convertAmt(100, "USD", "PEN", map);
  // Debe usar 1/0.27 ≈ 3.7037
  assert(approxEqual(result, 100 / 0.27, 0.1), `100 USD → PEN esperado ~370, recibido ${result}`);
}

function runConvertAmtMissingFromCurrency() {
  const map = new Map<string, number>();
  const result = convertAmt(100, null, "USD", map);
  assert(result === 100, "currency null debe retornar el monto sin convertir");
}

function runPeriodTotalsMultiCurrency() {
  // Workspace con cuentas en PEN y USD. Display = USD.
  // 100 PEN expense (cuenta 1) + 50 USD expense (cuenta 2) = (100 * 0.27) + 50 = 77 USD
  // 1000 PEN income (cuenta 1) + 200 USD income (cuenta 2) = (1000 * 0.27) + 200 = 470 USD
  const movements: Movement[] = [
    expense(1, 100, "2026-05-10T10:00:00Z", 1), // PEN
    expense(2, 50, "2026-05-11T10:00:00Z", 2),  // USD
    income(3, 1000, "2026-05-12T10:00:00Z", 1), // PEN
    income(4, 200, "2026-05-13T10:00:00Z", 2),  // USD
  ];
  const index = buildMovementsIndex(movements as never);
  const totals = selectPeriodTotals(
    index,
    new Date("2026-05-01T00:00:00Z"),
    new Date("2026-05-31T23:59:59Z"),
    multiCurrencyCtx("USD"),
  );
  assert(approxEqual(totals.income, 470), `income USD esperado 470, recibido ${totals.income}`);
  assert(approxEqual(totals.expense, 77), `expense USD esperado 77, recibido ${totals.expense}`);
  assert(approxEqual(totals.net, 393), `net USD esperado 393, recibido ${totals.net}`);
}

function runPeriodTotalsSwitchDisplayCurrency() {
  // Mismo workspace que arriba pero ahora display = PEN.
  // 100 PEN (sin convertir) + 50 USD * 3.7 (inversa) = 100 + 185 = 285 PEN
  // 1000 PEN (sin convertir) + 200 USD * 3.7 = 1000 + 740 = 1740 PEN
  const movements: Movement[] = [
    expense(1, 100, "2026-05-10T10:00:00Z", 1),
    expense(2, 50, "2026-05-11T10:00:00Z", 2),
    income(3, 1000, "2026-05-12T10:00:00Z", 1),
    income(4, 200, "2026-05-13T10:00:00Z", 2),
  ];
  const index = buildMovementsIndex(movements as never);
  const totals = selectPeriodTotals(
    index,
    new Date("2026-05-01T00:00:00Z"),
    new Date("2026-05-31T23:59:59Z"),
    multiCurrencyCtx("PEN"),
  );
  assert(approxEqual(totals.income, 1740, 0.5), `income PEN esperado 1740, recibido ${totals.income}`);
  assert(approxEqual(totals.expense, 285, 0.5), `expense PEN esperado 285, recibido ${totals.expense}`);
}

function runCategoryTotalsMultiCurrency() {
  // Categoría 10 con gastos en PEN y USD; display=USD
  // 100 PEN + 50 PEN = 150 PEN → 40.5 USD
  // + 30 USD (cuenta 2) = 70.5 USD
  const movements: Movement[] = [
    expense(1, 100, "2026-05-10T10:00:00Z", 1, 10),
    expense(2, 50, "2026-05-11T10:00:00Z", 1, 10),
    expense(3, 30, "2026-05-12T10:00:00Z", 2, 10),
  ];
  const index = buildMovementsIndex(movements as never);
  const totals = selectCategoryTotals(
    index,
    new Date("2026-05-01T00:00:00Z"),
    new Date("2026-05-31T23:59:59Z"),
    multiCurrencyCtx("USD"),
  );
  const cat10 = totals.get(10);
  assert(cat10 != null, "categoría 10 debe existir");
  assert(approxEqual(cat10!, 70.5), `categoría 10 USD esperado 70.5, recibido ${cat10}`);
}

function runMissingRateFallback() {
  // Una cuenta con currency desconocido (CLP) y display=USD pero sin tasa CLP/USD.
  // El comportamiento esperado: retornar el monto sin convertir (no NaN, no crash).
  const ctx: ConversionCtx = {
    accountCurrencyMap: new Map<number, string>([[1, "CLP"]]),
    exchangeRateMap: new Map<string, number>([["PEN:USD", 0.27]]),
    displayCurrency: "USD",
  };
  const movements: Movement[] = [expense(1, 1000, "2026-05-10T10:00:00Z", 1)];
  const index = buildMovementsIndex(movements as never);
  const totals = selectPeriodTotals(
    index,
    new Date("2026-05-01T00:00:00Z"),
    new Date("2026-05-31T23:59:59Z"),
    ctx,
  );
  assert(Number.isFinite(totals.expense), `expense debe ser finito, recibido ${totals.expense}`);
}

function main() {
  const tests: Array<[string, () => void]> = [
    ["convertAmt mismo currency", runConvertAmtSameCurrency],
    ["convertAmt tasa directa", runConvertAmtDirectRate],
    ["convertAmt tasa inversa", runConvertAmtInverseRate],
    ["convertAmt currency null", runConvertAmtMissingFromCurrency],
    ["periodTotals multi-currency display USD", runPeriodTotalsMultiCurrency],
    ["periodTotals switch display currency", runPeriodTotalsSwitchDisplayCurrency],
    ["categoryTotals multi-currency", runCategoryTotalsMultiCurrency],
    ["missing rate fallback no crashea", runMissingRateFallback],
  ];

  let passed = 0;
  let failed = 0;
  for (const [label, fn] of tests) {
    try {
      fn();
      console.log(`  ✓ ${label}`);
      passed++;
    } catch (error) {
      console.error(`  ✗ ${label}: ${(error as Error).message}`);
      failed++;
    }
  }
  console.log(`\nmulti-currency-smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} test(s) failed`);
}

main();
