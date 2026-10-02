import type { QueryClient } from "@tanstack/react-query";

import type { WorkspaceDeferred, WorkspaceSnapshot } from "./workspace-data";
import { catalogMovementAmount } from "../../lib/catalog-money";
import { movementActsAsIncome } from "../../lib/movement-amounts";
import { convertAmountToWorkspaceBase } from "../../lib/subscription-helpers";

/**
 * Bajo el prefijo `["workspace-snapshot", wsId]` cuelgan dos entradas: el núcleo
 * y la diferida (`{ budgets, obligations }`). Todo patch por prefijo debe
 * discriminarlas antes de leer campos, o revienta sobre la que no le toca.
 *
 * Vive aquí y no en workspace-data para no crear un ciclo de imports en runtime:
 * workspace-data ya importa de este módulo.
 */
export function isCoreSnapshot(data: unknown): data is WorkspaceSnapshot {
  return typeof data === "object" && data !== null && "accounts" in data;
}

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
  counterpartyId?: number | null;
  movementType?: string;
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
  queryClient.setQueriesData<unknown>(
    { queryKey: ["workspace-snapshot", workspaceId] },
    (old: unknown) => {
      if (!isCoreSnapshot(old)) return old;
      const baseCurrency = old.workspaces.find((w) => w.id === workspaceId)?.baseCurrencyCode;
      const useDestination = movementActsAsIncome(movement) || (movement.movementType === "transfer" && !movement.sourceAmount);
      const accountId = useDestination ? movement.destinationAccountId : movement.sourceAccountId;
      const currencyCode = old.accounts.find((item) => item.id === accountId)?.currencyCode ?? baseCurrency ?? "PEN";
      const amount = catalogMovementAmount({ ...movement, sourceAmount: movement.sourceAmount ?? null, destinationAmount: movement.destinationAmount ?? null });
      const analyticsRow = {
        id: movement.id, occurredAt: movement.occurredAt,
        sourceAmount: movement.sourceAmount ?? null, destinationAmount: movement.destinationAmount ?? null,
        movementType: movement.movementType, amount, amountCurrencyCode: currencyCode,
        amountInBaseCurrency: convertAmountToWorkspaceBase(amount, currencyCode, baseCurrency ?? "PEN", old.exchangeRates),
      };
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
                ...analyticsRow,
                categoryId: movement.categoryId,
              },
              ...old.categoryPostedMovements.filter((item) => item.id !== movement.id),
            ]
          : old.categoryPostedMovements;
      const subscriptionPostedMovements =
        movement.subscriptionId != null
          ? [
              {
                ...analyticsRow,
                subscriptionId: movement.subscriptionId,
              },
              ...old.subscriptionPostedMovements.filter((item) => item.id !== movement.id),
            ]
          : old.subscriptionPostedMovements;
      const counterpartyPostedMovements = movement.counterpartyId != null && old.counterpartyPostedMovements !== undefined
        ? [{ ...analyticsRow, counterpartyId: movement.counterpartyId }, ...old.counterpartyPostedMovements.filter((item) => item.id !== movement.id)]
        : old.counterpartyPostedMovements;
      return { ...old, accounts, categoryPostedMovements, subscriptionPostedMovements, counterpartyPostedMovements };
    },
  );
}

/**
 * Refleja un pago de obligación en el cache: baja pendingAmount y recalcula el
 * progreso. Interés/estado exacto los corrige el refetch en vuelo.
 */
export function patchSnapshotObligationPayment(
  queryClient: QueryClient,
  workspaceId: number,
  obligationId: number,
  amount: number,
) {
  // Las obligaciones viven en la entrada diferida; la moneda base, en el núcleo.
  const core = queryClient
    .getQueriesData({ queryKey: ["workspace-snapshot", workspaceId] })
    .map(([, data]) => data)
    .find(isCoreSnapshot);
  const baseCurrency = core?.workspaces.find((w) => w.id === workspaceId)?.baseCurrencyCode;

  queryClient.setQueriesData<unknown>(
    { queryKey: ["workspace-snapshot", workspaceId] },
    (old: unknown) => {
      if (!old || isCoreSnapshot(old)) return old;
      const deferred = old as WorkspaceDeferred;
      return {
        ...deferred,
        obligations: deferred.obligations.map((ob) => {
          if (ob.id !== obligationId) return ob;
          const pendingAmount = Math.max(0, ob.pendingAmount - amount);
          return {
            ...ob,
            pendingAmount,
            pendingAmountInBaseCurrency:
              ob.pendingAmountInBaseCurrency != null && ob.currencyCode === baseCurrency
                ? Math.max(0, ob.pendingAmountInBaseCurrency - amount)
                : ob.pendingAmountInBaseCurrency,
            progressPercent:
              ob.principalAmount > 0
                ? Math.min(100, Math.round(((ob.principalAmount - pendingAmount) / ob.principalAmount) * 100))
                : ob.progressPercent,
          };
        }),
      };
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
  queryClient.setQueriesData<unknown>(
    { queryKey: ["workspace-snapshot", workspaceId] },
    (old: unknown) => {
      if (!isCoreSnapshot(old)) return old;
      return {
        ...old,
        subscriptions: old.subscriptions.map((sub) =>
          sub.id === subscriptionId ? { ...sub, nextDueDate } : sub,
        ),
      };
    },
  );
}
