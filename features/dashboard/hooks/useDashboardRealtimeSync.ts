import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { subscribeRealtimeChannel } from "../../../lib/realtime-channel";

type Input = {
  workspaceId: number | null;
};

/**
 * Suscribe el dashboard a cambios realtime en las 3 tablas que afectan sus
 * cifras: `movements`, `accounts`, `obligations`. Cuando llega un evento, se
 * invalidan solo las queries afectadas para que React Query re-fetche.
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
            void queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] });
            void queryClient.invalidateQueries({ queryKey: ["dashboard-analytics"] });
            void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
            void queryClient.invalidateQueries({ queryKey: ["movements"] });
          },
        },
        {
          table: "accounts",
          filter: `workspace_id=eq.${workspaceId}`,
          onChange: () => {
            void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
          },
        },
        {
          table: "obligations",
          filter: `workspace_id=eq.${workspaceId}`,
          onChange: () => {
            void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
            void queryClient.invalidateQueries({ queryKey: ["dashboard-analytics"] });
            void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
          },
        },
      ],
    });
  }, [workspaceId, queryClient]);
}
