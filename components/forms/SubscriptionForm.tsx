import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CalendarClock, CalendarPlus, CalendarX2, AlertCircle } from "lucide-react-native";
import { format } from "date-fns";
import { useWorkspace } from "../../lib/workspace-context";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import {
  useCreateSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useWorkspaceSnapshotQuery,
  type SubscriptionFormInput,
} from "../../services/queries/workspace-data";
import { useMovementPatternsQuery } from "../../services/queries/movement-patterns";
import { buildPatternMaps, suggestCategoryFromDescription, suggestAccountFromCounterparty } from "../../lib/movement-patterns";
import type { SubscriptionSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CurrencyInput } from "../ui/CurrencyInput";
import { FormDateField } from "./FormDateField";
import { SmartSuggestion } from "../ui/SmartSuggestion";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const POPULAR_CURRENCIES = ["PEN", "USD", "EUR", "MXN", "COP", "ARS", "CLP", "BRL"];

const FREQUENCY_OPTIONS: { value: SubscriptionFormInput["frequency"]; label: string }[] = [
  { value: "weekly",    label: "Semanal" },
  { value: "monthly",   label: "Mensual" },
  { value: "quarterly", label: "Trimestral" },
  { value: "yearly",    label: "Anual" },
  { value: "daily",     label: "Diario" },
  { value: "custom",    label: "Personalizado" },
];

const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
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
  const haptics = useHaptics();
  const createMutation = useCreateSubscriptionMutation(activeWorkspaceId);
  const updateMutation = useUpdateSubscriptionMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);

  const { data: patternMovements } = useMovementPatternsQuery(activeWorkspaceId);
  const patternMaps = useMemo(
    () => (patternMovements ? buildPatternMaps(patternMovements) : null),
    [patternMovements],
  );
  const [catSuggestionId, setCatSuggestionId] = useState<number | null>(null);
  const [accSuggestionId, setAccSuggestionId] = useState<number | null>(null);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const today = format(new Date(), "yyyy-MM-dd");
  const isEditing = Boolean(editSubscription);

  const [name, setName] = useState("");
  const [vendorPartyId, setVendorPartyId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [frequency, setFrequency] = useState<SubscriptionFormInput["frequency"]>("monthly");
  const [intervalCount, setIntervalCount] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(today);
  const [nextDueDate, setNextDueDate] = useState(today);
  const [endDate, setEndDate] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [remindDaysBefore, setRemindDaysBefore] = useState(3);
  const [autoCreateMovement, setAutoCreateMovement] = useState(false);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const [nameError, setNameError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [showDiscard, setShowDiscard] = useState(false);

  const nameRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    if (editSubscription) {
      setName(editSubscription.name);
      setVendorPartyId(editSubscription.vendorPartyId ?? null);
      setAmount(String(editSubscription.amount));
      setCurrencyCode(editSubscription.currencyCode);
      setFrequency(editSubscription.frequency);
      setIntervalCount(String(editSubscription.intervalCount));
      setDayOfMonth(editSubscription.dayOfMonth ? String(editSubscription.dayOfMonth) : "");
      setDayOfWeek(
        editSubscription.dayOfWeek !== undefined && editSubscription.dayOfWeek !== null
          ? editSubscription.dayOfWeek
          : null,
      );
      setStartDate(editSubscription.startDate);
      setNextDueDate(editSubscription.nextDueDate);
      setEndDate(editSubscription.endDate ?? "");
      setAccountId(editSubscription.accountId ?? null);
      setCategoryId(editSubscription.categoryId ?? null);
      setRemindDaysBefore(editSubscription.remindDaysBefore);
      setAutoCreateMovement(editSubscription.autoCreateMovement);
      setDescription(editSubscription.description ?? "");
      setNotes(editSubscription.notes ?? "");
    } else {
      setName("");
      setVendorPartyId(null);
      setAmount("");
      setCurrencyCode(defaultCurrency);
      setFrequency("monthly");
      setIntervalCount("1");
      setDayOfMonth("");
      setDayOfWeek(null);
      setStartDate(today);
      setNextDueDate(today);
      setEndDate("");
      setAccountId(null);
      setCategoryId(null);
      setRemindDaysBefore(3);
      setAutoCreateMovement(false);
      setDescription("");
      setNotes("");
    }
    setNameError("");
    setAmountError("");
    setSubmitError("");
  }, [visible, editSubscription, defaultCurrency, today]);

  function handleClose() {
    const es = editSubscription;
    const isDirty = isEditing && es
      ? (name.trim() !== es.name.trim() ||
         vendorPartyId !== (es.vendorPartyId ?? null) ||
         amount !== String(es.amount) ||
         currencyCode !== es.currencyCode ||
         frequency !== es.frequency ||
         intervalCount !== String(es.intervalCount) ||
         (dayOfMonth || "") !== (es.dayOfMonth != null ? String(es.dayOfMonth) : "") ||
         dayOfWeek !== (es.dayOfWeek ?? null) ||
         startDate !== es.startDate ||
         nextDueDate !== es.nextDueDate ||
         (endDate || "") !== (es.endDate ?? "") ||
         accountId !== (es.accountId ?? null) ||
         categoryId !== (es.categoryId ?? null) ||
         remindDaysBefore !== es.remindDaysBefore ||
         autoCreateMovement !== es.autoCreateMovement ||
         (description.trim() || "") !== (es.description?.trim() ?? "") ||
         (notes.trim() || "") !== (es.notes?.trim() ?? ""))
      : Boolean(name.trim() || amount);
    if (isDirty) {
      setShowDiscard(true);
    } else {
      onClose();
    }
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

    if (!startDate?.trim()) {
      haptics.error();
      setSubmitError("La fecha de inicio es obligatoria");
      return;
    }
    if (!nextDueDate?.trim()) {
      haptics.error();
      setSubmitError("El próximo vencimiento es obligatorio");
      return;
    }
    if (nextDueDate < startDate) {
      haptics.error();
      setSubmitError("El próximo vencimiento debe ser igual o posterior al inicio");
      return;
    }
    if (endDate.trim() && endDate < startDate) {
      haptics.error();
      setSubmitError("La fecha de fin no puede ser anterior al inicio");
      return;
    }

    const ic = parseInt(intervalCount, 10);
    if (!Number.isFinite(ic) || ic < 1) {
      setSubmitError("Intervalo inválido");
      return;
    }

    let resolvedDayOfMonth: number | null = null;
    if (frequency === "monthly" || frequency === "quarterly" || frequency === "yearly") {
      if (dayOfMonth.trim()) {
        const dom = parseInt(dayOfMonth, 10);
        if (!Number.isFinite(dom) || dom < 1 || dom > 31) {
          setSubmitError("Día del mes entre 1 y 31");
          return;
        }
        resolvedDayOfMonth = dom;
      }
    }

    let resolvedDayOfWeek: number | null = null;
    if (frequency === "weekly" && dayOfWeek !== null) {
      if (dayOfWeek < 0 || dayOfWeek > 6) {
        setSubmitError("Día de la semana inválido (0–6)");
        return;
      }
      resolvedDayOfWeek = dayOfWeek;
    }

    if (remindDaysBefore < 0 || !Number.isFinite(remindDaysBefore)) {
      setSubmitError("Días de recordatorio inválidos");
      return;
    }

    const cc = currencyCode.trim().toUpperCase();
    if (!cc) {
      setSubmitError("Indica una moneda");
      return;
    }

    const payloadBase = {
      name: name.trim(),
      vendorPartyId,
      amount: parsed,
      currencyCode: cc,
      frequency,
      intervalCount: ic,
      dayOfMonth: resolvedDayOfMonth,
      dayOfWeek: frequency === "weekly" ? resolvedDayOfWeek : null,
      startDate,
      nextDueDate,
      endDate: endDate.trim() ? endDate : null,
      accountId,
      categoryId,
      remindDaysBefore,
      autoCreateMovement,
      description: description.trim() ? description.trim() : null,
      notes: notes.trim() ? notes.trim() : null,
    };

    try {
      if (isEditing && editSubscription) {
        await updateMutation.mutateAsync({
          id: editSubscription.id,
          input: payloadBase,
        });
        showToast("Suscripción actualizada", "success");
      } else {
        await createMutation.mutateAsync({
          ...payloadBase,
        });
        showToast("Suscripción creada", "success");
      }
      haptics.success();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      haptics.error();
      setSubmitError(humanizeError(err));
    }
  }

  const activeAccounts = useMemo(
    () => sortByName(snapshot?.accounts.filter((a) => !a.isArchived) ?? []),
    [snapshot?.accounts],
  );
  const expenseCategories = useMemo(
    () =>
      sortByName(
        snapshot?.categories.filter((c) => c.isActive && (c.kind === "expense" || c.kind === "both")) ?? [],
      ),
    [snapshot?.categories],
  );
  const counterparties = useMemo(
    () => sortByName(snapshot?.counterparties ?? []),
    [snapshot?.counterparties],
  );
  const isLoading = createMutation.isPending || updateMutation.isPending;

  // Name → suggest category (debounced)
  useEffect(() => {
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    if (!patternMaps || categoryId !== null) { setCatSuggestionId(null); return; }
    const trimmed = name.trim();
    if (trimmed.length < 3) { setCatSuggestionId(null); return; }
    nameDebounceRef.current = setTimeout(() => {
      setCatSuggestionId(suggestCategoryFromDescription(trimmed, patternMaps));
    }, 350);
    return () => { if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, categoryId, patternMaps]);

  // Vendor (counterparty) → suggest account
  useEffect(() => {
    if (!patternMaps || accountId !== null || vendorPartyId === null) {
      setAccSuggestionId(null);
      return;
    }
    setAccSuggestionId(suggestAccountFromCounterparty(vendorPartyId, patternMaps));
  }, [vendorPartyId, accountId, patternMaps]);

  return (
    <>
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
        />
        {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
      </View>

      {/* Vendor (counterparty picker) */}
      {counterparties.length > 0 ? (
        <View>
          <Text style={styles.label}>Proveedor (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, vendorPartyId === null && styles.pillActive]}
                onPress={() => setVendorPartyId(null)}
              >
                <Text style={[styles.pillText, vendorPartyId === null && styles.pillTextActive]}>Ninguno</Text>
              </TouchableOpacity>
              {counterparties.map((cp) => (
                <TouchableOpacity
                  key={cp.id}
                  style={[styles.pill, vendorPartyId === cp.id && styles.pillActive]}
                  onPress={() => setVendorPartyId(cp.id)}
                >
                  <Text style={[styles.pillText, vendorPartyId === cp.id && styles.pillTextActive]}>
                    {cp.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

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

      {frequency === "weekly" ? (
        <View>
          <Text style={styles.label}>Día de la semana (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.pillRow}>
              <TouchableOpacity
                style={[styles.pill, dayOfWeek === null && styles.pillActive]}
                onPress={() => setDayOfWeek(null)}
              >
                <Text style={[styles.pillText, dayOfWeek === null && styles.pillTextActive]}>—</Text>
              </TouchableOpacity>
              {WEEKDAY_OPTIONS.map((w) => (
                <TouchableOpacity
                  key={w.value}
                  style={[styles.pill, dayOfWeek === w.value && styles.pillActive]}
                  onPress={() => setDayOfWeek(w.value)}
                >
                  <Text style={[styles.pillText, dayOfWeek === w.value && styles.pillTextActive]}>{w.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Fechas — campos con ayuda y selector unificado */}
      <View style={styles.datesBlock}>
        <View style={styles.datesIntro}>
          <Text style={styles.datesIntroTitle}>Fechas de la suscripción</Text>
          <Text style={styles.datesIntroBody}>
            Toca cada bloque para elegir fecha. En «Fin» puedes dejar vacío: usa el botón ✕ al lado o «Quitar» dentro del calendario.
          </Text>
        </View>

      <FormDateField
        title="Inicio del cobro"
        description="Desde qué día cuenta esta suscripción: suele ser la primera factura, el alta del servicio o la fecha que quieras tomar como referencia. Sirve para que vencimiento y fin tengan sentido frente a ese inicio."
        required
        value={startDate}
        onChange={setStartDate}
        placeholder="Elegir fecha de inicio"
        Icon={CalendarPlus}
        accentColor={COLORS.primary}
      />

      <FormDateField
        title="Próximo vencimiento"
        description="El próximo día en que vence o se renueva el pago. Es la fecha que verás en listados, recordatorios y lógica de «próximo cobro»."
        required
        value={nextDueDate}
        onChange={setNextDueDate}
        placeholder="Elegir próximo vencimiento"
        minimumDate={
          startDate
            ? (() => {
                const p = startDate.split("-").map(Number);
                return new Date(p[0], p[1] - 1, p[2]);
              })()
            : undefined
        }
        Icon={CalendarClock}
        accentColor={COLORS.gold}
      />

      <FormDateField
        title="Fin de la suscripción"
        description="Solo si hay una fecha de baja o fin de contrato. Si la suscripción es indefinida o aún no sabes cuándo termina, déjalo vacío (sin límite hasta que la pauses o canceles en estado)."
        optional
        value={endDate}
        onChange={setEndDate}
        placeholder="Sin fecha de fin — opcional"
        minimumDate={
          startDate
            ? (() => {
                const p = startDate.split("-").map(Number);
                return new Date(p[0], p[1] - 1, p[2]);
              })()
            : undefined
        }
        Icon={CalendarX2}
        accentColor={COLORS.secondary}
      />
      </View>

      {/* Account */}
      {activeAccounts.length > 0 ? (
        <View style={{ gap: SPACING.xs }}>
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
          {accSuggestionId !== null ? (() => {
            const acc = activeAccounts.find((a) => a.id === accSuggestionId);
            return acc ? (
              <SmartSuggestion label={acc.name} onApply={() => setAccountId(acc.id)} />
            ) : null;
          })() : null}
        </View>
      ) : null}

      {/* Category */}
      {expenseCategories.length > 0 ? (
        <View style={{ gap: SPACING.xs }}>
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
          {catSuggestionId !== null ? (() => {
            const cat = expenseCategories.find((c) => c.id === catSuggestionId);
            return cat ? (
              <SmartSuggestion label={cat.name} onApply={() => setCategoryId(cat.id)} />
            ) : null;
          })() : null}
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
          placeholder="Resumen visible en listados"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="next"
          blurOnSubmit
        />
      </View>

      <View>
        <Text style={styles.label}>Notas internas (opcional)</Text>
        <TextInput
          style={[styles.textInput, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notas adicionales"
          placeholderTextColor={COLORS.textDisabled}
          multiline
          textAlignVertical="top"
        />
      </View>

      {submitError ? (
        <View style={styles.submitErrorBanner}>
          <AlertCircle size={16} color={COLORS.danger} strokeWidth={2} />
          <Text style={styles.submitErrorText}>{submitError}</Text>
        </View>
      ) : null}

      <Button
        label={isEditing ? "Guardar cambios" : "Crear suscripción"}
        onPress={handleSubmit}
        loading={isLoading}
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
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
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
  twoCol: { flexDirection: "row", gap: SPACING.md },
  colHalf: { flex: 1 },
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
  datesBlock: { gap: SPACING.md },
  datesIntro: {
    gap: SPACING.xs,
  },
  datesIntroTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  datesIntroBody: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    lineHeight: 18,
  },
  notesInput: { minHeight: 88, paddingTop: SPACING.sm },
});
