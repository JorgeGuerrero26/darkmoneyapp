import type { NetInfoState } from "@react-native-community/netinfo";

type TransportUpdate = {
  current: string | null;
  changed: boolean;
};

/**
 * NetInfo puede emitir `unknown`, `none` o el mismo WiFi con/sin `ipAddress` al
 * despertar. Esos estados transitorios no significan un cambio de transporte y
 * no deben disparar una recuperación global. Solo importa un cambio entre tipos
 * conectados estables (por ejemplo WiFi -> cellular).
 */
export function resolveNetworkTransport(
  previous: string | null,
  state: Pick<NetInfoState, "type" | "isConnected">,
): TransportUpdate {
  const observed =
    state.isConnected === true && state.type !== "unknown" && state.type !== "none"
      ? state.type
      : null;

  if (!observed) return { current: previous, changed: false };
  return {
    current: observed,
    changed: previous !== null && previous !== observed,
  };
}
