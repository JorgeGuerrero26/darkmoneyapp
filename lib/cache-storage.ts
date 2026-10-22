import AsyncStorage from "@react-native-async-storage/async-storage";

import { getOrCreateSecret, randomBytesOrNull } from "./offline/db-key";
import { createSecureStorage, type CacheKeyState } from "./secure-cache-storage";

/** Nombre de la llave de la caché en el llavero (una por teléfono: la caché se borra al cambiar de usuario). */
const CACHE_KEY_NAME = "darkmoney-cache-key";

let memoizedKey: Uint8Array | null = null;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function cacheKeyState(): Promise<CacheKeyState> {
  if (memoizedKey) return { kind: "key", key: memoizedKey };
  try {
    const hex = await getOrCreateSecret(CACHE_KEY_NAME);
    if (!hex) return { kind: "none" }; // este binario no puede cifrar (sin expo-crypto): la caché sigue como siempre
    memoizedKey = hexToBytes(hex);
    return { kind: "key", key: memoizedKey };
  } catch {
    return { kind: "unavailable" }; // llavero bloqueado: no se guarda nada en claro
  }
}

/** AsyncStorage con la caché cifrada cuando el binario lo permite. Es lo que usa el persistidor de React Query. */
export const cacheStorage = createSecureStorage(AsyncStorage, cacheKeyState, randomBytesOrNull);
