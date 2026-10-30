import { useEffect, useState } from "react";

import { useOfflineStatus } from "../lib/offline/react";
import { describeSyncLine, type SyncLine } from "../lib/offline/status-copy";

/** Espera antes de decir "Sin conexión": un corte breve no debe hacer parpadear el encabezado. */
export const OFFLINE_LINE_DELAY_MS = 2500;

/** El aviso de conexión se retrasa; los cambios que requieren revisión no se retrasan. */
export function lineNeedsDelay(line: SyncLine | null): boolean {
  return line?.kind === "offline";
}

/**
 * La línea de estado que reemplaza a "Actualizado hace…" en el encabezado de cada módulo. null = nada que
 * decir (modo apagado, todo al día): el encabezado se ve exactamente como siempre.
 */
export function useSyncLine(): SyncLine | null {
  const status = useOfflineStatus();
  const raw = describeSyncLine(status);
  const delayed = lineNeedsDelay(raw);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!delayed) {
      setReady(false);
      return;
    }
    const timer = setTimeout(() => setReady(true), OFFLINE_LINE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [delayed]);

  if (!raw) return null;
  if (delayed && !ready) return status.pending > 0
    ? { kind: "pending", text: `${status.pending} por enviar`, tappable: true }
    : null;
  return raw;
}
