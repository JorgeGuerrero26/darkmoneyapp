import {
  Text,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { parseDisplayDate } from "../../../../lib/date";
import { firstMeaningfulText } from "../../../../lib/text-utils";
import type {
  EventDeleteStatus,
  EventEditStatus,
} from "../../../../lib/obligation-event-payloads";
import type {
  ObligationEventSummary,
  ObligationPaymentRequest,
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type ViewerRequestsSectionStyles = {
  section: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  sectionHint: StyleProp<TextStyle>;
  requestGroupTitle: StyleProp<TextStyle>;
  viewerRequestCard: StyleProp<ViewStyle>;
  viewerRequestHeader: StyleProp<ViewStyle>;
  viewerRequestAmount: StyleProp<TextStyle>;
  viewerRequestStatus: StyleProp<ViewStyle>;
  viewerRequestStatusText: StyleProp<TextStyle>;
  viewerRequestDate: StyleProp<TextStyle>;
  viewerRequestDesc: StyleProp<TextStyle>;
  viewerRequestNote: StyleProp<TextStyle>;
  viewerEmptyState: StyleProp<ViewStyle>;
  viewerEmptyStateText: StyleProp<TextStyle>;
};

type Props = {
  obligation: ObligationSummary | SharedObligationSummary;
  viewerPaymentRequests: ObligationPaymentRequest[];
  viewerEditRequests: EventEditStatus[];
  viewerDeleteRequests: EventDeleteStatus[];
  eventsForDetail: ObligationEventSummary[];
  linkedEventIds: Set<number>;
  eventLabels: Record<string, string>;
  styles: ViewerRequestsSectionStyles;
};

export function ViewerRequestsSection({
  obligation,
  viewerPaymentRequests,
  viewerEditRequests,
  viewerDeleteRequests,
  eventsForDetail,
  linkedEventIds,
  eventLabels,
  styles,
}: Props) {
  const totalRequests =
    viewerPaymentRequests.length + viewerEditRequests.length + viewerDeleteRequests.length;

  if (totalRequests === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mis solicitudes</Text>
        <View style={styles.viewerEmptyState}>
          <Text style={styles.viewerEmptyStateText}>
            Aún no tienes solicitudes en esta obligación.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mis solicitudes</Text>
        <Text style={styles.sectionHint}>
          Seguimiento de lo que enviaste al propietario y aun requiere respuesta o ya fue respondido.
        </Text>
      </View>

      {viewerPaymentRequests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.requestGroupTitle}>Pagos y cobros</Text>
          {viewerPaymentRequests.map((req) => {
            const isPending = req.status === "pending";
            const isAccepted = req.status === "accepted";
            const isRejected = req.status === "rejected";
            const statusColor = isAccepted ? COLORS.income : isRejected ? COLORS.danger : COLORS.warning;
            const statusLabel = isAccepted ? "Aceptada" : isRejected ? "Rechazada" : "Pendiente";
            const autoLinked = isAccepted && req.acceptedEventId != null && linkedEventIds.has(req.acceptedEventId);
            return (
              <View
                key={req.id}
                style={[styles.viewerRequestCard, { borderColor: statusColor + "44" }]}
              >
                <View style={styles.viewerRequestHeader}>
                  <Text style={styles.viewerRequestAmount}>
                    {formatCurrency(req.amount, obligation.currencyCode)}
                  </Text>
                  <View style={[styles.viewerRequestStatus, { backgroundColor: statusColor + "22" }]}>
                    <Text style={[styles.viewerRequestStatusText, { color: statusColor }]}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>
                <Text style={styles.viewerRequestDate}>
                  {format(parseDisplayDate(req.paymentDate), "d MMM yyyy", { locale: es })}
                </Text>
                {req.description ? (
                  <Text style={styles.viewerRequestDesc} numberOfLines={1}>{req.description}</Text>
                ) : null}
                {isAccepted && autoLinked ? (
                  <Text style={[styles.viewerRequestNote, { color: COLORS.income }]}>
                    Movimiento registrado en tu cuenta
                  </Text>
                ) : isAccepted && !autoLinked && req.viewerAccountId ? (
                  <Text style={[styles.viewerRequestNote, { color: COLORS.warning }]}>
                    Registrando movimiento...
                  </Text>
                ) : isAccepted ? (
                  <Text style={styles.viewerRequestNote}>Sin cuenta asociada - asocia el evento manualmente</Text>
                ) : null}
                {isRejected && req.rejectionReason ? (
                  <Text style={[styles.viewerRequestNote, { color: COLORS.danger }]}>
                    Motivo: {req.rejectionReason}
                  </Text>
                ) : null}
                {isPending ? (
                  <Text style={styles.viewerRequestNote}>Esperando confirmacion del propietario</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {viewerEditRequests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.requestGroupTitle}>Cambios de evento</Text>
          {viewerEditRequests.map((req) => {
            const isPending = req.status === "pending";
            const isAccepted = req.status === "accepted";
            const isRejected = req.status === "rejected";
            const statusColor = isAccepted ? COLORS.income : isRejected ? COLORS.danger : COLORS.warning;
            const statusLabel = isAccepted ? "Aceptada" : isRejected ? "Rechazada" : "Pendiente";
            return (
              <View
                key={req.notification.id}
                style={[styles.viewerRequestCard, { borderColor: statusColor + "44" }]}
              >
                <View style={styles.viewerRequestHeader}>
                  <Text style={styles.viewerRequestAmount}>
                    {req.payload.proposedAmount != null
                      ? formatCurrency(req.payload.proposedAmount, obligation.currencyCode)
                      : "Edicion"}
                  </Text>
                  <View style={[styles.viewerRequestStatus, { backgroundColor: statusColor + "22" }]}>
                    <Text style={[styles.viewerRequestStatusText, { color: statusColor }]}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>
                <Text style={styles.viewerRequestDate}>
                  {format(
                    parseDisplayDate(
                      req.payload.proposedEventDate ?? req.payload.currentEventDate ?? obligation.startDate,
                    ),
                    "d MMM yyyy",
                    { locale: es },
                  )}
                </Text>
                <Text style={styles.viewerRequestDesc} numberOfLines={2}>
                  {req.payload.proposedDescription?.trim()
                    || req.payload.currentDescription?.trim()
                    || "Cambio en el evento"}
                </Text>
                <Text style={styles.viewerRequestNote}>
                  Antes:{" "}
                  {req.payload.currentAmount != null
                    ? formatCurrency(req.payload.currentAmount, obligation.currencyCode)
                    : "Sin dato"}
                  {"  "}
                  Ahora:{" "}
                  {req.payload.proposedAmount != null
                    ? formatCurrency(req.payload.proposedAmount, obligation.currencyCode)
                    : "Sin cambio"}
                </Text>
                {isAccepted ? (
                  <Text style={[styles.viewerRequestNote, { color: COLORS.income }]}>
                    La edicion fue aprobada y el evento ya se actualizo.
                  </Text>
                ) : null}
                {isRejected ? (
                  <Text style={[styles.viewerRequestNote, { color: COLORS.danger }]}>
                    {req.payload.rejectionReason?.trim()
                      ? `Motivo: ${req.payload.rejectionReason.trim()}`
                      : "La solicitud fue rechazada"}
                  </Text>
                ) : null}
                {isPending ? (
                  <Text style={styles.viewerRequestNote}>Esperando confirmacion del propietario</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {viewerDeleteRequests.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.requestGroupTitle}>Eliminaciones de evento</Text>
          {viewerDeleteRequests.map((req) => {
            const isPending = req.status === "pending";
            const isAccepted = req.status === "accepted";
            const isRejected = req.status === "rejected";
            const statusColor = isAccepted ? COLORS.income : isRejected ? COLORS.danger : COLORS.warning;
            const statusLabel = isAccepted ? "Aceptada" : isRejected ? "Rechazada" : "Pendiente";
            const targetEvent = eventsForDetail.find((event) => event.id === req.payload.eventId) ?? null;
            const targetType = targetEvent?.eventType ?? req.payload.eventType ?? null;
            const targetLabel = targetType ? eventLabels[targetType] ?? targetType : "Evento";
            const targetDate = targetEvent?.eventDate ?? req.payload.eventDate ?? obligation.startDate;
            const targetAmount = targetEvent?.amount ?? req.payload.amount ?? null;
            const targetDescription = targetEvent
              ? firstMeaningfulText(targetEvent.description, targetEvent.reason, targetEvent.notes)
              : null;
            return (
              <View
                key={req.notification.id}
                style={[styles.viewerRequestCard, { borderColor: statusColor + "44" }]}
              >
                <View style={styles.viewerRequestHeader}>
                  <Text style={styles.viewerRequestAmount}>
                    {targetAmount != null
                      ? formatCurrency(targetAmount, obligation.currencyCode)
                      : "Eliminacion"}
                  </Text>
                  <View style={[styles.viewerRequestStatus, { backgroundColor: statusColor + "22" }]}>
                    <Text style={[styles.viewerRequestStatusText, { color: statusColor }]}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>
                <Text style={styles.viewerRequestDate}>
                  {format(parseDisplayDate(targetDate), "d MMM yyyy", { locale: es })}
                </Text>
                <Text style={styles.viewerRequestDesc} numberOfLines={2}>
                  {targetDescription ?? targetLabel}
                </Text>
                {isAccepted ? (
                  <Text style={[styles.viewerRequestNote, { color: COLORS.income }]}>
                    La eliminacion fue aprobada.
                  </Text>
                ) : null}
                {isRejected ? (
                  <Text style={[styles.viewerRequestNote, { color: COLORS.danger }]}>
                    {req.payload.rejectionReason?.trim()
                      ? `Motivo: ${req.payload.rejectionReason.trim()}`
                      : "La solicitud fue rechazada"}
                  </Text>
                ) : null}
                {isPending ? (
                  <Text style={styles.viewerRequestNote}>Esperando confirmacion del propietario</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </>
  );
}
