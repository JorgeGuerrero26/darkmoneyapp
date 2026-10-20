/**
 * Llave de cifrado de la copia local (SQLCipher).
 *
 * Es aleatoria (256 bits), distinta por usuario y vive SOLO en el llavero del teléfono (iOS Keychain / Android Keystore vía
 * expo-secure-store), nunca junto al archivo de la base: quien copie el archivo sin el llavero no puede leerlo. Se pide el
 * acceso «después del primer desbloqueo» y «solo en este dispositivo»: no viaja en copias de seguridad a otro teléfono.
 *
 * `expo-secure-store` y `expo-crypto` se cargan con require protegido (como expo-sqlite): un binario anterior que no
 * los traiga no rompe la app, simplemente no cifra.
 */

type SecureStoreModule = typeof import("expo-secure-store");
type CryptoModule = { getRandomBytes?: (count: number) => Uint8Array };

function loadSecureStore(): SecureStoreModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-secure-store") as SecureStoreModule;
    return typeof mod?.getItemAsync === "function" ? mod : null;
  } catch {
    return null;
  }
}

function loadRandomBytes(): ((count: number) => Uint8Array) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-crypto") as CryptoModule;
    return typeof mod?.getRandomBytes === "function" ? mod.getRandomBytes : null;
  } catch {
    return null;
  }
}

export function keyNameFor(userId: string): string {
  return `darkmoney-db-key-${userId.replace(/[^a-zA-Z0-9-]/g, "")}`;
}

/** 32 bytes → 64 caracteres hexadecimales. */
export function bytesToHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes, (byte) => (byte & 0xff).toString(16).padStart(2, "0")).join("");
}

/** La forma en que SQLCipher recibe una llave cruda (sin derivarla de una contraseña): x'<hex>'. */
export function sqlcipherKeyPragma(hexKey: string): string {
  if (!/^[0-9a-f]{64}$/.test(hexKey)) throw new Error("La llave de la base no tiene el formato esperado.");
  return `pragma key = "x'${hexKey}'"`;
}

/**
 * La llave del usuario; la crea la primera vez. `null` = este binario no puede cifrar (falta expo-crypto o el llavero).
 * LANZA si el llavero existe pero no se pudo leer (p. ej. el teléfono no se ha desbloqueado desde que reinició): en ese caso
 * NO se debe abrir otra base «sin cifrar» a escondidas, simplemente no está disponible por ahora.
 */
export async function getOrCreateDatabaseKey(userId: string): Promise<string | null> {
  const store = loadSecureStore();
  const random = loadRandomBytes();
  if (!store || !random) return null;
  const name = keyNameFor(userId);
  const existing = await store.getItemAsync(name);
  if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing;
  const created = bytesToHex(random(32));
  await store.setItemAsync(name, created, { keychainAccessible: store.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
  return created;
}

/** Al cerrar sesión: sin la llave, lo que quedara del archivo no se puede leer. */
export async function deleteDatabaseKey(userId: string): Promise<void> {
  const store = loadSecureStore();
  if (!store) return;
  try {
    await store.deleteItemAsync(keyNameFor(userId));
  } catch {
    // Si no existía no hay nada más que hacer.
  }
}
