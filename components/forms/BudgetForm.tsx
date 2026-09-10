import { useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { format, startOfMonth, endOfMonth } from "date-fns";
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
import { FormDateRow } from "../ui/FormDateRow";
import { FormOptionRow } from "../ui/FormOptionRow";
import { SearchableSelectSheet } from "../ui/SearchableSelectSheet";
import { CurrencySelectOverlay } from "./CurrencySelectOverlay";
import {
  budgetRecurrenceLabel,
  budgetRecurrenceSentence,
  firstBudgetPeriod,
  inferRecurrence,
  BUDGET_RECURRENCE_OPTIONS,
  type BudgetRecurrence,
} from "../../features/budgets/lib/budgetRecurrence";
import { todayPeru } from "../../lib/date";
import { Check } from "lucide-react-native";
import { InlineFormSheet } from "../ui/InlineFormSheet";
import { BUDGET_SCOPE_PLACEHOLDER, budgetScopeSummary } from "../../features/budgets/lib/budgetScopeSummary";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { sortByName } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { TextField } from "../ui/TextField";


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
  /** Prellena el form en modo CREAR (duplicado de otro presupuesto, p. ej. siguiente período). */
  duplicateBudget?: BudgetOverview;
};

export function BudgetForm({ visible, onClose, onSuccess, editBudget, duplicateBudget }: Props) {
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

  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [name, setName] = useState("");
  const [limitAmount, setLimitAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState(defaultCurrency);
  const [alertPercent, setAlertPercent] = useState(80);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [rolloverEnabled, setRolloverEnabled] = useState(false);
  const [periodStart, setPeriodStart] = useState(format(startOfMonth(now), "yyyy-MM-dd"));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(now), "yyyy-MM-dd"));
  const [recurrence, setRecurrence] = useState<BudgetRecurrence>("monthly");
  const [recurrenceOpen, setRecurrenceOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [optionalsOpen, setOptionalsOpen] = useState(false);
  /* "Todas" es una elección válida, pero tiene que ser elegida: por defecto no hay valor, para
     que el nombre del presupuesto no acabe describiendo algo que la regla no hace. */
  const [scopeTouched, setScopeTouched] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [notes, setNotes] = useState("");

  const [amountError, setAmountError] = useState("");
  const [discardVisible, setDiscardVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const source = editBudget ?? duplicateBudget;
    if (source) {
      setName(source.name);
      setLimitAmount(String(source.limitAmount));
      setCurrencyCode(source.currencyCode);
      setAlertPercent(source.alertPercent);
      setCategoryId(source.categoryId ?? null);
      setAccountId(source.accountId ?? null);
      setRolloverEnabled(source.rolloverEnabled);
      setPeriodStart(source.periodStart);
      setPeriodEnd(source.periodEnd);
      /* Los presupuestos creados antes de la fase 36 no traen cadencia: se deduce de lo que
         duran. Precargar "Entre dos fechas" en uno que el usuario venía recreando cada mes sería
         devolverle justo el trabajo que esta pantalla le quita. */
      setRecurrence(source.recurrence && source.recurrence !== "none"
        ? source.recurrence
        : inferRecurrence({ periodStart: source.periodStart, periodEnd: source.periodEnd }));
      setScopeTouched(true);
      setNotes(source.notes ?? "");
    } else {
      const m = new Date();
      setName("");
      setLimitAmount("");
      setCurrencyCode(defaultCurrency);
      setAlertPercent(80);
      setCategoryId(null);
      setAccountId(null);
      setRolloverEnabled(false);
      const inicial = firstBudgetPeriod(todayPeru(), "monthly");
      setPeriodStart(inicial.periodStart);
      setPeriodEnd(inicial.periodEnd);
      setRecurrence("monthly");
      setScopeTouched(false);
      setNotes("");
    }
    setAmountError("");
  }, [visible, editBudget, duplicateBudget, defaultCurrency]);




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

  const submittingRef = useRef(false);

  async function handleSubmit() {
    if (submittingRef.current) return; // guard anti-doble-tap: evita duplicados
    setAmountError("");
    let valid = true;

    /* "Todas" es una elección válida, pero tiene que ser elegida: el pie decía "Falta qué
       limitas" y el botón dejaba crear igual, así que se colaba un presupuesto general con
       nombre de categoría — que es el fallo que esta pantalla vino a arreglar. */
    if (!scopeTouched && categoryId === null && accountId === null) {
      haptics.error();
      showToast("Elige qué limita este presupuesto. Puede ser todo el gasto, si es un tope general.", "error");
      return;
    }
    const amount = parseFloat(limitAmount);
    if (!limitAmount || isNaN(amount) || amount <= 0) {
      setAmountError("Ingresa un monto válido mayor a 0");
      valid = false;
    }
    if (periodEnd < periodStart) {
      showToast("La fecha final no puede ser anterior a la inicial", "error");
      valid = false;
    }
    if (!valid) { haptics.error(); return; }

    /* El nombre se propone solo con lo que ya elegiste. Se pedía primero y obligatorio, con el
       ejemplo "Ej. Alimentación mensual" — que es literalmente categoría + cadencia, las dos
       cosas que el formulario pregunta después. Nadie debería teclearlo para poder avanzar; y
       sigue siendo editable en Opcionales, porque el nombre es dato del usuario. */
    const categoria = expenseCategories.find((cat) => cat.id === categoryId)?.name;
    const propuesto = [categoria ?? "Presupuesto", budgetRecurrenceLabel(recurrence).toLowerCase()]
      .join(" · ");

    /* Con cadencia, las fechas las pone el sistema: el primer período arranca hoy y cierra con
       el período. Solo "Entre dos fechas" conserva las que el usuario eligió. */
    const periodo = recurrence === "none"
      ? { periodStart, periodEnd }
      : firstBudgetPeriod(todayYmd, recurrence);

    const input: BudgetFormInput = {
      name: name.trim() || propuesto,
      recurrence,
      periodStart: isEditing ? periodStart : periodo.periodStart,
      periodEnd: isEditing ? periodEnd : periodo.periodEnd,
      limitAmount: amount,
      alertPercent,
      currencyCode,
      categoryId,
      accountId,
      rolloverEnabled,
      notes: notes.trim() || null,
    };

    submittingRef.current = true;
    try {
      if (isEditing && editBudget) {
        await updateMutation.mutateAsync({ id: editBudget.id, input });
        showToast("Presupuesto actualizado", "warning");
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
    } finally {
      submittingRef.current = false;
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

  const scopeCategoryName = expenseCategories.find((cat) => cat.id === categoryId)?.name ?? null;
  const scopeAccountName = activeAccounts.find((acc) => acc.id === accountId)?.name ?? null;

  const todayYmd = todayPeru();
  const multiCurrency = (snapshot?.accounts ?? []).some(
    (account) => account.currencyCode !== defaultCurrency,
  );
  /* El botón dice qué falta en vez de quedarse apagado sin explicar por qué. */
  const missingLabel = !limitAmount.trim()
    ? "Falta cuánto"
    : !scopeTouched && categoryId === null
      ? "Falta qué limitas"
      : "";

  return (
    <>
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={isEditing ? "Editar presupuesto" : "Nuevo presupuesto"}
      snapHeight={0.92}
      footer={
        <View style={styles.footer}>
          {missingLabel ? <Text style={styles.submitNote}>{missingLabel}</Text> : null}
          <Button
            label={isEditing ? "Guardar cambios" : "Crear presupuesto"}
            onPress={handleSubmit}
            loading={createMutation.isPending || updateMutation.isPending}
            size="lg"
          />
        </View>
      }
      // Dentro del sheet: iOS solo presenta un Modal a la vez y como hermano no aparecía.
      overlay={
        <>
          <ConfirmDialog
            inline
            visible={discardVisible}
            title="¿Descartar cambios?"
            body="Los datos ingresados se perderán."
            confirmLabel="Descartar"
            cancelLabel="Continuar editando"
            onCancel={() => setDiscardVisible(false)}
            onConfirm={() => { setDiscardVisible(false); onClose(); }}
          />
          {/* Se renueva (mockup BE). Las cinco cadencias juntas y, aparte, el caso que sí
              justifica fechas sueltas: un viaje, un proyecto que termina. */}
          <InlineFormSheet
            visible={recurrenceOpen}
            title="Se renueva"
            onBack={() => setRecurrenceOpen(false)}
            footer={
              <Button label="Listo" size="lg" onPress={() => setRecurrenceOpen(false)} />
            }
          >
            <View style={styles.group}>
              {BUDGET_RECURRENCE_OPTIONS.map((option, index) => (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.optionRow, index < BUDGET_RECURRENCE_OPTIONS.length - 1 && styles.optionDivided]}
                  onPress={() => { setRecurrence(option.value); setRecurrenceOpen(false); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: recurrence === option.value }}
                >
                  <Text style={styles.optionLabel}>{option.label}</Text>
                  {recurrence === option.value ? <Check size={18} color={COLORS.ink} /> : null}
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionLabel}>No se repite</Text>
            <View style={styles.group}>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => { setRecurrence("none"); setRecurrenceOpen(false); }}
                accessibilityRole="button"
                accessibilityState={{ selected: recurrence === "none" }}
              >
                <View style={styles.optionCopy}>
                  <Text style={styles.optionLabel}>Entre dos fechas</Text>
                  <Text style={styles.optionSupport}>Para un viaje o un proyecto que termina</Text>
                </View>
                {recurrence === "none" ? <Check size={18} color={COLORS.ink} /> : null}
              </TouchableOpacity>
            </View>

            <Text style={styles.hint}>
              Un presupuesto que se renueva no hay que volver a crearlo: cada período cerrado pasa
              al historial y el nuevo empieza en cero.
            </Text>
          </InlineFormSheet>


          <InlineFormSheet
            visible={optionalsOpen}
            title="Opcionales"
            onBack={() => setOptionalsOpen(false)}
            footer={<Button label="Listo" size="lg" onPress={() => setOptionalsOpen(false)} />}
          >
            <View style={styles.amountField}>
              <Text style={styles.label}>Nombre</Text>
              <TextField
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder={`${expenseCategories.find((cat) => cat.id === categoryId)?.name ?? "Presupuesto"} · ${budgetRecurrenceLabel(recurrence).toLowerCase()}`}
                placeholderTextColor={COLORS.textDisabled}
              />
            </View>

            <View style={styles.group}>
              {/* La moneda sube solo si hay más de una en el espacio de trabajo: para un dato que
                  casi nunca cambia, ocupaba el sitio anterior al monto. */}
              {multiCurrency ? (
                <FormOptionRow
                  label="Moneda"
                  value={currencyCode}
                  onPress={() => setCurrencyOpen(true)}
                  grouped
                  last
                />
              ) : null}
            </View>

            <View style={styles.amountField}>
              <Text style={styles.label}>Notas</Text>
              <TextField
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
          </InlineFormSheet>

          {/* Las dos mitades del ámbito, juntas: QUÉ se limita y DÓNDE. La cuenta vivía en
              "Opcionales", dos niveles adentro, así que esta fila prometía responder al ámbito
              y solo preguntaba la mitad — y un presupuesto por cuenta parecía imposible. */}
          <InlineFormSheet
            visible={scopeOpen}
            title="Qué limitas"
            onBack={() => setScopeOpen(false)}
            footer={
              <Button
                label="Listo"
                size="lg"
                onPress={() => { setScopeTouched(true); setScopeOpen(false); }}
              />
            }
          >
            <View style={styles.group}>
              <FormOptionRow
                label="Categoría"
                value={scopeCategoryName}
                placeholder="Todo el gasto"
                onPress={() => setCategoryOpen(true)}
                grouped
              />
              <FormOptionRow
                label="Solo en la cuenta"
                value={scopeAccountName}
                placeholder="Todas"
                onPress={() => setAccountOpen(true)}
                grouped
                last
              />
            </View>

            <Text style={styles.hint}>
              {scopeCategoryName && scopeAccountName
                ? `Cuenta lo que gastes en ${scopeCategoryName}, y solo desde ${scopeAccountName}.`
                : scopeCategoryName
                  ? `Cuenta lo que gastes en ${scopeCategoryName}, salga de la cuenta que salga.`
                  : scopeAccountName
                    ? `Cuenta todo lo que salga de ${scopeAccountName}, sea de la categoría que sea.`
                    : "Cuenta todo tu gasto. Elige una categoría o una cuenta si quieres acotarlo."}
            </Text>
          </InlineFormSheet>

          {/* Los selectores van DESPUÉS de las hojas que los abren.
              La cuenta se elige desde "Opcionales", que es una hoja: pintada antes, el selector
              quedaba por debajo y al tocar "Cuenta" no aparecía nada — así que un presupuesto
              por cuenta parecía imposible cuando solo estaba tapado. Mismo fallo que el del
              2026-08-13 con los diálogos en iOS. */}
          {/* Cuatro opciones fijas no necesitan cuatro botones ocupando una línea entera. */}
          <SearchableSelectSheet
            inline
            visible={alertOpen}
            title="Avisarme al"
            options={ALERT_PRESETS.map((preset) => ({ value: preset.value, label: preset.label }))}
            value={alertPercent}
            onChange={setAlertPercent}
            onClose={() => setAlertOpen(false)}
          />
          <SearchableSelectSheet
            inline
            visible={categoryOpen}
            title="Categoría"
            options={[
              { value: null as number | null, label: "Todas" },
              ...expenseCategories.map((cat) => ({ value: cat.id as number | null, label: cat.name })),
            ]}
            value={categoryId}
            onChange={setCategoryId}
            onClose={() => setCategoryOpen(false)}
          />
          <SearchableSelectSheet
            inline
            visible={accountOpen}
            title="Cuenta"
            options={[
              { value: null as number | null, label: "Todas" },
              ...activeAccounts.map((acc) => ({ value: acc.id as number | null, label: acc.name })),
            ]}
            value={accountId}
            onChange={setAccountId}
            onClose={() => setAccountOpen(false)}
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
      {/* La categoría ES el presupuesto: lo que estás limitando. Venía en "Todas" por defecto y
          en el puesto seis, así que un presupuesto llamado "Alimentación mensual" contaba también
          gasolina y alquiler — el nombre decía una cosa y la regla hacía otra, sin que nada
          avisara. Va primera y sin valor puesto; "Todas" sigue elegible, pero como elección. */}
      <FormOptionRow
        label="Qué limitas"
        value={scopeTouched ? budgetScopeSummary(scopeCategoryName, scopeAccountName) : null}
        placeholder={BUDGET_SCOPE_PLACEHOLDER}
        onPress={() => setScopeOpen(true)}
      />

      {/* El único número que hace que un presupuesto sea un presupuesto. Estaba en gris sobre
          caja gris, con la etiqueta dentro y sin cursor: se leía como un dato ya puesto que
          valía cero. La etiqueta dice además que el límite se renueva. */}
      <View style={styles.amountField}>
        <Text style={styles.label}>Cuánto por período</Text>
        <CurrencyInput
          value={limitAmount}
          onChangeText={(t) => { setLimitAmount(t); setAmountError(""); }}
          currencyCode={currencyCode}
          error={amountError || undefined}
        />
      </View>

      <View style={styles.group}>
        <FormOptionRow
          label="Se renueva"
          value={budgetRecurrenceLabel(recurrence)}
          onPress={() => setRecurrenceOpen(true)}
          grouped
        />
        <FormOptionRow
          label="Avisarme al"
          value={`${alertPercent}%`}
          onPress={() => setAlertOpen(true)}
          grouped
          last
        />
      </View>

      {recurrence === "none" ? (
        <View style={styles.group}>
          <FormDateRow label="Desde" value={periodStart} onChange={setPeriodStart} grouped />
          <FormDateRow label="Hasta" value={periodEnd} onChange={setPeriodEnd} grouped last />
        </View>
      ) : (
        <Text style={styles.hint}>{budgetRecurrenceSentence(recurrence, todayYmd)}</Text>
      )}

      {/* "Arrastrar saldo al siguiente período" era jerga contable, y por eso necesitaba un
          párrafo de cinco líneas —el texto más largo de la pantalla— que incluso aclaraba lo que
          NO hace. Con un nombre que se entiende, la explicación cabe en el subtítulo. */}
      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Guardar lo que sobre</Text>
          <Text style={styles.switchDesc}>Lo no gastado se suma al mes siguiente</Text>
        </View>
        <Switch
          value={rolloverEnabled}
          onValueChange={setRolloverEnabled}
          trackColor={{ false: COLORS.border, true: COLORS.action }}
          thumbColor="#FFFFFF"
        />
      </View>

      <FormOptionRow
        label="Opcionales"
        support={multiCurrency ? "Nombre, moneda, notas" : "Nombre, notas"}
        value={null}
        placeholder=""
        onPress={() => setOptionalsOpen(true)}
      />

    </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    minHeight: 56,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  optionDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  optionCopy: { flex: 1, gap: 2 },
  optionLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  optionSupport: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  sectionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  footer: { gap: SPACING.sm },
  submitNote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
  },
  amountField: { gap: SPACING.xs },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  hint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
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
  textArea: { minHeight: 80 },
  customRange: { gap: SPACING.sm, marginTop: SPACING.sm },
  switchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  switchInfo: { flex: 1, gap: 2, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
});
