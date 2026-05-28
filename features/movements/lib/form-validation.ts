import type { MovementStatus, MovementType } from "../../../types/domain";

/**
 * Esquema de validación explícito para MovementForm.
 *
 * Distingue:
 *   - `errors`: hard-errors que bloquean submit (faltan campos, monto inválido,
 *     transfer con cuentas iguales, transfer multi-currency sin FX, etc.)
 *   - `warnings`: soft-warnings que el form puede mostrar como confirmación
 *     pre-submit sin bloquear (fecha futura, monto > balance).
 *
 * Diseñado como función pura para que sea testeable sin React.
 */

export type MovementFormSnapshot = {
  movementType: MovementType | "expense" | "income" | "transfer";
  status: MovementStatus;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  sourceAmount: string;
  destinationAmount: string;
  occurredAt: string;
};

export type MovementFormContext = {
  /** Monedas de cuenta origen y destino, si están seleccionadas. Si difieren → transfer multi-currency. */
  sourceCurrencyCode: string | null;
  destinationCurrencyCode: string | null;
  /** ¿El usuario o el resolver tienen un fxRate disponible para transfer multi-currency? */
  hasTransferFxAvailable: boolean;
  /** Balance disponible de la cuenta origen, para detectar overdraft (warning, no error). */
  sourceAccountBalance: number | null;
  /** Fecha de hoy en formato YYYY-MM-DD (zona Lima por defecto desde el caller). */
  todayYmd: string;
};

export type MovementFormErrors = {
  sourceAccountId?: string;
  destinationAccountId?: string;
  sourceAmount?: string;
  destinationAmount?: string;
  occurredAt?: string;
};

export type MovementFormWarnings = {
  occurredAt?: string;
  sourceAmount?: string;
};

export type MovementFormValidation = {
  valid: boolean;
  errors: MovementFormErrors;
  warnings: MovementFormWarnings;
};

function parseAmount(value: string): number {
  if (!value) return NaN;
  const normalized = value.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function isAfter(targetYmd: string, todayYmd: string): boolean {
  return targetYmd > todayYmd;
}

export function validateMovementForm(
  snapshot: MovementFormSnapshot,
  context: MovementFormContext,
): MovementFormValidation {
  const errors: MovementFormErrors = {};
  const warnings: MovementFormWarnings = {};

  const isExpense = snapshot.movementType === "expense";
  const isIncome = snapshot.movementType === "income";
  const isTransfer = snapshot.movementType === "transfer";

  // --- Cuentas ---
  if (!isIncome && !snapshot.sourceAccountId) {
    errors.sourceAccountId = "Selecciona una cuenta";
  }
  if ((isIncome || isTransfer) && !snapshot.destinationAccountId) {
    errors.destinationAccountId = isIncome ? "Selecciona una cuenta de destino" : "Selecciona cuenta destino";
  }
  if (
    isTransfer &&
    snapshot.sourceAccountId !== null &&
    snapshot.sourceAccountId === snapshot.destinationAccountId
  ) {
    errors.destinationAccountId = "Debe ser una cuenta diferente";
  }

  // --- Montos ---
  const sourceAmt = parseAmount(snapshot.sourceAmount);
  const destAmt = parseAmount(snapshot.destinationAmount);

  if (!isIncome) {
    if (!snapshot.sourceAmount) {
      errors.sourceAmount = "Ingresa un monto";
    } else if (!Number.isFinite(sourceAmt) || sourceAmt <= 0) {
      errors.sourceAmount = "El monto debe ser mayor a 0";
    }
  }
  if (isIncome) {
    if (!snapshot.destinationAmount) {
      errors.destinationAmount = "Ingresa un monto";
    } else if (!Number.isFinite(destAmt) || destAmt <= 0) {
      errors.destinationAmount = "El monto debe ser mayor a 0";
    }
  }

  // --- Transfer multi-currency ---
  const currenciesDiffer = Boolean(
    context.sourceCurrencyCode &&
      context.destinationCurrencyCode &&
      context.sourceCurrencyCode.toUpperCase() !== context.destinationCurrencyCode.toUpperCase(),
  );
  if (isTransfer && currenciesDiffer) {
    if (!context.hasTransferFxAvailable) {
      errors.destinationAmount = "No se pudo resolver el tipo de cambio";
    } else if (!snapshot.destinationAmount) {
      errors.destinationAmount = "Ingresa monto destino";
    } else if (!Number.isFinite(destAmt) || destAmt <= 0) {
      errors.destinationAmount = "El monto destino debe ser mayor a 0";
    }
  }

  // --- Fecha futura: warning, no error ---
  if (snapshot.occurredAt && isAfter(snapshot.occurredAt, context.todayYmd)) {
    warnings.occurredAt = "La fecha del movimiento es futura";
  }

  // --- Overdraft: warning ---
  if (
    (isExpense || isTransfer) &&
    !errors.sourceAmount &&
    Number.isFinite(sourceAmt) &&
    sourceAmt > 0 &&
    context.sourceAccountBalance != null &&
    sourceAmt > context.sourceAccountBalance
  ) {
    warnings.sourceAmount = "El monto supera el saldo disponible de la cuenta";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}
