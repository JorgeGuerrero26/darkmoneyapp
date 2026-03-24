import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { todayPeru } from "../../lib/date";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import {
  useCreatePrincipalAdjustmentMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import type { ObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { formatCurrency } from "../ui/AmountDisplay";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { TextInput } from "react-native";

type Mode = "increase" | "decrease";

type Props = {
  visible: boolean;
  mode: Mode;
  obligation: ObligationSummary | null;
  onClose: () => void;
  onSuccess?: () => void;
};

export function PrincipalAdjustmentForm({ visible, mode, obligation, onClose, onSuccess }: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const adjustmentWorkspaceId = obligation?.workspaceId ?? activeWorkspaceId ?? null;
  const mutation = useCreatePrincipalAdjustmentMutation(adjustmentWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const today = todayPeru();
  const [amount, setAmount] = useState("");
  const [eventDate, setEventDate] = useState(today);
  const [reason, setReason] = useState("");
  const [createMovement, setCreateMovement] = useState(false);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [amountError, setAmountError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);

  const activeAccounts = useMemo(
    () => sortByName(snapshot?.accounts.filter((a) => !a.isArchived) ?? []),
    [snapshot?.accounts],
  );

  const isIncrease = mode === "increase";
  const currencyCode = obligation?.currencyCode ?? "PEN";

  const currentPrincipal = obligation?.currentPrincipalAmount ?? obligation?.principalAmount ?? 0;

  const resultingAmount = useMemo(() => {
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) return null;
    return isIncrease ? currentPrincipal + parsed : Math.max(0, currentPrincipal - parsed);
  }, [amount, currentPrincipal, isIncrease]);

  useEffect(() => {
    if (!visible || !obligation) return;
    setAmount("");
    setEventDate(today);
    setReason("");
    setCreateMovement(false);
    setAccountId(obligation.settlementAccountId ?? null);
    setAmountError("");
  }, [visible, obligation, today]);

  function handleClose() {
    const isDirty = Boolean(amount || reason.trim());
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
      await mutation.mutateAsync({
        obligationId: obligation.id,
        mode,
        amount: parsed,
        eventDate,
        reason: reason.trim() || null,
        createMovement,
        accountId: createMovement ? accountId : null,
      });
      showToast(isIncrease ? "Monto aumentado" : "Monto reducido", "success");
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const title = isIncrease ? "Agregar monto" : "Reducir monto";
  const accentColor = isIncrease ? COLORS.income : COLORS.expense;
  const Icon = isIncrease ? TrendingUp : TrendingDown;
  const description = isIncrease
    ? (obligation?.direction === "receivable"
        ? "Aumenta lo que te deben. El cambio quedará registrado en el historial."
        : "Aumenta lo que debes. El cambio quedará registrado en el historial.")
    : (obligation?.direction === "receivable"
        ? "Reduce el monto que te deben. El principal original no se borra."
        : "Reduce lo que debes. El principal original no se borra.");

  return (
    <>
      <BottomSheet visible={visible} onClose={handleClose} title={title} snapHeight={0.7}>
        {obligation ? (
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

        {/* Account movement toggle */}
        <View style={styles.switchRow}>
          <View style={styles.switchInfo}>
            <Text style={styles.switchLabel}>Registrar movimiento en cuenta</Text>
            <Text style={styles.switchDesc}>
              {isIncrease
                ? "Crea un ingreso real que afecta el saldo"
                : "Crea un gasto real que afecta el saldo"}
            </Text>
          </View>
          <Switch
            value={createMovement}
            onValueChange={setCreateMovement}
            trackColor={{ false: COLORS.storm + "44", true: accentColor + "88" }}
            thumbColor="#FFFFFF"
          />
        </View>

        {createMovement && activeAccounts.length > 0 ? (
          <View>
            <Text style={styles.label}>Cuenta</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.pillRow}>
                {activeAccounts.map((acc) => (
                  <TouchableOpacity
                    key={acc.id}
                    style={[styles.pill, accountId === acc.id && { borderColor: accentColor, backgroundColor: accentColor + "18" }]}
                    onPress={() => setAccountId(acc.id)}
                  >
                    <Text style={[styles.pillText, accountId === acc.id && { color: accentColor }]}>
                      {acc.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        ) : null}

        <Button
          label={isIncrease ? "Confirmar aumento" : "Confirmar reducción"}
          onPress={handleSubmit}
          loading={mutation.isPending}
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
});
