import type { QueryClient } from "@tanstack/react-query";

import {
  rollupMovementsByCounterparty,
  rollupObligationsByCounterparty,
  withLocalFinancials,
} from "../../features/contacts/lib/localCounterpartyFinancials";
import { offlineRuntime } from "../../lib/offline/instance";
import type { CounterpartyOverview } from "../../types/domain";
import { isCoreSnapshot } from "./snapshot-cache";
import type { WorkspaceDeferred, WorkspaceSnapshot } from "./workspace-data";

/** Tablas cuyos cambios sin enviar mueven el resumen de los contactos. */
export const COUNTERPARTY_SUMMARY_MOVEMENT_TABLES = ["movements"];
export const COUNTERPARTY_SUMMARY_OBLIGATION_TABLES = ["obligations", "obligation_events"];

/**
 * Movimientos: con cambios sin enviar, lo que entró y salió de cada contacto se calcula desde la copia local (la del
 * servidor todavía no los incluye). Sin cambios pendientes devuelve la lista tal cual: el servidor ya es exacto.
 */
export async function withLocalCounterpartyMovements(workspaceId: number, counterparties: CounterpartyOverview[]): Promise<CounterpartyOverview[]> {
  try {
    if (!(await offlineRuntime.hasPendingOps(workspaceId, COUNTERPARTY_SUMMARY_MOVEMENT_TABLES))) return counterparties;
    const movements = await offlineRuntime.listRows(workspaceId, "movements");
    if (!movements) return counterparties;
    const rollup = rollupMovementsByCounterparty(movements);
    return counterparties.map((item) => withLocalFinancials(item, { movements: rollup }));
  } catch {
    return counterparties;
  }
}

/**
 * Sin red no hay refetch: tras registrar un gasto, un pago o un cobro con un contacto, su resumen (cobros, pagos,
 * movimientos) se rehace aquí. Movimientos desde la copia local; créditos y deudas desde las obligaciones que ya muestra
 * la app (las del servidor más lo registrado en el teléfono). Solo si hay cambios sin enviar.
 */
export async function applyLocalCounterpartyFinancialsToCache(queryClient: QueryClient, workspaceId: number): Promise<boolean> {
  const entries = queryClient.getQueriesData({ queryKey: ["workspace-snapshot", workspaceId] }).map(([, data]) => data);
  const core = entries.find(isCoreSnapshot) as WorkspaceSnapshot | undefined;
  if (!core?.counterparties?.length) return false;
  const deferred = entries.find((entry) => entry && !isCoreSnapshot(entry)) as WorkspaceDeferred | undefined;

  const [movementsPending, obligationsPending] = await Promise.all([
    offlineRuntime.hasPendingOps(workspaceId, COUNTERPARTY_SUMMARY_MOVEMENT_TABLES).catch(() => false),
    offlineRuntime.hasPendingOps(workspaceId, COUNTERPARTY_SUMMARY_OBLIGATION_TABLES).catch(() => false),
  ]);
  if (!movementsPending && !obligationsPending) return false;

  const movements = movementsPending ? await offlineRuntime.listRows(workspaceId, "movements").catch(() => null) : null;
  const parts = {
    movements: movements ? rollupMovementsByCounterparty(movements) : undefined,
    obligations: obligationsPending && deferred?.obligations ? rollupObligationsByCounterparty(deferred.obligations) : undefined,
  };
  if (!parts.movements && !parts.obligations) return false;

  queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot", workspaceId] }, (old: unknown) => {
    if (!isCoreSnapshot(old)) return old;
    return { ...old, counterparties: old.counterparties.map((item) => withLocalFinancials(item, parts)) };
  });
  return true;
}
