import { useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";

import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import {
  useCreateSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useWorkspaceSnapshotQuery,
  type SubscriptionFormInput,
} from "../../services/queries/workspace-data";
import type { SubscriptionSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

const POPULAR_CURRENCIES = ["PEN", "USD", "EUR", "MXN", "COP", "ARS", "CLP", "BRL"];

const FREQUENCY_OPTIONS: { value: SubscriptionFormInput["frequency"]; label: string }[] = [
  { value: "weekly",    label: "Semanal" },
  { value: "monthly",   label: "Mensual" },
  { value: "quarterly", label: "Trimestral" },
  { value: "yearly",    label: "Anual" },
  { value: "daily",     label: "Diario" },
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
  editSubscription?: SubscriptionSummary;
};

export function SubscriptionForm({ visible, onClose, onSuccess, editSubscription }: Props) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const createMutation = useCreateSubscriptionMutation(activeWorkspaceId);
  const updateMutation = useUpdateSubscriptionMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const today = format(new Date(), "yyyy-MM-dd");
  const isEditing = Boolean(editSubscription);

  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [frequency, setFrequency] = useState<SubscriptionFormInput["frequency"]>("monthly");
  const [intervalCount, setIntervalCount] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [remindDaysBefore, setRemindDaysBefore] = useState(3);
  const [autoCreateMovement, setAutoCreateMovement] = useState(false);
  const [description, setDescription] = useState("");

  const [nameError, setNameError] = useState("");
  const [amountError, setAmountError] = useState("");

  const nameRef = useRef<TextInput>(null);
  const vendorRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    if (editSubscription) {
      setName(editSubscription.name);
      setVendor(editSubscription.vendor ?? "");
      setAmount(String(editSubscription.amount));
      setCurrencyCode(editSubscription.currencyCode);
      setFrequency(editSubscription.frequency);
      setIntervalCount(String(editSubscription.intervalCount));
      setDayOfMonth(editSubscription.dayOfMonth ? String(editSubscription.dayOfMonth) : "");
      setStartDate(editSubscription.startDate);
      setEndDate(editSubscription.endDate ?? "");
      setAccountId(editSubscription.accountId ?? null);
      setCategoryId(editSubscription.categoryId ?? null);
      setRemindDaysBefore(editSubscription.remindDaysBefore);
      setAutoCreateMovement(editSubscription.autoCreateMovement);
      setDescription(editSubscription.description ?? "");
    } else {
      setName("");
      setVendor("");
      setAmount("");
      setCurrencyCode(defaultCurrency);
      setFrequency("monthly");
      setIntervalCount("1");
      setDayOfMonth("");
      setStartDate(today);
      setEndDate("");
      setAccountId(null);
      setCategoryId(null);
      setRemindDaysBefore(3);
      setAutoCreateMovement(false);
      setDescription("");
    }
    setNameError("");
    setAmountError("");
  }, [visible, editSubscription, defaultCurrency, today]);

  function handleClose() {
    if (name.trim() || amount) {
      Alert.alert("¿Descartar cambios?", "Se perderán los datos ingresados.", [
        { text: "Continuar", style: "cancel" },
        { text: "Descartar", style: "destructive", onPress: onClose },
      ]);
    } else {
      onClose();
    }
  }

  async function handleSubmit() {
    setNameError("");
    setAmountError("");
    let valid = true;
    if (!name.trim()) { setNameError("El nombre es obligatorio"); valid = false; }
    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) { setAmountError("Ingresa un monto válido"); valid = false; }
    if (!valid) {
      if (!name.trim()) nameRef.current?.focus();
      return;
    }

    try {
      if (isEditing && editSubscription) {
        await updateMutation.mutateAsync({
          id: editSubscription.id,
          input: {
            name: name.trim(),
            amount: parsed,
            currencyCode,
            frequency,
            intervalCount: parseInt(intervalCount) || 1,
            dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : null,
            endDate: endDate || null,
            accountId,
            categoryId,
            remindDaysBefore,
            autoCreateMovement,
            description: description.trim() || null,
          },
        });
        showToast("Suscripción actualizada", "success");
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          amount: parsed,
          currencyCode,
          frequency,
          intervalCount: parseInt(intervalCount) || 1,
          dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : null,
          startDate,
          endDate: endDate || null,
          accountId,
          categoryId,
          remindDaysBefore,
          autoCreateMovement,
          description: description.trim() || null,
        });
        showToast("Suscripción creada", "success");
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  const activeAccounts = snapshot?.accounts.filter((a) => !a.isArchived) ?? [];
  const expenseCategories = snapshot?.categories.filter((c) => c.kind === "expense" || c.kind === "both") ?? [];
  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={isEditing ? "Editar suscripción" : "Nueva suscripción"}
      snapHeight={0.95}
    >
      {/* Name */}
      <View>
        <Text style={styles.label}>Nombre *</Text>
        <TextInput
          ref={nameRef}
          style={[styles.textInput, nameError ? styles.inputError : null]}
          value={name}
          onChangeText={(t) => { setName(t); setNameError(""); }}
          placeholder="Ej. Netflix, Spotify, Adobe CC"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="next"
          onSubmitEditing={() => vendorRef.current?.focus()}
        />
        {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
      </View>

      {/* Vendor */}
      <View>
        <Text style={styles.label}>Proveedor (opcional)</Text>
        <TextInput
          ref={vendorRef}
          style={styles.textInput}
          value={vendor}
          onChangeText={setVendor}
          placeholder="Empresa que cobra"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="next"
          onSubmitEditing={() => descriptionRef.current?.focus()}
        />
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

      {/* Amount */}
      <CurrencyInput
        label="Monto *"
        value={amount}
        onChangeText={(t) => { setAmount(t); setAmountError(""); }}
        currencyCode={currencyCode}
        error={amountError}
      />

      {/* Frequency */}
      <View>
        <Text style={styles.label}>Frecuencia</Text>
        <View style={styles.pillWrap}>
          {FREQUENCY_OPTIONS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.pill, frequency === f.value && styles.pillActive]}
              onPress={() => setFrequency(f.value)}
            >
              <Text style={[styles.pillText, frequency === f.value && styles.pillTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Interval count */}
      <View style={styles.twoCol}>
        <View style={styles.colHalf}>
          <Text style={styles.label}>Cada (N)</Text>
          <TextInput
            style={styles.textInput}
            value={intervalCount}
            onChangeText={setIntervalCount}
            placeholder="1"
            placeholderTextColor={COLORS.textDisabled}
            keyboardType="number-pad"
          />
        </View>
        {frequency === "monthly" || frequency === "quarterly" || frequency === "yearly" ? (
          <View style={styles.colHalf}>
            <Text style={styles.label}>Día del mes</Text>
            <TextInput
              style={styles.textInput}
              value={dayOfMonth}
              onChangeText={setDayOfMonth}
              placeholder="1-31"
              placeholderTextColor={COLORS.textDisabled}
              keyboardType="number-pad"
            />
          </View>
        ) : null}
      </View>

      {/* Dates */}
      {!isEditing ? (
        <DatePickerInput
          label="Fecha de inicio"
          value={startDate}
          onChange={setStartDate}
        />
      ) : null}

      <DatePickerInput
        label="Fecha de fin (opcional)"
        value={endDate}
        onChange={setEndDate}
        optional
      />

      {/* Account */}
      {activeAccounts.length > 0 ? (
        <View>
          <Text style={styles.label}>Cuenta de débito (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, accountId === null && styles.pillActive]}
                onPress={() => setAccountId(null)}
              >
                <Text style={[styles.pillText, accountId === null && styles.pillTextActive]}>Ninguna</Text>
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

      {/* Category */}
      {expenseCategories.length > 0 ? (
        <View>
          <Text style={styles.label}>Categoría (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, categoryId === null && styles.pillActive]}
                onPress={() => setCategoryId(null)}
              >
                <Text style={[styles.pillText, categoryId === null && styles.pillTextActive]}>Ninguna</Text>
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

      {/* Remind days */}
      <View>
        <Text style={styles.label}>Recordatorio</Text>
        <View style={styles.pillWrap}>
          {REMIND_OPTIONS.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.pill, remindDaysBefore === r.value && styles.pillActive]}
              onPress={() => setRemindDaysBefore(r.value)}
            >
              <Text style={[styles.pillText, remindDaysBefore === r.value && styles.pillTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Auto create movement */}
      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Crear movimiento automáticamente</Text>
          <Text style={styles.switchDesc}>Registra el gasto al llegar la fecha de cobro</Text>
        </View>
        <Switch
          value={autoCreateMovement}
          onValueChange={setAutoCreateMovement}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor="#FFFFFF"
        />
      </View>

      {/* Description */}
      <View>
        <Text style={styles.label}>Descripción (opcional)</Text>
        <TextInput
          ref={descriptionRef}
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="Notas sobre esta suscripción"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="done"
          blurOnSubmit
        />
      </View>

      <Button
        label={isEditing ? "Guardar cambios" : "Crear suscripción"}
        onPress={handleSubmit}
        loading={isLoading}
        style={styles.submitBtn}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
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
  twoCol: { flexDirection: "row", gap: SPACING.md },
  colHalf: { flex: 1 },
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
  submitBtn: { marginTop: SPACING.sm },
});
