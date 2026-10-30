import { useEffect, useState } from "react";

import { offlineRuntime } from "../lib/offline/instance";
import { useOfflineStatus } from "../lib/offline/react";

const EMPTY: ReadonlyMap<number, string> = new Map();

/**
 * Qué filas de una tabla siguen sin enviarse y a qué hora se guardaron, para marcarlas en su lista
 * ("Por enviar · 8:56", Revisión 54). Con el modo apagado o sin nada pendiente devuelve siempre el mismo
 * mapa vacío, así que las filas memoizadas no se vuelven a pintar.
 */
export function usePendingRowTimes(table: string, workspaceId: number | null): ReadonlyMap<number, string> {
  const status = useOfflineStatus();
  const [result, setResult] = useState<{ workspaceId: number; table: string; times: ReadonlyMap<number, string> } | null>(null);
  const active = status.availability === "ready" && status.pending > 0 && workspaceId != null;

  useEffect(() => {
    if (!active || workspaceId == null) {
      setResult(null);
      return;
    }
    let cancelled = false;
    void offlineRuntime
      .pendingRowTimes(workspaceId, table)
      .then((rows) => {
        if (!cancelled) setResult({ workspaceId, table, times: rows.length ? new Map(rows.map((row) => [row.id, row.at])) : EMPTY });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `pending` y `lastSyncAt` cambian cuando una fila sale de la cola o entra otra.
  }, [active, workspaceId, table, status.pending, status.lastSyncAt]);

  return active && result?.workspaceId === workspaceId && result.table === table ? result.times : EMPTY;
}
