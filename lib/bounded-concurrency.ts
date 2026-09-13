/**
 * Ejecuta tareas con un tope de cuántas corren a la vez.
 *
 * Existe por la estampida al recuperar la sesión: `queryClient.invalidateQueries()` sin filtro
 * revalida TODAS las queries activas en el mismo instante, justo cuando la conexión acaba de
 * nacer (cambio de WiFi a datos, vuelta de segundo plano). Medido sobre 60 días de
 * app_error_logs: los fallos de query/mutation no llegan sueltos sino en ráfagas simultáneas de
 * hasta 12 en el mismo segundo — la firma de una avalancha, no de mala suerte independiente.
 *
 * Mantiene `limit` tareas en vuelo y arranca la siguiente en cuanto una termina, en vez de ir
 * por tandas: una tarea lenta no deja el hueco vacío esperando a sus compañeras de tanda.
 *
 * Nunca rechaza: una tarea que falla no puede abortar a las demás, porque cada una es una
 * revalidación independiente y quien la pidió ya tiene su propio manejo de error.
 */
export async function runBounded(tasks: Array<() => Promise<unknown>>, limit: number): Promise<void> {
  const width = Math.max(1, Math.min(limit, tasks.length));
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const task = tasks[next];
      next += 1;
      try {
        await task();
      } catch {
        // Aislada a propósito: ver arriba.
      }
    }
  };
  await Promise.all(Array.from({ length: width }, worker));
}
