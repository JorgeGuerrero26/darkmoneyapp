import type { MovementFormInput } from "../../movements/lib/movement-input-types";
import type { AssistantDraft } from "../../../services/queries/assistant";

/**
 * IDs ya resueltos por el cliente desde el snapshot (no se confían los del LLM
 * ciegamente: el modelo propone nombres, el cliente los mapea a ids reales).
 */
export type ResolvedIds = {
  sourceAccountId: number | null;
  destinationAccountId?: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  todayIso: string;
};

/** Clave de idempotencia estable por draft: guardar 2 veces no duplica. */
export function draftDedupeKey(draft: AssistantDraft): string {
  const parts = [draft.operation, draft.amount, draft.currency, draft.accountName, draft.occurredAt, draft.description];
  return `assistant:${parts.join("|")}`;
}

/**
 * Convierte un borrador de gasto/ingreso/transferencia en MovementFormInput.
 * Los pagos de suscripción/deuda NO pasan por aquí: usan sus mutations propias.
 */
export function draftToMovementInput(draft: AssistantDraft, ids: ResolvedIds): MovementFormInput {
  const occurredAt = draft.occurredAt ? `${draft.occurredAt}T12:00:00.000Z` : ids.todayIso;
  const common = {
    status: "posted" as const,
    occurredAt,
    description: draft.description ?? "",
    categoryId: ids.categoryId,
    counterpartyId: ids.counterpartyId,
    metadata: { source: "assistant_chat" },
    dedupeKey: draftDedupeKey(draft),
  };
  if (draft.operation === "income") {
    return {
      ...common,
      movementType: "income",
      sourceAccountId: null,
      sourceAmount: null,
      destinationAccountId: ids.sourceAccountId,
      destinationAmount: draft.amount,
    };
  }
  if (draft.operation === "transfer") {
    return {
      ...common,
      movementType: "transfer",
      categoryId: null,
      sourceAccountId: ids.sourceAccountId,
      sourceAmount: draft.amount,
      destinationAccountId: ids.destinationAccountId ?? null,
      destinationAmount: draft.amount,
    };
  }
  // expense (default)
  return {
    ...common,
    movementType: "expense",
    sourceAccountId: ids.sourceAccountId,
    sourceAmount: draft.amount,
    destinationAccountId: null,
    destinationAmount: null,
  };
}
