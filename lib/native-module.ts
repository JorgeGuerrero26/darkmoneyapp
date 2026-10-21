import { requireOptionalNativeModule } from "expo";

/**
 * ¿Este binario trae el módulo nativo `name`? Se pregunta SIN cargar el paquete JS.
 *
 * Hay que preguntarlo antes de cualquier `require()` tardío de un paquete nativo. Un `try { require("expo-crypto") }`
 * NO protege: si el paquete lanza al cargarse (porque al binario le falta su módulo nativo) y el require ocurre después
 * del arranque, el `require` de Metro (guardedLoadModule) lo reporta como error FATAL antes de que el `catch` lo vea, y la
 * app se cierra. Incidente del 2026-10-21: el IPA 1.1.0 no trae expo-crypto, el JS del cifrado llegó por OTA y la app
 * se cerraba justo después del Face ID, al arrancar el modo sin conexión.
 *
 * (El `try` alrededor de un `require` sí basta cuando el require corre durante la carga inicial del bundle, como en
 * lib/speech-recognition-safe.ts.)
 */
export function hasNativeModule(name: string): boolean {
  try {
    return requireOptionalNativeModule(name) != null;
  } catch {
    return false;
  }
}
