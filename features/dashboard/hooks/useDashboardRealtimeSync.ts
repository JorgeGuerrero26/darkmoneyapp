import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { subscribeRealtimeChannel } from "../../../lib/realtime-channel";
import {
  scheduleCoalescedTask,
  scheduleQueryInvalidation,
} from "../../../lib/query-refresh-coalescer";
import { refreshSnapshotDomains } from "../../../services/queries/workspace-data";

type Input = {
  workspaceId: number | null;
};

/**
 * Suscribe el dashboard a cambios realtime en las 3 tablas que afectan sus
 * cifras: `movements`, `accounts`, `obligations`. Las invalidaciones iguales se
 * agrupan y los movimientos refrescan solo los dominios afectados del snapshot.
 *
 * Filtrado por workspace_id en el servidor — el cliente no recibe eventos de
 * otros workspaces, así que también es eficiente en tráfico.
 *
 * La resiliencia (re-suscripción con backoff, logs deduplicados) vive en
 * subscribeRealtimeChannel. Se desuscribe al desmontar o cambiar workspaceId.
 */
export function useDashboardRealtimeSync({ workspaceId }: Input) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    return subscribeRealtimeChannel({
      source: "dashboard",
      channelName: `dashboard:ws-${workspaceId}`,
      bindings: [
        {
          table: "movements",
          filter: `workspace_id=eq.${workspaceId}`,
          onChange: () => {
            scheduleQueryInvalidation(queryClient, ["dashboard-movements"]);
            scheduleQueryInvalidation(queryClient, ["movements"]);
            scheduleCoalescedTask(
              queryClient,
              `movement-snapshot:${workspaceId}`,
              () => refreshSnapshotDomains(
                queryClient,
                workspaceId,
                ["accounts", "budgets", "categoryMovements", "subscriptionMovements"],
              ),
            );
          },
        },
        {
          table: "accounts",
          filter: `workspace_id=eq.${workspaceId}`,
          onChange: () => {
            scheduleQueryInvalidation(queryClient, ["workspace-snapshot"]);
          },
        },
        {
          table: "obligations",
          filter: `workspace_id=eq.${workspaceId}`,
          onChange: () => {
            scheduleQueryInvalidation(queryClient, ["workspace-snapshot"]);
            scheduleQueryInvalidation(queryClient, ["dashboard-analytics"]);
            scheduleQueryInvalidation(queryClient, ["shared-obligations"]);
          },
        },
      ],
    });
  }, [workspaceId, queryClient]);
}
