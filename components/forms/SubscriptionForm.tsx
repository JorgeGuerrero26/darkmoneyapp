import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AlertCircle } from "lucide-react-native";
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
import { subscriptionFrequencyListLabel } from "../../lib/subscription-helpers";
import type { SubscriptionSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { DatePickerInput } from "../ui/DatePickerInput";
import { FormOptionRow } from "../ui/FormOptionRow";
import { FormFirstRunHelp, useFormFirstRunHelp } from "./FormFirstRunHelp";
import { SearchableSelectSheet } from "../ui/SearchableSelectSheet";
import { CurrencySelectOverlay } from "./CurrencySelectOverlay";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CurrencyInput } from "../ui/CurrencyInput";
import { BusinessDateNotice } from "../ui/BusinessDateNotice";
import { SmartSuggestion } from "../ui/SmartSuggestion";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { TextField } from "../ui/TextField";


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

  // Ver MovementForm: sin el gate en `visible` esto se pide con la hoja cerrada.
  const { data: patternMovements } = useMovementPatternsQuery(visible ? activeWorkspaceId : null);
  const patternMaps = useMemo(
    () => (patternMovements ? buildPatternMaps(patternMovements) : null),
    [patternMovements],
  );
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [vendorOpen, setVendorOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const { open: helpOpen, dismiss: dismissHelp, show: showHelp } = useFormFirstRunHelp(
    "dm_help_subscription_form",
    visible,
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

  const submittingRef = useRef(false);

  async function handleSubmit() {
    if (submittingRef.current) return; // guard anti-doble-tap: evita duplicados
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

    submittingRef.current = true;
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
    } finally {
      submittingRef.current = false;
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
  // El botón vivía al final de 2.400 px: para saber si ya podías guardar había que volver a
  // subir a repasar los campos. Ahora lo NOMBRA.
  const missingLabel = !name.trim()
    ? "Falta el nombre"
    : !amount.trim() || Number(amount) <= 0
      ? "Falta el monto"
      : !nextDueDate.trim()
        ? "Falta el próximo cobro"
        : autoCreateMovement && accountId === null
          ? "Falta la cuenta de débito"
          : null;

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const intervalValue = Math.max(1, parseInt(intervalCount, 10) || 1);
  const recurrenceLabel = subscriptionFrequencyListLabel(intervalValue, frequency, FREQUENCY_LABELS);
  const selectedAccountName = accountId !== null
    ? activeAccounts.find((account) => account.id === accountId)?.name ?? null
    : null;

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
        // Dentro del sheet: iOS solo presenta un Modal a la vez y como hermano no aparecía.
        overlay={
          <>
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
            <SearchableSelectSheet
            inline
            visible={frequencyOpen}
            title="Se repite"
            options={FREQUENCY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={frequency}
            onChange={(next: SubscriptionFormInput["frequency"]) => {
              setFrequency(next);
              // Personalizado es el único que necesita un número; se pide justo después,
              // no como campo permanente para los otros cinco.
              if (next !== "custom") setIntervalCount("1");
            }}
            onClose={() => setFrequencyOpen(false)}
          />
          <SearchableSelectSheet
            inline
            visible={remindOpen}
            title="Avisarme antes"
            options={REMIND_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={remindDaysBefore}
            onChange={setRemindDaysBefore}
            onClose={() => setRemindOpen(false)}
          />
          <SearchableSelectSheet
            inline
            visible={vendorOpen}
            title="Proveedor"
            options={[
              { value: null as number | null, label: "Ninguno" },
              ...counterparties.map((cp) => ({ value: cp.id as number | null, label: cp.name })),
            ]}
            value={vendorPartyId}
            onChange={setVendorPartyId}
            onClose={() => setVendorOpen(false)}
          />
          <SearchableSelectSheet
            inline
            visible={accountOpen}
            title="Cuenta de débito"
            options={[
              { value: null as number | null, label: "Ninguna" },
              ...activeAccounts.map((acc) => ({ value: acc.id as number | null, label: acc.name })),
            ]}
            value={accountId}
            onChange={setAccountId}
            onClose={() => setAccountOpen(false)}
          />
          <SearchableSelectSheet
            inline
            visible={categoryOpen}
            title="Categoría"
            options={[
              { value: null as number | null, label: "Ninguna" },
              ...expenseCategories.map((cat) => ({ value: cat.id as number | null, label: cat.name })),
            ]}
            value={categoryId}
            onChange={setCategoryId}
            onClose={() => setCategoryOpen(false)}
          />
          <CurrencySelectOverlay
              visible={currencyOpen}
              onClose={() => setCurrencyOpen(false)}
              value={currencyCode}
              onChange={setCurrencyCode}
            />
          </>
        }
      >
      {/* Name */}
      <FormFirstRunHelp
        open={helpOpen}
        onDismiss={dismissHelp}
        onShow={showHelp}
        title="Cómo funciona"
        lines={[
          "El sistema no adivina las fechas: toma el próximo cobro que elijas y desde ahí repite según cada cuánto se cobre.",
          "Inicio y Fin están en Opcionales. Inicio es solo referencia y Fin puede quedar vacío si no hay fecha de baja.",
          "Si activas «Registrar el gasto solo», ese día se anota el gasto en la cuenta que elijas y la fecha pasa al siguiente ciclo.",
        ]}
      />

      {/* Cuatro decisiones en una pantalla, sin desplazarse: nombre, monto, cada cuánto y
          cuándo. Lo demás vive en Opcionales, que la mayoría va a pasar de largo. */}
      <View>
        <Text style={styles.label}>Nombre *</Text>
        <TextField
          ref={nameRef}
          style={[styles.textInput, nameError ? styles.inputError : null]}
          value={name}
          onChangeText={(t) => { setName(t); setNameError(""); }}
          placeholder="Netflix, Spotify, Adobe…"
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="next"
        />
        {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
      </View>

      <CurrencyInput
        label="Monto *"
        value={amount}
        onChangeText={(t) => { setAmount(t); setAmountError(""); }}
        currencyCode={currencyCode}
        error={amountError}
      />

      {/* Antes eran tres controles para una pregunta: seis cápsulas de frecuencia, un campo
          numérico y la línea "Cadencia resultante" que traducía lo recién elegido. */}
      <FormOptionRow
        label="Se repite"
        value={recurrenceLabel}
        onPress={() => setFrequencyOpen(true)}
      />
      {frequency === "custom" ? (
        <View>
          <Text style={styles.label}>Cada cuántos días</Text>
          <TextField
            style={styles.textInput}
            value={intervalCount}
            onChangeText={setIntervalCount}
            placeholder="1"
            placeholderTextColor={COLORS.textDisabled}
            keyboardType="number-pad"
          />
        </View>
      ) : null}

      {/* La única fecha que hace algo. Inicio y fin bajaron a Opcionales: el propio texto del
          formulario admitía que Inicio "no mueve por sí sola el próximo cobro". */}
      <DatePickerInput
        label="Próximo cobro"
        value={nextDueDate}
        onChange={setNextDueDate}
        placeholder="Elegir fecha"
        variant="formRow"
        minimumDate={startDate ? parseLocalYmd(startDate) : undefined}
      />
      <Text style={styles.helperText}>Desde esta fecha se calcula el ciclo.</Text>
      <BusinessDateNotice dateValue={nextDueDate} onApplySuggestedDate={setNextDueDate} />

      <FormOptionRow
        label="Avisarme antes"
        value={REMIND_OPTIONS.find((option) => option.value === remindDaysBefore)?.label ?? "Sin aviso"}
        onPress={() => setRemindOpen(true)}
      />

      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Registrar el gasto solo</Text>
          <Text style={styles.switchDesc}>
            {autoCreateMovement && !accountId
              ? "Necesita una cuenta de débito — elígela en Opcionales"
              : "Necesita una cuenta de débito"}
          </Text>
        </View>
        <Switch
          value={autoCreateMovement}
          onValueChange={setAutoCreateMovement}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={COLORS.ink}
        />
      </View>

      {/* Ocho campos marcados "(opcional)" sumaban 700 px que la mayoría pasa de largo. */}
      <FormOptionRow
        label="Opcionales"
        support="Proveedor, moneda, cuenta, categoría, fechas y notas"
        value={null}
        placeholder={showOptional ? "Ocultar" : "Abrir"}
        onPress={() => setShowOptional((open) => !open)}
      />

      {showOptional ? (
        <View style={styles.optionalBlock}>
          {counterparties.length > 0 ? (
            <FormOptionRow
              label="Proveedor"
              value={counterparties.find((cp) => cp.id === vendorPartyId)?.name ?? null}
              placeholder="Ninguno"
              onPress={() => setVendorOpen(true)}
            />
          ) : null}

          <FormOptionRow
            label="Moneda"
            value={currencyCode}
            onPress={() => setCurrencyOpen(true)}
          />

          {activeAccounts.length > 0 ? (
            <>
              <FormOptionRow
                label="Cuenta de débito"
                value={selectedAccountName}
                placeholder="Ninguna"
                onPress={() => setAccountOpen(true)}
              />
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
            </>
          ) : null}

          {expenseCategories.length > 0 ? (
            <>
              <FormOptionRow
                label="Categoría"
                value={expenseCategories.find((c) => c.id === categoryId)?.name ?? null}
                placeholder="Ninguna"
                onPress={() => setCategoryOpen(true)}
              />
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
            </>
          ) : null}

          <DatePickerInput
            label="Inicio"
            value={startDate}
            onChange={setStartDate}
            placeholder="Elegir fecha"
            variant="formRow"
          />

          <DatePickerInput
            label="Fin"
            value={endDate}
            onChange={setEndDate}
            placeholder="Sin fecha de fin"
            optional
            showInlineClear
            variant="formRow"
            minimumDate={startDate ? parseLocalYmd(startDate) : undefined}
          />

          <View>
            <Text style={styles.label}>Descripción</Text>
            <TextField
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
            <Text style={styles.label}>Notas internas</Text>
            <TextField
              style={[styles.textInput, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notas adicionales"
              placeholderTextColor={COLORS.textDisabled}
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>
      ) : null}

      {submitError ? (
        <View style={styles.submitErrorBanner}>
          <AlertCircle size={16} color={COLORS.danger} strokeWidth={2} />
          <Text style={styles.submitErrorText}>{submitError}</Text>
        </View>
      ) : null}

      <View style={styles.submitBar}>
        {missingLabel ? <Text style={styles.missingLabel}>{missingLabel}</Text> : null}
        <Button
          label={isEditing ? "Guardar cambios" : "Crear suscripción"}
          onPress={handleSubmit}
          loading={isLoading}
          size="lg"
        />
      </View>
    </BottomSheet>
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
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: SPACING.xs },
  optionalBlock: {
    gap: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  submitBar: { gap: SPACING.xs, marginTop: SPACING.sm },
  missingLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
  },
  pillRow: { flexDirection: "row", gap: SPACING.sm },
  pillWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  switchInfo: { flex: 1, gap: SPACING.xs / 2, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
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
  notesInput: { minHeight: 88, paddingTop: SPACING.sm },
});
