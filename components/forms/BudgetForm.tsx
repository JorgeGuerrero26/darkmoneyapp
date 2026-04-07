import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { format, startOfMonth, endOfMonth, addMonths } from "date-fns";
import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import {
  useCreateBudgetMutation,
  useUpdateBudgetMutation,
  useWorkspaceSnapshotQuery,
  type BudgetFormInput,
} from "../../services/queries/workspace-data";
import type { BudgetOverview } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const POPULAR_CURRENCIES = ["PEN", "USD", "EUR", "MXN", "COP", "ARS", "CLP", "BRL"];

const ALERT_PRESETS = [
  { label: "70%", value: 70 },
  { label: "80%", value: 80 },
  { label: "90%", value: 90 },
  { label: "100%", value: 100 },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editBudget?: BudgetOverview;
};

export function BudgetForm({ visible, onClose, onSuccess, editBudget }: Props) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const haptics = useHaptics();
  const createMutation = useCreateBudgetMutation(activeWorkspaceId);
  const updateMutation = useUpdateBudgetMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const isEditing = Boolean(editBudget);

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const now = new Date();

  const [name, setName] = useState("");
  const [limitAmount, setLimitAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [alertPercent, setAlertPercent] = useState(80);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [rolloverEnabled, setRolloverEnabled] = useState(false);
  const [periodStart, setPeriodStart] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");

  const [nameError, setNameError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [discardVisible, setDiscardVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editBudget) {
      setName(editBudget.name);
      setLimitAmount(String(editBudget.limitAmount));
      setCurrencyCode(editBudget.currencyCode);
      setAlertPercent(editBudget.alertPercent);
      setCategoryId(editBudget.categoryId ?? null);
      setAccountId(editBudget.accountId ?? null);
      setRolloverEnabled(editBudget.rolloverEnabled);
      setPeriodStart(editBudget.periodStart);
      setPeriodEnd(editBudget.periodEnd);
      setNotes(editBudget.notes ?? "");
    } else {
      const m = new Date();
      setName("");
      setLimitAmount("");
      setCurrencyCode(defaultCurrency);
      setAlertPercent(80);
      setCategoryId(null);
      setAccountId(null);
      setRolloverEnabled(false);
      setPeriodStart(format(startOfMonth(m), "yyyy-MM-dd"));
      setPeriodEnd(format(endOfMonth(m), "yyyy-MM-dd"));
      setNotes("");
    }
    setNameError("");
    setAmountError("");
  }, [visible, editBudget, defaultCurrency]);

  function setNextMonth() {
    const next = addMonths(now, 1);
    setPeriodStart(format(startOfMonth(next), "yyyy-MM-dd"));
    setPeriodEnd(format(endOfMonth(next), "yyyy-MM-dd"));
  }

  function setCurrentMonth() {
    setPeriodStart(format(startOfMonth(now), "yyyy-MM-dd"));
    setPeriodEnd(format(endOfMonth(now), "yyyy-MM-dd"));
  }

  function handleClose() {
    const isDirty = isEditing && editBudget
      ? name.trim() !== editBudget.name.trim() ||
        limitAmount !== String(editBudget.limitAmount) ||
        currencyCode !== editBudget.currencyCode ||
        alertPercent !== editBudget.alertPercent ||
        categoryId !== (editBudget.categoryId ?? null) ||
        accountId !== (editBudget.accountId ?? null) ||
        rolloverEnabled !== editBudget.rolloverEnabled ||
        periodStart !== editBudget.periodStart ||
        periodEnd !== editBudget.periodEnd ||
        notes.trim() !== (editBudget.notes ?? "").trim()
      : Boolean(name.trim() || limitAmount);
    if (isDirty) {
      setDiscardVisible(true);
    } else {
      onClose();
    }
  }

  async function handleSubmit() {
    setNameError("");
    setAmountError("");
    let valid = true;

    if (!name.trim()) { setNameError("El nombre es obligatorio"); valid = false; }
    const amount = parseFloat(limitAmount);
    if (!limitAmount || isNaN(amount) || amount <= 0) {
      setAmountError("Ingresa un monto válido mayor a 0");
      valid = false;
    }
    if (!valid) { haptics.error(); return; }

    const input: BudgetFormInput = {
      name: name.trim(),
      periodStart,
      periodEnd,
      limitAmount: amount,
      alertPercent,
      currencyCode,
      categoryId,
      accountId,
      rolloverEnabled,
      notes: notes.trim() || null,
    };

    try {
      if (isEditing && editBudget) {
        await updateMutation.mutateAsync({ id: editBudget.id, input });
        showToast("Presupuesto actualizado", "success");
      } else {
        await createMutation.mutateAsync(input);
        showToast("Presupuesto creado", "success");
      }
      haptics.success();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      haptics.error();
      const msg = err instanceof Error ? err.message : "Error desconocido";
      showToast(msg, "error");
    }
  }

  const expenseCategories = useMemo(
    () =>
      sortByName(
        snapshot?.categories.filter((c) => c.isActive && (c.kind === "expense" || c.kind === "both")) ?? [],
      ),
    [snapshot?.categories],
  );

  const activeAccounts = useMemo(
    () => sortByName(snapshot?.accounts.filter((a) => !a.isArchived) ?? []),
    [snapshot?.accounts],
  );

  return (
    <>
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={isEditing ? "Editar presupuesto" : "Nuevo presupuesto"}
      snapHeight={0.92}
    >
      {/* Name */}
      <View>
        <Text style={styles.label}>Nombre *</Text>
        <TextInput
          style={[styles.textInput, nameError ? styles.inputError : null]}
          value={name}
          onChangeText={(t) => { setName(t); setNameError(""); }}
          placeholder="Ej. Alimentación mensual"
          placeholderTextColor={COLORS.textDisabled}
        />
        {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
      </View>

      {/* Period */}
      <View>
        <Text style={styles.label}>Período</Text>
        <View style={styles.pillRow}>
          <TouchableOpacity
            style={[styles.pill, periodStart.startsWith(format(startOfMonth(now), "yyyy-MM")) && styles.pillActive]}
            onPress={setCurrentMonth}
          >
            <Text style={[styles.pillText, periodStart.startsWith(format(startOfMonth(now), "yyyy-MM")) && styles.pillTextActive]}>
              Este mes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, periodStart.startsWith(format(startOfMonth(addMonths(now, 1)), "yyyy-MM")) && styles.pillActive]}
            onPress={setNextMonth}
          >
            <Text style={[styles.pillText, periodStart.startsWith(format(startOfMonth(addMonths(now, 1)), "yyyy-MM")) && styles.pillTextActive]}>
              Próximo mes
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.periodRange}>
          {periodStart} → {periodEnd}
        </Text>
      </View>

      {/* Currency */}
      <View>
        <Text style={styles.label}>Moneda</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.pillRow}>
            {POPULAR_CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.pill, currencyCode === c && styles.pillActive]}
                onPress={() => setCurrencyCode(c)}
              >
                <Text style={[styles.pillText, currencyCode === c && styles.pillTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Limit amount */}
      <CurrencyInput
        label="Monto límite *"
        value={limitAmount}
        onChangeText={(t) => { setLimitAmount(t); setAmountError(""); }}
        currencyCode={currencyCode}
        error={amountError}
      />

      {/* Alert percent */}
      <View>
        <Text style={styles.label}>Alerta en</Text>
        <View style={styles.pillRow}>
          {ALERT_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.value}
              style={[styles.pill, alertPercent === p.value && styles.pillActive]}
              onPress={() => setAlertPercent(p.value)}
            >
              <Text style={[styles.pillText, alertPercent === p.value && styles.pillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Category filter (optional) */}
      {expenseCategories.length > 0 ? (
        <View>
          <Text style={styles.label}>Categoría (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, categoryId === null && styles.pillActive]}
                onPress={() => setCategoryId(null)}
              >
                <Text style={[styles.pillText, categoryId === null && styles.pillTextActive]}>Todas</Text>
              </TouchableOpacity>
              {expenseCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.pill, categoryId === cat.id && styles.pillActive]}
                  onPress={() => setCategoryId(cat.id)}
                >
                  <Text style={[styles.pillText, categoryId === cat.id && styles.pillTextActive]}>
                    {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Account filter (optional) */}
      {activeAccounts.length > 0 ? (
        <View>
          <Text style={styles.label}>Cuenta (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, accountId === null && styles.pillActive]}
                onPress={() => setAccountId(null)}
              >
                <Text style={[styles.pillText, accountId === null && styles.pillTextActive]}>Todas</Text>
              </TouchableOpacity>
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

      {/* Rollover */}
      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Arrastrar saldo al siguiente período</Text>
          <Text style={styles.switchDesc}>El remanente se agrega al siguiente presupuesto</Text>
        </View>
        <Switch
          value={rolloverEnabled}
          onValueChange={setRolloverEnabled}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Notes */}
      <View>
        <Text style={styles.label}>Notas (opcional)</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Observaciones adicionales"
          placeholderTextColor={COLORS.textDisabled}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      <Button
        label={isEditing ? "Guardar cambios" : "Crear presupuesto"}
        onPress={handleSubmit}
        loading={createMutation.isPending || updateMutation.isPending}
        style={styles.submitBtn}
      />
    </BottomSheet>

    <ConfirmDialog
      visible={discardVisible}
      title="¿Descartar cambios?"
      body="Los datos ingresados se perderán."
      confirmLabel="Descartar"
      cancelLabel="Continuar editando"
      onCancel={() => setDiscardVisible(false)}
      onConfirm={() => { setDiscardVisible(false); onClose(); }}
    />
    </>
  );
}

const styles = StyleSheet.create({
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
  textArea: { minHeight: 80 },
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  pillRow: { flexDirection: "row", gap: SPACING.sm, flexWrap: "wrap" },
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
  periodRange: { fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: SPACING.xs },
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
  submitBtn: { marginTop: SPACING.sm },
});
