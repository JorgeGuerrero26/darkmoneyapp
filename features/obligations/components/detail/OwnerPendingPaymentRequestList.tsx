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
import type {
  ObligationPaymentRequest,
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type OwnerPendingPaymentRequestStyles = {
  section: StyleProp<ViewStyle>;
  sectionTitle: StyleProp<TextStyle>;
  requestCard: StyleProp<ViewStyle>;
  requestInfo: StyleProp<ViewStyle>;
  requestName: StyleProp<TextStyle>;
  requestAmount: StyleProp<TextStyle>;
  requestDate: StyleProp<TextStyle>;
  requestDesc: StyleProp<TextStyle>;
  requestAccountChip: StyleProp<ViewStyle>;
  requestAccountChipText: StyleProp<TextStyle>;
  requestNoAccount: StyleProp<TextStyle>;
  requestActions: StyleProp<ViewStyle>;
  acceptBtn: StyleProp<ViewStyle>;
  rejectBtn: StyleProp<ViewStyle>;
};

type Props = {
  obligation: ObligationSummary | SharedObligationSummary;
  pendingRequests: ObligationPaymentRequest[];
  acceptIsPending: boolean;
  styles: OwnerPendingPaymentRequestStyles;
  onAcceptPress: (req: ObligationPaymentRequest) => void;
  onRejectPress: (req: ObligationPaymentRequest) => void;
};

export function OwnerPendingPaymentRequestList({
  obligation,
  pendingRequests,
  acceptIsPending,
  styles,
  onAcceptPress,
  onRejectPress,
}: Props) {
  if (pendingRequests.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Solicitudes pendientes ({pendingRequests.length})
      </Text>
      {pendingRequests.map((req) => (
        <View key={req.id} style={styles.requestCard}>
          <View style={styles.requestInfo}>
            <Text style={styles.requestName}>
              {req.requestedByDisplayName ?? "Visualizador compartido"}
            </Text>
            <Text style={styles.requestAmount}>
              {formatCurrency(req.amount, obligation.currencyCode)}
            </Text>
            <Text style={styles.requestDate}>
              {format(parseDisplayDate(req.paymentDate), "d MMM yyyy", { locale: es })}
            </Text>
            {req.description ? (
              <Text style={styles.requestDesc} numberOfLines={2}>{req.description}</Text>
            ) : null}
            {req.viewerAccountId ? (
              <View style={styles.requestAccountChip}>
                <Text style={styles.requestAccountChipText}>
                  Se registrara en su cuenta al aceptar
                </Text>
              </View>
            ) : (
              <Text style={styles.requestNoAccount}>Sin cuenta asociada</Text>
            )}
          </View>
          <View style={styles.requestActions}>
            <TouchableOpacity
              style={styles.acceptBtn}
              onPress={() => onAcceptPress(req)}
              disabled={acceptIsPending}
            >
              <CheckCircle size={20} color={COLORS.income} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectBtn}
              onPress={() => onRejectPress(req)}
            >
              <XCircle size={20} color={COLORS.danger} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  );
}
