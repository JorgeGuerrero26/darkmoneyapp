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

/**
 * La dirección **desde tu lado**, para una obligación que puede venir compartida.
 *
 * `direction` está guardada desde el lado del dueño. Cuando la lista mezcla las tuyas con las
 * que te compartieron —el dashboard con `mergeWorkspaceAndSharedObligations`, la pantalla de
 * créditos y deudas— leer `o.direction === "receivable"` cuenta las deudas compartidas como
 * dinero que entra. Esta función es la forma corta de no equivocarse.
 */
export function obligationViewerDirection(obligation: { direction?: string }): ObligationDirection {
  const isSharedViewer = "viewerMode" in obligation;
  return obligation.direction === "receivable"
    ? (isSharedViewer ? "payable" : "receivable")
    : (isSharedViewer ? "receivable" : "payable");
}

export function obligationSwipeActionLabel(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): "Cobrar" | "Pagar" | "Solicitar" {
  if (isSharedViewer) return "Solicitar";
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "Cobrar" : "Pagar";
}

export function obligationPerspectiveDirectionLabel(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): "Me deben" | "Yo debo" {
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "Me deben" : "Yo debo";
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
/**
 * Lo que rotula la cifra grande del detalle.
 *
 * "Por cobrar" y "por pagar" son términos de contabilidad y describen la deuda, no lo que el
 * usuario viene a preguntar. La cifra grande es **lo que falta**, así que se dice así.
 */
export function obligationPendingDirectionBadge(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): string {
  return obligationViewerActsAsCollector(direction, isSharedViewer)
    ? "Falta que te paguen"
    : "Falta que pagues";
}

export function obligationRegisterMoneyActionTitle(
  direction: ObligationDirection,
  isSharedViewer: boolean,
): "Registrar cobro" | "Registrar pago" {
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "Registrar cobro" : "Registrar pago";
}

export function obligationViewerPaymentRequestNoun(
  direction: ObligationDirection,
): "cobro" | "pago" {
  return obligationViewerActsAsCollector(direction, true) ? "cobro" : "pago";
}

export function obligationViewerPaymentRequestTitle(
  direction: ObligationDirection,
): "Solicitar registro de cobro" | "Solicitar registro de pago" {
  const noun = obligationViewerPaymentRequestNoun(direction);
  return noun === "cobro" ? "Solicitar registro de cobro" : "Solicitar registro de pago";
}

export function obligationEventCashDeltaSign(
  eventType: string,
  direction: ObligationDirection,
  isSharedViewer: boolean,
): -1 | 1 | 0 {
  const actsAsCollector = obligationViewerActsAsCollector(direction, isSharedViewer);
  if (eventType === "payment" || eventType === "principal_decrease") {
    return actsAsCollector ? 1 : -1;
  }
  if (eventType === "principal_increase") {
    return actsAsCollector ? -1 : 1;
  }
  return 0;
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
  useCashPerspective = false,
): string {
  const good = COLORS.income;
  const bad = COLORS.expense;

  if (useCashPerspective) {
    const cashSign = obligationEventCashDeltaSign(eventType, direction, isSharedViewer);
    if (cashSign > 0) return good;
    if (cashSign < 0) return bad;
  }

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
  useCashPerspective = false,
): "+" | "−" | "" {
  if (useCashPerspective) {
    const cashSign = obligationEventCashDeltaSign(eventType, direction, isSharedViewer);
    if (cashSign > 0) return "+";
    if (cashSign < 0) return "−";
    return "";
  }
  if (eventType !== "payment") return "";
  return obligationViewerActsAsCollector(direction, isSharedViewer) ? "+" : "−";
}
