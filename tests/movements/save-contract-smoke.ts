import { buildMovementCreateInput, buildMovementUpdateInput } from "../../features/movements/lib/movement-save-contract";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function approxEqual(actual: number | null | undefined, expected: number, tolerance = 0.0001): boolean {
  if (actual == null) return false;
  return Math.abs(actual - expected) < tolerance;
}

function runExpenseBuildsCorrectShape() {
  const result = buildMovementCreateInput({
    movementType: "expense",
    status: "posted",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "Café",
    sourceAccountId: 1,
    destinationAccountId: null,
    sourceAmount: 8.5,
    destinationAmount: 0,
    categoryId: 10,
    counterpartyId: 20,
  });
  assert(result.movementType === "expense", `movementType esperado expense, recibido ${result.movementType}`);
  assert(result.status === "posted", "status esperado posted");
  assert(result.sourceAccountId === 1, "sourceAccountId esperado 1");
  assert(result.sourceAmount === 8.5, `sourceAmount esperado 8.5, recibido ${result.sourceAmount}`);
  assert(result.destinationAccountId === null, "destinationAccountId debe ser null para expense");
  assert(result.destinationAmount === null, "destinationAmount debe ser null para expense (transferDestinationAmount returns null)");
  assert(result.categoryId === 10, "categoryId debe propagarse");
  assert(result.counterpartyId === 20, "counterpartyId debe propagarse");
  assert(result.fxRate === null, "fxRate debe ser null en expense");
}

function runIncomeBuildsCorrectShape() {
  const result = buildMovementCreateInput({
    movementType: "income",
    status: "posted",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "Sueldo",
    sourceAccountId: null,
    destinationAccountId: 2,
    sourceAmount: 0,
    destinationAmount: 5000,
    categoryId: 30,
  });
  assert(result.movementType === "income", "movementType income");
  assert(result.sourceAccountId === null, "income: sourceAccountId debe ser null");
  assert(result.sourceAmount === null, "income: sourceAmount debe ser null");
  assert(result.destinationAccountId === 2, "income: destinationAccountId debe propagarse");
  assert(result.destinationAmount === 5000, "income: destinationAmount esperado 5000");
  assert(result.categoryId === 30, "income permite categoría");
  assert(result.fxRate === null, "income: fxRate null");
}

function runTransferSameCurrencyBuildsCorrectShape() {
  const result = buildMovementCreateInput({
    movementType: "transfer",
    status: "posted",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "Transferencia entre mis cuentas",
    sourceAccountId: 1,
    destinationAccountId: 2,
    sourceAmount: 100,
    destinationAmount: 100,
    transferCurrenciesDiffer: false,
    categoryId: 99, // debe ignorarse
    counterpartyId: 99, // debe ignorarse
  });
  assert(result.movementType === "transfer", "movementType transfer");
  assert(result.status === "posted", "transfer siempre posted (no acepta pending/planned)");
  assert(result.sourceAccountId === 1 && result.destinationAccountId === 2, "transfer mantiene ambas cuentas");
  assert(result.sourceAmount === 100, "transfer sourceAmount 100");
  assert(result.destinationAmount === 100, "transfer same-currency: destinationAmount = sourceAmount");
  assert(result.fxRate === null, "transfer same-currency: fxRate null");
  assert(result.categoryId === null, "transfer ignora categoryId");
  assert(result.counterpartyId === null, "transfer ignora counterpartyId");
}

function runTransferMultiCurrencyWithExplicitRate() {
  const result = buildMovementCreateInput({
    movementType: "transfer",
    status: "posted",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "PEN→USD",
    sourceAccountId: 1,
    destinationAccountId: 2,
    sourceAmount: 100,
    destinationAmount: 27,
    transferCurrenciesDiffer: true,
    fxRate: 0.27,
  });
  assert(result.destinationAmount === 27, `multi-currency: destinationAmount esperado 27, recibido ${result.destinationAmount}`);
  assert(result.fxRate === 0.27, `multi-currency: fxRate explícito esperado 0.27, recibido ${result.fxRate}`);
}

function runTransferMultiCurrencyComputesFxFromAmounts() {
  // Sin fxRate explícito: debe calcularlo como destination / source
  const result = buildMovementCreateInput({
    movementType: "transfer",
    status: "posted",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "PEN→USD sin fx explícito",
    sourceAccountId: 1,
    destinationAccountId: 2,
    sourceAmount: 100,
    destinationAmount: 27,
    transferCurrenciesDiffer: true,
    fxRate: null,
  });
  assert(approxEqual(result.fxRate, 0.27), `fxRate calculado esperado 0.27, recibido ${result.fxRate}`);
}

function runTransferMultiCurrencyFxFallsBackToNullIfAmountsZero() {
  const result = buildMovementCreateInput({
    movementType: "transfer",
    status: "posted",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "edge",
    sourceAccountId: 1,
    destinationAccountId: 2,
    sourceAmount: 0,
    destinationAmount: 0,
    transferCurrenciesDiffer: true,
  });
  assert(result.fxRate === null, "fxRate null cuando ambos montos son 0");
}

function runInvalidAmountsAreCoercedToZero() {
  const result = buildMovementCreateInput({
    movementType: "expense",
    status: "posted",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "edge",
    sourceAccountId: 1,
    destinationAccountId: null,
    sourceAmount: NaN,
    destinationAmount: -10,
  });
  assert(result.sourceAmount === 0, `validAmount(NaN) debe ser 0, recibido ${result.sourceAmount}`);
}

function runMetadataDefaultsToEmptyObject() {
  const result = buildMovementCreateInput({
    movementType: "expense",
    status: "posted",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "x",
    sourceAccountId: 1,
    destinationAccountId: null,
    sourceAmount: 10,
    destinationAmount: 0,
  });
  assert(result.metadata !== null && typeof result.metadata === "object", "metadata debe ser {} cuando no se provee");
}

function runMetadataPassthrough() {
  const meta = { source: "notification_detection", suggestionId: "abc" };
  const result = buildMovementCreateInput({
    movementType: "expense",
    status: "posted",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "x",
    sourceAccountId: 1,
    destinationAccountId: null,
    sourceAmount: 10,
    destinationAmount: 0,
    metadata: meta,
  });
  assert(result.metadata === meta, "metadata debe propagarse por referencia");
}

function runPendingStatusPreservedForNonTransfer() {
  const result = buildMovementCreateInput({
    movementType: "expense",
    status: "pending",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "x",
    sourceAccountId: 1,
    destinationAccountId: null,
    sourceAmount: 10,
    destinationAmount: 0,
  });
  assert(result.status === "pending", "expense pending debe preservarse");
}

function runUpdateInputDoesNotIncludeMetadataNorMovementType() {
  // buildMovementUpdateInput omite metadata y movementType porque son inmutables en update.
  const update = buildMovementUpdateInput({
    movementType: "expense",
    status: "posted",
    occurredAt: "2026-05-26T12:00:00Z",
    description: "edit",
    sourceAccountId: 1,
    destinationAccountId: null,
    sourceAmount: 50,
    destinationAmount: 0,
    categoryId: 11,
  });
  assert(!("movementType" in update), "update no debe incluir movementType");
  assert(!("metadata" in update), "update no debe incluir metadata");
  assert(update.status === "posted", "update preserva status");
  assert(update.categoryId === 11, "update preserva categoryId");
}

function main() {
  const tests: Array<[string, () => void]> = [
    ["expense build shape", runExpenseBuildsCorrectShape],
    ["income build shape", runIncomeBuildsCorrectShape],
    ["transfer same-currency", runTransferSameCurrencyBuildsCorrectShape],
    ["transfer multi-currency con fxRate explícito", runTransferMultiCurrencyWithExplicitRate],
    ["transfer multi-currency calcula fx desde montos", runTransferMultiCurrencyComputesFxFromAmounts],
    ["transfer multi-currency fxRate null si montos 0", runTransferMultiCurrencyFxFallsBackToNullIfAmountsZero],
    ["amounts inválidos coercionados a 0", runInvalidAmountsAreCoercedToZero],
    ["metadata default vacío", runMetadataDefaultsToEmptyObject],
    ["metadata passthrough", runMetadataPassthrough],
    ["pending status preservado en expense", runPendingStatusPreservedForNonTransfer],
    ["update input omite metadata/movementType", runUpdateInputDoesNotIncludeMetadataNorMovementType],
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
  console.log(`\nsave-contract-smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} test(s) failed`);
}

main();
