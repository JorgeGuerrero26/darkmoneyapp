import { MutationCache, QueryCache, QueryClient, onlineManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";

import { logError, logWarn } from "./error-logger";

/**
 * Tiers estandarizados de staleTime para React Query.
 * Usar estos en lugar de números mágicos en queries individuales.
 */
export const STALE = {
  realtime: 0,
  short: 30_000,
  medium: 5 * 60_000,
  long: 30 * 60_000,
  session: Infinity,
} as const;

// Wire NetInfo into React Query: cuando NetInfo reporta sin red, onlineManager
// pausa queries pendientes y mutations (networkMode default "online" en v5).
// Cuando vuelve la red, React Query reanuda automaticamente lo que estaba en cola.
// Evita reintentos en vano que gastan bateria y spinner infinito al estar offline.
onlineManager.setEventListener((setOnline) => {
  const unsubscribe = NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
  });
  return () => {
    unsubscribe();
  };
});

/** Instancia única: permite limpiar caché al cambiar de usuario (p. ej. desde auth). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 120_000,
      retry: 1,
      refetchOnWindowFocus: false,
      placeholderData: (previousData: unknown) => previousData,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      logWarn("query", error instanceof Error ? error.message : String(error), {
        queryKey: query.queryKey,
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      logError("mutation", error instanceof Error ? error.message : String(error), {
        mutationKey: mutation.options.mutationKey,
      });
    },
  }),
});
