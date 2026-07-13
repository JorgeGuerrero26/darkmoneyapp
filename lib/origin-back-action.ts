export type OriginBackAction = "pop" | "replace-origin" | "replace-default";

/**
 * Decide cómo vuelve una pantalla con navegación por origen.
 *
 * Pop siempre que haya stack: la pantalla anterior (el origen que pusheó este
 * detalle y declaró `from`) sigue montada y vuelve intacta — sin remontar la
 * lista, sin re-animar filas ni refetchear por remount (incidente 2026-07-13:
 * "huecos en blanco" al volver de un detalle). El replace al origen declarado
 * queda solo para cuando no hay stack (deep link, notificación, restauración).
 */
export function resolveOriginBackAction(input: {
  hasOrigin: boolean;
  canGoBack: boolean;
}): OriginBackAction {
  if (input.canGoBack) return "pop";
  return input.hasOrigin ? "replace-origin" : "replace-default";
}

/**
 * El listener de `hardwareBackPress` es GLOBAL y las tabs visitadas quedan
 * montadas: sin chequeo de foco, una pantalla con `from` visitada antes (p. ej.
 * Presupuestos desde Más) secuestra el gesto de back de la pantalla visible y
 * la manda a su origen (bug: detalle de deuda → gesto back → Más).
 */
export function shouldInterceptHardwareBack(input: {
  hasOrigin: boolean;
  isFocused: boolean;
}): boolean {
  return input.hasOrigin && input.isFocused;
}
