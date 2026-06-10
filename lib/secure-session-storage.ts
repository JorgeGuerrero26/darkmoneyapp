import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * Storage para supabase-js respaldado por el Keystore del SO (expo-secure-store)
 * en lugar de AsyncStorage plano (hallazgo S3 de la auditoría: el JWT de sesión
 * era legible en disco).
 *
 * - SecureStore limita cada valor a ~2048 bytes y la sesión de Supabase los supera,
 *   así que el valor se parte en chunks: `<key>.meta` guarda el número de chunks y
 *   `<key>.<i>` cada fragmento.
 * - Migración lazy: si la key no existe en SecureStore pero sí en AsyncStorage
 *   (instalaciones previas), se copia al almacenamiento seguro y se borra la copia plana.
 * - Disponibilidad > confidencialidad: si el Keystore falla (restore de backup,
 *   contexto raro), se cae a AsyncStorage para no desloguear al usuario ni romper
 *   el registro headless con la app cerrada.
 */

const CHUNK_SIZE = 1800;

/** SecureStore solo acepta [A-Za-z0-9._-]; las keys de supabase (sb-<ref>-auth-token) cumplen. */
function sanitizeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

function metaKey(key: string): string {
  return `${sanitizeKey(key)}.meta`;
}

function chunkKey(key: string, index: number): string {
  return `${sanitizeKey(key)}.${index}`;
}

async function secureGet(key: string): Promise<string | null> {
  const metaRaw = await SecureStore.getItemAsync(metaKey(key));
  if (!metaRaw) return null;
  const chunkCount = Number(metaRaw);
  if (!Number.isInteger(chunkCount) || chunkCount <= 0) return null;
  const chunks: string[] = [];
  for (let i = 0; i < chunkCount; i += 1) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i));
    if (part == null) return null;
    chunks.push(part);
  }
  return chunks.join("");
}

async function secureSet(key: string, value: string): Promise<void> {
  const previousMeta = await SecureStore.getItemAsync(metaKey(key));
  const previousCount = Number(previousMeta ?? 0);
  const chunkCount = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
  for (let i = 0; i < chunkCount; i += 1) {
    await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
  }
  await SecureStore.setItemAsync(metaKey(key), String(chunkCount));
  // Chunks sobrantes de una escritura anterior más larga.
  for (let i = chunkCount; i < previousCount; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}

async function secureRemove(key: string): Promise<void> {
  const metaRaw = await SecureStore.getItemAsync(metaKey(key));
  const chunkCount = Number(metaRaw ?? 0);
  for (let i = 0; i < chunkCount; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
  await SecureStore.deleteItemAsync(metaKey(key));
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const stored = await secureGet(key);
      if (stored != null) return stored;
      // Migración lazy desde AsyncStorage (sesiones creadas antes de este cambio).
      const legacy = await AsyncStorage.getItem(key);
      if (legacy != null) {
        try {
          await secureSet(key, legacy);
          await AsyncStorage.removeItem(key);
        } catch {
          // Si el Keystore no coopera, conservar la copia plana y seguir funcionando.
        }
        return legacy;
      }
      return null;
    } catch {
      return AsyncStorage.getItem(key);
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      await secureSet(key, value);
    } catch {
      await AsyncStorage.setItem(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await secureRemove(key);
    } catch {
      // Borrar siempre la copia plana aunque el Keystore falle.
    }
    await AsyncStorage.removeItem(key);
  },
};
