import { useEffect, useState } from "react";

import { useOfflineStatus } from "../lib/offline/react";
import type { OfflineState } from "../lib/offline/runtime";
import { describeSyncLine, type SyncLine } from "../lib/offline/status-copy";

/** Espera antes de decir "Sin conexión" si todavía no hay nada guardado: un corte breve no debe hacer parpadear el encabezado. */
export const OFFLINE_LINE_DELAY_MS = 2500;

/**
 * ¿La línea debe esperar antes de mostrarse? Solo "Sin conexión" a secas (sin cambios pendientes ni nada por
 * revisar). Si ya hay algo guardado en el teléfono, el usuario necesita saberlo al instante.
 */
export function lineNeedsDelay(line: SyncLine | null, state: Pick<OfflineState, "pending" | "rejected" | "review">): boolean {
  return line?.kind === "offline" && state.pending === 0 && state.rejected + state.review === 0;
}

/**
 * La línea de estado que reemplaza a "Actualizado hace…" en el encabezado de cada módulo. null = nada que
 * decir (modo apagado, todo al día): el encabezado se ve exactamente como siempre.
 */
export function useSyncLine(): SyncLine | null {
  const status = useOfflineStatus();
  const raw = describeSyncLine(status);
  const delayed = lineNeedsDelay(raw, status);
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
  if (delayed && !ready) return null;
  return raw;
}
