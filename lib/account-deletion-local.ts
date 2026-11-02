import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { offlineRuntime } from "./offline/instance";
import { notificationDetection } from "./notification-detection-native";
import { clearSessionScopedClientState } from "./session-data-reset";
import { REMEMBER_EMAIL_KEY, REMEMBER_FLAG_KEY, REMEMBER_PASS_KEY, SECURE_EMAIL_KEY, SECURE_PASS_KEY } from "./device-auth-state";
import { useUiStore } from "../store/ui-store";

/** Claves del almacenamiento seguro que no son de la sesión de Supabase (esa la borra signOut). */
const SECURE_KEYS = [SECURE_EMAIL_KEY, SECURE_PASS_KEY, REMEMBER_EMAIL_KEY, REMEMBER_PASS_KEY, REMEMBER_FLAG_KEY];

/** Detecciones de Android: se apaga y se le quita la copia de cuentas, categorías y contactos. */
async function clearNotificationDetection() {
  if (!notificationDetection.isAvailable()) return;
  notificationDetection.setDetectionEnabled(false);
  notificationDetection.setAllowedPackages([]);
  // Sin userId ni catálogos: el servicio deja de poder registrar nada a nombre de la cuenta borrada.
  notificationDetection.setRuntimeContext({ notifCleanupKey: "account-deleted" });
  const suggestions = await notificationDetection.getSuggestions().catch(() => []);
  for (const suggestion of suggestions) notificationDetection.ignoreSuggestion(suggestion.id);
}

/**
 * La cuenta ya no existe en el servidor: se borra TODO lo suyo del teléfono. Base sin conexión (cifrada, con su clave
 * y la cola de cambios aunque quede algo sin enviar), caché de consultas, preferencias guardadas, credenciales de huella
 * y "recordarme", y lo que tenga la detección de Android. Cada paso es independiente: si uno falla, los demás siguen.
 */
export async function wipeDeviceAfterAccountDeletion(userId: string): Promise<void> {
  await Promise.allSettled([
    offlineRuntime.forgetUser(userId),
    clearSessionScopedClientState(),
    clearNotificationDetection(),
    ...SECURE_KEYS.map((key) => SecureStore.deleteItemAsync(key)),
  ]);
  // Al final: el caché de consultas y los ajustes de pantalla también viven en AsyncStorage.
  await AsyncStorage.clear().catch(() => undefined);
  // Lo que ya estaba en memoria (persistido arriba) vuelve a su valor inicial.
  const ui = useUiStore.getState();
  ui.setBiometricEnabled(false);
  ui.setBiometricLocked(false);
  ui.setLastMovementAccountId(null);
}
