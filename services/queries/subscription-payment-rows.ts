import { buildSubscriptionPaymentReceipts } from "../../features/subscriptions/lib/payment-receipts";

/** Only a payment-history projection; never feed the returned totals back into the ledger. */
export function collapseSubscriptionPaymentRows<T extends Record<string, unknown>>(rows: readonly T[], workspaceId: number): T[] {
  if (rows.some(row=>Number(row.workspace_id)!==workspaceId)) throw new Error("El historial no pertenece al espacio consultado.");
  const result = buildSubscriptionPaymentReceipts(rows.map(row => ({
    id: Number(row.id), workspaceId: Number(row.workspace_id), createdByUserId: row.created_by_user_id as string | null,
    subscriptionId: row.subscription_id == null ? null : Number(row.subscription_id),
    status: String(row.status), movementType: String(row.movement_type), occurredAt: String(row.occurred_at),
    sourceAccountId: row.source_account_id == null ? null : Number(row.source_account_id),
    destinationAccountId: row.destination_account_id == null ? null : Number(row.destination_account_id),
    sourceAmount: row.source_amount == null ? null : Number(row.source_amount),
    destinationAmount: row.destination_amount == null ? null : Number(row.destination_amount),
    metadata: row.metadata,
  })), workspaceId);
  if (result.issues.length) throw new Error("No se pudo confirmar el historial: hay una división incompleta o incompatible.");
  const byId = new Map(rows.map(row => [Number(row.id),row]));
  return result.payments.map(payment => ({ ...byId.get(payment.id)!, source_amount: payment.sourceAmount,
    destination_amount: payment.destinationAmount, receipt_part_ids: payment.receiptPartIds } as T));
}
