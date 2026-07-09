import type { QueryClient } from "@tanstack/react-query";

import type { WorkspaceSnapshot } from "./workspace-data";

/**
 * Parches quirúrgicos del cache del snapshot: reflejan el efecto de una
 * mutación confirmada por el server al instante, sin esperar el refetch
 * completo del snapshot (~15 queries). Las invalidaciones existentes siguen
 * corriendo detrás y corrigen cualquier deriva (moneda base convertida,
 * presupuestos, etc.).
 */

export type CreatedMovementPatch = {
  id: number;
  status: string;
  categoryId?: number | null;
  subscriptionId?: number | null;
  occurredAt: string;
  sourceAccountId?: number | null;
  sourceAmount?: number | null;
  destinationAccountId?: number | null;
  destinationAmount?: number | null;
};

export function patchSnapshotWithCreatedMovement(
  queryClient: QueryClient,
  workspaceId: number,
  movement: CreatedMovementPatch,
) {
  // Saldos y analíticas solo cuentan movimientos posted.
  if (movement.status !== "posted") return;
  queryClient.setQueriesData<WorkspaceSnapshot | undefined>(
    { queryKey: ["workspace-snapshot", workspaceId] },
    (old) => {
      if (!old) return old;
      const baseCurrency = old.workspaces.find((w) => w.id === workspaceId)?.baseCurrencyCode;
      const accounts = old.accounts.map((acc) => {
        let delta = 0;
        if (acc.id === movement.sourceAccountId && movement.sourceAmount != null) delta -= movement.sourceAmount;
        if (acc.id === movement.destinationAccountId && movement.destinationAmount != null) delta += movement.destinationAmount;
        if (delta === 0) return acc;
        return {
          ...acc,
          currentBalance: acc.currentBalance + delta,
          // En moneda base solo si la cuenta ya está en base (sin conversión);
          // si requiere tasa, se deja al refetch en vuelo.
          currentBalanceInBaseCurrency:
            acc.currentBalanceInBaseCurrency != null && acc.currencyCode === baseCurrency
              ? acc.currentBalanceInBaseCurrency + delta
              : acc.currentBalanceInBaseCurrency,
        };
      });
      const categoryPostedMovements =
        movement.categoryId != null
          ? [
              {
                id: movement.id,
                categoryId: movement.categoryId,
                occurredAt: movement.occurredAt,
                sourceAmount: movement.sourceAmount ?? null,
                destinationAmount: movement.destinationAmount ?? null,
              },
              ...old.categoryPostedMovements,
            ]
          : old.categoryPostedMovements;
      const subscriptionPostedMovements =
        movement.subscriptionId != null
          ? [
              {
                id: movement.id,
                subscriptionId: movement.subscriptionId,
                occurredAt: movement.occurredAt,
                sourceAmount: movement.sourceAmount ?? null,
                destinationAmount: movement.destinationAmount ?? null,
              },
              ...old.subscriptionPostedMovements,
            ]
          : old.subscriptionPostedMovements;
      return { ...old, accounts, categoryPostedMovements, subscriptionPostedMovements };
    },
  );
}

/** Avanza next_due_date de una suscripción en el cache (tras pago confirmado). */
export function patchSnapshotSubscriptionNextDue(
  queryClient: QueryClient,
  workspaceId: number,
  subscriptionId: number,
  nextDueDate: string,
) {
  queryClient.setQueriesData<WorkspaceSnapshot | undefined>(
    { queryKey: ["workspace-snapshot", workspaceId] },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        subscriptions: old.subscriptions.map((sub) =>
          sub.id === subscriptionId ? { ...sub, nextDueDate } : sub,
        ),
      };
    },
  );
}
