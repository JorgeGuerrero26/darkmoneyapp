import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { secureSessionStorage } from "./secure-session-storage";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * Timeout global para TODA llamada HTTP de supabase-js (queries, mutations, auth,
 * storage). Tras horas en foreground el socket queda stale: el servidor commitea
 * el write pero la respuesta nunca vuelve y, sin límite, el fetch cuelga para
 * siempre (incidente 2026-07-20: guardar cuenta "cargando" 5 min). Aquí el arreglo
 * es único y cubre todos los formularios. NO afecta:
 *   - el asistente / edge functions → usan su propio fetch (services/queries/workspace-data.ts)
 *   - realtime → usa websockets, no fetch
 * 30 s: holgado para subir comprobantes en redes lentas, pero corta el cuelgue.
 */
const SUPABASE_FETCH_TIMEOUT_MS = 30_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT_MS);
  // Respetar un signal que el propio supabase-js haya pasado (p. ej. cancelaciones).
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Keystore del SO con chunking + migración lazy desde AsyncStorage; ver
        // lib/secure-session-storage.ts. El headless lee la sesión por esta misma vía.
        storage: secureSessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        // Critical for React Native: prevents crash trying to parse OAuth URLs
        detectSessionInUrl: false,
      },
      global: { fetch: fetchWithTimeout },
    })
  : null;

// Keep token alive when app comes back to foreground
AppState.addEventListener("change", (state) => {
  if (!supabase) return;
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
