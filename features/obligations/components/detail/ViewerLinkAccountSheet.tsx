import { BottomSheet } from "../../../../components/ui/BottomSheet";
import { FormFeedbackProvider, FormSubmitBar, FormFieldGroup } from "../../../../components/ui/FormFeedback";
import { selectedAccountField } from "../../../../lib/form-field-rules";
import { Text, TouchableOpacity, View, type StyleProp, type ViewStyle, type TextStyle } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";


import { formatCurrency } from "../../../../components/ui/AmountDisplay";

import { parseDisplayDate } from "../../../../lib/date";
import { obligationViewerActsAsCollector } from "../../../../lib/obligation-viewer-labels";
import type { ViewerEventAccountImpactCopy } from "../../../../lib/obligation-viewer-account-impact";
import type { AccountSummary, ObligationEventSummary, ObligationSummary, SharedObligationSummary } from "../../../../types/domain";

export type ViewerLinkAccountSheetStyles = {
  overlay: StyleProp<ViewStyle>;
  linkSheet: StyleProp<ViewStyle>;
  eventMenuHandle: StyleProp<ViewStyle>;
  linkSheetTitle: StyleProp<TextStyle>;
  linkSheetSub: StyleProp<TextStyle>;
  linkSheetHint: StyleProp<TextStyle>;
  linkSheetImpactCard: StyleProp<ViewStyle>;
  linkSheetImpactCardPositive: StyleProp<ViewStyle>;
  linkSheetImpactCardNegative: StyleProp<ViewStyle>;
  linkSheetImpactCardNeutral: StyleProp<ViewStyle>;
  linkSheetImpactTitle: StyleProp<TextStyle>;
  linkSheetImpactTitlePositive: StyleProp<TextStyle>;
  linkSheetImpactTitleNegative: StyleProp<TextStyle>;
  linkSheetImpactTitleNeutral: StyleProp<TextStyle>;
  linkSheetImpactBody: StyleProp<TextStyle>;
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
  linkNoAccounts: StyleProp<TextStyle>;
};

type Props = {
  styles: ViewerLinkAccountSheetStyles;
  linkingEvent: ObligationEventSummary | null;
  linkingAccountId: number | null;
  obligation: ObligationSummary | SharedObligationSummary | null;
  accounts: AccountSummary[];
  viewerLinkExists: boolean;
  viewerLinkDelta: number;
  viewerProjectedAccount: AccountSummary | null;
  viewerProjectedBalance: number | null;
  linkingEventImpactCopy: ViewerEventAccountImpactCopy | null;
  insetBottom: number;
  linkIsPending: boolean;
  onClose: () => void;
  onSelectAccount: (accountId: number) => void;
  onConfirm: () => void | Promise<void>;
};

export function ViewerLinkAccountSheet({
  styles,
  linkingEvent,
  linkingAccountId,
  obligation,
  accounts,
  viewerLinkExists,
  viewerLinkDelta,
  viewerProjectedAccount,
  viewerProjectedBalance,
  linkingEventImpactCopy,
  insetBottom,
  linkIsPending,
  onClose,
  onSelectAccount,
  onConfirm,
}: Props) {
  const submit = onConfirm;
  const validationFields = { accountId: selectedAccountField(linkingAccountId, accounts) };
  return (
    <FormFeedbackProvider visible={Boolean(linkingEvent)} resetKey={linkingEvent?.id} busy={linkIsPending} onSubmit={submit} fields={validationFields}>
    <BottomSheet entranceAnimation="springFade" visible={Boolean(linkingEvent)} onClose={onClose} title={viewerLinkExists ? "Cambiar cuenta asociada" : "Asociar a una cuenta"} snapHeight={0.9} footer={<FormSubmitBar label="Confirmar asociación" onSubmit={submit} loading={linkIsPending}></FormSubmitBar>}>

          {linkingEvent && obligation ? (
            <Text style={styles.linkSheetSub}>
              {linkingEvent.eventType === "payment"
                ? (obligationViewerActsAsCollector(obligation.direction, true) ? "Cobro" : "Pago")
                : linkingEvent.eventType === "principal_increase"
                  ? (obligation.direction === "receivable" ? "Dinero recibido" : "Prestamo entregado")
                  : (obligation.direction === "receivable" ? "Devolucion de principal" : "Pago de principal")}{" "}
              de {formatCurrency(linkingEvent.amount, obligation.currencyCode)}{" "}
              - {format(parseDisplayDate(linkingEvent.eventDate), "d MMM yyyy", { locale: es })}
            </Text>
          ) : null}
          <Text style={styles.linkSheetHint}>
            {viewerLinkExists
              ? "Elige la nueva cuenta sobre la que se recalculara este movimiento real."
              : "Elige la cuenta en la que quieres reflejar este evento como movimiento real."}
          </Text>
          {linkingEventImpactCopy ? (
            <View
              style={[
                styles.linkSheetImpactCard,
                linkingEventImpactCopy.tone === "positive"
                  ? styles.linkSheetImpactCardPositive
                  : linkingEventImpactCopy.tone === "negative"
                    ? styles.linkSheetImpactCardNegative
                    : styles.linkSheetImpactCardNeutral,
              ]}
            >
              <Text
                style={[
                  styles.linkSheetImpactTitle,
                  linkingEventImpactCopy.tone === "positive"
                    ? styles.linkSheetImpactTitlePositive
                    : linkingEventImpactCopy.tone === "negative"
                      ? styles.linkSheetImpactTitleNegative
                      : styles.linkSheetImpactTitleNeutral,
                ]}
              >
                {linkingEventImpactCopy.chipLabel}
              </Text>
              <Text style={styles.linkSheetImpactBody}>{linkingEventImpactCopy.note}</Text>
            </View>
          ) : null}
          <FormFieldGroup fieldId="accountId" label="Cuenta">{accounts.map((acc) => (
            <TouchableOpacity
              key={acc.id}
              style={[
                styles.linkAccountRow,
                linkingAccountId === acc.id && styles.linkAccountRowSelected,
              ]}
              onPress={() => onSelectAccount(acc.id)}
            >
              <View style={styles.linkAccountInfo}>
                <Text style={styles.linkAccountName}>{acc.name}</Text>
                <Text style={styles.linkAccountBalance}>
                  {formatCurrency(acc.currentBalance, acc.currencyCode)}
                </Text>
              </View>
              {linkingAccountId === acc.id ? (
                <Text style={styles.linkAccountCheck}>OK</Text>
              ) : null}
            </TouchableOpacity>
          ))}</FormFieldGroup>
          {viewerProjectedAccount && viewerProjectedBalance != null ? (
            <View style={styles.accountProjectionCard}>
              <Text style={styles.accountProjectionTitle}>Proyectado para {viewerProjectedAccount.name}</Text>
              <View style={styles.accountProjectionRow}>
                <Text style={styles.accountProjectionLabel}>Saldo actual</Text>
                <Text style={styles.accountProjectionValue}>
                  {formatCurrency(viewerProjectedAccount.currentBalance, viewerProjectedAccount.currencyCode)}
                </Text>
              </View>
              <View style={styles.accountProjectionRow}>
                <Text style={styles.accountProjectionLabel}>Movimiento</Text>
                <Text
                  style={[
                    styles.accountProjectionValue,
                    viewerLinkDelta >= 0 ? styles.accountProjectionPositive : styles.accountProjectionNegative,
                  ]}
                >
                  {viewerLinkDelta >= 0 ? "+" : "-"}
                  {formatCurrency(Math.abs(viewerLinkDelta), viewerProjectedAccount.currencyCode)}
                </Text>
              </View>
              <View style={styles.accountProjectionRow}>
                <Text style={styles.accountProjectionLabel}>Quedara en</Text>
                <Text style={styles.accountProjectionStrong}>
                  {formatCurrency(viewerProjectedBalance, viewerProjectedAccount.currencyCode)}
                </Text>
              </View>
            </View>
          ) : null}
          {accounts.length === 0 ? (
            <Text style={styles.linkNoAccounts}>No tienes cuentas registradas en este workspace</Text>
          ) : null}

    </BottomSheet>
    </FormFeedbackProvider>
  );
}
