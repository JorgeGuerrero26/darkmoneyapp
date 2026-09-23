import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AppProfile } from "./auth-context";

const KEY = "darkmoney/profile/v1";

type Stored = { userId: string; profile: AppProfile };

/**
 * El último perfil bueno, guardado en el teléfono.
 *
 * Existe porque el arranque esperaba a traer el perfil por red antes de dejar tocar nada. Medido
 * con las fases de `startup-timing`: los datos salían del disco a los ~80 ms y la app se quedaba
 * 5–6.5 s bloqueada esperando la sesión y el perfil. Con esto, el perfil de la última vez se usa
 * al instante y el de red llega por detrás.
 *
 * Va atado al id de usuario: un perfil guardado de OTRO usuario no se devuelve nunca, aunque el
 * borrado al cerrar sesión fallara.
 */
export function pickCachedProfile(raw: string | null, userId: string): AppProfile | null {
  if (!raw || !userId) return null;
  try {
    const stored = JSON.parse(raw) as Partial<Stored>;
    const profile = stored?.profile;
    if (stored?.userId !== userId || !profile || profile.id !== userId) return null;
    if (typeof profile.baseCurrencyCode !== "string" || !profile.baseCurrencyCode) return null;
    return profile as AppProfile;
  } catch {
    return null;
  }
}

export async function readCachedProfile(userId: string): Promise<AppProfile | null> {
  try {
    return pickCachedProfile(await AsyncStorage.getItem(KEY), userId);
  } catch {
    return null;
  }
}

export async function writeCachedProfile(profile: AppProfile): Promise<void> {
  try {
    const stored: Stored = { userId: profile.id, profile };
    await AsyncStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Sin caché el arranque solo vuelve a ser el de antes: esperar a la red.
  }
}

export async function clearCachedProfile(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => null);
}
