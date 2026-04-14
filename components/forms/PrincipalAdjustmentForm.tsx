import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { TrendingUp, TrendingDown, ArrowRight, AlertCircle } from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { todayPeru } from "../../lib/date";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import {
  useCreatePrincipalAdjustmentMutation,
  useUpdateObligationEventMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import type { ObligationEventSummary, ObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { formatCurrency } from "../ui/AmountDisplay";
import { BalanceImpactPreview } from "../domain/BalanceImpactPreview";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type Mode = "increase" | "decrease";

type Props = {
  visible: boolean;
  mode: Mode;
  obligation: ObligationSummary | null;
  onClose: () => void;
  onSuccess?: () => void;
  /** Presente cuando se edita un evento existente en lugar de crear uno nuevo */
  editEvent?: ObligationEventSummary;
};

export function PrincipalAdjustmentForm({ visible, mode, obligation, onClose, onSuccess, editEvent }: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const haptics = useHaptics();
  const adjustmentWorkspaceId = obligation?.workspaceId ?? activeWorkspaceId ?? null;
  const mutation = useCreatePrincipalAdjustmentMutation(adjustmentWorkspaceId);
  const updateEventMutation = useUpdateObligationEventMutation();
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const isEditMode = Boolean(editEvent);
  const scrollRef = useRef<ScrollView>(null);
  const amountRef = useRef<TextInput>(null);
  const accountSectionYRef = useRef(0);

  const today = todayPeru();
  const [amount, setAmount] = useState("");
  const [eventDate, setEventDate] = useState(today);
  const [reason, setReason] = useState("");
  const [createMovement, setCreateMovement] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [amountError, setAmountError] = useState("");
  const [accountError, setAccountError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const initialRef = useRef({ amount: "", reason: "" });

  const activeAccounts = useMemo(
    () => sortByName(snapshot?.accounts.filter((a) => !a.isArchived) ?? []),
    [snapshot?.accounts],
  );

  const isIncrease = mode === "increase";
  const isReceivable = obligation?.direction === "receivable";
  const currencyCode = obligation?.currencyCode ?? "PEN";

  const currentPrincipal = obligation?.currentPrincipalAmount ?? obligation?.principalAmount ?? 0;

  const resultingAmount = useMemo(() => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) return null;
    return isIncrease ? currentPrincipal + parsed : Math.max(0, currentPrincipal - parsed);
  }, [amount, currentPrincipal, isIncrease]);
  const selectedAccount = useMemo(
    () => activeAccounts.find((account) => account.id === accountId) ?? null,
    [activeAccounts, accountId],
  );
  const projectedAccountDelta = useMemo(() => {
    const parsed = parseFloat(amount);
    if (!createMovement || !selectedAccount || !amount || isNaN(parsed) || parsed <= 0) return null;
    if (isIncrease) {
      return isReceivable ? -parsed : parsed;
    }
    return isReceivable ? parsed : -parsed;
  }, [amount, createMovement, isIncrease, isReceivable, selectedAccount]);
  const projectedAccountBalance = selectedAccount && projectedAccountDelta != null
    ? selectedAccount.currentBalance + projectedAccountDelta
    : null;

  useEffect(() => {
    if (!visible || !obligation) return;
    if (editEvent) {
      const initReason = editEvent.reason ?? editEvent.notes ?? "";
      setAmount(String(editEvent.amount));
      setEventDate(editEvent.eventDate);
      setReason(initReason);
      setCreateMovement(false);
      setAccountId(null);
      setAmountError("");
      setAccountError("");
      setSubmitError("");
      initialRef.current = { amount: String(editEvent.amount), reason: initReason };
    } else {
      setAmount("");
      setEventDate(today);
      setReason("");
      setCreateMovement(false);
      setAccountId(obligation.settlementAccountId ?? null);
      setAmountError("");
      setAccountError("");
      setSubmitError("");
      initialRef.current = { amount: "", reason: "" };
    }
  }, [visible, obligation, editEvent, today]);

  function handleClose() {
    const isDirty = isEditMode
      ? (amount !== initialRef.current.amount || reason.trim() !== initialRef.current.reason)
      : Boolean(amount || reason.trim());
    if (isDirty) {
      setShowDiscard(true);
    } else {
      onClose();
    }
  }

  async function handleSubmit() {
    setAmountError("");
    setAccountError("");
    setSubmitError("");
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      haptics.error();
      setAmountError("Ingresa un monto válido");
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => amountRef.current?.focus(), 250);
      return;
    }
    if (!isEditMode && createMovement && activeAccounts.length > 0 && accountId == null) {
      haptics.error();
      setAccountError("Selecciona una cuenta o desactiva el movimiento en cuenta");
      scrollRef.current?.scrollTo({ y: Math.max(0, accountSectionYRef.current - 24), animated: true });
      return;
    }
    if (!obligation) return;
    try {
      if (isEditMode && editEvent) {
        await updateEventMutation.mutateAsync({
          eventId: editEvent.id,
          obligationId: obligation.id,
          amount: parsed,
          eventDate,
          reason: reason.trim() || null,
          eventType: editEvent.eventType,
          currencyCode: obligation.currencyCode,
          obligationTitle: obligation.title,
        });
        showToast(isIncrease ? "Aumento actualizado ✓" : "Reducción actualizada ✓", "success");
      } else {
        await mutation.mutateAsync({
          obligationId: obligation.id,
          direction: obligation.direction,
          mode,
          amount: parsed,
          eventDate,
          reason: reason.trim() || null,
          createMovement,
          accountId: createMovement ? accountId : null,
        });
        showToast(isIncrease ? "Monto aumentado" : "Monto reducido", "success");
      }
      haptics.success();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      haptics.error();
      setSubmitError(humanizeError(err));
    }
  }

  const title = isEditMode
    ? (isIncrease ? "Editar aumento" : "Editar reducción")
    : (isIncrease ? "Agregar monto" : "Reducir monto");
  const accentColor = isIncrease ? COLORS.income : COLORS.expense;
  const Icon = isIncrease ? TrendingUp : TrendingDown;
  const description = isIncrease
    ? (obligation?.direction === "receivable"
        ? "Aumenta lo que te deben. El cambio quedará registrado en el historial."
        : "Aumenta lo que debes. El cambio quedará registrado en el historial.")
    : (obligation?.direction === "receivable"
        ? "Reduce el monto que te deben. El principal original no se borra."
        : "Reduce lo que debes. El principal original no se borra.");

  const movementImpactText = isIncrease
    ? (isReceivable
        ? "Crea un gasto real porque estas prestando mas dinero"
        : "Crea un ingreso real porque estas recibiendo mas dinero prestado")
    : (isReceivable
        ? "Crea un ingreso real porque estas recuperando parte del principal"
        : "Crea un gasto real porque estas pagando parte del principal");

  return (
    <>
      <BottomSheet visible={visible} onClose={handleClose} title={title} snapHeight={0.7} scrollRef={scrollRef}>
        {obligation && !isEditMode ? (
          <View style={styles.infoBox}>
            {/* Title row */}
            <View style={styles.infoRow}>
              <Icon size={16} color={accentColor} strokeWidth={2} />
              <Text style={[styles.infoTitle, { color: accentColor }]}>{obligation.title}</Text>
            </View>

            {/* Amount preview: current → resulting */}
            <View style={styles.amountRow}>
              <View style={styles.amountBlock}>
                <Text style={styles.amountLabel}>Principal actual</Text>
                <Text style={styles.amountValue}>
                  {formatCurrency(currentPrincipal, currencyCode)}
                </Text>
              </View>

              <ArrowRight size={16} color={COLORS.storm} />

              <View style={styles.amountBlock}>
                <Text style={styles.amountLabel}>Quedará en</Text>
                <Text style={[
                  styles.amountValue,
                  resultingAmount !== null && { color: accentColor },
                ]}>
                  {resultingAmount !== null
                    ? formatCurrency(resultingAmount, currencyCode)
                    : "—"}
                </Text>
              </View>
            </View>

            <Text style={styles.infoDesc}>{description}</Text>
          </View>
        ) : null}

        <CurrencyInput
          ref={amountRef}
          label={isIncrease ? "Monto a agregar *" : "Monto a reducir *"}
          value={amount}
          onChangeText={(t) => { setAmount(t); setAmountError(""); }}
          currencyCode={currencyCode}
          error={amountError}
        />

        <DatePickerInput
          label="Fecha del ajuste"
          value={eventDate}
          onChange={setEventDate}
        />

        <View>
          <Text style={styles.label}>Motivo (opcional)</Text>
          <TextInput
            style={styles.textInput}
            value={reason}
            onChangeText={setReason}
            placeholder="¿Por qué se ajusta el monto?"
            placeholderTextColor={COLORS.textDisabled}
            returnKeyType="done"
          />
        </View>

        {/* Account movement toggle — solo en modo crear */}
        {!isEditMode && (
          <>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Registrar movimiento en cuenta</Text>
                <Text style={styles.switchDesc}>
                  {movementImpactText}
                </Text>
              </View>
              <Switch
                value={createMovement}
                onValueChange={(value) => {
                  setCreateMovement(value);
                  if (!value) setAccountError("");
                }}
                trackColor={{ false: COLORS.storm + "44", true: accentColor + "88" }}
                thumbColor="#FFFFFF"
              />
            </View>
            {createMovement && activeAccounts.length > 0 ? (
              <View onLayout={(event) => { accountSectionYRef.current = event.nativeEvent.layout.y; }}>
                <Text style={styles.label}>Cuenta</Text>
                <View style={[styles.pillWrap, accountError ? styles.pillWrapError : null]}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.pillRow}>
                      {activeAccounts.map((acc) => (
                        <TouchableOpacity
                          key={acc.id}
                          style={[styles.pill, accountId === acc.id && { borderColor: accentColor, backgroundColor: accentColor + "18" }]}
                          onPress={() => { setAccountId(acc.id); setAccountError(""); }}
                        >
                          <Text style={[styles.pillText, accountId === acc.id && { color: accentColor }]}>
                            {acc.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
                {accountError ? <Text style={styles.fieldError}>{accountError}</Text> : null}
                {selectedAccount && projectedAccountBalance != null ? (
                  <View style={styles.projectionWrap}>
                    <BalanceImpactPreview
                      label={selectedAccount.name}
                      currentBalance={selectedAccount.currentBalance}
                      projectedBalance={projectedAccountBalance}
                      currencyCode={selectedAccount.currencyCode}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {submitError ? (
          <View style={styles.submitErrorBanner}>
            <AlertCircle size={16} color={COLORS.danger} strokeWidth={2} />
            <Text style={styles.submitErrorText}>{submitError}</Text>
          </View>
        ) : null}

        <Button
          label={isEditMode ? "Guardar cambios" : (isIncrease ? "Confirmar aumento" : "Confirmar reducción")}
          onPress={handleSubmit}
          loading={mutation.isPending || updateEventMutation.isPending}
          style={styles.submitBtn}
        />
      </BottomSheet>

      <ConfirmDialog
        visible={showDiscard}
        title="¿Descartar cambios?"
        body="Se perderán los datos ingresados."
        confirmLabel="Descartar"
        cancelLabel="Continuar"
        onCancel={() => setShowDiscard(false)}
        onConfirm={() => { setShowDiscard(false); onClose(); }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  infoBox: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    gap: SPACING.sm,
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  infoTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold, flex: 1 },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: RADIUS.sm,
    padding: SPACING.sm,
  },
  amountBlock: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  amountLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  amountValue: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
  },
  infoDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm, lineHeight: 18 },
  label: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  textInput: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  submitBtn: { marginTop: SPACING.sm },
  submitErrorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.danger + "18",
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
  },
  submitErrorText: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    lineHeight: 20,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  switchInfo: { flex: 1, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 2 },
  pillWrap: { borderRadius: RADIUS.md },
  pillWrapError: {
    borderWidth: 1,
    borderColor: COLORS.danger,
    padding: SPACING.xs,
  },
  pillRow: { flexDirection: "row", gap: SPACING.xs },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  pillText: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.storm },
  projectionWrap: { marginTop: SPACING.sm },
  fieldError: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    marginTop: 4,
  },
});
