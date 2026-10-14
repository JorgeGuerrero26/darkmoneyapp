import type { QueryClient } from "@tanstack/react-query";

import { mergePendingObligations } from "../../features/obligations/lib/offlineObligations";
import { offlineRuntime } from "../../lib/offline/instance";
import type { ObligationSummary } from "../../types/domain";
import { isCoreSnapshot } from "./snapshot-cache";
import type { WorkspaceDeferred, WorkspaceSnapshot } from "./workspace-data";

/**
 * Obligaciones del servidor + las definiciones que quedaron sin enviar en este teléfono (nuevas o
 * editadas). Sin cambios pendientes devuelve la lista tal cual: el servidor ya es exacto.
 * Cualquier problema con la copia local conserva la lista del servidor.
 */
export async function withLocalObligations(
  workspaceId: number,
  summaries: ObligationSummary[],
  counterpartyNames: Map<number, string>,
): Promise<ObligationSummary[]> {
  try {
    const pending = new Set(await offlineRuntime.pendingRowIds(workspaceId, "obligations"));
    if (pending.size === 0) return summaries;
    const rows = await offlineRuntime.listRows(workspaceId, "obligations");
    if (!rows) return summaries;
    return mergePendingObligations(summaries, rows, pending, counterpartyNames);
  } catch {
    return summaries;
  }
}

/**
 * Sin red no hay refetch: tras crear o editar una obligación se rehace la parte diferida del snapshot
 * (obligaciones) desde la base local. Solo si hay definiciones sin enviar.
 */
export async function applyLocalObligationsToCache(queryClient: QueryClient, workspaceId: number): Promise<boolean> {
  const entries = queryClient.getQueriesData({ queryKey: ["workspace-snapshot", workspaceId] }).map(([, data]) => data);
  const core = entries.find(isCoreSnapshot) as WorkspaceSnapshot | undefined;
  const deferred = entries.find((entry) => entry && !isCoreSnapshot(entry)) as WorkspaceDeferred | undefined;
  if (!core || !deferred?.obligations) return false;
  const counterpartyNames = new Map<number, string>((core.counterparties ?? []).map((item) => [item.id, item.name]));
  const next = await withLocalObligations(workspaceId, deferred.obligations, counterpartyNames);
  if (next === deferred.obligations) return false;
  queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot", workspaceId] }, (old: unknown) => {
    if (!old || isCoreSnapshot(old)) return old;
    return { ...(old as WorkspaceDeferred), obligations: next };
  });
  return true;
}
