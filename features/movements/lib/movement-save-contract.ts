import type { JsonValue, MovementStatus, MovementType } from "../../../types/domain";
import type { MovementFormInput, MovementUpdateInput } from "../../../services/queries/workspace-data";

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
  counterpartyId?: number | null;
  obligationId?: number | null;
  subscriptionId?: number | null;
  metadata?: JsonValue | null;
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
    counterpartyId: isTransfer ? null : input.counterpartyId ?? null,
    obligationId: input.obligationId ?? null,
    subscriptionId: isTransfer ? null : input.subscriptionId ?? null,
    metadata: input.metadata ?? {},
  };
}

export function buildMovementUpdateInput(input: BuildMovementInput): MovementUpdateInput {
  const createInput = buildMovementCreateInput(input);
  return {
    status: createInput.status,
    description: createInput.description,
    notes: createInput.notes,
    categoryId: createInput.categoryId,
    counterpartyId: createInput.counterpartyId,
    occurredAt: createInput.occurredAt,
    sourceAccountId: createInput.sourceAccountId,
    destinationAccountId: createInput.destinationAccountId,
    sourceAmount: createInput.sourceAmount ?? undefined,
    destinationAmount: createInput.destinationAmount ?? undefined,
    fxRate: createInput.fxRate,
  };
}
