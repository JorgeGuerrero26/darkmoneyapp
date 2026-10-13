import { useEffect, useSyncExternalStore } from "react";

import { isOfflineFlagEnabled, isOfflineFlagLoaded, loadOfflineFlag, setOfflineFlag, subscribeOfflineFlag } from "./flag";
import { offlineRuntime } from "./instance";
import type { OfflineState } from "./runtime";

/** Estado completo del motor para pantallas de estado. */
export function useOfflineStatus(): OfflineState {
  return useSyncExternalStore(offlineRuntime.subscribe, offlineRuntime.getState, offlineRuntime.getState);
}

/**
 * ¿Las lecturas/escrituras de este espacio van por la base local? Devuelve un booleano estable, así
 * que solo vuelve a renderizar quien lo usa cuando cambia de verdad. Sirve para elegir
 * `networkMode: "always"` en consultas y mutaciones: sin eso React Query las pausa sin red y la
 * base local nunca llegaría a leerse.
 */
export function useOfflineLocalReady(workspaceId: number | null | undefined): boolean {
  return useSyncExternalStore(
    offlineRuntime.subscribe,
    () => offlineRuntime.canReadLocal(workspaceId),
    () => false,
  );
}

export function useOfflineFlag(): { enabled: boolean; loaded: boolean; setEnabled: (next: boolean) => Promise<void> } {
  const enabled = useSyncExternalStore(subscribeOfflineFlag, isOfflineFlagEnabled, () => false);
  const loaded = useSyncExternalStore(subscribeOfflineFlag, isOfflineFlagLoaded, () => false);
  useEffect(() => {
    void loadOfflineFlag();
  }, []);
  return { enabled, loaded, setEnabled: setOfflineFlag };
}
