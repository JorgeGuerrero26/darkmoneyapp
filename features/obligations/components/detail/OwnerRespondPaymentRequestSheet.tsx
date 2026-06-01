import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "../../../../components/ui/Button";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { SPACING } from "../../../../constants/theme";
import { parseDisplayDate } from "../../../../lib/date";
import type {
  AccountSummary,
  ObligationPaymentRequest,
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type OwnerRespondPaymentRequestSheetStyles = {
  overlay: StyleProp<ViewStyle>;
  linkSheet: StyleProp<ViewStyle>;
  linkSheetTitle: StyleProp<TextStyle>;
  linkSheetSub: StyleProp<TextStyle>;
  linkSheetHint: StyleProp<TextStyle>;
  viewerRequestDesc: StyleProp<TextStyle>;
  ownerAccountLabel: StyleProp<TextStyle>;
  linkAccountRow: StyleProp<ViewStyle>;
  linkAccountRowSelected: StyleProp<ViewStyle>;
  linkAccountInfo: StyleProp<ViewStyle>;
  linkAccountName: StyleProp<TextStyle>;
  linkAccountBalance: StyleProp<TextStyle>;
  linkAccountCheck: StyleProp<TextStyle>;
  accountProjectionCard: StyleProp<ViewStyle>;
  accountProjectionTitle: StyleProp<TextStyle>;
  accountProjectionRow: StyleProp<ViewStyle>;
  accountProjectionLabel: StyleProp<TextStyle>;
  accountProjectionValue: StyleProp<TextStyle>;
  accountProjectionPositive: StyleProp<TextStyle>;
  accountProjectionNegative: StyleProp<TextStyle>;
  accountProjectionStrong: StyleProp<TextStyle>;
  rejectConfirmBtn: StyleProp<ViewStyle>;
};

type Props = {
  styles: OwnerRespondPaymentRequestSheetStyles;
  notificationRequestTarget: ObligationPaymentRequest | null;
  obligation: ObligationSummary | SharedObligationSummary | null;
  ownerAccounts: AccountSummary[];
  ownerResponseAccountId: number | null;
  ownerProjectedAccount: AccountSummary | null;
  ownerProjectedBalance: number | null;
  ownerRequestDelta: number;
  ownerAccountQuestion: string;
  ownerAccountLabel: string;
  insetBottom: number;
  acceptIsPending: boolean;
  onSelectAccount: (accountId: number | null) => void;
  onAccept: (req: ObligationPaymentRequest) => void;
  onReject: (req: ObligationPaymentRequest) => void;
  onCancel: () => void;
};

export function OwnerRespondPaymentRequestSheet({
  styles,
  notificationRequestTarget,
  obligation,
  ownerAccounts,
  ownerResponseAccountId,
  ownerProjectedAccount,
  ownerProjectedBalance,
  ownerRequestDelta,
  ownerAccountQuestion,
  ownerAccountLabel,
  insetBottom,
  acceptIsPending,
  onSelectAccount,
  onAccept,
  onReject,
  onCancel,
}: Props) {
  return (
    <Modal
      visible={Boolean(notificationRequestTarget)}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.overlay} onPress={onCancel}>
        <View
          style={[styles.linkSheet, { paddingBottom: insetBottom + SPACING.lg }]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.linkSheetTitle}>Responder solicitud</Text>
          {notificationRequestTarget && obligation ? (
            <>
              <Text style={styles.linkSheetSub}>
                {formatCurrency(notificationRequestTarget.amount, obligation.currencyCode)}
                {" - "}
                {format(parseDisplayDate(notificationRequestTarget.paymentDate), "d MMM yyyy", { locale: es })}
              </Text>
              {notificationRequestTarget.description ? (
                <Text style={styles.viewerRequestDesc}>{notificationRequestTarget.description}</Text>
              ) : null}
              <Text style={styles.linkSheetHint}>{ownerAccountQuestion}</Text>
              <Text style={styles.ownerAccountLabel}>{ownerAccountLabel}</Text>
              {ownerAccounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[
                    styles.linkAccountRow,
                    ownerResponseAccountId === acc.id && styles.linkAccountRowSelected,
                  ]}
                  onPress={() => onSelectAccount(acc.id)}
                >
                  <View style={styles.linkAccountInfo}>
                    <Text style={styles.linkAccountName}>{acc.name}</Text>
                    <Text style={styles.linkAccountBalance}>
                      {formatCurrency(acc.currentBalance, acc.currencyCode)}
                    </Text>
                  </View>
                  {ownerResponseAccountId === acc.id ? (
                    <Text style={styles.linkAccountCheck}>OK</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
              {ownerProjectedAccount && ownerProjectedBalance != null ? (
                <View style={styles.accountProjectionCard}>
                  <Text style={styles.accountProjectionTitle}>Proyectado para {ownerProjectedAccount.name}</Text>
                  <View style={styles.accountProjectionRow}>
                    <Text style={styles.accountProjectionLabel}>Saldo actual</Text>
                    <Text style={styles.accountProjectionValue}>
                      {formatCurrency(ownerProjectedAccount.currentBalance, ownerProjectedAccount.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.accountProjectionRow}>
                    <Text style={styles.accountProjectionLabel}>Movimiento</Text>
                    <Text
                      style={[
                        styles.accountProjectionValue,
                        ownerRequestDelta >= 0 ? styles.accountProjectionPositive : styles.accountProjectionNegative,
                      ]}
                    >
                      {ownerRequestDelta >= 0 ? "+" : "-"}
                      {formatCurrency(Math.abs(ownerRequestDelta), ownerProjectedAccount.currencyCode)}
                    </Text>
                  </View>
                  <View style={styles.accountProjectionRow}>
                    <Text style={styles.accountProjectionLabel}>Quedara en</Text>
                    <Text style={styles.accountProjectionStrong}>
                      {formatCurrency(ownerProjectedBalance, ownerProjectedAccount.currencyCode)}
                    </Text>
                  </View>
                </View>
              ) : null}
              <TouchableOpacity
                style={[
                  styles.linkAccountRow,
                  ownerResponseAccountId == null && styles.linkAccountRowSelected,
                ]}
                onPress={() => onSelectAccount(null)}
              >
                <View style={styles.linkAccountInfo}>
                  <Text style={styles.linkAccountName}>No registrar movimiento contable</Text>
                  <Text style={styles.linkAccountBalance}>Solo aceptar la solicitud sin cambiar tus cuentas</Text>
                </View>
                {ownerResponseAccountId == null ? (
                  <Text style={styles.linkAccountCheck}>OK</Text>
                ) : null}
              </TouchableOpacity>
            </>
          ) : null}
          <Button
            label="Aceptar"
            onPress={() => {
              if (notificationRequestTarget) onAccept(notificationRequestTarget);
            }}
            loading={acceptIsPending}
          />
          <Button
            label="Rechazar"
            variant="ghost"
            onPress={() => {
              if (notificationRequestTarget) onReject(notificationRequestTarget);
            }}
            style={styles.rejectConfirmBtn}
          />
          <Button
            label="Cancelar"
            variant="ghost"
            onPress={onCancel}
          />
        </View>
      </Pressable>
    </Modal>
  );
}
