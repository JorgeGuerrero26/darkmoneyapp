import { COLORS } from "../constants/theme";
import type { ObligationDirection } from "../types/domain";

/**
 * Perspectiva del usuario en pantalla respecto al flujo de dinero:
 * - **Crédito (receivable)**, titular: cobra lo que le deben.
 * - **Crédito compartido** (invitado, suele ser el deudor): paga.
 * - **Deuda (payable)**, titular: paga lo que debe.
 * - **Deuda compartida** (invitado, suele ser el acreedor): cobra.
 */
export function obligationViewerActsAsCollector(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): boolean {
  return direction === "receivable" ? !isSharedViewer : isSharedViewer;
}

export function obligationSwipeActionLabel(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): "Cobrar" | "Pagar" | "Solicitar" {
  if (isSharedViewer) return "Solicitar";
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "Cobrar" : "Pagar";
}

export function analyticsPaidMetricLabel(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): string {
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "Cobrado" : "Pagado";
}

export function analyticsPaymentCountMetricLabel(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): string {
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "Nro. cobros" : "Nro. pagos";
}

export function analyticsChartSectionTitle(
  direction: ObligationDirection,
  isSharedViewer: boolean,
  scope: "6" | "12" | "all",
): string {
  const base = obligationViewerActsAsCollector(direction, isSharedViewer)
    ? "Cobros por mes"
    : "Pagos por mes";
  if (scope === "6") return `${base} (ultimos 6 meses)`;
  if (scope === "12") return `${base} (ultimos 12 meses)`;
  return `${base} (historico completo)`;
}

export function analyticsInstallmentsDoneAdj(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): "cobradas" | "pagadas" {
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "cobradas" : "pagadas";
}

export function analyticsEventPaymentNoun(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): "Cobro" | "Pago" {
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "Cobro" : "Pago";
}

/** Texto tipo «45 % pagado de …» / «45 % cobrado de …» en ficha. */
export function obligationProgressPaidAdjective(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): "cobrado" | "pagado" {
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "cobrado" : "pagado";
}

/** Badge principal bajo el monto pendiente. */
export function obligationPendingDirectionBadge(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): string {
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "Por cobrar" : "Por pagar";
}

export function obligationRegisterMoneyActionTitle(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): "Registrar cobro" | "Registrar pago" {
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "Registrar cobro" : "Registrar pago";
}

/**
 * Color del evento en historial (verde = le conviene al que mira, rojo = le perjudica).
 * Crédito titular: cobros/aumentos verde, reducción rojo. Invitado: al revés.
 * Deuda titular: pagos/aumentos rojo, reducción verde. Invitado: al revés.
 */
export function obligationHistoryEventColor(
  eventType: string,
  direction: ObligationDirection,
  isSharedViewer: boolean,
): string {
  const good = COLORS.income;
  const bad = COLORS.expense;

  const isReceivable = direction === "receivable";

  if (eventType === "payment") {
    if (isReceivable) return isSharedViewer ? bad : good;
    return isSharedViewer ? good : bad;
  }
  if (eventType === "principal_increase") {
    if (isReceivable) return isSharedViewer ? bad : good;
    return isSharedViewer ? good : bad;
  }
  if (eventType === "principal_decrease") {
    if (isReceivable) return isSharedViewer ? good : bad;
    return isSharedViewer ? bad : good;
  }

  return COLORS.storm;
}

export function obligationHistoryEventAmountPrefix(
  eventType: string,
  direction: ObligationDirection,
  isSharedViewer: boolean,
): "+" | "−" | "" {
  if (eventType !== "payment") return "";
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "+" : "−";
}
