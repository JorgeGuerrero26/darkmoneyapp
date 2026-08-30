import { memo, useRef, useState, type RefObject } from "react";
import { StyleSheet, Text, View, type ScrollView, type TextInput } from "react-native";
import { AlertCircle } from "lucide-react-native";

import { AttachmentPicker, type Attachment } from "../../../../../components/domain/AttachmentPicker";
import { Button } from "../../../../../components/ui/Button";
import { DatePickerInput } from "../../../../../components/ui/DatePickerInput";
import { TimePickerInput } from "../../../../../components/ui/TimePickerInput";
import { FormOptionRow } from "../../../../../components/ui/FormOptionRow";
import { Input } from "../../../../../components/ui/Input";
import { TextField } from "../../../../../components/ui/TextField";
import { SmartSuggestion } from "../../../../../components/ui/SmartSuggestion";
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  RADIUS,
  SPACING,
  SURFACE,
} from "../../../../../constants/theme";
import type {
  AccountSummary,
  CategorySummary,
  CounterpartySummary,
} from "../../../../../types/domain";
import {
  BudgetImpactBlock,
  CategoryAiBlock,
  CounterpartyAiBlock,
  DescriptionCleanupBlock,
  RecurringAiBlock,
  RiskWarningBlock,
  type CategorySuggestionState,
} from "../MovementFormBlocks";
import { SplitAmountEditor } from "../SplitAmountEditor";
import type { SplitLine } from "../../../lib/split-movement";
import type { MovementRiskExplanation } from "../../../../../lib/movement-risk-analysis";
import type { MovementBudgetImpact } from "../../../../../lib/movement-budget-impact";
import type { DescriptionCleanupResult } from "../../../../../lib/movement-description-cleanup";
import type { CounterpartySuggestionResult } from "../../../../../lib/movement-counterparty-suggestions";
import type { MovementRecurringSuggestionResult } from "../../../../../lib/movement-recurring-suggestions";

type FormWarnings = {
  occurredAt?: string;
};

type Props = {
  isEditing: boolean;
  /**
   * El scroll de la hoja, para llevar el campo enfocado por encima del teclado.
   *
   * La hoja se encoge sola cuando entra el teclado, pero el desplazamiento se queda donde
   * estaba: enfocar las notas las dejaba justo debajo del corte.
   */
  scrollRef?: RefObject<ScrollView | null>;

  // Description
  descriptionRef: RefObject<TextInput | null>;
  notesRef: RefObject<TextInput | null>;
  description: string;
  onChangeDescription: (value: string) => void;

  // Notes
  notes: string;
  onChangeNotes: (value: string) => void;

  // Risk / budget
  movementRisk: MovementRiskExplanation | null;
  budgetImpact: MovementBudgetImpact | null;

  // Description cleanup
  descriptionCleanup: DescriptionCleanupResult | null;
  onApplyDescriptionCleanup: (cleaned: string) => void;

  // Category
  categoriesForPicker: CategorySummary[];
  categoryId: number | null;
  onSelectCategory: (id: number | null) => void;
  // Split de montos (solo gasto en creación): null = apagado.
  splitLines?: SplitLine[] | null;
  onChangeSplitLines?: (lines: SplitLine[] | null) => void;
  splitTotalAmount?: number;
  splitCurrencyCode?: string;
  categorySuggestionToShow: CategorySuggestionState | null;
  onApplyCategorySuggestion: (sug: CategorySuggestionState) => void;

  // Counterparty
  counterpartiesSorted: CounterpartySummary[];
  counterpartyId: number | null;
  onSelectCounterparty: (id: number | null) => void;
  counterpartySuggestionToShow: CounterpartySuggestionResult | null;
  onApplyCounterpartySuggestion: (sug: CounterpartySuggestionResult) => void;

  // Recurring
  recurringAlreadyLinked: boolean;
  recurringSuggestion: MovementRecurringSuggestionResult | null;
  onApplyRecurringSuggestion: (sug: MovementRecurringSuggestionResult) => void;

  // Account suggestion
  accountSuggestion: AccountSummary | null;
  movementType: string;
  onPickSuggestedAccount: (account: AccountSummary) => void;

  // Date
  occurredAt: string;
  /** "HH:mm" hora Perú del movimiento. */
  occurredTime: string;
  onChangeOccurredTime: (value: string) => void;
  onChangeOccurredAt: (value: string) => void;
  warnings: FormWarnings;

  // Attachments
  attachments: Attachment[];
  onChangeAttachments: (next: Attachment[]) => void;
  savedMovementId: number | undefined;
  isHydratingExistingAttachments: boolean;

  // Selectores de categoría y contraparte: los abre el formulario, porque su capa tiene que
  // ir en la ranura `overlay` del sheet (iOS presenta un Modal a la vez).
  onOpenCategory: () => void;
  onOpenCounterparty: () => void;

  // Submit
  submitError: string;
  submitLoading: boolean;
  onBack: () => void;
  onSubmit: () => void;
};

/** Hoy / Ayer / 12 sep — como se escribe una fecha cuando se habla, no en ISO. */
function describeDay(ymd: string): string {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return ymd;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === -1) return "Ayer";
  if (diff === 1) return "Mañana";
  return date.toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

export const StepDetails = memo(function StepDetails({
  isEditing,
  scrollRef,
  descriptionRef,
  notesRef,
  description,
  onChangeDescription,
  notes,
  onChangeNotes,
  movementRisk,
  budgetImpact,
  descriptionCleanup,
  onApplyDescriptionCleanup,
  categoriesForPicker,
  categoryId,
  onSelectCategory,
  splitLines,
  onChangeSplitLines,
  splitTotalAmount,
  splitCurrencyCode,
  categorySuggestionToShow,
  onApplyCategorySuggestion,
  counterpartiesSorted,
  counterpartyId,
  onSelectCounterparty,
  counterpartySuggestionToShow,
  onApplyCounterpartySuggestion,
  recurringAlreadyLinked,
  recurringSuggestion,
  onApplyRecurringSuggestion,
  accountSuggestion,
  movementType,
  onPickSuggestedAccount,
  occurredAt,
  onChangeOccurredAt,
  occurredTime,
  onChangeOccurredTime,
  warnings,
  attachments,
  onChangeAttachments,
  savedMovementId,
  isHydratingExistingAttachments,
  onOpenCategory,
  onOpenCounterparty,
  submitError,
  submitLoading,
  onBack,
  onSubmit,
}: Props) {
  const [dateTimeOpen, setDateTimeOpen] = useState(false);
  const [descriptionFocused, setDescriptionFocused] = useState(false);
  const notesTop = useRef(0);

  const selectedCategoryName =
    categoriesForPicker.find((category) => category.id === categoryId)?.name ?? null;
  const selectedCounterpartyName =
    counterpartiesSorted.find((counterparty) => counterparty.id === counterpartyId)?.name ?? null;

  // "Hoy, 14:50": la fecha en palabras cuando es hoy o ayer, que es el 90 % de los casos.
  const dateTimeLabel = `${describeDay(occurredAt)}, ${occurredTime}`;

  // Cada sugerencia va pegada a la fila que cambia, dentro de la misma tarjeta. La fila de
  // arriba cede su línea divisoria: la sugerencia trae la suya.
  const showCategoryRow = splitLines == null;
  const categorySuggestion = showCategoryRow ? categorySuggestionToShow : null;
  const counterpartySuggestion = counterpartyId == null ? counterpartySuggestionToShow : null;
  const showSplitRow = onChangeSplitLines != null && splitLines == null;

  return (
    <View style={styles.section}>
      <RiskWarningBlock risk={movementRisk} />
      <BudgetImpactBlock impact={budgetImpact} />

      {/* Sin etiqueta encima: el placeholder ya dice qué es Y qué pasa si lo dejas vacío. La
          sugerencia de descripción vive en la misma tarjeta, debajo del texto que cambia. */}
      <View style={[styles.group, descriptionFocused && styles.groupFocused]}>
        <TextField
          style={styles.descriptionInput}
          placeholder="Descripción — se genera sola si la dejas vacía"
          placeholderTextColor={COLORS.storm}
          value={description}
          onChangeText={onChangeDescription}
          autoFocus
          ref={descriptionRef}
          returnKeyType="next"
          onSubmitEditing={() => notesRef.current?.focus()}
          onFocus={() => setDescriptionFocused(true)}
          onBlur={() => setDescriptionFocused(false)}
          accessibilityLabel="Descripción del movimiento"
        />
        <DescriptionCleanupBlock
          cleanup={descriptionCleanup}
          onApply={onApplyDescriptionCleanup}
        />
      </View>

      {/* Las filas en un grupo, con el valor a la derecha, y cada sugerencia inmediatamente
          debajo de la fila que modifica: aplicada desde el fondo de la pantalla, cambiaba una
          fila que quedaba 120 px más arriba, fuera de la vista. */}
      <View style={styles.group}>
        {showCategoryRow ? (
          <FormOptionRow
            grouped
            label="Categoría"
            value={selectedCategoryName}
            placeholder="Sin asignar"
            onPress={onOpenCategory}
            last={Boolean(categorySuggestion)}
          />
        ) : null}
        <CategoryAiBlock
          suggestion={categorySuggestion}
          onApply={onApplyCategorySuggestion}
        />
        <FormOptionRow
          grouped
          label="Contraparte"
          value={selectedCounterpartyName}
          placeholder="Ninguna"
          onPress={onOpenCounterparty}
          last={Boolean(counterpartySuggestion)}
        />
        <CounterpartyAiBlock
          hasSelectedCounterparty={counterpartyId != null}
          suggestion={counterpartySuggestionToShow}
          onApply={onApplyCounterpartySuggestion}
        />
        <FormOptionRow
          grouped
          label="Fecha y hora"
          value={dateTimeLabel}
          onPress={() => setDateTimeOpen((open) => !open)}
          last={!showSplitRow}
        />
        {showSplitRow ? (
          <FormOptionRow
            grouped
            last
            muted
            label="Repartir entre varias categorías"
            onPress={() => onChangeSplitLines?.([
              { categoryId: null, amount: "" },
              { categoryId: null, amount: "" },
            ])}
          />
        ) : null}
      </View>

      {dateTimeOpen ? (
        <View style={styles.dateTimeRow}>
          <View style={styles.dateTimeDate}>
            <DatePickerInput label="Fecha" value={occurredAt} onChange={onChangeOccurredAt} />
          </View>
          <View style={styles.dateTimeTime}>
            <TimePickerInput label="Hora" value={occurredTime} onChange={onChangeOccurredTime} />
          </View>
        </View>
      ) : null}
      {warnings.occurredAt ? (
        <Text
          style={styles.warningHint}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {warnings.occurredAt}
        </Text>
      ) : null}

      {onChangeSplitLines ? (
        <SplitAmountEditor
          lines={splitLines ?? null}
          onChangeLines={onChangeSplitLines}
          categories={categoriesForPicker}
          totalAmount={splitTotalAmount ?? 0}
          currencyCode={splitCurrencyCode ?? ""}
        />
      ) : null}
      {/* Las dos que no cambian ninguna fila: proponen crear algo, así que van sueltas. */}
      <RecurringAiBlock
        alreadyLinked={recurringAlreadyLinked}
        suggestion={recurringSuggestion}
        onApply={onApplyRecurringSuggestion}
      />
      {accountSuggestion ? (
        <SmartSuggestion
          label={`Usar ${accountSuggestion.name}`}
          detail="Normalmente usas esta cuenta con esa persona o comercio"
          onApply={() => onPickSuggestedAccount(accountSuggestion)}
        />
      ) : null}
      <View
        style={styles.notesField}
        onLayout={(event) => { notesTop.current = event.nativeEvent.layout.y; }}
      >
        <Text style={styles.sectionLabel}>Notas</Text>
        <Input
          placeholder="Para lo que no cabe en la descripción"
          value={notes}
          onChangeText={onChangeNotes}
          multiline
          numberOfLines={3}
          style={styles.notesInput}
          ref={notesRef}
          returnKeyType="done"
          blurOnSubmit
          onFocus={() => scrollRef?.current?.scrollTo({ y: notesTop.current, animated: true })}
        />
      </View>

      <AttachmentPicker
        movementId={savedMovementId}
        attachments={attachments}
        onChange={onChangeAttachments}
        isHydratingExisting={isEditing && isHydratingExistingAttachments}
      />

      {submitError ? (
        <View
          style={styles.submitErrorBanner}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <AlertCircle size={16} color={COLORS.danger} strokeWidth={2} />
          <Text style={styles.submitErrorText}>{submitError}</Text>
        </View>
      ) : null}

      {/* Los botones viven en la barra anclada del formulario: aquí solo aparecían al llegar
          al final del desplazamiento. */}
    </View>
  );
});

const styles = StyleSheet.create({
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  groupFocused: { borderColor: SURFACE.inputFocus },
  descriptionInput: {
    minHeight: 52,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: -SPACING.xs,
  },
  dateTimeRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "flex-end",
  },
  dateTimeDate: { flex: 1.4, minWidth: 0 },
  dateTimeTime: { flex: 1, minWidth: 0 },
  section: { gap: SPACING.md },
  warningHint: {
    color: COLORS.warning,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
  notesField: { gap: SPACING.sm },
  notesInput: { height: 72, textAlignVertical: "top" },
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
  },
});
