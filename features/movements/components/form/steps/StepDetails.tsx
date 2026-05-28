import { memo, type RefObject } from "react";
import { StyleSheet, Text, View, type TextInput } from "react-native";
import { AlertCircle } from "lucide-react-native";

import { AttachmentPicker, type Attachment } from "../../../../../components/domain/AttachmentPicker";
import { Button } from "../../../../../components/ui/Button";
import { DatePickerInput } from "../../../../../components/ui/DatePickerInput";
import { Input } from "../../../../../components/ui/Input";
import { SmartSuggestion } from "../../../../../components/ui/SmartSuggestion";
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  RADIUS,
  SPACING,
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
import { CategoryPicker, CounterpartyPicker } from "../MovementChipPickers";
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

  // Description
  descriptionRef: RefObject<TextInput | null>;
  notesRef: RefObject<TextInput | null>;
  description: string;
  onChangeDescription: (value: string) => void;

  // Notes
  notes: string;
  onChangeNotes: (value: string) => void;

  // Risk / budget
  movementRiskLoading: boolean;
  movementRisk: MovementRiskExplanation | null;
  budgetImpactLoading: boolean;
  budgetImpact: MovementBudgetImpact | null;

  // Description cleanup
  descriptionCleanupLoading: boolean;
  descriptionCleanup: DescriptionCleanupResult | null;
  onApplyDescriptionCleanup: (cleaned: string) => void;

  // Category
  categoriesForPicker: CategorySummary[];
  categoryId: number | null;
  onSelectCategory: (id: number | null) => void;
  aiCategorySuggestionLoading: boolean;
  aiCategorySuggestionAttempted: boolean;
  hasLocalCategorySuggestion: boolean;
  categorySuggestionToShow: CategorySuggestionState | null;
  onApplyCategorySuggestion: (sug: CategorySuggestionState) => void;

  // Counterparty
  counterpartiesSorted: CounterpartySummary[];
  counterpartyId: number | null;
  onSelectCounterparty: (id: number | null) => void;
  aiCounterpartySuggestionLoading: boolean;
  aiCounterpartySuggestionAttempted: boolean;
  counterpartySuggestionToShow: CounterpartySuggestionResult | null;
  onApplyCounterpartySuggestion: (sug: CounterpartySuggestionResult) => void;

  // Recurring
  recurringSuggestionLoading: boolean;
  recurringSuggestionAttempted: boolean;
  recurringAlreadyLinked: boolean;
  recurringSuggestion: MovementRecurringSuggestionResult | null;
  onApplyRecurringSuggestion: (sug: MovementRecurringSuggestionResult) => void;

  // Account suggestion
  accountSuggestion: AccountSummary | null;
  movementType: string;
  onPickSuggestedAccount: (account: AccountSummary) => void;

  // Date
  occurredAt: string;
  onChangeOccurredAt: (value: string) => void;
  warnings: FormWarnings;

  // Attachments
  attachments: Attachment[];
  onChangeAttachments: (next: Attachment[]) => void;
  savedMovementId: number | undefined;
  isHydratingExistingAttachments: boolean;

  // Submit
  submitError: string;
  submitLoading: boolean;
  onBack: () => void;
  onSubmit: () => void;
};

export const StepDetails = memo(function StepDetails({
  isEditing,
  descriptionRef,
  notesRef,
  description,
  onChangeDescription,
  notes,
  onChangeNotes,
  movementRiskLoading,
  movementRisk,
  budgetImpactLoading,
  budgetImpact,
  descriptionCleanupLoading,
  descriptionCleanup,
  onApplyDescriptionCleanup,
  categoriesForPicker,
  categoryId,
  onSelectCategory,
  aiCategorySuggestionLoading,
  aiCategorySuggestionAttempted,
  hasLocalCategorySuggestion,
  categorySuggestionToShow,
  onApplyCategorySuggestion,
  counterpartiesSorted,
  counterpartyId,
  onSelectCounterparty,
  aiCounterpartySuggestionLoading,
  aiCounterpartySuggestionAttempted,
  counterpartySuggestionToShow,
  onApplyCounterpartySuggestion,
  recurringSuggestionLoading,
  recurringSuggestionAttempted,
  recurringAlreadyLinked,
  recurringSuggestion,
  onApplyRecurringSuggestion,
  accountSuggestion,
  movementType,
  onPickSuggestedAccount,
  occurredAt,
  onChangeOccurredAt,
  warnings,
  attachments,
  onChangeAttachments,
  savedMovementId,
  isHydratingExistingAttachments,
  submitError,
  submitLoading,
  onBack,
  onSubmit,
}: Props) {
  return (
    <View style={styles.section}>
      <RiskWarningBlock loading={movementRiskLoading} risk={movementRisk} />
      <BudgetImpactBlock loading={budgetImpactLoading} impact={budgetImpact} />

      <Input
        label="Descripción (opcional)"
        placeholder="Se genera automáticamente si la dejas vacía"
        value={description}
        onChangeText={onChangeDescription}
        autoFocus
        ref={descriptionRef}
        returnKeyType="next"
        onSubmitEditing={() => notesRef.current?.focus()}
      />
      <DescriptionCleanupBlock
        loading={descriptionCleanupLoading}
        cleanup={descriptionCleanup}
        onApply={onApplyDescriptionCleanup}
      />

      <CategoryPicker
        label="Categoría (opcional)"
        categories={categoriesForPicker}
        selectedId={categoryId}
        onSelect={onSelectCategory}
      />
      <CategoryAiBlock
        loading={aiCategorySuggestionLoading}
        attempted={aiCategorySuggestionAttempted}
        hasLocalSuggestion={hasLocalCategorySuggestion}
        suggestion={categorySuggestionToShow}
        onApply={onApplyCategorySuggestion}
      />

      <CounterpartyPicker
        label="Contraparte (opcional)"
        counterparties={counterpartiesSorted}
        selectedId={counterpartyId}
        onSelect={onSelectCounterparty}
      />
      <CounterpartyAiBlock
        loading={aiCounterpartySuggestionLoading}
        attempted={aiCounterpartySuggestionAttempted}
        hasSelectedCounterparty={counterpartyId != null}
        suggestion={counterpartySuggestionToShow}
        onApply={onApplyCounterpartySuggestion}
      />
      <RecurringAiBlock
        loading={recurringSuggestionLoading}
        attempted={recurringSuggestionAttempted}
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

      <DatePickerInput
        label="Fecha"
        value={occurredAt}
        onChange={onChangeOccurredAt}
      />
      {warnings.occurredAt ? (
        <Text
          style={styles.warningHint}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {warnings.occurredAt}
        </Text>
      ) : null}

      <Input
        label="Notas (opcional)"
        placeholder="Notas adicionales…"
        value={notes}
        onChangeText={onChangeNotes}
        multiline
        numberOfLines={3}
        style={styles.notesInput}
        ref={notesRef}
        returnKeyType="done"
        blurOnSubmit
      />

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

      <View style={styles.navRow}>
        <Button label="← Atrás" variant="ghost" onPress={onBack} style={styles.btnHalf} />
        <Button
          label={isEditing ? "Actualizar" : "Guardar"}
          onPress={onSubmit}
          loading={submitLoading}
          style={styles.btnHalf}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: SPACING.md },
  warningHint: {
    color: COLORS.warning,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    marginTop: -SPACING.sm,
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
  },
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
  navRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.sm },
  btnHalf: { flex: 1 },
});
