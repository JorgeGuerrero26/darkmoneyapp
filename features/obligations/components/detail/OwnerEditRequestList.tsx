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
import type { PendingOwnerEditRequest } from "../../../../lib/obligation-event-payloads";
import type {
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type OwnerEditRequestStyles = {
  section: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  requestCard: StyleProp<ViewStyle>;
  requestInfo: StyleProp<ViewStyle>;
  requestName: StyleProp<TextStyle>;
  requestAmount: StyleProp<TextStyle>;
  requestDate: StyleProp<TextStyle>;
  requestDesc: StyleProp<TextStyle>;
  requestNoAccount: StyleProp<TextStyle>;
  requestActions: StyleProp<ViewStyle>;
  acceptBtn: StyleProp<ViewStyle>;
  rejectBtn: StyleProp<ViewStyle>;
  viewerRequestNote: StyleProp<TextStyle>;
};

type Props = {
  obligation: ObligationSummary | SharedObligationSummary;
  pendingEditRequests: PendingOwnerEditRequest[];
  eventLabels: Record<string, string>;
  acceptIsPending: boolean;
  rejectIsPending: boolean;
  styles: OwnerEditRequestStyles;
  onSelectRequest: (req: PendingOwnerEditRequest) => void;
};

export function OwnerEditRequestList({
  obligation,
  pendingEditRequests,
  eventLabels,
  acceptIsPending,
  rejectIsPending,
  styles,
  onSelectRequest,
}: Props) {
  if (pendingEditRequests.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Solicitudes de edicion ({pendingEditRequests.length})
      </Text>
      {pendingEditRequests.map((req) => (
        <View key={req.notification.id} style={styles.requestCard}>
          <View style={styles.requestInfo}>
            <Text style={styles.requestName}>
              {req.payload.requestedByDisplayName ?? "Visualizador compartido"}
            </Text>
            <Text style={styles.requestAmount}>
              {req.payload.proposedAmount != null
                ? formatCurrency(req.payload.proposedAmount, obligation.currencyCode)
                : req.event
                  ? formatCurrency(req.event.amount, obligation.currencyCode)
                  : "Evento"}
            </Text>
            <Text style={styles.requestDate}>
              {format(
                parseDisplayDate(
                  req.payload.proposedEventDate ?? req.event?.eventDate ?? obligation.startDate,
                ),
                "d MMM yyyy",
                { locale: es },
              )}
            </Text>
            <Text style={styles.requestDesc} numberOfLines={2}>
              {req.payload.proposedDescription?.trim()
                || req.event?.description?.trim()
                || (req.payload.eventType ? eventLabels[req.payload.eventType] ?? req.payload.eventType : "Evento")}
            </Text>
            <Text style={styles.viewerRequestNote}>
              Antes:{" "}
              {req.payload.currentAmount != null
                ? formatCurrency(req.payload.currentAmount, obligation.currencyCode)
                : req.event
                  ? formatCurrency(req.event.amount, obligation.currencyCode)
                  : "Sin dato"}
              {"  "}
              Ahora:{" "}
              {req.payload.proposedAmount != null
                ? formatCurrency(req.payload.proposedAmount, obligation.currencyCode)
                : "Sin cambio"}
            </Text>
            {!req.event ? (
              <Text style={styles.requestNoAccount}>
                El evento ya no esta disponible para editar.
              </Text>
            ) : null}
          </View>
          <View style={styles.requestActions}>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => onSelectRequest(req)}
              disabled={acceptIsPending || !req.event}
            >
              <CheckCircle size={20} color={COLORS.income} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={() => onSelectRequest(req)}
              disabled={rejectIsPending}
            >
              <XCircle size={20} color={COLORS.danger} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}
