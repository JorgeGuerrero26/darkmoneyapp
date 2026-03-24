import type {
  ObligationDirection,
  ObligationShareSummary,
  ObligationStatus,
} from "../types/domain";

/** obligations.direction → etiqueta en UI (paridad con web). */
export function getDirectionLabel(direction: ObligationDirection): string {
  return direction === "receivable" ? "Me deben" : "Yo debo";
}

const OBLIGATION_STATUS_LABELS: Record<ObligationStatus, string> = {
  draft: "Borrador",
  active: "Activa",
  paid: "Liquidada",
  cancelled: "Cancelada",
  defaulted: "Incumplido",
};

/** obligations.status → etiqueta (paridad con statusOptions web). */
export function getObligationStatusLabel(status: ObligationStatus): string {
  return OBLIGATION_STATUS_LABELS[status] ?? status;
}

/** obligation_shares.status → tercer badge en tarjeta (si hay fila para esa obligación). */
export function getShareStatusLabel(status: ObligationShareSummary["status"]): string {
  switch (status) {
    case "accepted":
      return "Compartida";
    case "pending":
      return "Por aceptar";
    case "declined":
      return "No aceptada";
    case "revoked":
      return "Revocada";
    default:
      return "Compartida";
  }
}

/**
 * Índice obligation_id → share (query pending+accepted, orden updated_at desc).
 * Si hubiera varias filas por obligación, gana la más reciente (primera del array).
 */
export function buildShareByObligationId(
  shares: ObligationShareSummary[],
): Map<number, ObligationShareSummary> {
  const map = new Map<number, ObligationShareSummary>();
  for (const share of shares) {
    if (!map.has(share.obligationId)) {
      map.set(share.obligationId, share);
    }
  }
  return map;
}
