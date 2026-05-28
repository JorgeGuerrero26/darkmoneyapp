import {
  validateMovementForm,
  type MovementFormContext,
  type MovementFormSnapshot,
} from "../../features/movements/lib/form-validation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function ctx(overrides: Partial<MovementFormContext> = {}): MovementFormContext {
  return {
    sourceCurrencyCode: "PEN",
    destinationCurrencyCode: "PEN",
    hasTransferFxAvailable: false,
    sourceAccountBalance: null,
    todayYmd: "2026-05-26",
    ...overrides,
  };
}

function snap(overrides: Partial<MovementFormSnapshot>): MovementFormSnapshot {
  return {
    movementType: "expense",
    status: "posted",
    sourceAccountId: 1,
    destinationAccountId: null,
    sourceAmount: "10",
    destinationAmount: "",
    occurredAt: "2026-05-26",
    ...overrides,
  };
}

function runValidExpense() {
  const result = validateMovementForm(snap({}), ctx());
  assert(result.valid === true, `expense válido: ${JSON.stringify(result.errors)}`);
  assert(Object.keys(result.errors).length === 0, "0 errors");
  assert(Object.keys(result.warnings).length === 0, "0 warnings");
}

function runValidIncome() {
  const result = validateMovementForm(
    snap({ movementType: "income", sourceAccountId: null, destinationAccountId: 2, sourceAmount: "", destinationAmount: "5000" }),
    ctx(),
  );
  assert(result.valid === true, `income válido: ${JSON.stringify(result.errors)}`);
}

function runValidTransferSameCurrency() {
  const result = validateMovementForm(
    snap({ movementType: "transfer", sourceAccountId: 1, destinationAccountId: 2, sourceAmount: "100" }),
    ctx(),
  );
  assert(result.valid === true, `transfer same-curr válido: ${JSON.stringify(result.errors)}`);
}

function runRejectsMissingSourceAccountForExpense() {
  const result = validateMovementForm(
    snap({ sourceAccountId: null }),
    ctx(),
  );
  assert(result.valid === false, "debe ser inválido");
  assert(result.errors.sourceAccountId, "error en sourceAccountId");
}

function runRejectsMissingDestForIncome() {
  const result = validateMovementForm(
    snap({ movementType: "income", sourceAccountId: null, destinationAccountId: null, sourceAmount: "", destinationAmount: "100" }),
    ctx(),
  );
  assert(result.errors.destinationAccountId, "error en destinationAccountId para income");
}

function runRejectsAmountZero() {
  const result = validateMovementForm(snap({ sourceAmount: "0" }), ctx());
  assert(result.errors.sourceAmount === "El monto debe ser mayor a 0", `error explícito: ${result.errors.sourceAmount}`);
}

function runRejectsNegativeAmount() {
  const result = validateMovementForm(snap({ sourceAmount: "-5" }), ctx());
  assert(result.errors.sourceAmount, "monto negativo rechazado");
}

function runRejectsInvalidAmountText() {
  const result = validateMovementForm(snap({ sourceAmount: "abc" }), ctx());
  assert(result.errors.sourceAmount, "monto texto no numérico rechazado");
}

function runRejectsEmptyAmount() {
  const result = validateMovementForm(snap({ sourceAmount: "" }), ctx());
  assert(result.errors.sourceAmount === "Ingresa un monto", "amount vacío bloquea");
}

function runRejectsTransferWithSameAccounts() {
  const result = validateMovementForm(
    snap({ movementType: "transfer", sourceAccountId: 1, destinationAccountId: 1, sourceAmount: "100" }),
    ctx(),
  );
  assert(result.errors.destinationAccountId === "Debe ser una cuenta diferente", "transfer origen==destino rechazado");
}

function runTransferMultiCurrencyRequiresFx() {
  const result = validateMovementForm(
    snap({
      movementType: "transfer",
      sourceAccountId: 1,
      destinationAccountId: 2,
      sourceAmount: "100",
      destinationAmount: "27",
    }),
    ctx({ sourceCurrencyCode: "PEN", destinationCurrencyCode: "USD", hasTransferFxAvailable: false }),
  );
  assert(result.errors.destinationAmount === "No se pudo resolver el tipo de cambio", "multi-currency sin FX rechazado");
}

function runTransferMultiCurrencyOkWithFx() {
  const result = validateMovementForm(
    snap({
      movementType: "transfer",
      sourceAccountId: 1,
      destinationAccountId: 2,
      sourceAmount: "100",
      destinationAmount: "27",
    }),
    ctx({ sourceCurrencyCode: "PEN", destinationCurrencyCode: "USD", hasTransferFxAvailable: true }),
  );
  assert(result.valid === true, `transfer multi-currency con FX válido: ${JSON.stringify(result.errors)}`);
}

function runTransferMultiCurrencyEmptyDestRejected() {
  const result = validateMovementForm(
    snap({
      movementType: "transfer",
      sourceAccountId: 1,
      destinationAccountId: 2,
      sourceAmount: "100",
      destinationAmount: "",
    }),
    ctx({ sourceCurrencyCode: "PEN", destinationCurrencyCode: "USD", hasTransferFxAvailable: true }),
  );
  assert(result.errors.destinationAmount === "Ingresa monto destino", "dest vacío en multi-currency rechazado");
}

function runFutureDateProducesWarning() {
  const result = validateMovementForm(
    snap({ occurredAt: "2026-06-01" }),
    ctx({ todayYmd: "2026-05-26" }),
  );
  assert(result.valid === true, "fecha futura no bloquea submit");
  assert(result.warnings.occurredAt === "La fecha del movimiento es futura", "warning de fecha futura");
}

function runPastDateNoWarning() {
  const result = validateMovementForm(
    snap({ occurredAt: "2026-04-15" }),
    ctx({ todayYmd: "2026-05-26" }),
  );
  assert(!result.warnings.occurredAt, "fecha pasada sin warning");
}

function runTodayNoWarning() {
  const result = validateMovementForm(
    snap({ occurredAt: "2026-05-26" }),
    ctx({ todayYmd: "2026-05-26" }),
  );
  assert(!result.warnings.occurredAt, "hoy sin warning");
}

function runOverdraftProducesWarning() {
  const result = validateMovementForm(
    snap({ sourceAmount: "500" }),
    ctx({ sourceAccountBalance: 100 }),
  );
  assert(result.valid === true, "overdraft no bloquea submit");
  assert(result.warnings.sourceAmount === "El monto supera el saldo disponible de la cuenta", "warning overdraft");
}

function runOverdraftSkippedWhenAmountInvalid() {
  const result = validateMovementForm(
    snap({ sourceAmount: "0" }),
    ctx({ sourceAccountBalance: 100 }),
  );
  // Si el monto ya es error, no se acumula warning de overdraft
  assert(result.errors.sourceAmount, "monto 0 bloquea");
  assert(!result.warnings.sourceAmount, "no se duplica warning con error activo");
}

function runOverdraftDoesNotApplyForIncome() {
  const result = validateMovementForm(
    snap({ movementType: "income", sourceAccountId: null, destinationAccountId: 2, sourceAmount: "", destinationAmount: "9999" }),
    ctx({ sourceAccountBalance: 50 }),
  );
  assert(!result.warnings.sourceAmount, "income no aplica overdraft");
}

function main() {
  const tests: Array<[string, () => void]> = [
    ["expense válido", runValidExpense],
    ["income válido", runValidIncome],
    ["transfer same-currency válido", runValidTransferSameCurrency],
    ["expense rechaza sourceAccount faltante", runRejectsMissingSourceAccountForExpense],
    ["income rechaza destinationAccount faltante", runRejectsMissingDestForIncome],
    ["rechaza monto 0", runRejectsAmountZero],
    ["rechaza monto negativo", runRejectsNegativeAmount],
    ["rechaza monto no numérico", runRejectsInvalidAmountText],
    ["rechaza monto vacío", runRejectsEmptyAmount],
    ["transfer rechaza origen==destino", runRejectsTransferWithSameAccounts],
    ["transfer multi-currency sin FX rechazado", runTransferMultiCurrencyRequiresFx],
    ["transfer multi-currency con FX OK", runTransferMultiCurrencyOkWithFx],
    ["transfer multi-currency monto dest vacío rechazado", runTransferMultiCurrencyEmptyDestRejected],
    ["fecha futura → warning, no error", runFutureDateProducesWarning],
    ["fecha pasada sin warning", runPastDateNoWarning],
    ["fecha hoy sin warning", runTodayNoWarning],
    ["overdraft → warning, no error", runOverdraftProducesWarning],
    ["overdraft no warn cuando monto ya es error", runOverdraftSkippedWhenAmountInvalid],
    ["overdraft no aplica a income", runOverdraftDoesNotApplyForIncome],
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
  console.log(`\nform-validation-smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} test(s) failed`);
}

main();
