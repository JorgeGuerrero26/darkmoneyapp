import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { AlertCircle, HelpCircle } from "lucide-react-native";
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
import { subscriptionRecurrencePhrase } from "../../lib/subscription-helpers";
import type { SubscriptionSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { FormDateRow } from "../ui/FormDateRow";
import { FormOptionRow } from "../ui/FormOptionRow";
import { FormFirstRunHelp, useFormFirstRunHelp } from "./FormFirstRunHelp";
import { SearchableSelectSheet } from "../ui/SearchableSelectSheet";
import { CurrencySelectOverlay } from "./CurrencySelectOverlay";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { CurrencyInput } from "../ui/CurrencyInput";
import { BusinessDateNotice } from "../ui/BusinessDateNotice";
import { SmartSuggestion } from "../ui/SmartSuggestion";
import { SubscriptionOptionalsSheet } from "../../features/subscriptions/components/SubscriptionOptionalsSheet";
import { currencyPluralTitle } from "../../constants/currencies";
import { relativeDateLabel } from "../../lib/calendar";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { TextField } from "../ui/TextField";


// "Cada mes" y no "Mensual": la fila dice cada cuánto se cobra, y así se dice. El adjetivo
// vuelve solo cuando el intervalo pasa de uno ("Cada 3 meses"), donde ya no cabe la forma corta.
const FREQUENCY_OPTIONS: { value: SubscriptionFormInput["frequency"]; label: string }[] = [
  { value: "weekly",    label: "Cada semana" },
  { value: "monthly",   label: "Cada mes" },
  { value: "quarterly", label: "Cada trimestre" },
  { value: "yearly",    label: "Cada año" },
  { value: "daily",     label: "Cada día" },
  { value: "custom",    label: "Personalizado" },
];

const REMIND_OPTIONS = [
  { label: "1 día", value: 1 },
  { label: "3 días", value: 3 },
  { label: "7 días", value: 7 },
  { label: "Sin aviso", value: 0 },
];

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
  const [optionalsOpen, setOptionalsOpen] = useState(false);
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
      setSubmitError("Elige la cuenta con la que se paga: el cobro se anota en ella.");
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
          ? "Falta la cuenta con la que se paga"
          : null;

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const intervalValue = Math.max(1, parseInt(intervalCount, 10) || 1);
  const recurrenceLabel = subscriptionRecurrencePhrase(intervalValue, frequency);

  /* Con lo obligatorio completo, el pie deja de nombrar lo que falta y dice qué se va a crear:
     "Se cobrará hoy y cada mes". Repetir "Falta el nombre" con el nombre puesto era ruido. */
  const nextChargeWord = nextDueDate ? relativeDateLabel(nextDueDate, today).toLowerCase() : "";
  const summaryLine = nextChargeWord
    ? `Se cobrará ${/^(hoy|ayer|anteayer|mañana)$/.test(nextChargeWord) ? nextChargeWord : `el ${nextChargeWord}`} y ${recurrenceLabel.toLowerCase()}`
    : null;
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
        headerAction={
          <TouchableOpacity
            onPress={showHelp}
            style={styles.helpBtn}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Cómo funciona este formulario"
          >
            <HelpCircle size={15} color={COLORS.storm} />
          </TouchableOpacity>
        }
        footer={
          <View style={styles.submitBar}>
            {missingLabel ? (
              <Text style={styles.submitNote}>{missingLabel}</Text>
            ) : summaryLine ? (
              <Text style={styles.submitNote}>{summaryLine}</Text>
            ) : null}
            <Button
              label={isEditing ? "Guardar cambios" : "Crear suscripción"}
              onPress={handleSubmit}
              loading={isLoading}
              size="lg"
            />
          </View>
        }
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
            {/* Las hojas van primero: los selectores que se abren DESDE ellas se pintan
                después y quedan por encima. */}
            <SubscriptionOptionalsSheet
              visible={optionalsOpen}
              onClose={() => setOptionalsOpen(false)}
              showVendor={counterparties.length > 0}
              vendorLabel={counterparties.find((cp) => cp.id === vendorPartyId)?.name ?? null}
              onOpenVendor={() => setVendorOpen(true)}
              showAccount={activeAccounts.length > 0 && !autoCreateMovement}
              accountLabel={selectedAccountName}
              onOpenAccount={() => setAccountOpen(true)}
              accountSuggestion={accSuggestionId !== null ? (() => {
                const acc = activeAccounts.find((a) => a.id === accSuggestionId);
                return acc ? (
                  <SmartSuggestion
                    label={acc.name}
                    detail="Cuenta aprendida por pagos parecidos a este proveedor"
                    onApply={() => setAccountId(acc.id)}
                  />
                ) : null;
              })() : null}
              showCategory={expenseCategories.length > 0}
              categoryLabel={expenseCategories.find((c) => c.id === categoryId)?.name ?? null}
              onOpenCategory={() => setCategoryOpen(true)}
              categorySuggestion={catSuggestionId !== null ? (() => {
                const cat = expenseCategories.find((c) => c.id === catSuggestionId);
                return cat ? (
                  <SmartSuggestion
                    label={cat.name}
                    detail="Categoría sugerida por nombre y proveedor"
                    onApply={() => setCategoryId(cat.id)}
                  />
                ) : null;
              })() : null}
              currencyLabel={currencyPluralTitle(currencyCode) || currencyCode}
              onOpenCurrency={() => setCurrencyOpen(true)}
              startDate={startDate}
              onChangeStartDate={setStartDate}
              endDate={endDate}
              onChangeEndDate={setEndDate}
              minimumEndDate={startDate ? parseLocalYmd(startDate) : undefined}
              description={description}
              onChangeDescription={setDescription}
              notes={notes}
              onChangeNotes={setNotes}
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
            title="Se paga con"
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
      {/* La explicación entera vivía aquí arriba en tres párrafos, y dos de ellos hablaban de
          campos que en ese momento no se veían. Los dos bajaron a la fila que los usa; queda el
          que explica el modelo de fechas, una vez, y después detrás del "?" de la cabecera. */}
      <FormFirstRunHelp
        open={helpOpen}
        onDismiss={dismissHelp}
        onShow={showHelp}
        showTrigger={false}
        title="Cómo funciona"
        lines={[
          "El sistema no adivina las fechas: toma el próximo cobro que elijas y desde ahí repite según cada cuánto se cobre.",
        ]}
      />

      {/* Sin rótulo: el ejemplo va de placeholder. Había dos maneras de marcar lo obligatorio
          —"NOMBRE *" en mayúsculas fuera del campo y "Monto *" en minúsculas dentro— más un
          asterisco que hay que interpretar. Lo obligatorio son los dos primeros campos y son los
          dos primeros: el orden ya lo dice, y el pie del botón nombra lo que falte. */}
      <View>
        <TextField
          ref={nameRef}
          style={[styles.textInput, nameError ? styles.inputError : null]}
          value={name}
          onChangeText={(t) => { setName(t); setNameError(""); }}
          placeholder="Netflix, Spotify, Adobe…"
          placeholderTextColor={COLORS.storm}
          returnKeyType="next"
          accessibilityLabel="Nombre de la suscripción"
        />
        {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
      </View>

      <CurrencyInput
        value={amount}
        onChangeText={(t) => { setAmount(t); setAmountError(""); }}
        currencyCode={currencyCode}
        error={amountError}
      />

      {/* Cada cuánto y desde cuándo, en una tarjeta. Antes eran tres controles para la primera
          pregunta —seis cápsulas, un campo numérico y una línea que traducía lo recién elegido—. */}
      <View style={styles.group}>
        <FormOptionRow
          grouped
          label="Se repite"
          value={recurrenceLabel}
          onPress={() => setFrequencyOpen(true)}
        />
        <FormDateRow
          grouped
          label="Próximo cobro"
          support="Desde esta fecha se cuenta el ciclo"
          value={nextDueDate}
          onChange={setNextDueDate}
          placeholder="Elegir fecha"
          minimumDate={startDate ? parseLocalYmd(startDate) : undefined}
        />
        <FormOptionRow
          grouped
          last
          label="Avisarme antes"
          value={REMIND_OPTIONS.find((option) => option.value === remindDaysBefore)?.label ?? "Sin aviso"}
          onPress={() => setRemindOpen(true)}
        />
      </View>

      {/* Personalizado es el único que necesita un número; se pide justo después, no como campo
          permanente para los otros cinco. */}
      {frequency === "custom" ? (
        <View>
          <Text style={styles.label}>Cada cuántos días</Text>
          <TextField
            style={styles.textInput}
            value={intervalCount}
            onChangeText={setIntervalCount}
            placeholder="1"
            placeholderTextColor={COLORS.storm}
            keyboardType="number-pad"
          />
        </View>
      ) : null}

      <BusinessDateNotice dateValue={nextDueDate} onApplySuggestedDate={setNextDueDate} />

      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          {/* "Registrar el gasto solo" se lee de dos maneras: *solamente el gasto* o *el gasto
              por sí solo*. Y su subtítulo pedía una cuenta que estaba escondida en Opcionales. */}
          <Text style={styles.switchLabel}>Anotar el gasto solo</Text>
          <Text style={styles.switchDesc}>Cada cobro entra como gasto, sin que lo registres</Text>
        </View>
        <Switch
          value={autoCreateMovement}
          onValueChange={setAutoCreateMovement}
          trackColor={{ false: COLORS.border, true: COLORS.primary }}
          thumbColor={COLORS.ink}
        />
      </View>

      {/* Con el gasto automático la cuenta deja de ser opcional, así que sube aquí: el toggle no
          puede pedir algo que solo se responde saliendo del formulario. */}
      {autoCreateMovement && activeAccounts.length > 0 ? (
        <View style={[styles.group, !accountId ? styles.groupError : null]}>
          <FormOptionRow
            grouped
            last
            label="Se paga con"
            value={selectedAccountName}
            placeholder="Elegir cuenta"
            onPress={() => setAccountOpen(true)}
          />
        </View>
      ) : null}

      {/* Ocho campos marcados "(opcional)" sumaban 700 px que la mayoría pasa de largo, y
          desplegarlos aquí dejaba el botón de crear fuera de vista. */}
      <FormOptionRow
        label="Opcionales"
        support="Proveedor, cuenta, categoría, fechas y notas"
        value=""
        placeholder=""
        onPress={() => setOptionalsOpen(true)}
      />

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
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: SPACING.xs },
  /** Filas hermanas dentro de UNA caja: apiladas con su propio borde dibujaban tres cajas. */
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  groupError: { borderColor: COLORS.danger },
  helpBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: SPACING.xs,
    backgroundColor: SURFACE.cardBorder,
    borderWidth: 1,
    borderColor: SURFACE.sheetBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBar: {
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
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
});
