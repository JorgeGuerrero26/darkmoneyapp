import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { AlertCircle } from "lucide-react-native";
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
import { useMovementPatternsQuery } from "../../services/queries/movement-patterns";
import {
  buildPatternMaps,
  suggestAccountFromCounterparty,
  suggestCategoryFromCounterparty,
  suggestCategoryFromDescription,
} from "../../lib/movement-patterns";
import type { RecurringIncomeSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { FormDateRow } from "../ui/FormDateRow";
import { FormOptionRow } from "../ui/FormOptionRow";
import { RecurringIncomeOptionalsSheet } from "../../features/recurring-income/components/RecurringIncomeOptionalsSheet";
import { describeRecurringCadence } from "../../features/recurring-income/lib/recurringIncomeSchedule";
import { LAST_DAY_ANCHOR, subscriptionRecurrencePhrase } from "../../lib/subscription-helpers";
import { currencyPluralTitle } from "../../constants/currencies";
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

/** Mensual con el ancla en el último día. No es una frecuencia nueva. */
type FrequencyChoice = RecurringIncomeFormInput["frequency"] | "monthly_last";

/* Un selector que dice el RESULTADO. Eran seis cápsulas cortadas por el borde —con una séptima
   asomando— más un campo "Repetir cada N periodos" y una línea que traducía lo recién elegido. */
const FREQUENCY_CHOICES: { value: FrequencyChoice; label: string }[] = [
  { value: "weekly",       label: "Cada semana" },
  { value: "monthly",      label: "Cada mes" },
  { value: "monthly_last", label: "Cada mes, el último día" },
  { value: "quarterly",    label: "Cada trimestre" },
  { value: "yearly",       label: "Cada año" },
  { value: "daily",        label: "Cada día" },
  { value: "custom",       label: "Personalizado" },
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

function parseLocalYmd(ymd: string): Date {
  const parts = ymd.trim().split("-").map(Number);
  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) return new Date(ymd);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

export function RecurringIncomeForm({ visible, onClose, onSuccess, editRecurringIncome }: Props) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const haptics = useHaptics();
  const createMutation = useCreateRecurringIncomeMutation(activeWorkspaceId);
  const updateMutation = useUpdateRecurringIncomeMutation(activeWorkspaceId);
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  // Ver MovementForm: sin el gate en `visible` esto se pide con la hoja cerrada.
  const { data: patternMovements } = useMovementPatternsQuery(visible ? activeWorkspaceId : null);
  const patternMaps = useMemo(
    () => (patternMovements ? buildPatternMaps(patternMovements) : null),
    [patternMovements],
  );

  const defaultCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const today = format(new Date(), "yyyy-MM-dd");
  const isEditing = Boolean(editRecurringIncome);

  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [frequencyOpen, setFrequencyOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [optionalsOpen, setOptionalsOpen] = useState(false);
  const [payerOpen, setPayerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
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
  const [catSuggestionId, setCatSuggestionId] = useState<number | null>(null);
  const [accSuggestionId, setAccSuggestionId] = useState<number | null>(null);

  const nameRef = useRef<TextInput>(null);
  const suggestionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      /* "Desde" es solo referencia y se deduce de la primera llegada: pedirla obligatoria y con
         el mismo valor que la próxima llegada hacía que el formulario trajera el mismo dato dos
         veces sin decir cuál mandaba. */
      setStartDate("");
      /* Y la próxima llegada no puede venir en "Hoy": un ingreso fijo que llega hoy es la
         excepción, no la norma. Se pide. */
      setNextExpectedDate("");
      setEndDate("");
      setAccountId(topIncomeAccountId);
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
  const intervalValue = Math.max(1, parseInt(intervalCount, 10) || 1);
  const anchorDay = dayOfMonth.trim() ? parseInt(dayOfMonth, 10) : null;
  const frequencyChoice: FrequencyChoice =
    frequency === "monthly" && anchorDay === LAST_DAY_ANCHOR ? "monthly_last" : frequency;
  /* La moneda solo se pregunta si hay más de una en juego: era el tercer campo de la pantalla
     para un dato que casi nunca cambia. */
  /* "Entra a" llega precargada con la cuenta que más ingresos recibe: sin cuenta, confirmar
     una llegada no le suma el dinero a ningún saldo. Sale de los movimientos que el formulario
     ya tiene cargados para las sugerencias, sin pedir nada nuevo. */
  const topIncomeAccountId = useMemo(() => {
    const counts = new Map<number, number>();
    for (const movement of patternMovements ?? []) {
      if (movement.movement_type !== "income" || !movement.destination_account_id) continue;
      counts.set(movement.destination_account_id, (counts.get(movement.destination_account_id) ?? 0) + 1);
    }
    let best: number | null = null;
    let bestCount = 0;
    for (const [id, count] of counts) {
      if (count > bestCount) { best = id; bestCount = count; }
    }
    return best ?? (activeAccounts.length === 1 ? activeAccounts[0].id : null);
  }, [activeAccounts, patternMovements]);

  /* La sugerencia llega con los movimientos, que tardan un momento más que el formulario. Si
     para entonces el usuario no eligió cuenta, se pone la sugerida. */
  useEffect(() => {
    if (!visible || isEditing) return;
    setAccountId((current) => current ?? topIncomeAccountId);
  }, [visible, isEditing, topIncomeAccountId]);

  const workspaceCurrencies = useMemo(() => {
    const codes = new Set<string>([defaultCurrency.toUpperCase()]);
    for (const account of snapshot?.accounts ?? []) codes.add(account.currencyCode.toUpperCase());
    return [...codes];
  }, [defaultCurrency, snapshot?.accounts]);

  /* El botón nombra lo que falta mientras falte, en vez de esperar a que lo toques. */
  const missingLabel = !name.trim()
    ? "Falta el nombre"
    : !amount.trim() || Number(amount) <= 0
      ? "Falta el monto"
      : !nextExpectedDate.trim()
        ? "Falta la próxima llegada"
        : accountId === null
          ? "Falta la cuenta donde entra"
          : null;
  const recurrenceLabel = subscriptionRecurrencePhrase(intervalValue, frequency, anchorDay);
  /* Lo que va a pasar, no cómo lo hace la app. Antes: "La app usa la próxima llegada como fecha
     base y desde ahí repite según esta frecuencia" y, aparte, "Cadencia actual: cada 1 mes". */
  const cadenceSentence = describeRecurringCadence({
    frequency,
    intervalCount: intervalValue,
    anchorDay: ["monthly", "quarterly", "yearly"].includes(frequency) ? anchorDay : null,
  });

  useEffect(() => {
    if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current);
    if (!patternMaps || categoryId !== null) {
      setCatSuggestionId(null);
      return;
    }
    const trimmed = name.trim();
    if (trimmed.length < 3 && payerPartyId === null) {
      setCatSuggestionId(null);
      return;
    }
    suggestionDebounceRef.current = setTimeout(() => {
      const suggestedByName = trimmed.length >= 3 ? suggestCategoryFromDescription(trimmed, patternMaps) : null;
      const suggestedByPayer = payerPartyId !== null
        ? suggestCategoryFromCounterparty(payerPartyId, patternMaps)
        : null;
      setCatSuggestionId(suggestedByName ?? suggestedByPayer);
    }, 350);
    return () => {
      if (suggestionDebounceRef.current) clearTimeout(suggestionDebounceRef.current);
    };
  }, [name, payerPartyId, categoryId, patternMaps]);

  useEffect(() => {
    if (!patternMaps || accountId !== null || payerPartyId === null) {
      setAccSuggestionId(null);
      return;
    }
    setAccSuggestionId(suggestAccountFromCounterparty(payerPartyId, patternMaps));
  }, [payerPartyId, accountId, patternMaps]);

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
    if (!nextExpectedDate.trim()) {
      haptics.error();
      setSubmitError("Elige cuándo llega la próxima vez");
      return;
    }
    if (accountId === null) {
      haptics.error();
      setSubmitError("Elige la cuenta donde entra: sin ella no se le puede sumar a ningún saldo");
      return;
    }
    if (startDate.trim() && nextExpectedDate < startDate) {
      haptics.error();
      setSubmitError("La próxima llegada no puede ser anterior al inicio");
      return;
    }
    if (!Number.isFinite(intervalValue) || intervalValue < 1) {
      haptics.error();
      setSubmitError("El intervalo debe ser mayor o igual a 1.");
      return;
    }
    if ((frequency === "monthly" || frequency === "quarterly" || frequency === "yearly") && dayOfMonth.trim()) {
      const resolvedDayOfMonth = parseInt(dayOfMonth, 10);
      if (!Number.isFinite(resolvedDayOfMonth) || resolvedDayOfMonth < 1 || resolvedDayOfMonth > 31) {
        haptics.error();
        setSubmitError("El día del mes debe estar entre 1 y 31.");
        return;
      }
    }
    if (frequency === "weekly" && dayOfWeek !== null && (dayOfWeek < 0 || dayOfWeek > 6)) {
      haptics.error();
      setSubmitError("El día de la semana seleccionado no es válido.");
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
      intervalCount: intervalValue,
      dayOfMonth: (frequency === "monthly" || frequency === "quarterly" || frequency === "yearly") && dayOfMonth.trim()
        ? parseInt(dayOfMonth, 10)
        : null,
      dayOfWeek: frequency === "weekly" ? dayOfWeek : null,
      // La columna no admite nulo, y sin "Desde" el inicio ES la primera llegada.
      startDate: startDate.trim() ? startDate : nextExpectedDate,
      nextExpectedDate,
      endDate: endDate.trim() ? endDate : null,
      remindDaysBefore,
      notes: notes.trim() ? notes.trim() : null,
    };

    submittingRef.current = true;
    try {
      if (isEditing && editRecurringIncome) {
        await updateMutation.mutateAsync({ id: editRecurringIncome.id, input: payload });
        showToast("Ingreso fijo actualizado", "warning");
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
    } finally {
      submittingRef.current = false;
    }
  }

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={handleClose}
        title={isEditing ? "Editar ingreso fijo" : "Nuevo ingreso fijo"}
        snapHeight={0.88}
        /* Estaban al final del scroll, después de las notas: en un formulario de tres pantallas
           no se veían hasta llegar al fondo. Y "Cancelar" se retira — la hoja ya tiene la X del
           encabezado, y dos maneras de abandonar compiten entre sí. */
        footer={
          <View style={styles.submitBar}>
            {missingLabel ? <Text style={styles.submitNote}>{missingLabel}</Text> : null}
            <Button
              label={isEditing ? "Guardar cambios" : "Crear ingreso"}
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
            <SearchableSelectSheet
            inline
            visible={payerOpen}
            title="Pagador"
            options={[
              { value: null as number | null, label: "Ninguno" },
              ...counterparties.map((cp) => ({ value: cp.id as number | null, label: cp.name })),
            ]}
            value={payerPartyId}
            onChange={setPayerPartyId}
            onClose={() => setPayerOpen(false)}
          />
          <SearchableSelectSheet
            inline
            visible={accountOpen}
            title="Entra a"
            /* Sin "Sin cuenta": ahora es obligatoria, y ofrecer la opción de dejarla vacía
               contradice al botón que la pide. */
            options={activeAccounts.map((acc) => ({ value: acc.id as number | null, label: acc.name }))}
            value={accountId}
            onChange={setAccountId}
            onClose={() => setAccountOpen(false)}
          />
          <SearchableSelectSheet
            inline
            visible={categoryOpen}
            title="Categoría"
            options={[
              { value: null as number | null, label: "Sin categoría" },
              ...incomeCategories.map((cat) => ({ value: cat.id as number | null, label: cat.name })),
            ]}
            value={categoryId}
            onChange={setCategoryId}
            onClose={() => setCategoryOpen(false)}
          />
            {/* Las hojas van primero: los selectores que se abren DESDE ellas se pintan
                después y quedan por encima. */}
            <RecurringIncomeOptionalsSheet
              visible={optionalsOpen}
              onClose={() => setOptionalsOpen(false)}
              showPayer={counterparties.length > 0}
              payerLabel={counterparties.find((cp) => cp.id === payerPartyId)?.name ?? null}
              onOpenPayer={() => setPayerOpen(true)}
              showCategory={incomeCategories.length > 0}
              categoryLabel={incomeCategories.find((c) => c.id === categoryId)?.name ?? null}
              onOpenCategory={() => setCategoryOpen(true)}
              categorySuggestion={catSuggestionId !== null && categoryId === null ? (() => {
                const category = incomeCategories.find((item) => item.id === catSuggestionId);
                return category ? (
                  <SmartSuggestion
                    label={category.name}
                    detail="Categoría sugerida por nombre y pagador"
                    onApply={() => setCategoryId(category.id)}
                  />
                ) : null;
              })() : null}
              showCurrency={workspaceCurrencies.length > 1}
              currencyLabel={currencyPluralTitle(currencyCode) || currencyCode}
              onOpenCurrency={() => setCurrencyOpen(true)}
              startDate={startDate}
              onChangeStartDate={setStartDate}
              endDate={endDate}
              onChangeEndDate={setEndDate}
              minimumEndDate={startDate ? parseLocalYmd(startDate) : undefined}
              notes={notes}
              onChangeNotes={setNotes}
            />
            <SearchableSelectSheet
              inline
              visible={frequencyOpen}
              title="Se repite"
              options={FREQUENCY_CHOICES.map((option) => ({ value: option.value, label: option.label }))}
              value={frequencyChoice}
              onChange={(next: FrequencyChoice) => {
                if (next === "monthly_last") {
                  setFrequency("monthly");
                  setDayOfMonth(String(LAST_DAY_ANCHOR));
                } else {
                  setFrequency(next);
                  setDayOfMonth(
                    ["monthly", "quarterly", "yearly"].includes(next) && nextExpectedDate
                      ? String(parseLocalYmd(nextExpectedDate).getDate())
                      : "",
                  );
                }
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
          <CurrencySelectOverlay
              visible={currencyOpen}
              onClose={() => setCurrencyOpen(false)}
              value={currencyCode}
              onChange={setCurrencyCode}
            />
          </>
        }
      >
        <View style={styles.section}>
          {/* Sin rótulo: el ejemplo va de placeholder, como en los otros seis formularios. */}
          <TextField
            ref={nameRef}
            style={[styles.input, nameError ? styles.inputError : null]}
            value={name}
            onChangeText={(value) => { setName(value); setNameError(""); }}
            placeholder="Sueldo, alquiler, clases…"
            placeholderTextColor={COLORS.storm}
            accessibilityLabel="Nombre del ingreso fijo"
          />
          {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}

          {/* "S/ 0.00" gris sobre caja gris se leía como un dato ya puesto, no como el campo
              donde va la cifra más importante del formulario. */}
          <Text style={styles.fieldLabel}>Cuánto llega</Text>
          <CurrencyInput
            value={amount}
            onChangeText={(value) => { setAmount(value); setAmountError(""); }}
            currencyCode={currencyCode}
            error={amountError}
            style={styles.amountField}
          />

          {/* Lo obligatorio, en una tarjeta. "Entra a" sube aquí: sin cuenta, confirmar una
              llegada no le suma el dinero a ningún saldo. */}
          <View style={styles.group}>
            <FormOptionRow
              grouped
              label="Se repite"
              value={recurrenceLabel}
              onPress={() => setFrequencyOpen(true)}
            />
            <FormDateRow
              grouped
              label="Próxima llegada"
              value={nextExpectedDate}
              onChange={(value) => {
                setNextExpectedDate(value);
                // El día del mes sale de la fecha elegida: preguntarlo aparte era preguntar dos
                // veces el mismo dato, y ninguna de las ocho cápsulas que ofrecía era el 29.
                if (["monthly", "quarterly", "yearly"].includes(frequency)) {
                  setDayOfMonth(String(parseLocalYmd(value).getDate()));
                }
                if (frequency === "weekly") setDayOfWeek(parseLocalYmd(value).getDay());
              }}
              placeholder="Elegir fecha"
            />
            <FormOptionRow
              grouped
              label="Entra a"
              value={activeAccounts.find((account) => account.id === accountId)?.name ?? null}
              placeholder="Elegir cuenta"
              onPress={() => setAccountOpen(true)}
            />
            <FormOptionRow
              grouped
              last
              label="Avisarme antes"
              value={REMIND_OPTIONS.find((option) => option.value === remindDaysBefore)?.label ?? "Sin aviso"}
              onPress={() => setRemindOpen(true)}
            />
          </View>
          <Text style={styles.helperText}>{cadenceSentence}</Text>
          <BusinessDateNotice dateValue={nextExpectedDate} onApplySuggestedDate={setNextExpectedDate} />

          {frequency === "custom" ? (
            <View>
              <Text style={styles.label}>Cada cuántos días</Text>
              <TextField
                style={styles.input}
                value={intervalCount}
                onChangeText={setIntervalCount}
                placeholder="1"
                placeholderTextColor={COLORS.storm}
                keyboardType="number-pad"
              />
            </View>
          ) : null}

          {accSuggestionId !== null && accountId === null ? (() => {
            const account = activeAccounts.find((item) => item.id === accSuggestionId);
            return account ? (
              <SmartSuggestion
                label={account.name}
                detail="Cuenta aprendida por ingresos parecidos de este pagador"
                onApply={() => setAccountId(account.id)}
              />
            ) : null;
          })() : null}

          <FormOptionRow
            label="Opcionales"
            support="Pagador, categoría, desde, hasta, notas"
            value=""
            placeholder=""
            onPress={() => setOptionalsOpen(true)}
          />

          {submitError ? (
            <View style={styles.errorBanner}>
              <AlertCircle size={16} color={COLORS.danger} />
              <Text style={styles.errorBannerText}>{submitError}</Text>
            </View>
          ) : null}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: -SPACING.xs,
  },
  /** Borde de campo activo: tiene que verse que se puede tocar. */
  amountField: { borderColor: SURFACE.inputBorder, paddingVertical: SPACING.md },
  inputError: { borderColor: COLORS.danger },
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
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  section: { gap: SPACING.md },
  label: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.ink,
    fontSize: FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  helperText: {
    marginTop: -2,
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
    fontFamily: FONT_FAMILY.body,
  },
  notesInput: {
    minHeight: 120,
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
    backgroundColor: "rgba(244,241,236,0.03)",
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
