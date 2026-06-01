import { ActivityIndicator, Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../ui/AmountDisplay";
import { COLORS } from "../../../constants/theme";
import { parseDisplayDate } from "../../../lib/date";
import type {
  AccountSummary,
  ObligationEventSummary,
} from "../../../types/domain";
import { styles } from "../ObligationAnalyticsModal.styles";

type Props = {
  linkingEvent: ObligationEventSummary | null;
  linkingAccountId: number | null;
  currency: string;
  viewerAccounts: AccountSummary[];
  viewerLinkAlreadyExists: boolean;
  viewerProjectedAccount: AccountSummary | null;
  viewerProjectedBalance: number | null;
  viewerLinkDelta: number;
  linkIsPending: boolean;
  onSelectAccount: (accountId: number) => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function AnalyticsViewerLinkAccountSheet({
  linkingEvent,
  linkingAccountId,
  currency,
  viewerAccounts,
  viewerLinkAlreadyExists,
  viewerProjectedAccount,
  viewerProjectedBalance,
  viewerLinkDelta,
  linkIsPending,
  onSelectAccount,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      visible={Boolean(linkingEvent)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.approvalOverlay} onPress={onClose}>
        <View
          style={styles.approvalSheet}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.approvalTitle}>
            {viewerLinkAlreadyExists ? "Cambiar cuenta asociada" : "Asociar a una cuenta"}
          </Text>
          {linkingEvent ? (
            <>
              <Text style={styles.approvalSub}>
                {formatCurrency(linkingEvent.amount, currency)}{" - "}
                {format(parseDisplayDate(linkingEvent.eventDate), "d MMM yyyy", { locale: es })}
              </Text>
              <Text style={styles.sectionHint}>
                {viewerLinkAlreadyExists
                  ? "Elige la nueva cuenta en la que se reflejara este movimiento"
                  : "Elige la cuenta en la que se refleja este movimiento"}
              </Text>
              {viewerAccounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.approvalAccountRow,
                    linkingAccountId === acc.id && styles.approvalAccountRowSelected,
                  ]}
                  onPress={() => onSelectAccount(acc.id)}
                >
                  <View style={styles.approvalAccountInfo}>
                    <Text style={styles.approvalAccountName}>{acc.name}</Text>
                    <Text style={styles.approvalAccountBalance}>
                      {formatCurrency(acc.currentBalance, acc.currencyCode)}
                    </Text>
                  </View>
                  {linkingAccountId === acc.id ? (
                    <Text style={styles.approvalAccountCheck}>OK</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
              {viewerProjectedAccount && viewerProjectedBalance != null ? (
                <View style={styles.approvalProjectionCard}>
                  <Text style={styles.approvalProjectionTitle}>Proyectado para {viewerProjectedAccount.name}</Text>
                  <View style={styles.approvalProjectionRow}>
                    <Text style={styles.approvalProjectionLabel}>Saldo actual</Text>
                    <Text style={styles.approvalProjectionValue}>
                      {formatCurrency(viewerProjectedAccount.currentBalance, viewerProjectedAccount.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.approvalProjectionRow}>
                    <Text style={styles.approvalProjectionLabel}>Movimiento</Text>
                    <Text
                      style={[
                        styles.approvalProjectionValue,
                        viewerLinkDelta >= 0 ? styles.approvalProjectionPositive : styles.approvalProjectionNegative,
                      ]}
                    >
                      {viewerLinkDelta >= 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(viewerLinkDelta), viewerProjectedAccount.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.approvalProjectionRow}>
                    <Text style={styles.approvalProjectionLabel}>Quedara en</Text>
                    <Text style={styles.approvalProjectionStrong}>
                      {formatCurrency(viewerProjectedBalance, viewerProjectedAccount.currencyCode)}
                    </Text>
                  </View>
                </View>
              ) : null}
              {viewerAccounts.length === 0 ? (
                <Text style={styles.viewerActionNote}>No tienes cuentas registradas en este workspace</Text>
              ) : null}
            </>
          ) : null}
          <View style={styles.approvalActions}>
            <TouchableOpacity
              style={[
                styles.approvalAcceptBtn,
                (!linkingAccountId || linkIsPending) && styles.viewerDisabledBtn,
              ]}
              onPress={onConfirm}
              disabled={!linkingAccountId || linkIsPending}
            >
              {linkIsPending ? (
                <ActivityIndicator size="small" color={COLORS.income} />
              ) : (
                <Text style={styles.approvalAcceptText}>Confirmar asociacion</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.approvalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}
