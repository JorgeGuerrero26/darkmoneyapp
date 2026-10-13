import { BottomSheet } from "../../../../components/ui/BottomSheet";
import { FormFeedbackProvider, FormSubmitBar, FormFieldGroup, FormActionButton } from "../../../../components/ui/FormFeedback";
import { selectedAccountField } from "../../../../lib/form-field-rules";
import { Text, TouchableOpacity, View, type StyleProp, type ViewStyle, type TextStyle } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";


import { formatCurrency } from "../../../../components/ui/AmountDisplay";

import { parseDisplayDate } from "../../../../lib/date";
import type { PendingOwnerEditRequest } from "../../../../lib/obligation-event-payloads";
import type { AccountSummary, ObligationSummary, SharedObligationSummary } from "../../../../types/domain";

export type OwnerRespondEditRequestSheetStyles = {
  overlay: StyleProp<ViewStyle>;
  rejectSheet: StyleProp<ViewStyle>;
  rejectTitle: StyleProp<TextStyle>;
  rejectSub: StyleProp<TextStyle>;
  ownerEditSummaryCard: StyleProp<ViewStyle>;
  ownerEditSummaryRow: StyleProp<ViewStyle>;
  ownerEditSummaryLabel: StyleProp<TextStyle>;
  ownerEditSummaryValue: StyleProp<TextStyle>;
  ownerEditSummaryStrong: StyleProp<TextStyle>;
  viewerRequestNote: StyleProp<TextStyle>;
  linkSheetHint: StyleProp<TextStyle>;
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
  requestNoAccount: StyleProp<TextStyle>;
  rejectConfirmBtn: StyleProp<ViewStyle>;
};

type Props = {
  styles: OwnerRespondEditRequestSheetStyles;
  ownerEditRequestTarget: PendingOwnerEditRequest | null;
  obligation: ObligationSummary | SharedObligationSummary | null;
  ownerAccounts: AccountSummary[];
  ownerAccountLabel: string;
  ownerEditResponseAccountId: number | null;
  ownerEditPreviousAccount: AccountSummary | null;
  ownerEditPreviousProjectedBalance: number | null;
  ownerEditSelectedAccount: AccountSummary | null;
  ownerEditSelectedProjectedBalance: number | null;
  ownerEditCurrentAmount: number;
  ownerEditProposedAmount: number;
  ownerEditCurrentDelta: number;
  ownerEditProposedDelta: number;
  insetBottom: number;
  acceptIsPending: boolean;
  rejectIsPending: boolean;
  onSelectAccount: (accountId: number) => void;
  onAccept: (target: PendingOwnerEditRequest) => void | Promise<void>;
  onReject: (target: PendingOwnerEditRequest) => void | Promise<void>;
  onCancel: () => void;
};

export function OwnerRespondEditRequestSheet({
  styles,
  ownerEditRequestTarget,
  obligation,
  ownerAccounts,
  ownerAccountLabel,
  ownerEditResponseAccountId,
  ownerEditPreviousAccount,
  ownerEditPreviousProjectedBalance,
  ownerEditSelectedAccount,
  ownerEditSelectedProjectedBalance,
  ownerEditCurrentAmount,
  ownerEditProposedAmount,
  ownerEditCurrentDelta,
  ownerEditProposedDelta,
  insetBottom,
  acceptIsPending,
  rejectIsPending,
  onSelectAccount,
  onAccept,
  onReject,
  onCancel,
}: Props) {
  const submit = () => ownerEditRequestTarget ? onAccept(ownerEditRequestTarget) : undefined;
  const validationFields = { accountId: selectedAccountField(ownerEditResponseAccountId, ownerAccounts, ownerAccounts.length === 0) };
  return (
    <FormFeedbackProvider visible={Boolean(ownerEditRequestTarget)} resetKey={ownerEditRequestTarget?.notification.id} busy={acceptIsPending || rejectIsPending} onSubmit={submit} fields={validationFields}>
    <BottomSheet entranceAnimation="springFade" visible={Boolean(ownerEditRequestTarget)} onClose={onCancel} title={"Responder edición"} snapHeight={0.9} footer={<FormSubmitBar label="Aprobar" onSubmit={submit} loading={acceptIsPending || rejectIsPending} disabled={!ownerEditRequestTarget?.event}><FormActionButton label="Rechazar" variant="secondary" style={{ flex: 1 }} onAction={() => ownerEditRequestTarget ? onReject(ownerEditRequestTarget) : undefined} /></FormSubmitBar>}>
          {ownerEditRequestTarget && obligation ? (
            <>
              <Text style={styles.rejectSub}>
                {ownerEditRequestTarget.payload.requestedByDisplayName ?? "Visualizador compartido"}
                {" - "}
                {ownerEditRequestTarget.payload.proposedAmount != null
                  ? formatCurrency(ownerEditRequestTarget.payload.proposedAmount, obligation.currencyCode)
                  : "Edicion"}
              </Text>
              <View style={styles.ownerEditSummaryCard}>
                <View style={styles.ownerEditSummaryRow}>
                  <Text style={styles.ownerEditSummaryLabel}>Monto actual</Text>
                  <Text style={styles.ownerEditSummaryValue}>
                    {ownerEditRequestTarget.payload.currentAmount != null
                      ? formatCurrency(ownerEditRequestTarget.payload.currentAmount, obligation.currencyCode)
                      : "Sin dato"}
                  </Text>
                </View>
                <View style={styles.ownerEditSummaryRow}>
                  <Text style={styles.ownerEditSummaryLabel}>Monto propuesto</Text>
                  <Text style={styles.ownerEditSummaryStrong}>
                    {ownerEditRequestTarget.payload.proposedAmount != null
                      ? formatCurrency(ownerEditRequestTarget.payload.proposedAmount, obligation.currencyCode)
                      : "Sin cambio"}
                  </Text>
                </View>
                <View style={styles.ownerEditSummaryRow}>
                  <Text style={styles.ownerEditSummaryLabel}>Fecha actual</Text>
                  <Text style={styles.ownerEditSummaryValue}>
                    {ownerEditRequestTarget.payload.currentEventDate
                      ? format(parseDisplayDate(ownerEditRequestTarget.payload.currentEventDate), "d MMM yyyy", { locale: es })
                      : "Sin dato"}
                  </Text>
                </View>
                <View style={styles.ownerEditSummaryRow}>
                  <Text style={styles.ownerEditSummaryLabel}>Fecha propuesta</Text>
                  <Text style={styles.ownerEditSummaryValue}>
                    {ownerEditRequestTarget.payload.proposedEventDate
                      ? format(parseDisplayDate(ownerEditRequestTarget.payload.proposedEventDate), "d MMM yyyy", { locale: es })
                      : "Sin cambio"}
                  </Text>
                </View>
                {ownerEditRequestTarget.payload.proposedDescription?.trim() ? (
                  <Text style={styles.viewerRequestNote}>
                    Descripcion: {ownerEditRequestTarget.payload.proposedDescription.trim()}
                  </Text>
                ) : null}
                {ownerEditRequestTarget.payload.proposedNotes?.trim() ? (
                  <Text style={styles.viewerRequestNote}>
                    Notas: {ownerEditRequestTarget.payload.proposedNotes.trim()}
                  </Text>
                ) : null}
              </View>
              {!ownerEditRequestTarget.event ? (
                <Text style={styles.viewerRequestNote}>
                  El evento ya no esta disponible para editar.
                </Text>
              ) : null}
              {ownerEditRequestTarget.event && ownerAccounts.length > 0 ? (
                <>
                  <Text style={styles.linkSheetHint}>
                    Elige la cuenta donde quedara reflejado este movimiento despues de aprobar la edicion
                  </Text>
                  <Text style={styles.ownerAccountLabel}>{ownerAccountLabel}</Text>
                  <FormFieldGroup fieldId="accountId" label="Cuenta">{ownerAccounts.map((acc) => (
                    <TouchableOpacity
                      key={acc.id}
                      style={[
                        styles.linkAccountRow,
                        ownerEditResponseAccountId === acc.id && styles.linkAccountRowSelected,
                      ]}
                      onPress={() => onSelectAccount(acc.id)}
                    >
                      <View style={styles.linkAccountInfo}>
                        <Text style={styles.linkAccountName}>{acc.name}</Text>
                        <Text style={styles.linkAccountBalance}>
                          {formatCurrency(acc.currentBalance, acc.currencyCode)}
                        </Text>
                      </View>
                      {ownerEditResponseAccountId === acc.id ? (
                        <Text style={styles.linkAccountCheck}>OK</Text>
                      ) : null}
                    </TouchableOpacity>
                  ))}</FormFieldGroup>
                  {ownerEditPreviousAccount && ownerEditPreviousProjectedBalance != null ? (
                    <View style={styles.accountProjectionCard}>
                      <Text style={styles.accountProjectionTitle}>
                        Asi quedara la cuenta anterior: {ownerEditPreviousAccount.name}
                      </Text>
                      <View style={styles.accountProjectionRow}>
                        <Text style={styles.accountProjectionLabel}>Saldo actual</Text>
                        <Text style={styles.accountProjectionValue}>
                          {formatCurrency(ownerEditPreviousAccount.currentBalance, ownerEditPreviousAccount.currencyCode)}
                        </Text>
                      </View>
                      <View style={styles.accountProjectionRow}>
                        <Text style={styles.accountProjectionLabel}>Reversion del movimiento actual</Text>
                        <Text
                          style={[
                            styles.accountProjectionValue,
                            ownerEditCurrentDelta >= 0 ? styles.accountProjectionNegative : styles.accountProjectionPositive,
                          ]}
                        >
                          {ownerEditCurrentDelta >= 0 ? "-" : "+"}
                          {formatCurrency(Math.abs(ownerEditCurrentAmount), ownerEditPreviousAccount.currencyCode)}
                        </Text>
                      </View>
                      <View style={styles.accountProjectionRow}>
                        <Text style={styles.accountProjectionLabel}>Quedara en</Text>
                        <Text style={styles.accountProjectionStrong}>
                          {formatCurrency(ownerEditPreviousProjectedBalance, ownerEditPreviousAccount.currencyCode)}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {ownerEditSelectedAccount && ownerEditSelectedProjectedBalance != null ? (
                    <View style={styles.accountProjectionCard}>
                      <Text style={styles.accountProjectionTitle}>
                        Asi quedara la cuenta seleccionada: {ownerEditSelectedAccount.name}
                      </Text>
                      <View style={styles.accountProjectionRow}>
                        <Text style={styles.accountProjectionLabel}>Saldo actual</Text>
                        <Text style={styles.accountProjectionValue}>
                          {formatCurrency(ownerEditSelectedAccount.currentBalance, ownerEditSelectedAccount.currencyCode)}
                        </Text>
                      </View>
                      <View style={styles.accountProjectionRow}>
                        <Text style={styles.accountProjectionLabel}>
                          {ownerEditSelectedAccount.id === ownerEditPreviousAccount?.id
                            ? "Ajuste neto del movimiento"
                            : "Nuevo movimiento"}
                        </Text>
                        <Text
                          style={[
                            styles.accountProjectionValue,
                            (ownerEditSelectedAccount.id === ownerEditPreviousAccount?.id
                              ? ownerEditProposedDelta - ownerEditCurrentDelta
                              : ownerEditProposedDelta) >= 0
                              ? styles.accountProjectionPositive
                              : styles.accountProjectionNegative,
                          ]}
                        >
                          {(ownerEditSelectedAccount.id === ownerEditPreviousAccount?.id
                            ? ownerEditProposedDelta - ownerEditCurrentDelta
                            : ownerEditProposedDelta) >= 0
                            ? "+"
                            : "-"}
                          {formatCurrency(
                            Math.abs(
                              ownerEditSelectedAccount.id === ownerEditPreviousAccount?.id
                                ? ownerEditProposedAmount - ownerEditCurrentAmount
                                : ownerEditProposedAmount,
                            ),
                            ownerEditSelectedAccount.currencyCode,
                          )}
                        </Text>
                      </View>
                      <View style={styles.accountProjectionRow}>
                        <Text style={styles.accountProjectionLabel}>Quedara en</Text>
                        <Text style={styles.accountProjectionStrong}>
                          {formatCurrency(ownerEditSelectedProjectedBalance, ownerEditSelectedAccount.currencyCode)}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}
              {ownerEditRequestTarget.event && ownerAccounts.length === 0 ? (
                <Text style={styles.requestNoAccount}>
                  No tienes cuentas activas disponibles para reasignar este movimiento.
                </Text>
              ) : null}
            </>
          ) : null}

    </BottomSheet>
    </FormFeedbackProvider>
  );
}
