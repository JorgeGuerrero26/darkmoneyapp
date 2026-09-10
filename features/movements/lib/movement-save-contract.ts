import type { JsonValue, MovementStatus, MovementType } from "../../../types/domain";
import type { MovementFormInput, MovementUpdateInput } from "./movement-input-types";

type BuildMovementInput = {
  movementType: MovementType;
  status: MovementStatus;
  occurredAt: string;
  description: string;
  notes?: string | null;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  sourceAmount: number;
  destinationAmount: number;
  transferCurrenciesDiffer?: boolean;
  fxRate?: number | null;
  categoryId?: number | null;
  spendTypeId?: number | null;
  counterpartyId?: number | null;
  obligationId?: number | null;
  subscriptionId?: number | null;
  metadata?: JsonValue | null;
  dedupeKey?: string | null;
};

function validAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function transferDestinationAmount(input: BuildMovementInput) {
  if (input.movementType !== "transfer") return null;
  return input.transferCurrenciesDiffer ? validAmount(input.destinationAmount) : validAmount(input.sourceAmount);
}

function transferFxRate(input: BuildMovementInput) {
  if (input.movementType !== "transfer" || !input.transferCurrenciesDiffer) return null;
  if (input.fxRate != null && Number.isFinite(input.fxRate) && input.fxRate > 0) return input.fxRate;
  const sourceAmount = validAmount(input.sourceAmount);
  const destinationAmount = validAmount(input.destinationAmount);
  return sourceAmount > 0 && destinationAmount > 0 ? destinationAmount / sourceAmount : null;
}

export function buildMovementCreateInput(input: BuildMovementInput): MovementFormInput {
  const isIncome = input.movementType === "income";
  const isTransfer = input.movementType === "transfer";
  return {
    movementType: input.movementType,
    status: isTransfer ? "posted" : input.status,
    occurredAt: input.occurredAt,
    description: input.description,
    notes: input.notes ?? null,
    sourceAccountId: isIncome ? null : input.sourceAccountId,
    sourceAmount: isIncome ? null : validAmount(input.sourceAmount),
    destinationAccountId: isIncome || isTransfer ? input.destinationAccountId : null,
    destinationAmount: isIncome ? validAmount(input.destinationAmount) : transferDestinationAmount(input),
    fxRate: isTransfer ? transferFxRate(input) : null,
    categoryId: isTransfer ? null : input.categoryId ?? null,
    /* Solo el gasto lleva tipo. Un ingreso no es necesidad ni deseo, y una transferencia mueve
       plata entre cuentas tuyas sin gastarla: el que quede puesto al cambiar de tipo de
       movimiento es un dato que nadie escribió y que contaría en las métricas. */
    spendTypeId: input.movementType === "expense" ? input.spendTypeId ?? null : null,
    counterpartyId: isTransfer ? null : input.counterpartyId ?? null,
    obligationId: input.obligationId ?? null,
    subscriptionId: isTransfer ? null : input.subscriptionId ?? null,
    metadata: input.metadata ?? {},
    dedupeKey: input.dedupeKey ?? null,
  };
}

/**
 * Lo que se manda al editar.
 *
 * Sale del MISMO builder que la creación a propósito: un gasto convertido en ingreso tiene que
 * quedar igual que si se hubiera creado como ingreso. Y los montos se mandan como `null` y no
 * como `undefined` — `undefined` significa "no lo toques", y ahí estaba el fallo: al cambiar de
 * gasto a ingreso, la cuenta de origen se vaciaba y su monto se quedaba puesto, así que la base
 * rechazaba la fila entera y el usuario solo notaba una vibración.
 */
export function buildMovementUpdateInput(input: BuildMovementInput): MovementUpdateInput {
  const createInput = buildMovementCreateInput(input);
  return {
    movementType: createInput.movementType,
    status: createInput.status,
    description: createInput.description,
    notes: createInput.notes,
    categoryId: createInput.categoryId,
    spendTypeId: createInput.spendTypeId,
    counterpartyId: createInput.counterpartyId,
    occurredAt: createInput.occurredAt,
    sourceAccountId: createInput.sourceAccountId,
    destinationAccountId: createInput.destinationAccountId,
    sourceAmount: createInput.sourceAmount ?? null,
    destinationAmount: createInput.destinationAmount ?? null,
    fxRate: createInput.fxRate,
  };
}
