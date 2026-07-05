import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import {
  notificationDetection,
  type DetectionLastSaveError,
} from "../lib/notification-detection-native";
import { notificationDetectionHeadlessTask } from "../lib/notification-detection-headless";

export type DetectionBackgroundSave = {
  suggestionId: string;
  attempts: number;
  /** Agotó los reintentos automáticos: requiere acción del usuario. */
  exhausted: boolean;
  amountLabel: string | null;
  description: string | null;
};

const REFRESH_INTERVAL_MS = 15_000;

function parsePayloadField(payloadJson: string, key: "amount" | "description"): string | null {
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown> | null;
    const value = parsed?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Expone la cola nativa de registros detectados que siguen enviándose en segundo
 * plano (fallos de red del "Registro rápido" con backoff exponencial), para que el
 * módulo de movimientos pueda mostrar al usuario qué está pendiente y por qué,
 * en lugar de dejarlo pensar que el registro se perdió (y que lo duplique a mano).
 */
export function useDetectionBackgroundSaves() {
  const queryClient = useQueryClient();
  const [pendingSaves, setPendingSaves] = useState<DetectionBackgroundSave[]>([]);
  const [lastError, setLastError] = useState<DetectionLastSaveError | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const mountedRef = useRef(true);
  const retryingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!notificationDetection.isAvailable()) return;
    const [entries, error] = await Promise.all([
      notificationDetection.getAllSaveRetries(),
      notificationDetection.getLastSaveError(),
    ]);
    if (!mountedRef.current) return;
    setPendingSaves(
      entries.map((entry) => ({
        suggestionId: entry.suggestionId,
        attempts: entry.attempts,
        exhausted: !entry.payloadJson,
        amountLabel: entry.payloadJson ? parsePayloadField(entry.payloadJson, "amount") : null,
        description: entry.payloadJson ? parsePayloadField(entry.payloadJson, "description") : null,
      })),
    );
    setLastError(error && Date.now() - error.ts < 24 * 60 * 60 * 1000 ? error : null);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [refresh]);

  /**
   * Fuerza el reintento inmediato de TODA la cola (sin esperar el backoff). Para el botón
   * "Reintentar ahora" del banner: el usuario recuperó red y no quiere esperar 1-16 min.
   * El client_dedupe_key hace idempotente re-ejecutar aunque un insert previo sí llegó,
   * y el claim nativo evita pisarse con un reintento del reconcile en paralelo.
   */
  const retryNow = useCallback(async () => {
    if (retryingRef.current || !notificationDetection.isAvailable()) return;
    retryingRef.current = true;
    setIsRetrying(true);
    try {
      const entries = await notificationDetection.getAllSaveRetries();
      for (const entry of entries) {
        if (!entry.payloadJson) continue; // marcador de reintentos agotados: requiere al usuario
        try {
          const payload = JSON.parse(entry.payloadJson) as Parameters<typeof notificationDetectionHeadlessTask>[0];
          // Re-encolar primero (sube attempts y empuja el backoff): si vuelve a fallar la
          // entrada ya quedó programada; si termina, el propio flujo la limpia.
          notificationDetection.enqueueSaveRetry(entry.suggestionId, entry.payloadJson);
          await notificationDetectionHeadlessTask(payload);
        } catch {
          notificationDetection.clearSaveRetry(entry.suggestionId);
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["movements"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await refresh();
    } finally {
      retryingRef.current = false;
      if (mountedRef.current) setIsRetrying(false);
    }
  }, [queryClient, refresh]);

  return { pendingSaves, lastError, refresh, retryNow, isRetrying };
}
