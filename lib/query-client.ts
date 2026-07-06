import { MutationCache, QueryCache, QueryClient, onlineManager } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Raíces de queryKey que se persisten a disco para arranque instantáneo
 * (hidratación desde AsyncStorage + revalidación en background). Whitelist a
 * propósito: nada de IA, entitlements ni detección — solo lo que pinta las
 * pantallas principales.
 */
const PERSISTED_QUERY_ROOTS = new Set([
  "user-workspaces",
  "workspace-snapshot",
  "dashboard-movements",
  "dashboard-analytics",
  "movements",
  "notifications",
]);

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "darkmoney/query-cache/v1",
  throttleTime: 2_000,
});

/**
 * Opciones para PersistQueryClientProvider (app/_layout.tsx). El buster invalida
 * el caché persistido cuando cambia el shape de los datos: bumpear al tocar
 * mappers/selects de las queries whitelisteadas.
 */
export const queryPersistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: asyncStoragePersister,
  maxAge: PERSIST_MAX_AGE_MS,
  buster: "2026-07-05-v1",
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      if (query.state.status !== "success") return false;
      const rootKey = query.queryKey[0];
      return typeof rootKey === "string" && PERSISTED_QUERY_ROOTS.has(rootKey);
    },
  },
};

/** Instancia única: permite limpiar caché al cambiar de usuario (p. ej. desde auth). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 120_000,
      // gcTime >= maxAge del persister: si React Query recolecta la query en memoria,
      // el persister re-escribe el storage SIN ella y el próximo arranque la pierde.
      gcTime: PERSIST_MAX_AGE_MS,
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
