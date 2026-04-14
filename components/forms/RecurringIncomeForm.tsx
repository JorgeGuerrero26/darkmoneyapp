import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CalendarClock, CalendarPlus, CalendarX2, AlertCircle } from "lucide-react-native";
import { format } from "date-fns";

import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import {
  useCreateRecurringIncomeMutation,
  useUpdateRecurringIncomeMutation,
  useWorkspaceSnapshotQuery,
  type RecurringIncomeFormInput,
} from "../../services/queries/workspace-data";
import type { RecurringIncomeSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CurrencyInput } from "../ui/CurrencyInput";
import { FormDateField } from "./FormDateField";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const POPULAR_CURRENCIES = ["PEN", "USD", "EUR", "MXN", "COP", "ARS", "CLP"];
const FREQUENCY_OPTIONS: { value: RecurringIncomeFormInput["frequency"]; label: string }[] = [
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
  { value: "quarterly", label: "Trimestral" },
  { value: "yearly", label: "Anual" },
  { value: "daily", label: "Diario" },
  { value: "custom", label: "Personalizado" },
];
const REMIND_OPTIONS = [
  { label: "1 día", value: 1 },
  { label: "3 días", value: 3 },
  { label: "7 días", value: 7 },
  { label: "Sin aviso", value: 0 },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  editRecurringIncome?: RecurringIncomeSummary;
};

export function RecurringIncomeForm({ visible, onClose, onSuccess, editRecurringIncome }: Props) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const haptics = useHaptics();
  const createMutation = useCreateRecurringIncomeMutation(activeWorkspaceId);
  const updateMutation = useUpdateRecurringIncomeMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const today = format(new Date(), "yyyy-MM-dd");
  const isEditing = Boolean(editRecurringIncome);

  const [name, setName] = useState("");
  const [payerPartyId, setPayerPartyId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [frequency, setFrequency] = useState<RecurringIncomeFormInput["frequency"]>("monthly");
  const [intervalCount, setIntervalCount] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [nextExpectedDate, setNextExpectedDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [remindDaysBefore, setRemindDaysBefore] = useState(3);
  const [notes, setNotes] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);
  const [nameError, setNameError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [submitError, setSubmitError] = useState("");

  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    if (editRecurringIncome) {
      setName(editRecurringIncome.name);
      setPayerPartyId(editRecurringIncome.payerPartyId ?? null);
      setAmount(String(editRecurringIncome.amount));
      setCurrencyCode(editRecurringIncome.currencyCode);
      setFrequency(editRecurringIncome.frequency);
      setIntervalCount(String(editRecurringIncome.intervalCount));
      setDayOfMonth(editRecurringIncome.dayOfMonth ? String(editRecurringIncome.dayOfMonth) : "");
      setDayOfWeek(editRecurringIncome.dayOfWeek ?? null);
      setStartDate(editRecurringIncome.startDate);
      setNextExpectedDate(editRecurringIncome.nextExpectedDate);
      setEndDate(editRecurringIncome.endDate ?? "");
      setAccountId(editRecurringIncome.accountId ?? null);
      setCategoryId(editRecurringIncome.categoryId ?? null);
      setRemindDaysBefore(editRecurringIncome.remindDaysBefore);
      setNotes(editRecurringIncome.notes ?? "");
    } else {
      setName("");
      setPayerPartyId(null);
      setAmount("");
      setCurrencyCode(defaultCurrency);
      setFrequency("monthly");
      setIntervalCount("1");
      setDayOfMonth("");
      setDayOfWeek(null);
      setStartDate(today);
      setNextExpectedDate(today);
      setEndDate("");
      setAccountId(null);
      setCategoryId(null);
      setRemindDaysBefore(3);
      setNotes("");
    }
    setNameError("");
    setAmountError("");
    setSubmitError("");
  }, [visible, editRecurringIncome, defaultCurrency, today]);

  const activeAccounts = useMemo(
    () => sortByName(snapshot?.accounts.filter((a) => !a.isArchived) ?? []),
    [snapshot?.accounts],
  );
  const incomeCategories = useMemo(
    () => sortByName(snapshot?.categories.filter((c) => c.isActive && (c.kind === "income" || c.kind === "both")) ?? []),
    [snapshot?.categories],
  );
  const counterparties = useMemo(() => sortByName(snapshot?.counterparties ?? []), [snapshot?.counterparties]);
  const isLoading = createMutation.isPending || updateMutation.isPending;

  function handleClose() {
    const ri = editRecurringIncome;
    const isDirty = isEditing && ri
      ? (
        name.trim() !== ri.name.trim() ||
        payerPartyId !== (ri.payerPartyId ?? null) ||
        amount !== String(ri.amount) ||
        currencyCode !== ri.currencyCode ||
        frequency !== ri.frequency ||
        intervalCount !== String(ri.intervalCount) ||
        (dayOfMonth || "") !== (ri.dayOfMonth != null ? String(ri.dayOfMonth) : "") ||
        dayOfWeek !== (ri.dayOfWeek ?? null) ||
        startDate !== ri.startDate ||
        nextExpectedDate !== ri.nextExpectedDate ||
        (endDate || "") !== (ri.endDate ?? "") ||
        accountId !== (ri.accountId ?? null) ||
        categoryId !== (ri.categoryId ?? null) ||
        remindDaysBefore !== ri.remindDaysBefore ||
        (notes.trim() || "") !== (ri.notes?.trim() ?? "")
      )
      : Boolean(name.trim() || amount.trim() || notes.trim());
    if (isDirty) setShowDiscard(true);
    else onClose();
  }

  async function handleSubmit() {
    setNameError("");
    setAmountError("");
    setSubmitError("");
    if (!name.trim()) {
      haptics.error();
      setNameError("El nombre es obligatorio");
      nameRef.current?.focus();
      return;
    }
    const parsed = parseFloat(amount.replace(",", "."));
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      haptics.error();
      setAmountError("Ingresa un monto mayor a 0");
      return;
    }
    if (!startDate.trim() || !nextExpectedDate.trim()) {
      haptics.error();
      setSubmitError("Inicio y próxima llegada son obligatorios");
      return;
    }
    if (nextExpectedDate < startDate) {
      haptics.error();
      setSubmitError("La próxima llegada debe ser igual o posterior al inicio");
      return;
    }

    const payload: RecurringIncomeFormInput = {
      name: name.trim(),
      payerPartyId,
      accountId,
      categoryId,
      amount: parsed,
      currencyCode: currencyCode.trim().toUpperCase(),
      frequency,
      intervalCount: Math.max(1, parseInt(intervalCount, 10) || 1),
      dayOfMonth: dayOfMonth.trim() ? parseInt(dayOfMonth, 10) : null,
      dayOfWeek,
      startDate,
      nextExpectedDate,
      endDate: endDate.trim() ? endDate : null,
      remindDaysBefore,
      notes: notes.trim() ? notes.trim() : null,
    };

    try {
      if (isEditing && editRecurringIncome) {
        await updateMutation.mutateAsync({ id: editRecurringIncome.id, input: payload });
        showToast("Ingreso fijo actualizado", "success");
      } else {
        await createMutation.mutateAsync(payload);
        showToast("Ingreso fijo creado", "success");
      }
      haptics.success();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      haptics.error();
      setSubmitError(humanizeError(err));
    }
  }

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={isEditing ? "Editar ingreso fijo" : "Nuevo ingreso fijo"}
        snapHeight={0.88}
      >
        <View style={styles.section}>
          <Text style={styles.label}>Nombre *</Text>
          <TextInput
            ref={nameRef}
            style={styles.input}
            value={name}
            onChangeText={(value) => { setName(value); setNameError(""); }}
            placeholder="ej. Sueldo mensual"
            placeholderTextColor={COLORS.textDisabled}
          />
          {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}

          <CurrencyInput
            label="Monto *"
            value={amount}
            onChangeText={(value) => { setAmount(value); setAmountError(""); }}
            currencyCode={currencyCode}
            error={amountError}
          />

          <Text style={styles.label}>Moneda</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              {POPULAR_CURRENCIES.map((code) => (
                <TouchableOpacity
                  key={code}
                  style={[styles.pill, currencyCode === code && styles.pillActive]}
                  onPress={() => setCurrencyCode(code)}
                >
                  <Text style={[styles.pillText, currencyCode === code && styles.pillTextActive]}>{code}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.label}>Frecuencia</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              {FREQUENCY_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.pill, frequency === option.value && styles.pillActive]}
                  onPress={() => setFrequency(option.value)}
                >
                  <Text style={[styles.pillText, frequency === option.value && styles.pillTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {(frequency === "monthly" || frequency === "quarterly" || frequency === "yearly") ? (
            <>
              <Text style={styles.label}>Día del mes</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.pillRow}>
                  {[1, 5, 10, 15, 20, 25, 28, 30].map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[styles.pill, dayOfMonth === String(day) && styles.pillActive]}
                      onPress={() => setDayOfMonth(String(day))}
                    >
                      <Text style={[styles.pillText, dayOfMonth === String(day) && styles.pillTextActive]}>{day}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          ) : null}

          <FormDateField
            title="Próxima llegada esperada"
            description="Es la fecha principal que el sistema usa para recordatorios y flujo futuro."
            value={nextExpectedDate}
            onChange={setNextExpectedDate}
            required
            Icon={CalendarClock}
            accentColor={COLORS.primary}
          />

          <FormDateField
            title="Fecha de inicio"
            description="Ayuda a entender desde cuándo existe este ingreso."
            value={startDate}
            onChange={setStartDate}
            required
            Icon={CalendarPlus}
            accentColor="#9AA7FF"
          />

          <FormDateField
            title="Fecha de fin"
            description="Déjala vacía si este ingreso no tiene fecha de cierre."
            value={endDate}
            onChange={setEndDate}
            optional
            placeholder="Sin fecha de fin"
            Icon={CalendarX2}
            accentColor="#E7C878"
          />

          <Text style={styles.label}>Avisar con anticipación</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              {REMIND_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.label}
                  style={[styles.pill, remindDaysBefore === option.value && styles.pillActive]}
                  onPress={() => setRemindDaysBefore(option.value)}
                >
                  <Text style={[styles.pillText, remindDaysBefore === option.value && styles.pillTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.label}>Pagador (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity style={[styles.pill, payerPartyId == null && styles.pillActive]} onPress={() => setPayerPartyId(null)}>
                <Text style={[styles.pillText, payerPartyId == null && styles.pillTextActive]}>Ninguno</Text>
              </TouchableOpacity>
              {counterparties.map((counterparty) => (
                <TouchableOpacity
                  key={counterparty.id}
                  style={[styles.pill, payerPartyId === counterparty.id && styles.pillActive]}
                  onPress={() => setPayerPartyId(counterparty.id)}
                >
                  <Text style={[styles.pillText, payerPartyId === counterparty.id && styles.pillTextActive]}>
                    {counterparty.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.label}>Cuenta destino (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity style={[styles.pill, accountId == null && styles.pillActive]} onPress={() => setAccountId(null)}>
                <Text style={[styles.pillText, accountId == null && styles.pillTextActive]}>Sin cuenta</Text>
              </TouchableOpacity>
              {activeAccounts.map((account) => (
                <TouchableOpacity
                  key={account.id}
                  style={[styles.pill, accountId === account.id && styles.pillActive]}
                  onPress={() => setAccountId(account.id)}
                >
                  <Text style={[styles.pillText, accountId === account.id && styles.pillTextActive]}>{account.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.label}>Categoría (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity style={[styles.pill, categoryId == null && styles.pillActive]} onPress={() => setCategoryId(null)}>
                <Text style={[styles.pillText, categoryId == null && styles.pillTextActive]}>Sin categoría</Text>
              </TouchableOpacity>
              {incomeCategories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.pill, categoryId === category.id && styles.pillActive]}
                  onPress={() => setCategoryId(category.id)}
                >
                  <Text style={[styles.pillText, categoryId === category.id && styles.pillTextActive]}>{category.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={styles.label}>Notas (opcional)</Text>
          <TextInput
            style={styles.notesInput}
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholder="Notas adicionales..."
            placeholderTextColor={COLORS.textDisabled}
          />

          {submitError ? (
            <View style={styles.errorBanner}>
              <AlertCircle size={16} color={COLORS.danger} />
              <Text style={styles.errorBannerText}>{submitError}</Text>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <Button label="Cancelar" variant="ghost" onPress={handleClose} style={styles.cancelBtn} />
            <Button
              label={isEditing ? "Guardar cambios" : "Crear ingreso"}
              onPress={handleSubmit}
              loading={isLoading}
              style={styles.submitBtn}
            />
          </View>
        </View>
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
  section: { gap: SPACING.md },
  label: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.ink,
    fontSize: FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  notesInput: {
    minHeight: 120,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.ink,
    fontSize: FONT_SIZE.md,
    textAlignVertical: "top",
  },
  pillRow: { flexDirection: "row", gap: SPACING.xs },
  pill: {
    height: 38,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  pillActive: {
    backgroundColor: COLORS.primary + "18",
    borderColor: COLORS.primary + "88",
  },
  pillText: {
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  pillTextActive: { color: COLORS.primary },
  fieldError: { color: COLORS.danger, fontSize: FONT_SIZE.xs, marginTop: -SPACING.sm },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.danger + "18",
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
  },
  errorBannerText: { flex: 1, color: COLORS.danger, fontSize: FONT_SIZE.sm, lineHeight: 20 },
  actionsRow: { flexDirection: "row", gap: SPACING.md, paddingTop: SPACING.sm },
  cancelBtn: { flex: 1 },
  submitBtn: { flex: 1 },
});
