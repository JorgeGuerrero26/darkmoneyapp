import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  notificationDetection,
  type DetectionLastSaveError,
} from "../lib/notification-detection-native";

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
  const [pendingSaves, setPendingSaves] = useState<DetectionBackgroundSave[]>([]);
  const [lastError, setLastError] = useState<DetectionLastSaveError | null>(null);
  const mountedRef = useRef(true);

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

  return { pendingSaves, lastError, refresh };
}
