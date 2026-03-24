import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import { format } from "date-fns";

import { useWorkspace } from "../../lib/workspace-context";
import { todayPeru } from "../../lib/date";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import {
  useCreateObligationPaymentMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import { obligationViewerActsAsCollector } from "../../lib/obligation-viewer-labels";
import type { ObligationSummary, SharedObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { formatCurrency } from "../ui/AmountDisplay";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  obligation: ObligationSummary | SharedObligationSummary | null;
};

export function PaymentForm({ visible, onClose, onSuccess, obligation }: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const paymentWorkspaceId = obligation?.workspaceId ?? activeWorkspaceId ?? null;
  const createPaymentMutation = useCreateObligationPaymentMutation(paymentWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const today = todayPeru();
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [createMovement, setCreateMovement] = useState(true);
  const [installmentNo, setInstallmentNo] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [amountError, setAmountError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);

  const initialRef = useRef({
    installmentNo: "",
    description: "",
    notes: "",
    createMovement: true,
    accountId: null as number | null,
  });

  useEffect(() => {
    if (!visible || !obligation) return;
    setAmount("");
    setPaymentDate(today);
    const nextInstallment =
      obligation.paymentCount != null ? String(obligation.paymentCount + 1) : "";
    setAccountId(obligation.settlementAccountId ?? null);
    setCreateMovement(true);
    setInstallmentNo(nextInstallment);
    setDescription("");
    setNotes("");
    setAmountError("");
    initialRef.current = {
      installmentNo: nextInstallment,
      description: "",
      notes: "",
      createMovement: true,
      accountId: obligation.settlementAccountId ?? null,
    };
  }, [visible, obligation, today]);

  const isSharedViewer =
    obligation != null &&
    "viewerMode" in obligation &&
    (obligation as SharedObligationSummary).viewerMode === "shared_viewer";
  const actsAsCollector =
    obligation != null && obligationViewerActsAsCollector(obligation.direction, isSharedViewer);
  const actionTitle = actsAsCollector ? "Registrar cobro" : "Registrar pago";
  const dateLabel = actsAsCollector ? "Fecha de cobro" : "Fecha de pago";
  const movementDesc = actsAsCollector
    ? "Registra también un ingreso en tu contabilidad"
    : "Registra también un egreso en tu contabilidad";
  const accountLabel = actsAsCollector ? "Cuenta de abono" : "Cuenta de débito";
  const discardBody = actsAsCollector
    ? "Se perderán los datos del cobro."
    : "Se perderán los datos del pago.";

  function handleClose() {
    const i = initialRef.current;
    const isDirty =
      amount.trim() !== "" ||
      description.trim() !== i.description ||
      notes.trim() !== i.notes ||
      installmentNo !== i.installmentNo ||
      createMovement !== i.createMovement ||
      accountId !== i.accountId;
    if (isDirty) {
      setShowDiscard(true);
    } else {
      onClose();
    }
  }

  async function handleSubmit() {
    setAmountError("");
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setAmountError("Ingresa un monto válido");
      return;
    }
    if (!obligation) return;

    try {
      await createPaymentMutation.mutateAsync({
        obligationId: obligation.id,
        amount: parsed,
        paymentDate,
        accountId: createMovement ? accountId : null,
        installmentNo: installmentNo ? parseInt(installmentNo) : null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        createMovement,
        direction: obligation.direction,
      });
      showToast(actsAsCollector ? "Cobro registrado ✓" : "Pago registrado ✓", "success");
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const activeAccounts = useMemo(
    () => sortByName(snapshot?.accounts.filter((a) => !a.isArchived) ?? []),
    [snapshot?.accounts],
  );
  const pendingAmount = obligation?.pendingAmount ?? 0;
  const currencyCode = obligation?.currencyCode ?? "PEN";

  const remainingAfter = useMemo(() => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) return null;
    return Math.max(0, pendingAmount - parsed);
  }, [amount, pendingAmount]);

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={actionTitle}
        snapHeight={0.75}
      >
      {/* Obligation summary + balance preview */}
      {obligation ? (
        <View style={styles.obligationInfo}>
          <Text style={styles.obligationTitle}>{obligation.title}</Text>
          <View style={styles.balanceRow}>
            <View style={styles.balanceBlock}>
              <Text style={styles.balanceLabel}>Pendiente</Text>
              <Text style={styles.balanceValue}>{formatCurrency(pendingAmount, currencyCode)}</Text>
            </View>
            <ArrowRight size={14} color={COLORS.storm} />
            <View style={styles.balanceBlock}>
              <Text style={styles.balanceLabel}>Quedará</Text>
              <Text style={[styles.balanceValue, remainingAfter !== null && { color: COLORS.pine }]}>
                {remainingAfter !== null ? formatCurrency(remainingAfter, currencyCode) : "—"}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Amount + Installment No in a row */}
      <View style={styles.twoCol}>
        <View style={{ flex: 2 }}>
          <CurrencyInput
            label="Monto *"
            value={amount}
            onChangeText={(t) => { setAmount(t); setAmountError(""); }}
            currencyCode={currencyCode}
            error={amountError}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>N° cuota</Text>
          <TextInput
            style={styles.textInput}
            value={installmentNo}
            onChangeText={(t) => setInstallmentNo(t.replace(/[^0-9]/g, ""))}
            placeholder="—"
            placeholderTextColor={COLORS.storm}
            keyboardType="number-pad"
            returnKeyType="done"
          />
        </View>
      </View>

      {/* Payment date */}
      <DatePickerInput
        label={dateLabel}
        value={paymentDate}
        onChange={setPaymentDate}
      />

      {/* Create movement toggle */}
      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Crear movimiento en cuenta</Text>
          <Text style={styles.switchDesc}>{movementDesc}</Text>
        </View>
        <Switch
          value={createMovement}
          onValueChange={setCreateMovement}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Account selector — visible only if createMovement */}
      {createMovement && activeAccounts.length > 0 ? (
        <View>
          <Text style={styles.label}>{accountLabel}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              {activeAccounts.map((acc) => (
                <TouchableOpacity
                  key={acc.id}
                  style={[styles.pill, accountId === acc.id && styles.pillActive]}
                  onPress={() => setAccountId(acc.id)}
                >
                  <Text style={[styles.pillText, accountId === acc.id && styles.pillTextActive]}>
                    {acc.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Description */}
      <View>
        <Text style={styles.label}>Descripción (opcional)</Text>
        <TextInput
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Ej. Cuota enero, transferencia bancaria..."
          placeholderTextColor={COLORS.storm}
          returnKeyType="next"
        />
      </View>

      {/* Notes */}
      <View>
        <Text style={styles.label}>Notas (opcional)</Text>
        <TextInput
          style={styles.textInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Referencia, número de operación..."
          placeholderTextColor={COLORS.storm}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />
      </View>

      <Button
        label={actionTitle}
        onPress={handleSubmit}
        loading={createPaymentMutation.isPending}
        style={styles.submitBtn}
      />
    </BottomSheet>

    <ConfirmDialog
      visible={showDiscard}
      title="¿Descartar cambios?"
      body={discardBody}
      confirmLabel="Descartar"
      cancelLabel="Continuar"
      onCancel={() => setShowDiscard(false)}
      onConfirm={() => { setShowDiscard(false); onClose(); }}
    />
  </>
  );
}

const styles = StyleSheet.create({
  obligationInfo: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    gap: SPACING.sm,
  },
  obligationTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  balanceBlock: { flex: 1, alignItems: "center", gap: 2 },
  balanceLabel: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  balanceValue: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.heading, color: COLORS.ink },
  twoCol: { flexDirection: "row", gap: SPACING.sm, alignItems: "flex-start" },
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
  switchInfo: { flex: 1, gap: 2, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  pillActive: { backgroundColor: COLORS.pine, borderColor: COLORS.pine },
  pillText: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  pillTextActive: { color: COLORS.textInverse },
  submitBtn: { marginTop: SPACING.sm },
});
