/**
 * Detecta errores que significan sesión/token Supabase degradado (no simple falta
 * de red). Un 42501 (RLS) o un JWT vencido ⇒ conviene refrescar la sesión; un
 * "Network request failed" NO (eso lo maneja onlineManager al volver la red).
 */
export function isAuthLikeError(message: string): boolean {
  return /42501|row-level security|\bjwt\b|\btoken\b|unauthorized|not authenticated|\b401\b|\b403\b/i.test(message);
}
