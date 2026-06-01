import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { CheckCircle, XCircle } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { parseDisplayDate } from "../../../../lib/date";
import { firstMeaningfulText } from "../../../../lib/text-utils";
import {
  obligationHistoryEventAmountPrefix,
  obligationHistoryEventColor,
} from "../../../../lib/obligation-viewer-labels";
import type { PendingOwnerDeleteRequest } from "../../../../lib/obligation-event-payloads";
import type {
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type OwnerDeleteRequestStyles = {
  section: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  ownerDeleteRequestCard: StyleProp<ViewStyle>;
  ownerDeleteRequestHeader: StyleProp<ViewStyle>;
  ownerDeleteRequestTitleWrap: StyleProp<ViewStyle>;
  ownerDeleteRequestEyebrow: StyleProp<TextStyle>;
  ownerDeleteRequestTitle: StyleProp<TextStyle>;
  ownerDeleteRequestStatus: StyleProp<ViewStyle>;
  ownerDeleteRequestStatusText: StyleProp<TextStyle>;
  ownerDeleteTargetCard: StyleProp<ViewStyle>;
  ownerDeleteTargetAccent: StyleProp<ViewStyle>;
  ownerDeleteTargetBody: StyleProp<ViewStyle>;
  ownerDeleteTargetTopRow: StyleProp<ViewStyle>;
  ownerDeleteTargetInfo: StyleProp<ViewStyle>;
  ownerDeleteTargetType: StyleProp<TextStyle>;
  ownerDeleteTargetDate: StyleProp<TextStyle>;
  ownerDeleteTargetAmount: StyleProp<TextStyle>;
  ownerDeleteTargetDesc: StyleProp<TextStyle>;
  ownerDeleteTargetDescMuted: StyleProp<TextStyle>;
  ownerDeleteRequestActions: StyleProp<ViewStyle>;
  ownerDeleteFocusBtn: StyleProp<ViewStyle>;
  ownerDeleteFocusText: StyleProp<TextStyle>;
  requestNoAccount: StyleProp<TextStyle>;
  ownerDeleteDecisionActions: StyleProp<ViewStyle>;
  acceptBtn: StyleProp<ViewStyle>;
  rejectBtn: StyleProp<ViewStyle>;
};

type Props = {
  obligation: ObligationSummary | SharedObligationSummary;
  pendingDeleteRequests: PendingOwnerDeleteRequest[];
  eventLabels: Record<string, string>;
  deleteEventIsPending: boolean;
  rejectIsPending: boolean;
  styles: OwnerDeleteRequestStyles;
  onApprove: (req: PendingOwnerDeleteRequest) => void;
  onReject: (req: PendingOwnerDeleteRequest) => void;
  onFocusEvent: (eventId: number) => void;
};

export function OwnerDeleteRequestList({
  obligation,
  pendingDeleteRequests,
  eventLabels,
  deleteEventIsPending,
  rejectIsPending,
  styles,
  onApprove,
  onReject,
  onFocusEvent,
}: Props) {
  if (pendingDeleteRequests.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Solicitudes de eliminacion ({pendingDeleteRequests.length})
      </Text>
      {pendingDeleteRequests.map((req) => {
        const targetType = req.event?.eventType ?? req.payload.eventType ?? null;
        const targetLabel = targetType ? eventLabels[targetType] ?? targetType : "Evento";
        const targetAmount = req.event?.amount ?? req.payload.amount ?? null;
        const targetDate = req.event?.eventDate ?? req.payload.eventDate ?? obligation.startDate;
        const targetTint = req.event
          ? obligationHistoryEventColor(req.event.eventType, obligation.direction, false)
          : COLORS.danger;
        const targetPrefix = req.event
          ? obligationHistoryEventAmountPrefix(req.event.eventType, obligation.direction, false)
          : "";
        const targetDescription = req.event
          ? firstMeaningfulText(req.event.description, req.event.reason, req.event.notes)
          : null;
        return (
          <View key={req.notification.id} style={styles.ownerDeleteRequestCard}>
            <View style={styles.ownerDeleteRequestHeader}>
              <View style={styles.ownerDeleteRequestTitleWrap}>
                <Text style={styles.ownerDeleteRequestEyebrow}>Solicitud de eliminacion</Text>
                <Text style={styles.ownerDeleteRequestTitle} numberOfLines={1}>
                  {req.payload.requestedByDisplayName ?? "Visualizador compartido"}
                </Text>
              </View>
              <View style={styles.ownerDeleteRequestStatus}>
                <Text style={styles.ownerDeleteRequestStatusText}>Pendiente</Text>
              </View>
            </View>

            <View style={styles.ownerDeleteTargetCard}>
              <View style={[styles.ownerDeleteTargetAccent, { backgroundColor: targetTint }]} />
              <View style={styles.ownerDeleteTargetBody}>
                <View style={styles.ownerDeleteTargetTopRow}>
                  <View style={styles.ownerDeleteTargetInfo}>
                    <Text style={[styles.ownerDeleteTargetType, { color: targetTint }]} numberOfLines={1}>
                      {targetLabel}
                    </Text>
                    <Text style={styles.ownerDeleteTargetDate}>
                      {format(parseDisplayDate(targetDate), "d MMM yyyy", { locale: es })}
                    </Text>
                  </View>
                  <Text style={[styles.ownerDeleteTargetAmount, { color: targetTint }]} numberOfLines={1}>
                    {targetAmount != null
                      ? `${targetPrefix}${formatCurrency(targetAmount, obligation.currencyCode)}`
                      : "Sin monto"}
                  </Text>
                </View>
                {targetDescription ? (
                  <Text style={styles.ownerDeleteTargetDesc} numberOfLines={2}>
                    {targetDescription}
                  </Text>
                ) : (
                  <Text style={styles.ownerDeleteTargetDescMuted}>
                    {req.event
                      ? "Este evento no tiene descripcion visible."
                      : "El evento ya no esta disponible en el historial."}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.ownerDeleteRequestActions}>
              {req.event ? (
                <TouchableOpacity
                  style={styles.ownerDeleteFocusBtn}
                  onPress={() => req.event && onFocusEvent(req.event.id)}
                  activeOpacity={0.86}
                >
                  <Text style={styles.ownerDeleteFocusText}>Ver evento</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.requestNoAccount}>
                  Puedes aceptar para cerrar la solicitud pendiente.
                </Text>
              )}
              <View style={styles.ownerDeleteDecisionActions}>
                <TouchableOpacity
                  style={styles.acceptBtn}
                  onPress={() => onApprove(req)}
                  disabled={deleteEventIsPending}
                >
                  <CheckCircle size={20} color={COLORS.income} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectBtn}
                  onPress={() => onReject(req)}
                  disabled={rejectIsPending}
                >
                  <XCircle size={20} color={COLORS.danger} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
