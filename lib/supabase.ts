import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { secureSessionStorage } from "./secure-session-storage";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

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
