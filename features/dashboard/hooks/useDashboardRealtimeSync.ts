import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "../../../lib/supabase";
import { logWarn } from "../../../lib/error-logger";

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
 * Se desuscribe automáticamente al desmontar (o cuando cambia workspaceId).
 */
export function useDashboardRealtimeSync({ workspaceId }: Input) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase || !workspaceId) return;

    const channel = supabase
      .channel(`dashboard:ws-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "movements",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] });
          void queryClient.invalidateQueries({ queryKey: ["dashboard-analytics"] });
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
          void queryClient.invalidateQueries({ queryKey: ["movements"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "accounts",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "obligations",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
          void queryClient.invalidateQueries({ queryKey: ["dashboard-analytics"] });
          void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          logWarn("realtime", `dashboard channel ${status}`, { workspaceId });
        }
      });

    return () => {
      void supabase!.removeChannel(channel);
    };
  }, [workspaceId, queryClient]);
}
