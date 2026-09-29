import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import { useQueryClient } from "@tanstack/react-query";

import {
  scheduleCoalescedTask,
  scheduleQueryInvalidation,
} from "../lib/query-refresh-coalescer";
import { refreshSnapshotDomains } from "../services/queries/workspace-data";

/**
 * Menos que esto fuera de la app no refresca: volver de la cámara, de un share sheet o de Safari
 * no puede disparar una ráfaga (ver el comentario de AppState en lib/query-client.ts).
 */
export const MIN_BACKGROUND_MS = 30_000;

/** Deja que supabase.ts reactive el auto-refresh de la sesión antes de salir a pedir datos. */
const RESUME_DELAY_MS = 1_500;

export function shouldRefreshOnResume(awayMs: number): boolean {
  return awayMs >= MIN_BACKGROUND_MS;
}

/**
 * Reemplaza a Realtime (postgres_changes). Diagnóstico del 2026-09-28 con dos informes del panel
 * de Supabase: Realtime entregaba ~25 cambios al día, pero su servidor se apaga sin clientes y
 * arrancaba en frío hasta 9 veces al día. Cada arranque crea particiones (DDL), eso hace recargar
 * el schema cache de PostgREST y, con la base del plan Nano sin RAM, la congeló 3 minutos.
 *
 * Lo que Realtime cubría —movimientos guardados por la detección nativa con la app cerrada, otro
 * dispositivo o un compañero del espacio— se cubre igual al volver a la app o al llegar un push.
 * Refresca lo mismo que refrescaban los hooks de Realtime, agrupado para que salga una vez.
 */
export function useForegroundDataRefresh(userId: string | null, workspaceId: number | null) {
  const queryClient = useQueryClient();
  const latest = useRef({ userId, workspaceId });
  latest.current = { userId, workspaceId };

  useEffect(() => {
    let backgroundedAt: number | null = null;

    function refresh(delayMs: number) {
      const { userId: uid, workspaceId: wsId } = latest.current;
      if (wsId) {
        scheduleCoalescedTask(
          queryClient,
          `movement-snapshot:${wsId}`,
          () => refreshSnapshotDomains(
            queryClient,
            wsId,
            ["accounts", "budgets", "categoryMovements", "subscriptionMovements"],
          ),
          delayMs,
        );
        scheduleQueryInvalidation(queryClient, ["movements"], delayMs);
        scheduleQueryInvalidation(queryClient, ["movement"], delayMs);
        scheduleQueryInvalidation(queryClient, ["dashboard-movements"], delayMs);
      }
      if (uid) scheduleQueryInvalidation(queryClient, ["notifications", uid], delayMs);
      scheduleQueryInvalidation(queryClient, ["shared-obligations"], delayMs);
    }

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAt = Date.now();
        return;
      }
      if (state !== "active" || backgroundedAt === null) return;
      const awayMs = Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (shouldRefreshOnResume(awayMs)) refresh(RESUME_DELAY_MS);
    });
    // Un push con la app abierta suele significar que algo cambió (pago compartido, aviso, etc.).
    const pushSub = Notifications.addNotificationReceivedListener(() => refresh(200));

    return () => {
      appStateSub.remove();
      pushSub.remove();
    };
  }, [queryClient]);
}
