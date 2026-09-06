/**
 * Registro de uso de IA, compartido.
 *
 * ## Por qué existe
 *
 * Las siete funciones de DeepSeek escriben en `ai_feature_usage_events` desde el principio: por
 * eso se puede responder "qué modelo corre, cuántas llamadas y con qué éxito" mirando una tabla.
 * Las de Gemini —el asistente y las cinco tarjetas del dashboard avanzado— **no registraban
 * nada**, así que de esa mitad del gasto no había forma de saber nada: ni cuántas llamadas, ni
 * si fallaban, ni con qué modelo.
 *
 * Se notó al preguntar algo tan simple como "¿conviene cancelar una de las dos APIs?". De
 * DeepSeek había datos; de Gemini hubo que deducir por fechas y hashes de secretos.
 *
 * ## Reglas
 *
 * - **Nunca rompe el flujo.** Si el registro falla, se traga el error: perder una métrica es
 *   barato, romperle el asistente al usuario no. Por eso no lanza nunca.
 * - **`model` es el que de verdad se usó**, resuelto del secreto, no el que dice el código por
 *   defecto. Ese es justo el dato que faltaba.
 * - **La fecha va en América/Lima**, igual que en las funciones de DeepSeek, o los contadores
 *   diarios de unas y otras no cuadrarían.
 */

/**
 * El cliente de Supabase, sin reproducir su tipo.
 *
 * Describirlo a mano (`insert` devuelve una promesa) no compilaba: `insert()` devuelve un
 * builder *thenable*, no una `Promise`, y el tipo estrecho contaminaba la inferencia del resto
 * del archivo que lo llamaba -- siete errores en una función que antes compilaba limpia.
 */
// deno-lint-ignore no-explicit-any
type MinimalClient = { from: (table: string) => any };

export function usageDateInLima(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type AiUsageStatus = "success" | "error";

export async function recordAiUsage(input: {
  client: MinimalClient;
  userId: string;
  workspaceId: number | null;
  featureKey: string;
  /** El modelo REAL que respondió, no el nombre por defecto del código. */
  model: string;
  surface: string;
  status: AiUsageStatus;
  latencyMs: number;
}): Promise<void> {
  try {
    const { error } = await input.client.from("ai_feature_usage_events").insert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      feature_key: input.featureKey,
      usage_date: usageDateInLima(),
      model: input.model,
      surface: input.surface,
      status: input.status,
      latency_ms: input.latencyMs,
    });
    if (error) console.warn("[ai-usage] no se pudo registrar:", error);
  } catch (error) {
    console.warn("[ai-usage] no se pudo registrar:", error);
  }
}
