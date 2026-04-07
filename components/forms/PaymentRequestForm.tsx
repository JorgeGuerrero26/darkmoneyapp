import { useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AlertCircle, Clock, Info } from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { todayPeru } from "../../lib/date";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import {
  useCreatePaymentRequestMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import { obligationViewerActsAsCollector } from "../../lib/obligation-viewer-labels";
import type { SharedObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  obligation: SharedObligationSummary;
};

export function PaymentRequestForm({ visible, onClose, onSuccess, obligation }: Props) {
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const haptics = useHaptics();
  const createRequest = useCreatePaymentRequestMutation();
  const scrollRef = useRef<ScrollView>(null);
  const amountRef = useRef<TextInput>(null);

  // Viewer's own accounts (from their active workspace)
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const viewerAccounts = (snapshot?.accounts ?? []).filter((a) => !a.isArchived);

  const today = todayPeru();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [description, setDescription] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [amountError, setAmountError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const actsAsCollector = obligationViewerActsAsCollector(obligation.direction, true);
  const verb = actsAsCollector ? "cobro" : "pago";
  const verbPast = actsAsCollector ? "cobrado" : "pagado";
  const accountLabel = actsAsCollector ? "Cuenta donde recibirás el cobro" : "Cuenta desde donde pagarás";
  const title = actsAsCollector ? "Solicitar cobro" : "Solicitar pago";
  const ownerName = obligation.share.ownerDisplayName?.trim() || "el propietario";

  function reset() {
    setAmount("");
    setPaymentDate(today);
    setDescription("");
    setSelectedAccountId(null);
    setAmountError("");
    setSubmitError("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setSubmitError("");
    setAmountError("");

    const numAmount = parseFloat(amount.replace(",", "."));
    if (!amount.trim() || isNaN(numAmount) || numAmount <= 0) {
      haptics.error();
      setAmountError(`Ingresa el monto del ${verb}`);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => amountRef.current?.focus(), 250);
      return;
    }

    if (!profile?.id) {
      haptics.error();
      setSubmitError("No hay sesión activa");
      return;
    }

    try {
      await createRequest.mutateAsync({
        obligationId: obligation.id,
        shareId: obligation.share.id,
        workspaceId: obligation.workspaceId,
        requestedByUserId: profile.id,
        requestedByDisplayName: profile.fullName ?? null,
        amount: numAmount,
        paymentDate,
        description: description.trim() || null,
        viewerAccountId: selectedAccountId,
        viewerWorkspaceId: selectedAccountId ? activeWorkspaceId : null,
        ownerUserId: obligation.share.ownerUserId,
        obligationTitle: obligation.title,
      });
      showToast(`Solicitud de ${verb} enviada a ${ownerName}`, "success");
      haptics.success();
      reset();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      haptics.error();
      setSubmitError(humanizeError(err));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title={title} scrollRef={scrollRef}>
      {submitError ? (
        <View style={styles.errorBanner}>
          <AlertCircle size={15} color={COLORS.danger} strokeWidth={2} />
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      ) : null}

      {/* Info box — explica el flujo */}
      <View style={styles.infoBox}>
        <View style={styles.infoBoxHeader}>
          <Info size={14} color={COLORS.primary} strokeWidth={2} />
          <Text style={styles.infoBoxTitle}>¿Cómo funciona?</Text>
        </View>
        <View style={styles.infoBoxSteps}>
          <View style={styles.infoStep}>
            <Text style={styles.infoStepNum}>1</Text>
            <Text style={styles.infoStepText}>
              Envías la solicitud a <Text style={styles.infoOwner}>{ownerName}</Text>, quien recibirá una notificación.
            </Text>
          </View>
          <View style={styles.infoStep}>
            <Text style={styles.infoStepNum}>2</Text>
            <Text style={styles.infoStepText}>
              {ownerName} revisa y <Text style={styles.infoStrong}>acepta o rechaza</Text> tu solicitud.
            </Text>
          </View>
          <View style={styles.infoStep}>
            <Text style={styles.infoStepNum}>3</Text>
            <Text style={styles.infoStepText}>
              Si aceptan, el {verbPast} quedará registrado automáticamente en la cuenta que elijas abajo.
            </Text>
          </View>
        </View>
        <View style={styles.pendingNotice}>
          <Clock size={12} color={COLORS.warning} strokeWidth={2} />
          <Text style={styles.pendingNoticeText}>
            No afecta tus cuentas hasta ser aceptada
          </Text>
        </View>
      </View>

      <CurrencyInput
        ref={amountRef}
        label={`Monto del ${verb} *`}
        value={amount}
        onChangeText={(v) => { setAmount(v); setAmountError(""); }}
        currencyCode={obligation.currencyCode}
        error={amountError}
      />

      <DatePickerInput
        label="Fecha *"
        value={paymentDate}
        onChange={setPaymentDate}
      />

      {/* Account selector */}
      <View style={styles.field}>
        <View style={styles.accountLabelRow}>
          <Text style={styles.fieldLabel}>{accountLabel}</Text>
          <Text style={styles.accountOptional}>opcional</Text>
        </View>
        {viewerAccounts.length === 0 ? (
          <View style={styles.noAccountsBox}>
            <Text style={styles.noAccountsText}>
              No tienes cuentas en este workspace. El movimiento se registrará sin asociar cuenta.
            </Text>
          </View>
        ) : (
          <View style={styles.accountList}>
            {viewerAccounts.map((acc) => {
              const selected = selectedAccountId === acc.id;
              return (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.accountRow, selected && styles.accountRowSelected]}
                  onPress={() => setSelectedAccountId(selected ? null : acc.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.accountRowInfo}>
                    <Text style={[styles.accountRowName, selected && styles.accountRowNameSelected]}>
                      {acc.name}
                    </Text>
                    <Text style={styles.accountRowBalance}>
                      {acc.currencyCode} {acc.currentBalance.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={[styles.accountRadio, selected && styles.accountRadioSelected]}>
                    {selected ? <View style={styles.accountRadioDot} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Descripción (opcional)</Text>
        <View style={styles.textAreaWrap}>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={setDescription}
            placeholder="Cuota de enero, abono parcial…"
            placeholderTextColor={COLORS.textDisabled}
            multiline
            numberOfLines={3}
          />
        </View>
      </View>

      <Button
        label={`Enviar solicitud de ${verb}`}
        onPress={handleSubmit}
        loading={createRequest.isPending}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    backgroundColor: COLORS.danger + "18",
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },
  errorText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    fontFamily: FONT_FAMILY.body,
  },
  infoBox: {
    backgroundColor: COLORS.primary + "12",
    borderWidth: 1,
    borderColor: COLORS.primary + "33",
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    gap: SPACING.sm,
  },
  infoBoxHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  infoBoxTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  infoBoxSteps: { gap: SPACING.xs },
  infoStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.xs,
  },
  infoStepNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.primary + "33",
    color: COLORS.primary,
    fontSize: 11,
    fontFamily: FONT_FAMILY.bodySemibold,
    textAlign: "center",
    lineHeight: 18,
    overflow: "hidden",
  },
  infoStepText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  infoOwner: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  infoStrong: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  pendingNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: COLORS.primary + "22",
    paddingTop: SPACING.xs,
  },
  pendingNoticeText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  field: { gap: SPACING.xs },
  fieldLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  accountLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  accountOptional: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
  },
  noAccountsBox: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: SPACING.sm,
  },
  noAccountsText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  accountList: { gap: SPACING.xs },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    gap: SPACING.sm,
  },
  accountRowSelected: {
    borderColor: COLORS.primary + "88",
    backgroundColor: COLORS.primary + "15",
  },
  accountRowInfo: { flex: 1, gap: 2 },
  accountRowName: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  accountRowNameSelected: {
    color: COLORS.ink,
  },
  accountRowBalance: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
  },
  accountRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  accountRadioSelected: {
    borderColor: COLORS.primary,
  },
  accountRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  textAreaWrap: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: SPACING.sm,
    minHeight: 80,
  },
  textArea: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.body,
    textAlignVertical: "top",
  },
});
