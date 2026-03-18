import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";

import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import {
  useCreateObligationPaymentMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import type { ObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  obligation: ObligationSummary | null;
};

export function PaymentForm({ visible, onClose, onSuccess, obligation }: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const createPaymentMutation = useCreateObligationPaymentMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const today = format(new Date(), "yyyy-MM-dd");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [createMovement, setCreateMovement] = useState(true);
  const [notes, setNotes] = useState("");
  const [amountError, setAmountError] = useState("");

  useEffect(() => {
    if (!visible || !obligation) return;
    // Pre-fill with installment amount if available
    const suggested = obligation.installmentAmount ?? obligation.pendingAmount;
    setAmount(suggested > 0 ? String(suggested) : "");
    setPaymentDate(today);
    setAccountId(obligation.settlementAccountId ?? null);
    setCreateMovement(true);
    setNotes("");
    setAmountError("");
  }, [visible, obligation, today]);

  function handleClose() {
    if (amount) {
      Alert.alert("¿Descartar?", "Se perderán los datos del pago.", [
        { text: "Continuar", style: "cancel" },
        { text: "Descartar", style: "destructive", onPress: onClose },
      ]);
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
        notes: notes.trim() || null,
        createMovement,
      });
      showToast("Pago registrado", "success");
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const activeAccounts = snapshot?.accounts.filter((a) => !a.isArchived) ?? [];
  const pendingAmount = obligation?.pendingAmount ?? 0;
  const currencyCode = obligation?.currencyCode ?? "PEN";

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Registrar pago"
      snapHeight={0.75}
    >
      {obligation ? (
        <View style={styles.obligationInfo}>
          <Text style={styles.obligationTitle}>{obligation.title}</Text>
          <Text style={styles.obligationMeta}>
            Pendiente: {formatCurrency(pendingAmount, currencyCode)}
          </Text>
        </View>
      ) : null}

      {/* Amount */}
      <CurrencyInput
        label="Monto del pago *"
        value={amount}
        onChangeText={(t) => { setAmount(t); setAmountError(""); }}
        currencyCode={currencyCode}
        error={amountError}
      />

      {/* Payment date */}
      <DatePickerInput
        label="Fecha de pago"
        value={paymentDate}
        onChange={setPaymentDate}
      />

      {/* Create movement toggle */}
      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Crear movimiento en cuenta</Text>
          <Text style={styles.switchDesc}>Registra también un egreso en tu contabilidad</Text>
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
          <Text style={styles.label}>Cuenta de débito</Text>
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

      {/* Notes */}
      <View>
        <Text style={styles.label}>Notas (opcional)</Text>
        <TextInput
          style={styles.textInput}
          value={notes}
          onChangeText={setNotes}
          placeholder="Referencia, número de operación..."
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />
      </View>

      <Button
        label="Registrar pago"
        onPress={handleSubmit}
        loading={createPaymentMutation.isPending}
        style={styles.submitBtn}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  obligationInfo: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 4,
  },
  obligationTitle: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold, color: COLORS.text },
  obligationMeta: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  textInput: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  switchInfo: { flex: 1, gap: 2, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, color: COLORS.text },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontWeight: FONT_WEIGHT.medium },
  pillTextActive: { color: "#FFFFFF" },
  submitBtn: { marginTop: SPACING.sm },
});
