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
 * ¿Ya terminó el arranque? Durante el arranque en frío hay muchas queries sin datos por
 * definición, y la app ya muestra su propia pantalla de carga: avisar ahí de "red lenta" es
 * ruido, no información.
 *
 * Medido en el iPhone del usuario: arranques de 4022, 5175, 6488 y **8034** ms. El umbral del
 * aviso era 8000, así que ese último lo cruzaba por 34 milésimas con la red perfectamente bien.
 */
export function isStartupComplete(): boolean {
  return reported;
}

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
    // Reloj absoluto del instante en que este módulo se evaluó, o sea cuando el JS empezó a
    // correr. `ms` mide desde aquí en adelante y deja ciego todo lo ANTERIOR: el arranque
    // nativo y la carga del bundle. Restando este valor del momento en que se lanzó la app se
    // obtiene ese tramo, que de otro modo solo se puede cronometrar desde fuera — y ahí el
    // coste de la propia herramienta (10 s de túnel en devicectl) contamina la medición.
    jsStartAt: JS_START,
    ...extra,
  });
}
