import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as Linking from "expo-linking";

import { secureSessionStorage } from "./secure-session-storage";
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabase";

/**
 * Iniciar sesión con Google.
 *
 * Se abre el navegador del teléfono (Chrome / Safari) con la pantalla de Google; al terminar, Supabase vuelve a la app por
 * el enlace `darkmoney://auth-callback?code=…` y la ruta `app/(auth)/auth-callback.tsx` termina el inicio de sesión. Se usa
 * el navegador del sistema con `expo-linking` (que ya trae el binario instalado) en vez de un navegador integrado: así llega
 * por OTA, sin APK ni IPA nuevos.
 *
 * Flujo PKCE: el enlace de vuelta trae un código de un solo uso que NO sirve sin la clave (`code verifier`) que queda guardada
 * en el llavero de este teléfono. Otra app que se hiciera pasar por `darkmoney://` no podría usarlo. El cliente principal usa
 * el flujo implícito (la recuperación de contraseña depende de él), así que el PKCE va en un cliente aparte, con su propia
 * clave de almacenamiento, y la sesión que obtiene se le pasa al cliente principal.
 */

export const GOOGLE_CALLBACK_PATH = "auth-callback";
const OAUTH_STORAGE_KEY = "darkmoney-oauth-pkce";

let oauthClient: SupabaseClient | null = null;

function getOAuthClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) throw new Error("Supabase no está configurado.");
  oauthClient ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: "pkce",
      storage: secureSessionStorage,
      storageKey: OAUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return oauthClient;
}

let enabledCheck: Promise<boolean> | null = null;

/**
 * ¿Está activado Google en Supabase? (`/auth/v1/settings`, público con la clave anónima). El botón solo se muestra si sí:
 * así el código puede publicarse antes de terminar la configuración, y aparece solo cuando se active. Un fallo (sin red) da
 * false y no se recuerda: se vuelve a preguntar la próxima vez.
 */
export function isGoogleSignInEnabled(fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!supabaseUrl || !supabaseAnonKey) return Promise.resolve(false);
  if (!enabledCheck) {
    const check = fetcher(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey } })
      .then((response) => (response.ok ? response.json() : null))
      .then((settings: { external?: { google?: boolean } } | null) => settings?.external?.google === true)
      .catch(() => false);
    enabledCheck = check;
    void check.then((enabled) => { if (!enabled && enabledCheck === check) enabledCheck = null; });
  }
  return enabledCheck;
}

/** Solo para pruebas. */
export function resetGoogleSignInCheck(): void {
  enabledCheck = null;
}

/** A dónde vuelve Google: `darkmoney://auth-callback` en la app instalada. Debe estar en las «Redirect URLs» de Supabase. */
export function googleRedirectUrl(): string {
  return Linking.createURL(GOOGLE_CALLBACK_PATH);
}

/** Abre la pantalla de Google en el navegador del teléfono. La vuelta la recibe `finishGoogleSignIn`. */
export async function startGoogleSignIn(): Promise<void> {
  const { data, error } = await getOAuthClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: googleRedirectUrl(),
      skipBrowserRedirect: true,
      // Que Google pregunte siempre qué cuenta usar (quien tiene varias no entra con la equivocada sin darse cuenta).
      queryParams: { prompt: "select_account" },
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("No se pudo abrir Google. Intenta de nuevo.");
  await Linking.openURL(data.url);
}

export type OAuthCallbackParams = { code?: string | string[]; error?: string | string[]; error_description?: string | string[] };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Lo que trae el enlace de vuelta, ya interpretado. Puro: se prueba solo. */
export function readOAuthCallback(params: OAuthCallbackParams): { code: string } | { error: string } {
  const error = first(params.error);
  if (error) {
    const detail = first(params.error_description) ?? "";
    if (error === "access_denied") return { error: "Cancelaste el inicio de sesión con Google." };
    return { error: detail ? `Google no permitió entrar: ${detail}` : "Google no permitió entrar. Intenta de nuevo." };
  }
  const code = first(params.code);
  if (!code) return { error: "El enlace de Google llegó incompleto. Vuelve a intentarlo desde «Continuar con Google»." };
  return { code };
}

/**
 * Termina el inicio de sesión: cambia el código por una sesión (con la clave guardada en este teléfono) y se la pasa al
 * cliente principal, que la guarda y avisa a la app. Pase lo que pase, borra lo que quedó del intento.
 */
export async function finishGoogleSignIn(params: OAuthCallbackParams): Promise<void> {
  const parsed = readOAuthCallback(params);
  if ("error" in parsed) throw new Error(parsed.error);
  if (!supabase) throw new Error("Supabase no está configurado.");
  try {
    const { data, error } = await getOAuthClient().auth.exchangeCodeForSession(parsed.code);
    if (error) throw error;
    if (!data.session) throw new Error("Google no devolvió una sesión. Intenta de nuevo.");
    const { error: setError } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (setError) throw setError;
  } finally {
    await Promise.all([
      secureSessionStorage.removeItem(OAUTH_STORAGE_KEY),
      secureSessionStorage.removeItem(`${OAUTH_STORAGE_KEY}-code-verifier`),
      secureSessionStorage.removeItem(`${OAUTH_STORAGE_KEY}-user`),
    ]).catch(() => undefined);
  }
}
