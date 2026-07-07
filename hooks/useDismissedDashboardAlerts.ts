import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Descarte de alertas del dashboard. Las alertas son CALCULADAS en vivo (un
 * presupuesto excedido genera su alerta porque está excedido), así que "eliminar"
 * a secas no sirve: reaparecería al instante. En vez de eso se guarda por alerta
 * una "firma" del estado en que fue descartada; la alerta queda oculta mientras
 * la firma no cambie. Si la situación EMPEORA (la firma cambia), vuelve a avisar
 * — que es lo correcto para una alerta financiera.
 *
 * Persistido por workspace en AsyncStorage; sin servidor.
 */
function storageKey(workspaceId: number | null | undefined): string | null {
  return workspaceId ? `darkmoney/dashboard-alerts-dismissed/${workspaceId}` : null;
}

export function useDismissedDashboardAlerts(workspaceId: number | null | undefined) {
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = false;
    setDismissed({});
    const key = storageKey(workspaceId);
    if (!key) return;
    let cancelled = false;
    void AsyncStorage.getItem(key).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, string>;
          if (parsed && typeof parsed === "object") setDismissed(parsed);
        } catch {
          // corrupto: ignorar
        }
      }
      hydratedRef.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  const isDismissed = useCallback(
    (alertKey: string, signature: string) => dismissed[alertKey] === signature,
    [dismissed],
  );

  const dismiss = useCallback(
    (alertKey: string, signature: string) => {
      setDismissed((current) => {
        const next = { ...current, [alertKey]: signature };
        const key = storageKey(workspaceId);
        if (key) void AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => null);
        return next;
      });
    },
    [workspaceId],
  );

  return { isDismissed, dismiss };
}
