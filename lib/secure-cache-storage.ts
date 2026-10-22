import { chacha20poly1305 } from "@noble/ciphers/chacha.js";

/**
 * Almacenamiento cifrado para la caché de la pantalla de inicio (React Query → AsyncStorage).
 *
 * Esa caché guarda lo necesario para abrir la app al instante: el resumen del espacio, la primera página de Movimientos, las
 * notificaciones. Sin esto quedaba en AsyncStorage como texto legible. Ahora cada valor se cifra con ChaCha20-Poly1305 (librería
 * auditada y sin código nativo: `@noble/ciphers`) y una llave aleatoria de 256 bits guardada en el llavero del teléfono.
 *
 * Reglas (todas por seguridad y para no romper el arranque):
 *  - **Binario sin `expo-crypto`/llavero** (el IPA 1.1.0, los APK anteriores): la caché sigue como siempre, en claro. Nunca se
 *    pide nada nativo que ese binario no tenga.
 *  - **Llavero que existe pero no se puede leer** (teléfono recién reiniciado y bloqueado): NO se guarda nada en claro y la
 *    lectura devuelve «sin caché». Es mejor arrancar sin caché unos segundos que dejar datos financieros al descubierto.
 *  - **Lectura que falla** (llave distinta, dato dañado, versión antigua): se trata como «sin caché»; la app vuelve a pedir todo
 *    al servidor. Nunca lanza.
 *  - Lo que ya estaba guardado en claro se lee igual (migración transparente: la siguiente escritura ya va cifrada).
 */

const PREFIX = "enc1:";

type StorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<void>;
};

/** Cómo está la llave ahora mismo. */
export type CacheKeyState = { kind: "none" } | { kind: "unavailable" } | { kind: "key"; key: Uint8Array };

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return globalThis.btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** UTF-8 sin depender de TextEncoder/TextDecoder (disponibles según el motor de JS). */
function utf8ToBytes(text: string): Uint8Array {
  const binary = unescape(encodeURIComponent(text));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToUtf8(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return decodeURIComponent(escape(binary));
}

export function encryptText(plain: string, key: Uint8Array, nonce: Uint8Array): string {
  const sealed = chacha20poly1305(key, nonce).encrypt(utf8ToBytes(plain));
  const all = new Uint8Array(nonce.length + sealed.length);
  all.set(nonce, 0);
  all.set(sealed, nonce.length);
  return PREFIX + bytesToBase64(all);
}

/** `null` si no es un valor cifrado válido para esa llave. Nunca lanza. */
export function decryptText(envelope: string, key: Uint8Array): string | null {
  try {
    if (!envelope.startsWith(PREFIX)) return null;
    const all = base64ToBytes(envelope.slice(PREFIX.length));
    if (all.length < 12 + 16) return null;
    return bytesToUtf8(chacha20poly1305(key, all.subarray(0, 12)).decrypt(all.subarray(12)));
  } catch {
    return null;
  }
}

export function isEncryptedValue(value: string | null): boolean {
  return Boolean(value && value.startsWith(PREFIX));
}

/**
 * Envuelve un almacenamiento con el cifrado. `getKeyState` y `randomBytes` se inyectan (en la app vienen del llavero y de
 * expo-crypto; en las pruebas, de mentira).
 */
export function createSecureStorage(
  inner: StorageLike,
  getKeyState: () => Promise<CacheKeyState>,
  randomBytes: (count: number) => Uint8Array | null,
): StorageLike {
  return {
    async getItem(name) {
      const value = await inner.getItem(name);
      if (value == null || !isEncryptedValue(value)) return value; // en claro (o vacío): como siempre
      const state = await getKeyState().catch((): CacheKeyState => ({ kind: "unavailable" }));
      if (state.kind !== "key") return null;
      return decryptText(value, state.key);
    },
    async setItem(name, value) {
      const state = await getKeyState().catch((): CacheKeyState => ({ kind: "unavailable" }));
      if (state.kind === "none") return inner.setItem(name, value); // este binario no puede cifrar
      if (state.kind === "unavailable") return undefined; // llavero bloqueado: no se deja nada en claro
      const nonce = randomBytes(12);
      if (!nonce) return undefined; // sin aleatoriedad del sistema no se improvisa
      return inner.setItem(name, encryptText(value, state.key, nonce));
    },
    removeItem: (name) => inner.removeItem(name),
  };
}
