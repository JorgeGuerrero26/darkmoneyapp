import { validateMovementForm } from "../features/movements/lib/form-validation";

const baseContext = {
  sourceCurrencyCode: "PEN",
  destinationCurrencyCode: null,
  hasTransferFxAvailable: false,
  sourceAccountBalance: null,
  todayYmd: "2026-07-06",
};

describe("validateMovementForm", () => {
  test("gasto válido pasa", () => {
    const result = validateMovementForm(
      {
        movementType: "expense",
        status: "posted",
        sourceAccountId: 1,
        destinationAccountId: null,
        sourceAmount: "50",
        destinationAmount: "",
        occurredAt: "2026-07-06",
      },
      baseContext,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  test("gasto sin cuenta ni monto acumula errores", () => {
    const result = validateMovementForm(
      {
        movementType: "expense",
        status: "posted",
        sourceAccountId: null,
        destinationAccountId: null,
        sourceAmount: "",
        destinationAmount: "",
        occurredAt: "2026-07-06",
      },
      baseContext,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.sourceAccountId).toBeTruthy();
    expect(result.errors.sourceAmount).toBeTruthy();
  });

  test("ingreso valida sobre destino (no origen)", () => {
    const result = validateMovementForm(
      {
        movementType: "income",
        status: "posted",
        sourceAccountId: null,
        destinationAccountId: 2,
        sourceAmount: "",
        destinationAmount: "120",
        occurredAt: "2026-07-06",
      },
      baseContext,
    );
    expect(result.valid).toBe(true);
  });

  test("transferencia a la misma cuenta se rechaza", () => {
    const result = validateMovementForm(
      {
        movementType: "transfer",
        status: "posted",
        sourceAccountId: 1,
        destinationAccountId: 1,
        sourceAmount: "100",
        destinationAmount: "",
        occurredAt: "2026-07-06",
      },
      baseContext,
    );
    expect(result.valid).toBe(false);
    expect(result.errors.destinationAccountId).toBe("Debe ser una cuenta diferente");
  });

  test("transferencia multimoneda sin FX disponible se rechaza", () => {
    const result = validateMovementForm(
      {
        movementType: "transfer",
        status: "posted",
        sourceAccountId: 1,
        destinationAccountId: 2,
        sourceAmount: "100",
        destinationAmount: "27",
        occurredAt: "2026-07-06",
      },
      { ...baseContext, destinationCurrencyCode: "USD", hasTransferFxAvailable: false },
    );
    expect(result.valid).toBe(false);
    expect(result.errors.destinationAmount).toBe("No se pudo resolver el tipo de cambio");
  });

  test("fecha futura es warning, no error", () => {
    const result = validateMovementForm(
      {
        movementType: "expense",
        status: "posted",
        sourceAccountId: 1,
        destinationAccountId: null,
        sourceAmount: "50",
        destinationAmount: "",
        occurredAt: "2026-12-31",
      },
      baseContext,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.occurredAt).toBeTruthy();
  });

  test("monto sobre el saldo es warning de sobregiro, no error", () => {
    const result = validateMovementForm(
      {
        movementType: "expense",
        status: "posted",
        sourceAccountId: 1,
        destinationAccountId: null,
        sourceAmount: "500",
        destinationAmount: "",
        occurredAt: "2026-07-06",
      },
      { ...baseContext, sourceAccountBalance: 100 },
    );
    expect(result.valid).toBe(true);
    expect(result.warnings.sourceAmount).toBeTruthy();
  });
});
