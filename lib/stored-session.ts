import type { Session } from "@supabase/supabase-js";

/**
 * La sesión tal como quedó guardada en el teléfono, sin pedirle nada al servidor.
 *
 * Al abrir la app, `supabase.auth.getSession()` renueva por red el permiso de acceso si caducó (dura una hora). Con mala señal
 * esa renovación falla o tarda más de lo que la app espera, y entonces devuelve «sin sesión» aunque la sesión siga guardada
 * y viva en el servidor: la app mandaba a la pantalla de iniciar sesión, que también necesita red. Con el modo sin conexión
 * eso dejaba fuera justo cuando más se necesita entrar (2026-10-27, 3G: «la solicitud tardó demasiado»).
 *
 * Con esta sesión guardada la app entra igual (el bloqueo con huella sigue pidiéndose) y trabaja con la copia del teléfono;
 * la renovación la reintenta supabase-js sola cuando vuelve la red. Si la sesión de verdad terminó, el servidor la rechaza al
 * renovar y la librería la borra: ahí sí se pide iniciar sesión.
 */
export function parseStoredSession(raw: string | null | undefined): Session | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Session> | null;
    if (!value || typeof value !== "object") return null;
    if (typeof value.access_token !== "string" || typeof value.refresh_token !== "string") return null;
    if (!value.user || typeof value.user !== "object" || typeof (value.user as { id?: unknown }).id !== "string") return null;
    return value as Session;
  } catch {
    return null;
  }
}

export async function readStoredSession(
  storage: { getItem(key: string): Promise<string | null> },
  storageKey: string,
): Promise<Session | null> {
  try {
    return parseStoredSession(await storage.getItem(storageKey));
  } catch {
    return null;
  }
}
