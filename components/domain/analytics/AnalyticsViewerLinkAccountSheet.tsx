import { BottomSheet } from "../../ui/BottomSheet";
import { FormFeedbackProvider, FormSubmitBar, FormFieldGroup } from "../../ui/FormFeedback";
import { selectedAccountField } from "../../../lib/form-field-rules";
import { Text, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../ui/AmountDisplay";

import { parseDisplayDate } from "../../../lib/date";
import type { AccountSummary, ObligationEventSummary } from "../../../types/domain";
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
  onConfirm: () => void | Promise<void>;
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
  const submit = onConfirm;
  const validationFields = { accountId: selectedAccountField(linkingAccountId, viewerAccounts) };
  return (
    <FormFeedbackProvider visible={Boolean(linkingEvent)} resetKey={linkingEvent?.id} busy={linkIsPending} onSubmit={submit} fields={validationFields}>
    <BottomSheet entranceAnimation="springFade" visible={Boolean(linkingEvent)} onClose={onClose} title={viewerLinkAlreadyExists ? "Cambiar cuenta asociada" : "Asociar a una cuenta"} snapHeight={0.9} footer={<FormSubmitBar label="Confirmar asociación" onSubmit={submit} loading={linkIsPending}></FormSubmitBar>}>

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
              <FormFieldGroup fieldId="accountId" label="Cuenta">{viewerAccounts.map((acc) => (
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
              ))}</FormFieldGroup>
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

    </BottomSheet>
    </FormFeedbackProvider>
  );
}
