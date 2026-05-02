import { useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { filterDateFrom, filterDateTo, todayPeru, dateStrToISO } from "../lib/date";
import { supabase } from "../lib/supabase";
import { computeNextRecurringDate } from "../lib/subscription-helpers";
import type { SubscriptionSummary } from "../types/domain";
import type { WorkspaceSnapshot } from "../services/queries/workspace-data";

type Input = {
  userId?: string | null;
  workspaceId: number | null;
  snapshot?: WorkspaceSnapshot;
};

const MAX_CATCH_UP_OCCURRENCES = 120;

async function movementExistsForSubscriptionDate(subscriptionId: number, dueDate: string) {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { count, error } = await supabase
    .from("movements")
    .select("id", { count: "exact", head: true })
    .eq("subscription_id", subscriptionId)
    .neq("status", "voided")
    .gte("occurred_at", filterDateFrom(dueDate))
    .lte("occurred_at", filterDateTo(dueDate));

  if (error) throw new Error(error.message ?? "Error al comprobar movimientos de suscripción");
  return (count ?? 0) > 0;
}

async function createAutomaticSubscriptionMovement(
  workspaceId: number,
  subscription: SubscriptionSummary,
  dueDate: string,
) {
  if (!supabase) throw new Error("Supabase no disponible.");
  const payload = {
    workspace_id: workspaceId,
    movement_type: "subscription_payment",
    status: "posted",
    occurred_at: dateStrToISO(dueDate),
    description: subscription.name,
    notes: subscription.notes ?? "Generado automáticamente desde la suscripción.",
    source_account_id: subscription.accountId ?? null,
    source_amount: subscription.amount,
    destination_account_id: null,
    destination_amount: null,
    fx_rate: null,
    category_id: subscription.categoryId ?? null,
    counterparty_id: subscription.vendorPartyId ?? null,
    obligation_id: null,
    subscription_id: subscription.id,
    metadata: {
      auto_generated_from_subscription: true,
      generator: "subscription_auto_create_movement",
      subscription_due_date: dueDate,
    },
  };

  const { error } = await supabase.from("movements").insert(payload);
  if (error) throw new Error(error.message ?? "Error al crear movimiento automático de suscripción");
}

async function advanceSubscriptionNextDueDate(
  workspaceId: number,
  subscriptionId: number,
  nextDueDate: string,
) {
  if (!supabase) throw new Error("Supabase no disponible.");
  const { error } = await supabase
    .from("subscriptions")
    .update({ next_due_date: nextDueDate })
    .eq("workspace_id", workspaceId)
    .eq("id", subscriptionId);

  if (error) throw new Error(error.message ?? "Error al actualizar próximo cobro de la suscripción");
}

async function processSubscription(
  workspaceId: number,
  subscription: SubscriptionSummary,
  todayYmd: string,
) {
  if (!subscription.accountId || !Number.isFinite(subscription.amount) || subscription.amount <= 0) {
    return false;
  }

  let cursor = subscription.nextDueDate;
  let iterations = 0;
  let changed = false;

  while (cursor <= todayYmd && (!subscription.endDate || cursor <= subscription.endDate)) {
    const exists = await movementExistsForSubscriptionDate(subscription.id, cursor);
    if (!exists) {
      await createAutomaticSubscriptionMovement(workspaceId, subscription, cursor);
      changed = true;
    }

    const nextCursor = computeNextRecurringDate(cursor, subscription.frequency, subscription.intervalCount);
    if (nextCursor <= cursor) break;
    cursor = nextCursor;
    iterations += 1;
    if (iterations >= MAX_CATCH_UP_OCCURRENCES) break;
  }

  if (cursor !== subscription.nextDueDate) {
    await advanceSubscriptionNextDueDate(workspaceId, subscription.id, cursor);
    changed = true;
  }

  return changed;
}

export function useAutoSubscriptionMovements({ userId, workspaceId, snapshot }: Input) {
  const queryClient = useQueryClient();
  const processingRef = useRef(false);
  const lastProcessedSignatureRef = useRef<string | null>(null);

  const dueSubscriptions = useMemo(() => {
    if (!snapshot?.subscriptions?.length) return [];
    const todayYmd = todayPeru();
    return snapshot.subscriptions.filter(
      (subscription) =>
        subscription.status === "active" &&
        subscription.autoCreateMovement &&
        subscription.nextDueDate <= todayYmd &&
        (!subscription.endDate || subscription.nextDueDate <= subscription.endDate),
    );
  }, [snapshot?.subscriptions]);

  const dueSignature = useMemo(() => {
    if (!userId || !workspaceId || dueSubscriptions.length === 0) return null;
    return [
      workspaceId,
      userId,
      ...dueSubscriptions.map((subscription) => `${subscription.id}:${subscription.nextDueDate}:${subscription.amount}`),
    ].join("|");
  }, [dueSubscriptions, userId, workspaceId]);

  useEffect(() => {
    if (!supabase || !userId || !workspaceId || !dueSignature || dueSubscriptions.length === 0) return;
    if (processingRef.current) return;
    if (lastProcessedSignatureRef.current === dueSignature) return;

    processingRef.current = true;

    void (async () => {
      try {
        const todayYmd = todayPeru();
        let changed = false;
        for (const subscription of dueSubscriptions) {
          changed = (await processSubscription(workspaceId, subscription, todayYmd)) || changed;
        }

        lastProcessedSignatureRef.current = dueSignature;

        if (changed) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] }),
            queryClient.invalidateQueries({ queryKey: ["movements"] }),
          ]);
        }
      } catch (error) {
        console.warn("[SubscriptionAutoMovement] failed:", error);
      } finally {
        processingRef.current = false;
      }
    })();
  }, [dueSignature, dueSubscriptions, queryClient, userId, workspaceId]);
}
