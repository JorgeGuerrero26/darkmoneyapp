import { useQuery } from "@tanstack/react-query";

import { supabase } from "../../lib/supabase";
import { STALE } from "../../lib/query-client";
import { toNum } from "./_shared";

export type SubscriptionOccurrenceStatus =
  | "scheduled"
  | "paid"
  | "skipped"
  | "cancelled"
  | "overdue";

export type SubscriptionOccurrence = {
  id: number;
  subscriptionId: number;
  /** `yyyy-MM-dd`. */
  dueDate: string;
  /** Lo que se esperaba cobrar ESE mes, congelado al materializarlo. */
  expectedAmount: number;
  status: SubscriptionOccurrenceStatus;
  movementId: number | null;
  paidAt: string | null;
  notes: string | null;
};

/**
 * El historial mes a mes de una suscripción.
 *
 * Vive en su propia query y no en el snapshot a propósito: solo la piden el detalle de una
 * suscripción y la hoja de pago, así que meterla en el primer render costaría una consulta a
 * todo el mundo para lo que mira uno.
 *
 * Las filas las escribe la base (`sync_subscription_occurrences`), nunca el cliente: quien
 * decide qué mes está pagado es el movimiento vinculado, no la app.
 */
export function useSubscriptionOccurrencesQuery(subscriptionId: number | null) {
  return useQuery({
    queryKey: ["subscription-occurrences", subscriptionId],
    enabled: Boolean(supabase) && subscriptionId != null,
    staleTime: STALE.short,
    queryFn: async (): Promise<SubscriptionOccurrence[]> => {
      if (!supabase || subscriptionId == null) return [];
      const { data, error } = await supabase
        .from("subscription_occurrences")
        .select("id, subscription_id, due_date, expected_amount, status, movement_id, paid_at, notes")
        .eq("subscription_id", subscriptionId)
        .order("due_date", { ascending: true });

      if (error) throw new Error(error.message ?? "No se pudo cargar el historial de la suscripción");

      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: Number(row.id),
        subscriptionId: Number(row.subscription_id),
        dueDate: String(row.due_date).slice(0, 10),
        expectedAmount: toNum(row.expected_amount as never),
        status: row.status as SubscriptionOccurrenceStatus,
        movementId: row.movement_id != null ? Number(row.movement_id) : null,
        paidAt: row.paid_at != null ? String(row.paid_at) : null,
        notes: row.notes != null ? String(row.notes) : null,
      }));
    },
  });
}
