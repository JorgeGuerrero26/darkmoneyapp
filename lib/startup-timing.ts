import * as Updates from "expo-updates";
import { logInfo } from "./error-logger";

/**
 * Medición del arranque, para optimizar con datos y no con intuiciones.
 *
 * `JS_START` se fija cuando este módulo se evalúa, o sea al principio del bundle. NO
 * incluye el arranque nativo previo (imposible de ver desde JS), así que mide la parte
 * que sí controlamos: cuánto tarda la app en ser usable desde que el JS corre.
 *
 * El corte es el overlay de bootstrap: mientras está arriba la UI no acepta toques, así
 * que su cierre ES el momento en que la app sirve.
 */
const JS_START = Date.now();

let reported = false;

/**
 * Registra una sola vez el tiempo hasta que la app quedó usable.
 * - `ready`: el bootstrap resolvió normalmente.
 * - `timeout`: se disparó la válvula de escape y la UI se liberó con queries colgadas.
 */
export function markStartupReady(outcome: "ready" | "timeout", extra?: Record<string, unknown>): void {
  if (reported) return;
  reported = true;
  const ms = Date.now() - JS_START;
  logInfo("startup", `app usable en ${ms}ms (${outcome})`, {
    ms,
    outcome,
    // Qué bundle JS está corriendo de verdad. Sin esto, "¿ya te llegó la OTA?" solo se puede
    // adivinar, y adivinarlo hace perder el tiempo depurando código que el teléfono no tiene.
    // `updateId` es null cuando corre el bundle embebido en el APK/IPA.
    updateId: Updates.updateId,
    embedded: Updates.isEmbeddedLaunch,
    ...extra,
  });
}
