import { BottomSheet } from "../../../../components/ui/BottomSheet";
import { FormFeedbackProvider, FormSubmitBar, FormFieldGroup, FormActionButton } from "../../../../components/ui/FormFeedback";
import { selectedAccountField } from "../../../../lib/form-field-rules";
import { Text, TouchableOpacity, View, type StyleProp, type ViewStyle, type TextStyle } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";


import { formatCurrency } from "../../../../components/ui/AmountDisplay";

import { parseDisplayDate } from "../../../../lib/date";
import type { AccountSummary, ObligationPaymentRequest, ObligationSummary, SharedObligationSummary } from "../../../../types/domain";

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
  onAccept: (req: ObligationPaymentRequest) => void | Promise<void>;
  onReject: (req: ObligationPaymentRequest) => void | Promise<void>;
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
  const submit = () => notificationRequestTarget ? onAccept(notificationRequestTarget) : undefined;
  const validationFields = { accountId: selectedAccountField(ownerResponseAccountId, ownerAccounts, true) };
  return (
    <FormFeedbackProvider visible={Boolean(notificationRequestTarget)} resetKey={notificationRequestTarget?.id} busy={acceptIsPending} onSubmit={submit} fields={validationFields}>
    <BottomSheet entranceAnimation="springFade" visible={Boolean(notificationRequestTarget)} onClose={onCancel} title={"Responder solicitud"} snapHeight={0.9} footer={<FormSubmitBar label="Aceptar" onSubmit={submit} loading={acceptIsPending}><FormActionButton label="Rechazar" variant="secondary" style={{ flex: 1 }} onAction={() => notificationRequestTarget ? onReject(notificationRequestTarget) : undefined} /></FormSubmitBar>}>
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
              <FormFieldGroup fieldId="accountId" label="Cuenta">{ownerAccounts.map((acc) => (
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
              ))}</FormFieldGroup>
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

    </BottomSheet>
    </FormFeedbackProvider>
  );
}
