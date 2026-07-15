import { MutationCache, QueryCache, QueryClient, onlineManager } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

import { logError, logWarn } from "./error-logger";
import { supabase } from "./supabase";
import { isAuthLikeError } from "./auth-error";

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
    // isConnected null = "aún no se sabe" (habitual al despertar de Doze / cold start).
    // Tratarlo como offline pausaba TODAS las queries hasta el próximo evento de red,
    // que puede no llegar nunca (incidente 2026-07-13: app vacía tras 1 día en background).
    setOnline(state.isConnected ?? true);
  });
  return () => {
    unsubscribe();
  };
});

// Al volver a foreground NetInfo puede arrastrar estado stale de antes del background
// (Doze corta la red y no siempre re-emite al despertar). Reevaluar y empujar el
// resultado reanuda las queries que quedaron pausadas como "offline".
AppState.addEventListener("change", (status) => {
  if (status !== "active") return;
  void NetInfo.refresh().then((state) => {
    onlineManager.setOnline(state.isConnected ?? true);
  });
  // App vuelve a foreground: si el token se puso stale mientras estuvo en
  // background, recuperar sesión y refetchear antes de que el usuario toque nada.
  void recoverSession();
});

let recovering = false;
let lastRecoveryAt = 0;
const RECOVERY_COOLDOWN_MS = 30_000;

/**
 * Recupera una sesión Supabase degradada (token stale tras horas en foreground o
 * red inestable) y refetchea las queries activas. Coalesce + cooldown para no
 * tormentear en fallos persistentes; `force` lo salta (reintento manual). Incidente
 * 2026-07-15: app 17 h abierta → escrituras 42501 y lecturas "Network request
 * failed" hasta matar la app; ahora se recupera sola sin reinicio.
 */
export async function recoverSession(opts?: { force?: boolean }): Promise<void> {
  if (recovering) return;
  const now = Date.now();
  if (!opts?.force && now - lastRecoveryAt < RECOVERY_COOLDOWN_MS) return;
  recovering = true;
  lastRecoveryAt = now;
  try {
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.auth.refreshSession();
    }
    await queryClient.invalidateQueries();
  } catch (error) {
    logWarn("session-recovery", error instanceof Error ? error.message : String(error));
  } finally {
    recovering = false;
  }
}

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
      const message = error instanceof Error ? error.message : String(error);
      logWarn("query", message, { queryKey: query.queryKey });
      if (isAuthLikeError(message)) void recoverSession();
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      const message = error instanceof Error ? error.message : String(error);
      logError("mutation", message, { mutationKey: mutation.options.mutationKey });
      if (isAuthLikeError(message)) void recoverSession();
    },
  }),
});
