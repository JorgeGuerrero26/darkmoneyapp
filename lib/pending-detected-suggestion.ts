import AsyncStorage from "@react-native-async-storage/async-storage";

const PENDING_KEY = "darkmoney_pending_detected_suggestion_native_id";

/** Vigencia del pendiente: pasado esto la sugerencia ya no es accionable (stale). */
const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Guarda el nativeId del deep link darkmoney://detected-suggestion/<id> cuando el
 * usuario lo abre SIN sesión, para retomarlo tras el login (mismo patrón que las
 * invitaciones pendientes). Sin esto, el tap en la notificación se perdía y el
 * usuario aterrizaba en el dashboard.
 */
export async function setPendingDetectedSuggestionNativeId(nativeId: string): Promise<void> {
  if (!nativeId.trim()) return;
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ nativeId: nativeId.trim(), ts: Date.now() }));
}

export async function getPendingDetectedSuggestionNativeId(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { nativeId?: unknown; ts?: unknown };
    const nativeId = typeof parsed.nativeId === "string" ? parsed.nativeId.trim() : "";
    const ts = Number(parsed.ts ?? 0);
    if (!nativeId || !ts || Date.now() - ts > PENDING_TTL_MS) return null;
    return nativeId;
  } catch {
    return null;
  }
}

export async function clearPendingDetectedSuggestionNativeId(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}
