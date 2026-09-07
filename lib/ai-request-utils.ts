/**
 * Cuánto espera el teléfono a una sugerencia de la IA antes de rendirse.
 *
 * Estaba en 6.5 s, y **el servidor tardaba más que eso casi la mitad de las veces**: medido el
 * 2026-09-06 sobre `ai_feature_usage_events`, de 1.303 llamadas de los últimos 60 días, 582
 * (45%) pasaron de 6.500 ms — mediana 5,9 s, p90 15,6 s. El reloj del servidor arranca al
 * entrar en la función, así que el total del cliente es ese más la red: el corte llegaba antes
 * que la respuesta en más de la mitad de los casos reales.
 *
 * En esas llamadas el modelo SÍ respondía y quedaban registradas como `success`: se pagaba el
 * token, se hacía el trabajo y la sugerencia no llegaba a verse. Y no se notaba, porque una
 * sugerencia que no aparece se ve igual que "no hay nada que proponer".
 *
 * 20 s cubre el p90 con margen. Esperar no cuesta nada aquí: la sugerencia no bloquea el
 * formulario —aparece pegada al campo cuando está lista, sin anunciarse antes—, así que el
 * único efecto de ampliar el plazo es que llegue en vez de perderse.
 */
export const INTERACTIVE_AI_TIMEOUT_MS = 20_000;

/**
 * Las tarjetas de IA del panel avanzado, que se piden a mano y tienen su propio cargando.
 *
 * Caían al plazo por defecto de 15 s, pensado para una consulta normal. Con un modelo que
 * razona el presupuesto de salida subió de 420 a 2.048 tokens —el pensamiento sale del mismo
 * saco—, y 15 s se queda corto para un texto de ese tamaño.
 */
export const DASHBOARD_AI_TIMEOUT_MS = 30_000;

/** Plazo por defecto de una llamada a una edge function que no es de IA. */
export const DEFAULT_EDGE_TIMEOUT_MS = 15_000;
export const AI_LOADING_MIN_VISIBLE_MS = 900;
/**
 * El chat corre un loop de herramientas (hasta 4 llamadas al modelo + queries) y,
 * en preguntas de análisis, una síntesis extra con un modelo más potente (Pro).
 * 70s cubre ese peor caso; las consultas simples responden en pocos segundos.
 */
export const ASSISTANT_CHAT_TIMEOUT_MS = 70_000;

export function isDashboardAiEdgeFunction(name: string): boolean {
  return name.startsWith("dashboard-advanced-ai-");
}

/** El plazo que le toca a cada edge function. Una sola tabla, para que no se olvide ninguna. */
export function resolveAiEdgeTimeoutMs(name: string): number {
  if (name === "assistant-chat") return ASSISTANT_CHAT_TIMEOUT_MS;
  if (isInteractiveAiEdgeFunction(name)) return INTERACTIVE_AI_TIMEOUT_MS;
  if (isDashboardAiEdgeFunction(name)) return DASHBOARD_AI_TIMEOUT_MS;
  return DEFAULT_EDGE_TIMEOUT_MS;
}

export function isInteractiveAiEdgeFunction(name: string): boolean {
  return [
    "movement-category-ai-suggestion",
    "movement-description-ai-cleanup",
    "movement-counterparty-ai-suggestion",
    "movement-recurring-ai-suggestion",
    "notification-movement-ai-classifier",
    "movement-risk-ai-explanation",
    "movement-budget-ai-recommendation",
    "daily-ai-digest",
  ].includes(name);
}

export async function waitForMinimumVisibleTime(startedAt: number, minMs = AI_LOADING_MIN_VISIBLE_MS) {
  const remaining = minMs - (Date.now() - startedAt);
  if (remaining <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, remaining));
}
