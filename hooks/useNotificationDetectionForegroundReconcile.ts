import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { notificationDetection } from "../lib/notification-detection-native";
import { notificationDetectionHeadlessTask } from "../lib/notification-detection-headless";
import { findRegisteredNativeSuggestionIds } from "../services/queries/notification-detection";

// Evita reconciliar en ráfaga si el usuario alterna foreground/background rápido.
const RECONCILE_DEBOUNCE_MS = 5_000;

/**
 * Al volver la app a primer plano (o al montar), reconcilia el estado entre el dispositivo
 * y la base. Resuelve el bug de registrar un movimiento con la app cerrada:
 *
 *  A) Refresca movimientos y saldos. El task headless inserta el movimiento directo en
 *     Supabase sin contexto de React Query, y el realtime solo llega a clientes conectados;
 *     por eso al reabrir la lista y los saldos quedaban viejos hasta un pull-to-refresh.
 *
 *  B) Marca como registradas las sugerencias nativas que aún están `pending` en el dispositivo
 *     pero cuyo movimiento YA existe en la base, y cancela su notificación bancaria vieja, para
 *     que no vuelva a dispararse "movimiento detectado" al reabrir.
 *
 * Costo acotado: el refresco invalida queries ya montadas (barato) y el lookup B solo corre
 * sobre el set chico de sugerencias `pending` (normalmente 0–2), con una sola lectura batched.
 */
export function useNotificationDetectionForegroundReconcile() {
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const lastReconcileAtRef = useRef(0);
  const runningRef = useRef(false);

  // Mantener los valores frescos sin re-suscribir el listener de AppState en cada cambio.
  const ctxRef = useRef({ profileId: profile?.id ?? null, workspaceId: activeWorkspaceId ?? null });
  ctxRef.current = { profileId: profile?.id ?? null, workspaceId: activeWorkspaceId ?? null };

  useEffect(() => {
    async function reconcile() {
      const { profileId, workspaceId } = ctxRef.current;
      if (!profileId || !workspaceId) return;
      if (runningRef.current) return;
      if (Date.now() - lastReconcileAtRef.current < RECONCILE_DEBOUNCE_MS) return;
      runningRef.current = true;
      lastReconcileAtRef.current = Date.now();
      try {
        // A) Refrescar datos posiblemente desactualizados por inserts del task headless.
        void queryClient.invalidateQueries({ queryKey: ["movements"] });
        void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });

        // B) Reconciliar sugerencias nativas `pending` contra movimientos ya registrados.
        if (!notificationDetection.isAvailable()) return;

        // C) Reprocesar registros headless que fallaron por red/timeout con la app cerrada.
        // El dispatch re-encola primero (sube attempts y empuja el backoff): si el task vuelve
        // a fallar la entrada ya quedó programada, y si termina (éxito, duplicado o estado que
        // requiere al usuario) el propio flujo la limpia con clearSaveRetry. La idempotencia
        // por client_dedupe_key hace seguro reintentar aunque el insert anterior sí llegó.
        const dueRetries = await notificationDetection.getDueSaveRetries();
        for (const entry of dueRetries) {
          try {
            const retryPayload = JSON.parse(entry.payloadJson) as Parameters<typeof notificationDetectionHeadlessTask>[0];
            notificationDetection.enqueueSaveRetry(entry.suggestionId, entry.payloadJson);
            await notificationDetectionHeadlessTask(retryPayload);
          } catch {
            // payload corrupto: descartar la entrada para no reintentar basura.
            notificationDetection.clearSaveRetry(entry.suggestionId);
          }
        }

        const suggestions = await notificationDetection.getSuggestions();
        const pendingIds = suggestions
          .filter((suggestion) => suggestion.status === "pending")
          .map((suggestion) => suggestion.id);
        if (pendingIds.length === 0) return;

        const registered = await findRegisteredNativeSuggestionIds(workspaceId, pendingIds);
        if (registered.size === 0) return;
        for (const suggestion of suggestions) {
          if (!registered.has(suggestion.id)) continue;
          notificationDetection.markSuggestionRegistered(suggestion.id, suggestion.notificationId ?? 0);
          notificationDetection.requestCancelBankNotification(suggestion.id);
        }
      } catch {
        // Reconciliación best-effort: nunca debe romper el arranque ni el foreground.
      } finally {
        runningRef.current = false;
      }
    }

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") void reconcile();
    });
    // Corre una vez al montar (cubre cold start tras registrar con la app cerrada).
    void reconcile();

    return () => subscription.remove();
  }, [queryClient]);
}
