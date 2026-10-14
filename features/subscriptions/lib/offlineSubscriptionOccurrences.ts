import type { SubscriptionOccurrence, SubscriptionOccurrenceStatus } from "../../../services/queries/subscription-occurrences";

type Row = Record<string, unknown>;

/** Historial mes a mes de una suscripción desde la copia local (solo lectura: las filas las escribe el servidor). */
export function buildLocalSubscriptionOccurrences(rows: Row[], subscriptionId: number): SubscriptionOccurrence[] {
  return rows
    .filter((row) => Number(row.subscription_id) === subscriptionId)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .map((row): SubscriptionOccurrence => ({
      id: Number(row.id),
      subscriptionId: Number(row.subscription_id),
      dueDate: String(row.due_date).slice(0, 10),
      expectedAmount: Number(row.expected_amount ?? 0),
      status: row.status as SubscriptionOccurrenceStatus,
      movementId: row.movement_id != null ? Number(row.movement_id) : null,
      paidAt: row.paid_at != null ? String(row.paid_at) : null,
      notes: row.notes != null ? String(row.notes) : null,
    }));
}
