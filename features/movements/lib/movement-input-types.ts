import type { JsonValue, MovementStatus, MovementType } from "../../../types/domain";

/**
 * Contrato de input para crear un movimiento. Compartido entre el form, el
 * headless task del overlay de notificaciones, y la mutation server.
 *
 * Separado de services/queries/workspace-data.ts para poder testear el
 * builder sin arrastrar React Native al tsc de tests.
 */
export type MovementFormInput = {
  movementType: MovementType;
  status: MovementStatus;
  occurredAt: string;
  description: string;
  notes?: string | null;
  sourceAccountId: number | null;
  sourceAmount: number | null;
  destinationAccountId: number | null;
  destinationAmount: number | null;
  fxRate?: number | null;
  categoryId?: number | null;
  counterpartyId?: number | null;
  obligationId?: number | null;
  subscriptionId?: number | null;
  metadata?: JsonValue | null;
};

/**
 * Contrato de input para actualizar un movimiento. Todos los campos opcionales
 * — solo se persisten los que están definidos (patrón "partial update").
 */
export type MovementUpdateInput = {
  description?: string;
  notes?: string | null;
  categoryId?: number | null;
  counterpartyId?: number | null;
  occurredAt?: string;
  status?: MovementStatus;
  sourceAmount?: number;
  destinationAmount?: number;
  fxRate?: number | null;
  sourceAccountId?: number | null;
  destinationAccountId?: number | null;
};
