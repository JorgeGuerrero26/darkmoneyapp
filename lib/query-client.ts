import { MutationCache, QueryCache, QueryClient, onlineManager } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { AppState } from "react-native";

import { logError, logWarn } from "./error-logger";
import { supabase } from "./supabase";
import { isAuthLikeError } from "./auth-error";
import { isBackendWarmingUp } from "./idempotency";
import { errorLogMessage } from "./errors";
import { resolveNetworkTransport } from "./network-transport";

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
// Identidad estable del transporte de red. Un salto WiFi↔datos deja los sockets TCP
// anteriores MUERTOS, pero `isConnected` puede seguir true y React Query no se entera.
// NetInfo también emite estados/IP transitorios al despertar; no son una red nueva. Incidente
// 2026-07-27: guardar tardaba ~15 s y luego "No se pudieron cargar los movimientos", con
// AbortError simultáneo en todas las queries y CHANNEL_ERROR en realtime.
let lastTransport: string | null = null;

onlineManager.setEventListener((setOnline) => {
  const unsubscribe = NetInfo.addEventListener((state) => {
    const transport = resolveNetworkTransport(lastTransport, state);
    if (transport.changed) {
      // Cambió el transporte: refrescar sesión y refetchear para salir por conexiones nuevas
      // en lugar de esperar a que cada petición muera por timeout. El cooldown de
      // recoverSession evita tormentas si la red va y viene.
      void recoverSession();
    }
    lastTransport = transport.current;
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
  // La sesión ya se reconcilia en AuthProvider y supabase.ts reactiva su auto-refresh.
  // No llamar recoverSession aquí: invalida todas las queries activas y, al volver de
  // Safari/cámara, generaba decenas de requests simultáneas que saturaban una conexión
  // HTTP/2 hasta hacer vencer incluso mutaciones nuevas a los 12 s.
});

let recoveringPromise: Promise<void> | null = null;
let lastRecoveryAt = 0;
const RECOVERY_COOLDOWN_MS = 30_000;

/**
 * Recupera una sesión Supabase degradada (token stale tras horas en foreground o
 * red inestable) y refetchea las queries activas. Coalesce + cooldown para no
 * tormentear en fallos persistentes; `force` lo salta (reintento manual). Incidente
 * 2026-07-15: app 17 h abierta → escrituras 42501 y lecturas "Network request
 * failed" hasta matar la app; ahora se recupera sola sin reinicio.
 *
 * Devuelve la promesa EN CURSO si ya se está recuperando, para que los callers (p. ej.
 * el reconcile de detección) puedan ESPERAR el refresh real del token en vez de retornar
 * al toque y reintentar el guardado con la sesión aún stale (carrera que hacía fallar el
 * reintento automático al abrir la app y solo dejaba funcionar el botón manual).
 */
export async function recoverSession(opts?: { force?: boolean }): Promise<void> {
  if (recoveringPromise) return recoveringPromise;
  const now = Date.now();
  if (!opts?.force && now - lastRecoveryAt < RECOVERY_COOLDOWN_MS) return;
  lastRecoveryAt = now;
  recoveringPromise = (async () => {
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session) await supabase.auth.refreshSession();
      }
      await queryClient.invalidateQueries();
    } catch (error) {
      logWarn("session-recovery", error instanceof Error ? error.message : String(error));
    } finally {
      recoveringPromise = null;
    }
  })();
  return recoveringPromise;
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
  // Bump 2026-07-30: el snapshot ya no lleva budgets/obligations dentro (viven en
  // una entrada aparte). Un caché viejo los traería embebidos y el generador de
  // notificaciones los daría por cargados, emitiendo un ciclo con datos rancios.
  buster: "2026-07-30-v1",
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
      // 2 reintentos: el primero suele caer todavía en el socket muerto tras un cambio de
      // red; el segundo ya sale por una conexión nueva. Con el timeout en 12 s el peor caso
      // sigue siendo más corto que antes (30 s + 1 reintento). Para las MUTATIONS ver la
      // política de abajo: solo reintentan si el backend estaba despertando.
      retry: 2,
      refetchOnWindowFocus: false,
      placeholderData: (previousData: unknown) => previousData,
    },
    mutations: {
      // Las mutaciones siguen SIN reintentar por defecto: no todas son idempotentes y
      // duplicarían registros. La única excepción es el backend despertando
      // (PGRST001/2/3), donde PostgREST no pudo ni hablar con la base: el statement no
      // llegó a ejecutarse, así que no hay nada que duplicar y reintentar es seguro.
      //
      // Es lo que sufría el usuario al abrir la app tras horas en segundo plano e ir
      // directo a registrar algo: se le mostraba "PGRST002 ... Retrying." como un fallo
      // definitivo, cuando el propio mensaje dice que hay que reintentar.
      retry: (failureCount: number, error: unknown) =>
        failureCount < 2 && isBackendWarmingUp(error),
      // Despertar PostgREST tarda un par de segundos: esperar es lo que lo resuelve.
      retryDelay: (attempt: number) => 1_500 * (attempt + 1),
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      const message = errorLogMessage(error);
      logWarn("query", message, { queryKey: query.queryKey });
      if (isAuthLikeError(message)) void recoverSession();
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      const message = errorLogMessage(error);
      logError("mutation", message, { mutationKey: mutation.options.mutationKey });
      if (isAuthLikeError(message)) void recoverSession();
    },
  }),
});
