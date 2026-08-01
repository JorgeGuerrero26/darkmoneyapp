import { dateStrToISO } from "../../../lib/date";
import { supabase } from "../../../lib/supabase";
import { computeNextRecurringDate } from "../../../lib/subscription-helpers";
import { recordManualMovementFingerprint } from "../../../services/queries/workspace-data";
import type { SubscriptionSummary } from "../../../types/domain";

type Args = {
  subscription: SubscriptionSummary;
  workspaceId: number;
  paidDate: string; // YYYY-MM-DD
  amount: number;
  accountId: number;
};

/**
 * Registra un pago manual de una suscripción:
 * 1. Avanza next_due_date de la suscripción al siguiente período (UPDATE primero
 *    para que si el INSERT del movement falla, se pueda reintentar el movement
 *    sin duplicar fechas).
 * 2. Inserta movement posted con subscription_id.
 *
 * Devuelve la nueva nextDueDate calculada.
 */
export async function markSubscriptionPaid({
  subscription,
  workspaceId,
  paidDate,
  amount,
  accountId,
}: Args): Promise<{ nextDueDate: string; movementId: number | null; occurredAt: string }> {
  if (!supabase) throw new Error("Supabase no disponible.");

  // Step 1: advance next_due_date. Si esto falla, abortamos sin crear movement.
  const nextDueDate = computeNextRecurringDate(
    subscription.nextDueDate,
    subscription.frequency,
    subscription.intervalCount,
  );
  const { error: updateError } = await supabase
    .from("subscriptions")
    .update({ next_due_date: nextDueDate })
    .eq("workspace_id", workspaceId)
    .eq("id", subscription.id);
  if (updateError) {
    throw new Error(updateError.message ?? "No se pudo avanzar la fecha de próximo cobro");
  }

  // Step 2: insert movement. Si falla, el next_due_date ya quedó avanzado.
  // El usuario puede registrar el movement manualmente desde el dashboard;
  // la suscripción ya muestra el siguiente período como esperado.
  const occurredAt = dateStrToISO(paidDate);
  const { data: inserted, error: insertError } = await supabase.from("movements").insert({
    workspace_id: workspaceId,
    movement_type: "subscription_payment",
    status: "posted",
    occurred_at: occurredAt,
    description: subscription.name,
    notes: subscription.notes ?? "Pago registrado manualmente.",
    source_account_id: accountId,
    source_amount: amount,
    destination_account_id: null,
    destination_amount: null,
    fx_rate: null,
    category_id: subscription.categoryId ?? null,
    counterparty_id: subscription.vendorPartyId ?? null,
    obligation_id: null,
    subscription_id: subscription.id,
    metadata: {
      manual_subscription_payment: true,
      paid_for_due_date: subscription.nextDueDate,
    },
  }).select("id").single();
  if (insertError) {
    throw new Error(
      `Fecha avanzada a ${nextDueDate}, pero el movimiento no se pudo crear: ${insertError.message ?? "error desconocido"}. Regístralo manualmente desde el dashboard.`,
    );
  }

  // Único flujo que inserta movimientos sin pasar por createMovement: registrar
  // la huella de dedupe nativo aquí (suprime el aviso del banco de este cobro).
  recordManualMovementFingerprint(workspaceId, {
    sourceAmount: amount,
    destinationAmount: null,
    sourceAccountId: accountId,
    destinationAccountId: null,
  });

  return { nextDueDate, movementId: (inserted as { id: number } | null)?.id ?? null, occurredAt };
}
