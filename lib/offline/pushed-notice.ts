import type { SyncReason } from "./runtime";
import type { SyncReport } from "./sync-types";

/**
 * Mensaje de "N cambios enviados" al terminar de enviar (el banner de la Revisión 40). Solo cuando tiene
 * sentido avisar: volvió el internet, el usuario pidió enviar, o salieron varios juntos. Un guardado normal
 * con internet envía de a uno en silencio: avisar cada vez sería ruido.
 */
export function describePushedNotice(report: Pick<SyncReport, "applied" | "rejected">, reason: SyncReason): string | null {
  const sent = report.applied;
  if (sent <= 0) return null;
  if (!(reason === "network" || reason === "manual" || sent >= 2)) return null;
  return sent === 1 ? "1 cambio enviado" : `${sent} cambios enviados`;
}
