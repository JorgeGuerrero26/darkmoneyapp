import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "../../../components/ui/Button";
import { TextField } from "../../../components/ui/TextField";
import { FormOptionRow } from "../../../components/ui/FormOptionRow";
import { CategorySuggestionBlock } from "../../../components/domain/QuickDetectedMovementSuggestionBlock";
import { BudgetBlock, CounterpartySuggestionBlock, DescriptionCleanupBlock, RecurringSuggestionBlock, RiskBlock } from "../../../components/domain/QuickDetectedMovementBlocks";
import { AiQuotaWarningBanner } from "../../../components/ui/AiQuotaWarningBanner";
import { SPACING } from "../../../constants/theme";
import type { DetectedMovementReview } from "../hooks/useDetectedMovementReview";

/** Opciones existentes de registro, accesibles sin recargar la revisión principal. */
export function DetectedMovementExtras({ review: r }: { review: DetectedMovementReview }) {
  const [expanded, setExpanded] = useState(false);
  return <View style={styles.content}>
    <Button label={expanded ? "Menos opciones" : "Más opciones"} variant="ghost" disabled={r.busy} onPress={() => setExpanded((value) => !value)} />
    {expanded ? <View pointerEvents={r.busy ? "none" : "auto"} style={styles.content}>
      <AiQuotaWarningBanner usage={r.aiUsage} />
      {r.movementType !== "transfer" ? <>
        <FormOptionRow label="Dividir en categorías" value={r.splitLines ? `${r.splitLines.length} categorías` : "Elegir"} onPress={() => {
          if (!r.splitLines) r.setSplitLines([{ categoryId: r.categoryId, amount: "" }, { categoryId: null, amount: "" }]);
          r.setSplitSheetOpen(true);
        }} />
        <CategorySuggestionBlock suggestion={r.categorySuggestion ? { categoryName: r.categorySuggestion.categoryName, detail: r.categorySuggestion.detail } : null} onApply={() => r.categorySuggestion && void r.applyCategorySuggestion(r.categorySuggestion)} />
        <DescriptionCleanupBlock cleanup={r.descriptionCleanup} onApply={(cleaned) => { r.setCleanupAppliedText(cleaned); r.setDescription(cleaned); }} />
        <CounterpartySuggestionBlock hasSelectedCounterparty={Boolean(r.selectedCounterparty)} suggestion={r.counterpartySuggestion} onApply={(suggestion) => void r.applyCounterpartySuggestion(suggestion)} />
        <RecurringSuggestionBlock alreadyLinked={Boolean(r.linkedSubscriptionId || r.linkedRecurringIncomeId)} suggestion={r.recurringSuggestion} onApply={(suggestion) => void r.applyRecurringSuggestion(suggestion)} />
        <RiskBlock risk={r.movementRisk} />
        <BudgetBlock impact={r.budgetImpact} />
      </> : null}
      <TextField value={r.notes} onChangeText={r.setNotes} multiline editable={!r.busy} placeholder="Notas (opcional)" accessibilityLabel="Notas del movimiento" />
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({ content: { gap: SPACING.md } });
