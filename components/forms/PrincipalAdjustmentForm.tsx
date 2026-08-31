import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { AlertCircle } from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { todayPeru } from "../../lib/date";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import { useWorkspaceSnapshotQuery } from "../../services/queries/workspace-data";
import {
  useCreatePrincipalAdjustmentMutation,
  useUpdateObligationEventMutation,
} from "../../services/queries/obligations";
import type { ObligationEventSummary, ObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { formatCurrency } from "../ui/AmountDisplay";
import { BalanceImpactPreview } from "../domain/BalanceImpactPreview";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { TextField } from "../ui/TextField";
import { FormOptionRow } from "../ui/FormOptionRow";
import { SegmentedControl } from "../ui/SegmentedControl";
import { SearchableSelectSheet } from "../ui/SearchableSelectSheet";

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

export function PrincipalAdjustmentForm({ visible, mode: initialMode, obligation, onClose, onSuccess, editEvent }: Props) {
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
  const [reasonError, setReasonError] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const initialRef = useRef({ amount: "", reason: "" });

  const activeAccounts = useMemo(
    () => sortByName(snapshot?.accounts.filter((a) => !a.isArchived) ?? []),
    [snapshot?.accounts],
  );

  /**
   * Aumentar y reducir eran **la misma hoja dos veces**: idénticas salvo el signo, la flecha, el
   * color del título y la explicación del interruptor. Una sola, con un conmutador — lo mismo
   * que se hizo con el plan de pagos.
   */
  const [mode, setMode] = useState<Mode>(initialMode);
  useEffect(() => {
    if (visible) setMode(initialMode);
  }, [initialMode, visible]);

  const isIncrease = mode === "increase";
  const isReceivable = obligation?.direction === "receivable";
  const currencyCode = obligation?.currencyCode ?? "PEN";

  /**
   * Lo que le debe **hoy**, que es el mismo número con el que abre la hoja de cobro.
   *
   * Esta hoja abría con "Principal actual S/ 23,455.00" y la de cobro con "Pendiente
   * S/ 21,020.00": dos cifras correctas de dos cosas distintas, con la misma tipografía en el
   * mismo lugar de la misma pantalla. Abiertas seguido, parece que una está mal. El total
   * acumulado se queda donde tiene sentido, en el desglose del detalle.
   */
  const currentPrincipal = obligation?.pendingAmount ?? 0;

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
    setReasonError("");
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

  const submittingRef = useRef(false);

  async function handleSubmit() {
    if (submittingRef.current) return; // guard anti-doble-tap: evita ajustes duplicados
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
    submittingRef.current = true;
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
        showToast(isIncrease ? "Aumento actualizado ✓" : "Reducción actualizada ✓", "warning");
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
    } finally {
      submittingRef.current = false;
    }
  }

  const title = isEditMode ? "Editar ajuste" : "Ajustar monto";

  /**
   * El interruptor pregunta por el **efecto**, no por el nombre de la operación.
   *
   * Decía "Crea un gasto real porque estás prestando más dinero", que es cierto cuando le
   * prestas efectivo y falso en las trece filas del estado de cuenta, que son cámaras y
   * monitores. Y al revés: si compraste la cámara para revendérsela, sí salió plata de tu
   * cuenta aunque no sea un préstamo. Lo que decide si hay movimiento es si salió o entró
   * plata, y eso es lo que se pregunta.
   */
  const moneyLeftAccount = isReceivable ? isIncrease : !isIncrease;
  const movementTitle = moneyLeftAccount ? "Salió plata de tu cuenta" : "Entró plata a tu cuenta";
  const movementHelp = moneyLeftAccount
    ? "Le pagaste el producto o le diste efectivo"
    : "Te devolvió parte, o te pagaron por ese producto";

  const counterpartyName = obligation?.counterparty?.trim() || "la otra persona";
  const owesNowLabel = isReceivable ? "Le debe hoy" : "Le debes hoy";
  const owesNextLabel = isReceivable ? "Le deberá" : "Le deberás";
  const modeOptions = isReceivable
    ? [
        { value: "increase" as Mode, label: "Le debe más" },
        { value: "decrease" as Mode, label: "Le debe menos" },
      ]
    : [
        { value: "increase" as Mode, label: "Le debo más" },
        { value: "decrease" as Mode, label: "Le debo menos" },
      ];

  const selectedAccountName = activeAccounts.find((acc) => acc.id === accountId)?.name ?? null;

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={title}
        snapHeight={0.9}
        scrollRef={scrollRef}
        footer={
          <View style={styles.submitBar}>
            <Button
              label="Guardar ajuste"
              size="lg"
              onPress={handleSubmit}
              loading={mutation.isPending || updateEventMutation.isPending}
              disabled={!reason.trim() || !amount.trim()}
            />
            {!reason.trim() ? (
              <Text style={styles.submitNote}>Falta decir por qué</Text>
            ) : !amount.trim() ? (
              <Text style={styles.submitNote}>Falta el monto</Text>
            ) : null}
          </View>
        }
        // Dentro del sheet: iOS solo presenta un Modal a la vez y como hermano no aparecía.
        overlay={
          <>
            <SearchableSelectSheet
              inline
              visible={accountPickerOpen}
              title={moneyLeftAccount ? "Sale de" : "Entra a"}
              options={activeAccounts.map((acc) => ({ value: acc.id as number | null, label: acc.name }))}
              value={accountId}
              onChange={(id) => { setAccountId(id); setAccountError(""); }}
              onClose={() => setAccountPickerOpen(false)}
            />
            <ConfirmDialog
              inline
              visible={showDiscard}
              title="¿Descartar cambios?"
              body="Se perderán los datos ingresados."
              confirmLabel="Descartar"
              cancelLabel="Continuar"
              onCancel={() => setShowDiscard(false)}
              onConfirm={() => { setShowDiscard(false); onClose(); }}
            />
          </>
        }
      >
        {!isEditMode ? (
          <SegmentedControl options={modeOptions} value={mode} onChange={setMode} />
        ) : null}

        {/* El concepto es lo que el estado de cuenta imprime en cada fila: el dato que
            distingue un movimiento de otro y el que el cliente lee para reconocer su deuda. Era
            "Motivo (opcional)" y por eso la fila del 11 de abril salió sin explicación. */}
        <View style={styles.field}>
          <Text style={styles.sectionLabel}>Por qué</Text>
          <TextField
            style={[styles.textInput, reasonError ? styles.inputError : null]}
            value={reason}
            onChangeText={(value) => { setReason(value); setReasonError(""); }}
            placeholder="Viper V3 Pro"
            placeholderTextColor={COLORS.storm}
            returnKeyType="next"
            accessibilityLabel="Por qué se ajusta el monto"
          />
          <Text style={styles.fieldHint}>
            Un producto, un préstamo, un servicio. Es lo que {counterpartyName} verá en su estado de cuenta.
          </Text>
          {reasonError ? <Text style={styles.fieldError}>{reasonError}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.sectionLabel}>Cuánto</Text>
          <CurrencyInput
            ref={amountRef}
            value={amount}
            onChangeText={(t) => { setAmount(t); setAmountError(""); }}
            currencyCode={currencyCode}
            error={amountError}
          />
        </View>

        {/* La proyección aparece cuando hay algo que proyectar. Antes decía "Quedará —", y un
            guion en el lugar de una cifra se lee como dato roto, no como campo por llenar. */}
        {obligation && !isEditMode ? (
          <View style={styles.contextCard}>
            <View style={styles.contextRow}>
              <Text style={styles.contextLabel}>{owesNowLabel}</Text>
              <Text style={styles.contextValue}>{formatCurrency(currentPrincipal, currencyCode)}</Text>
            </View>
            {resultingAmount !== null ? (
              <View style={styles.contextRow}>
                <Text style={styles.contextLabel}>{owesNextLabel}</Text>
                <Text style={styles.contextValue}>{formatCurrency(resultingAmount, currencyCode)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.group}>
          <FormOptionRow
            grouped
            last
            label="Cuándo"
            value={eventDate === today ? `Hoy, ${eventDate.slice(8)} ${eventDate.slice(5, 7)}` : eventDate}
            onPress={() => setDateOpen((open) => !open)}
          />
        </View>
        {dateOpen ? (
          <DatePickerInput label="Cuándo" value={eventDate} onChange={setEventDate} />
        ) : null}

        {!isEditMode ? (
          <>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>{movementTitle}</Text>
                <Text style={styles.switchDesc}>{movementHelp}</Text>
              </View>
              <Switch
                value={createMovement}
                onValueChange={(value) => {
                  setCreateMovement(value);
                  if (!value) setAccountError("");
                }}
                trackColor={{ false: COLORS.border, true: COLORS.ink }}
                thumbColor={createMovement ? COLORS.bg : COLORS.fog}
                ios_backgroundColor={COLORS.border}
              />
            </View>
            {createMovement && activeAccounts.length > 0 ? (
              <View onLayout={(event) => { accountSectionYRef.current = event.nativeEvent.layout.y; }}>
                <View style={[styles.group, accountError ? styles.inputError : null]}>
                  <FormOptionRow
                    grouped
                    last
                    label={moneyLeftAccount ? "Sale de" : "Entra a"}
                    value={selectedAccountName}
                    placeholder="Elegir cuenta"
                    onPress={() => setAccountPickerOpen(true)}
                  />
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
        ) : null}

        {submitError ? (
          <View style={styles.submitErrorBanner}>
            <AlertCircle size={16} color={COLORS.danger} strokeWidth={2} />
            <Text style={styles.submitErrorText}>{submitError}</Text>
          </View>
        ) : null}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACING.sm },
  sectionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  fieldHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  inputError: { borderColor: COLORS.danger },
  contextCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  contextLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  contextValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  submitBar: {
    gap: SPACING.xs,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    backgroundColor: SURFACE.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  submitNote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
  },
  textInput: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
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
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  switchInfo: { flex: 1, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 2 },
  projectionWrap: { marginTop: SPACING.sm },
  fieldError: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    marginTop: 4,
  },
});
