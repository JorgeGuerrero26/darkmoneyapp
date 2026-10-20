import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

/** ¿Hay conexión ahora? Se actualiza sola al perderla o recuperarla (misma fuente que usa React Query). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
}
