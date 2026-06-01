import { ActivityIndicator, Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../ui/AmountDisplay";
import { COLORS } from "../../../constants/theme";
import { parseDisplayDate } from "../../../lib/date";
import type {
  AccountSummary,
  ObligationPaymentRequest,
} from "../../../types/domain";
import { styles } from "../ObligationAnalyticsModal.styles";

type Props = {
  approvingRequest: ObligationPaymentRequest | null;
  currency: string;
  ownerAccountQuestion: string;
  ownerAccountLabel: string;
  ownerAccounts: AccountSummary[];
  approvalAccountId: number | null;
  approvalProjectedAccount: AccountSummary | null;
  approvalProjectedBalance: number | null;
  approvalDelta: number;
  acceptIsPending: boolean;
  onSelectAccount: (accountId: number | null) => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function AnalyticsApprovalSheet({
  approvingRequest,
  currency,
  ownerAccountQuestion,
  ownerAccountLabel,
  ownerAccounts,
  approvalAccountId,
  approvalProjectedAccount,
  approvalProjectedBalance,
  approvalDelta,
  acceptIsPending,
  onSelectAccount,
  onConfirm,
  onClose,
}: Props) {
  return (
    <Modal
      visible={Boolean(approvingRequest)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.approvalOverlay} onPress={onClose}>
        <View
          style={styles.approvalSheet}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.approvalTitle}>Aceptar solicitud</Text>
          {approvingRequest ? (
            <>
              <Text style={styles.approvalSub}>
                {formatCurrency(approvingRequest.amount, currency)}{" - "}
                {format(parseDisplayDate(approvingRequest.paymentDate), "d MMM yyyy", { locale: es })}
              </Text>
              {approvingRequest.description ? (
                <Text style={styles.eventDesc}>{approvingRequest.description}</Text>
              ) : null}
              <Text style={styles.sectionHint}>{ownerAccountQuestion}</Text>
              <Text style={styles.approvalLabel}>{ownerAccountLabel}</Text>
              {ownerAccounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.approvalAccountRow,
                    approvalAccountId === acc.id && styles.approvalAccountRowSelected,
                  ]}
                  onPress={() => onSelectAccount(acc.id)}
                >
                  <View style={styles.approvalAccountInfo}>
                    <Text style={styles.approvalAccountName}>{acc.name}</Text>
                    <Text style={styles.approvalAccountBalance}>
                      {formatCurrency(acc.currentBalance, acc.currencyCode)}
                    </Text>
                  </View>
                  {approvalAccountId === acc.id ? (
                    <Text style={styles.approvalAccountCheck}>OK</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
              {approvalProjectedAccount && approvalProjectedBalance != null ? (
                <View style={styles.approvalProjectionCard}>
                  <Text style={styles.approvalProjectionTitle}>Proyectado para {approvalProjectedAccount.name}</Text>
                  <View style={styles.approvalProjectionRow}>
                    <Text style={styles.approvalProjectionLabel}>Saldo actual</Text>
                    <Text style={styles.approvalProjectionValue}>
                      {formatCurrency(approvalProjectedAccount.currentBalance, approvalProjectedAccount.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.approvalProjectionRow}>
                    <Text style={styles.approvalProjectionLabel}>Movimiento</Text>
                    <Text
                      style={[
                        styles.approvalProjectionValue,
                        approvalDelta >= 0 ? styles.approvalProjectionPositive : styles.approvalProjectionNegative,
                      ]}
                    >
                      {approvalDelta >= 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(approvalDelta), approvalProjectedAccount.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.approvalProjectionRow}>
                    <Text style={styles.approvalProjectionLabel}>Quedara en</Text>
                    <Text style={styles.approvalProjectionStrong}>
                      {formatCurrency(approvalProjectedBalance, approvalProjectedAccount.currencyCode)}
                    </Text>
                  </View>
                </View>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.approvalAccountRow,
                  approvalAccountId == null && styles.approvalAccountRowSelected,
                ]}
                onPress={() => onSelectAccount(null)}
              >
                <View style={styles.approvalAccountInfo}>
                  <Text style={styles.approvalAccountName}>No registrar movimiento contable</Text>
                  <Text style={styles.approvalAccountBalance}>Solo aceptar la solicitud sin cambiar tus cuentas</Text>
                </View>
                {approvalAccountId == null ? (
                  <Text style={styles.approvalAccountCheck}>OK</Text>
                ) : null}
              </TouchableOpacity>
            </>
          ) : null}
          <View style={styles.approvalActions}>
            <TouchableOpacity
              style={styles.approvalAcceptBtn}
              onPress={onConfirm}
              disabled={acceptIsPending}
            >
              {acceptIsPending ? (
                <ActivityIndicator size="small" color={COLORS.income} />
              ) : (
                <Text style={styles.approvalAcceptText}>Aceptar</Text>
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
