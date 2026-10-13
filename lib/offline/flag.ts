import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Interruptor del modo sin conexión (beta). Apagado por defecto: con él apagado la app se
 * comporta exactamente como antes. Se guarda en el teléfono porque es una preferencia del
 * dispositivo (la base SQLite también lo es).
 */
const KEY = "darkmoney/offline-engine-enabled";

let enabled = false;
let loaded = false;
const listeners = new Set<() => void>();

export async function loadOfflineFlag(): Promise<boolean> {
  if (loaded) return enabled;
  try {
    enabled = (await AsyncStorage.getItem(KEY)) === "1";
  } catch {
    enabled = false;
  }
  loaded = true;
  listeners.forEach((listener) => listener());
  return enabled;
}

export function isOfflineFlagEnabled(): boolean {
  return enabled;
}

export function isOfflineFlagLoaded(): boolean {
  return loaded;
}

export async function setOfflineFlag(next: boolean): Promise<void> {
  enabled = next;
  loaded = true;
  try {
    await AsyncStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // Sin persistencia, el interruptor vale solo para esta sesión.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeOfflineFlag(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
