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
import {
  buildPatternMaps,
  suggestAccountFromCounterparty,
  suggestCategoryFromCounterparty,
  suggestCategoryFromDescription,
} from "../../lib/movement-patterns";
import { computeNextRecurringDate, subscriptionFrequencyListLabel } from "../../lib/subscription-helpers";
import type { SubscriptionSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CurrencyInput } from "../ui/CurrencyInput";
import { BusinessDateNotice } from "../ui/BusinessDateNotice";
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

const REMIND_OPTIONS = [
  { label: "1 día", value: 1 },
  { label: "3 días", value: 3 },
  { label: "7 días", value: 7 },
  { label: "Sin aviso", value: 0 },
];

const FREQUENCY_LABELS: Record<SubscriptionFormInput["frequency"], string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
  custom: "Personalizado",
};

function parseLocalYmd(ymd: string): Date {
  const parts = ymd.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return new Date(ymd);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatYmdPreview(ymd: string): string {
  if (!ymd.trim()) return "sin fecha";
  return format(parseLocalYmd(ymd), "d MMM yyyy");
}

function buildIntervalHelperCopy(
  frequency: SubscriptionFormInput["frequency"],
  intervalCount: number,
  frequencyLabel: string,
): string {
  if (frequency === "custom") {
    return `Personalizado siempre usa días. ${intervalCount} significa ${frequencyLabel.toLowerCase()}.`;
  }
  return `Cadencia resultante: ${frequencyLabel}. El sistema siempre parte del próximo cobro que elijas.`;
}

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
      setSubmitError("El próximo cobro es obligatorio");
      return;
    }
    if (nextDueDate < startDate) {
      haptics.error();
      setSubmitError("El próximo cobro debe ser igual o posterior al inicio");
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
    if (autoCreateMovement && accountId === null) {
      setSubmitError("Para crear el movimiento automáticamente debes elegir una cuenta de débito.");
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
  const intervalValue = Math.max(1, parseInt(intervalCount, 10) || 1);
  const recurrenceLabel = subscriptionFrequencyListLabel(intervalValue, frequency, FREQUENCY_LABELS);
  const nextCycleDate = nextDueDate.trim()
    ? computeNextRecurringDate(nextDueDate, frequency, intervalValue)
    : "";
  const selectedAccountName = accountId !== null
    ? activeAccounts.find((account) => account.id === accountId)?.name ?? null
    : null;
  const intervalHelperCopy = buildIntervalHelperCopy(frequency, intervalValue, recurrenceLabel);

  // Name → suggest category (debounced)
  useEffect(() => {
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    if (!patternMaps || categoryId !== null) { setCatSuggestionId(null); return; }
    const trimmed = name.trim();
    if (trimmed.length < 3) { setCatSuggestionId(null); return; }
    nameDebounceRef.current = setTimeout(() => {
      const suggestedByName = suggestCategoryFromDescription(trimmed, patternMaps);
      const suggestedByVendor = vendorPartyId !== null
        ? suggestCategoryFromCounterparty(vendorPartyId, patternMaps)
        : null;
      setCatSuggestionId(suggestedByName ?? suggestedByVendor);
    }, 350);
    return () => { if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, categoryId, patternMaps, vendorPartyId]);

  // Vendor can suggest category even before the name is descriptive.
  useEffect(() => {
    if (!patternMaps || categoryId !== null || vendorPartyId === null || name.trim().length >= 3) return;
    setCatSuggestionId(suggestCategoryFromCounterparty(vendorPartyId, patternMaps));
  }, [vendorPartyId, categoryId, patternMaps, name]);

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
        <Text style={styles.helperText}>
          El sistema usa el próximo cobro como base para repetir esta suscripción. En personalizado, el intervalo siempre se mide en días.
        </Text>
      </View>

      {/* Interval count */}
      <View>
        <Text style={styles.label}>
          {frequency === "custom" ? "Repetir cada N días" : "Repetir cada N periodos"}
        </Text>
        <TextInput
          style={styles.textInput}
          value={intervalCount}
          onChangeText={setIntervalCount}
          placeholder="1"
          placeholderTextColor={COLORS.textDisabled}
          keyboardType="number-pad"
        />
        <Text style={styles.helperText}>{intervalHelperCopy}</Text>
      </View>

      <View style={styles.systemCard}>
        <Text style={styles.systemCardTitle}>Así lo hará el sistema</Text>
        <Text style={styles.systemCardLine}>
          Inicio: {formatYmdPreview(startDate)}. Esta fecha es referencia y evita que el próximo cobro quede antes del inicio.
        </Text>
        <Text style={styles.systemCardLine}>
          Próximo cobro: {formatYmdPreview(nextDueDate)}. Esta es la fecha real que se mostrará en listados y recordatorios.
        </Text>
        <Text style={styles.systemCardLine}>
          Repetición: {recurrenceLabel}. Después del cobro del {formatYmdPreview(nextDueDate)}, el siguiente pasará al {formatYmdPreview(nextCycleDate)}.
        </Text>
        <Text style={styles.systemCardLine}>
          {autoCreateMovement
            ? selectedAccountName
              ? `Movimiento automático activo: ese día se registrará un gasto en ${selectedAccountName}.`
              : "Movimiento automático activo, pero aún falta elegir la cuenta donde se registrará el gasto."
            : "Movimiento automático desactivado: la suscripción solo avisará y mostrará el próximo cobro."}
        </Text>
      </View>

      {/* Fechas — campos con ayuda y selector unificado */}
      <View style={styles.datesBlock}>
        <View style={styles.datesIntro}>
          <Text style={styles.datesIntroTitle}>Fechas de la suscripción</Text>
          <Text style={styles.datesIntroBody}>
            El sistema no adivina las fechas: toma el próximo cobro que elijas y desde ahí repite según la frecuencia. En «Fin» puedes dejar vacío si no hay fecha de baja.
          </Text>
        </View>

      <FormDateField
        title="Inicio de la suscripción"
        description="Marca desde cuándo existe este servicio o contrato. No mueve por sí sola el próximo cobro; sirve como referencia y como fecha mínima válida."
        required
        value={startDate}
        onChange={setStartDate}
        placeholder="Elegir fecha de inicio"
        Icon={CalendarPlus}
        accentColor={COLORS.primary}
      />

      <FormDateField
        title="Próximo cobro o renovación"
        description="Esta es la fecha real que usará el sistema para mostrar vencimientos, enviar recordatorios y calcular el siguiente ciclo."
        required
        value={nextDueDate}
        onChange={setNextDueDate}
        placeholder="Elegir próximo cobro"
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
      <BusinessDateNotice dateValue={nextDueDate} onApplySuggestedDate={setNextDueDate} />

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
          <Text style={styles.label}>Cuenta de débito</Text>
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
          <Text style={styles.helperText}>
            Si activas movimiento automático, esta cuenta es obligatoria porque aquí se registrará el gasto.
          </Text>
          {accSuggestionId !== null ? (() => {
            const acc = activeAccounts.find((a) => a.id === accSuggestionId);
            return acc ? (
              <SmartSuggestion
                label={acc.name}
                detail="Cuenta aprendida por pagos parecidos a este proveedor"
                onApply={() => setAccountId(acc.id)}
              />
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
              <SmartSuggestion
                label={cat.name}
                detail="Categoría sugerida por nombre y proveedor"
                onApply={() => setCategoryId(cat.id)}
              />
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
        <Text style={styles.helperText}>
          Solo envía un aviso antes del próximo cobro. No registra el gasto por sí mismo.
        </Text>
      </View>

      {/* Auto create movement */}
      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Crear movimiento automáticamente</Text>
          <Text style={styles.switchDesc}>Al llegar el próximo cobro, registra el gasto y luego mueve la fecha al siguiente ciclo.</Text>
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
  helperText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    lineHeight: 18,
  },
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  systemCard: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.secondary + "10",
    borderWidth: 1,
    borderColor: COLORS.secondary + "30",
  },
  systemCardTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  systemCardLine: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    lineHeight: 18,
  },
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
