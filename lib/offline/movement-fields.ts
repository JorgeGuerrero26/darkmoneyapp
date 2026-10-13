import type { MovementFormInput, MovementUpdateInput } from "../../features/movements/lib/movement-input-types";

/**
 * Del contrato de la app (camelCase) a columnas de la base. Es el mismo mapeo que hacen
 * `createMovement` y `useUpdateMovementMutation` (services/queries/workspace-data.ts); vive aquí,
 * sin dependencias de React Native, para poder usarlo y probarlo dentro del motor.
 */
export function movementInputToFields(input: MovementFormInput): Record<string, unknown> {
  return {
    movement_type: input.movementType,
    status: input.status,
    occurred_at: input.occurredAt,
    description: input.description,
    notes: input.notes ?? null,
    source_account_id: input.sourceAccountId,
    source_amount: input.sourceAmount,
    destination_account_id: input.destinationAccountId,
    destination_amount: input.destinationAmount,
    fx_rate: input.fxRate ?? null,
    category_id: input.categoryId ?? null,
    spend_type_id: input.spendTypeId ?? null,
    counterparty_id: input.counterpartyId ?? null,
    obligation_id: input.obligationId ?? null,
    subscription_id: input.subscriptionId ?? null,
    metadata: input.metadata ?? {},
    client_dedupe_key: input.dedupeKey ?? null,
  };
}

/** Solo los campos definidos: `null` vacía la columna, `undefined` la deja como está. */
export function movementUpdateToFields(input: MovementUpdateInput): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (input.movementType !== undefined) fields.movement_type = input.movementType;
  if (input.description !== undefined) fields.description = input.description;
  if (input.notes !== undefined) fields.notes = input.notes;
  if (input.categoryId !== undefined) fields.category_id = input.categoryId;
  if (input.spendTypeId !== undefined) fields.spend_type_id = input.spendTypeId;
  if (input.counterpartyId !== undefined) fields.counterparty_id = input.counterpartyId;
  if (input.occurredAt !== undefined) fields.occurred_at = input.occurredAt;
  if (input.status !== undefined) fields.status = input.status;
  if (input.sourceAmount !== undefined) fields.source_amount = input.sourceAmount;
  if (input.destinationAmount !== undefined) fields.destination_amount = input.destinationAmount;
  if (input.fxRate !== undefined) fields.fx_rate = input.fxRate;
  if (input.sourceAccountId !== undefined) fields.source_account_id = input.sourceAccountId;
  if (input.destinationAccountId !== undefined) fields.destination_account_id = input.destinationAccountId;
  if (input.metadata !== undefined) fields.metadata = input.metadata;
  return fields;
}
