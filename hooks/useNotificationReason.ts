import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useLocalSearchParams } from "expo-router";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Lee `reason`/`reasonToken` que adjunta resolveNotificationNavigationTarget.
 * El token se consume una sola vez (los params persisten en la pantalla:
 * mismo truco que quickToken en Movimientos) y la nota se limpia al salir de
 * la pantalla, para que una visita normal posterior no muestre nota stale.
 */
export function useNotificationReason() {
  const params = useLocalSearchParams<{ reason?: string | string[]; reasonToken?: string | string[] }>();
  const reasonParam = first(params.reason);
  const token = first(params.reasonToken);
  const consumedRef = useRef<string | null>(null);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !reasonParam || consumedRef.current === token) return;
    consumedRef.current = token;
    setReason(reasonParam);
  }, [reasonParam, token]);

  useFocusEffect(
    useCallback(() => {
      return () => setReason(null);
    }, []),
  );

  const dismiss = useCallback(() => setReason(null), []);
  return { reason, dismiss };
}
