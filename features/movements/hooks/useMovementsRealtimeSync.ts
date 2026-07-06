import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { subscribeRealtimeChannel } from "../../../lib/realtime-channel";

type Input = {
  workspaceId: number | null;
};

/**
 * Suscribe la pantalla de movimientos a cambios realtime en la tabla
 * `movements`, filtrado por workspace en el servidor. Cuando llega un evento
 * (insert/update/delete) invalida la query infinita `["movements", ...]` para
 * que React Query re-fetche la página activa.
 *
 * Casos que cubre:
 * - El usuario registra un movimiento desde el overlay nativo Android.
 * - Un headless task de notificación inserta un movimiento.
 * - Otro dispositivo del mismo usuario / workspace compartido inserta/edita.
 *
 * Diferente del dashboard sync: ambos hooks pueden estar montados (cada tab es
 * autónomo). Usan canales distintos (`movements:ws-X` vs `dashboard:ws-X`)
 * para evitar conflictos de suscripción.
 *
 * La resiliencia (re-suscripción con backoff, logs deduplicados) vive en
 * subscribeRealtimeChannel. Se desuscribe al desmontar o cambiar workspaceId.
 */
export function useMovementsRealtimeSync({ workspaceId }: Input) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!workspaceId) return;
    return subscribeRealtimeChannel({
      source: "movements",
      channelName: `movements:ws-${workspaceId}`,
      bindings: [
        {
          table: "movements",
          filter: `workspace_id=eq.${workspaceId}`,
          onChange: () => {
            void queryClient.invalidateQueries({ queryKey: ["movements"] });
            // El detalle individual puede haber cambiado también.
            void queryClient.invalidateQueries({ queryKey: ["movement"] });
          },
        },
      ],
    });
  }, [workspaceId, queryClient]);
}
