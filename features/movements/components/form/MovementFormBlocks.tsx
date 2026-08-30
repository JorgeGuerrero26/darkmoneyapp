import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertCircle } from "lucide-react-native";

import { SmartSuggestion } from "../../../../components/ui/SmartSuggestion";
import { suggestionReason } from "../../../../lib/suggestion-reason";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../../../constants/theme";
import {
  recurringFrequencyLabel,
  type MovementRecurringSuggestionResult,
} from "../../../../lib/movement-recurring-suggestions";
import type { CounterpartySuggestionResult } from "../../../../lib/movement-counterparty-suggestions";
import type { MovementRiskExplanation } from "../../../../lib/movement-risk-analysis";
import type { MovementBudgetImpact } from "../../../../lib/movement-budget-impact";
import type { DescriptionCleanupResult } from "../../../../lib/movement-description-cleanup";

/**
 * Bloques visuales del MovementForm extraídos como sub-componentes memoizados.
 * Cada uno recibe solo las props que necesita para que re-renderice solo
 * cuando cambia la sugerencia/loading de su propio dominio — no por keystrokes
 * en otros campos del form.
 *
 * Patrón aplicado idéntico al de QuickDetectedMovementBlocks.
 */

export type CategorySuggestionState = {
  categoryId: number | null;
  categoryName: string;
  newCategoryName?: string | null;
  confidence: number;
  reasons: string[];
  source?: "deepseek" | "local";
};

type RiskBlockProps = {
  risk: MovementRiskExplanation | null;
};

export const RiskWarningBlock = memo(function RiskWarningBlock({ risk }: RiskBlockProps) {
  if (!risk) return null;
  return (
    <View style={styles.warning}>
      <AlertCircle size={16} color={COLORS.gold} strokeWidth={2} />
      <View style={styles.warningBody}>
        <Text style={styles.warningTitle}>{risk.title}</Text>
        <Text style={styles.warningText}>
          {risk.source === "deepseek" ? "Revisión inteligente: " : ""}
          {risk.explanation}
        </Text>
      </View>
    </View>
  );
});

type BudgetImpactBlockProps = {
  impact: MovementBudgetImpact | null;
};

export const BudgetImpactBlock = memo(function BudgetImpactBlock({ impact }: BudgetImpactBlockProps) {
  if (!impact) return null;
  return (
    <View style={styles.warning}>
      <AlertCircle
        size={16}
        color={impact.severity === "high" ? COLORS.danger : COLORS.gold}
        strokeWidth={2}
      />
      <View style={styles.warningBody}>
        <Text style={styles.warningTitle}>{impact.title}</Text>
        <Text style={styles.warningText}>
          {impact.source === "deepseek" ? "Recomendación inteligente: " : ""}
          {impact.recommendation}
        </Text>
      </View>
    </View>
  );
});

type DescriptionCleanupBlockProps = {
  cleanup: DescriptionCleanupResult | null;
  onApply: (cleaned: string) => void;
};

export const DescriptionCleanupBlock = memo(function DescriptionCleanupBlock({
  cleanup,
  onApply,
}: DescriptionCleanupBlockProps) {
  if (!cleanup) return null;
  return (
    <SmartSuggestion
      grouped
      label={cleanup.cleanedDescription}
      detail="Descripción sugerida"
      onApply={() => onApply(cleanup.cleanedDescription)}
    />
  );
});

type CategoryAiBlockProps = {
  suggestion: CategorySuggestionState | null;
  onApply: (suggestion: CategorySuggestionState) => void;
};

export const CategoryAiBlock = memo(function CategoryAiBlock({
  suggestion,
  onApply,
}: CategoryAiBlockProps) {
  if (!suggestion) return null;
  return (
    <SmartSuggestion
      grouped
      label={suggestion.categoryName}
      detail={suggestionReason(suggestion.reasons, "Categoría sugerida")}
      onApply={() => onApply(suggestion)}
    />
  );
});

type CounterpartyAiBlockProps = {
  hasSelectedCounterparty: boolean;
  suggestion: CounterpartySuggestionResult | null;
  onApply: (suggestion: CounterpartySuggestionResult) => void;
};

export const CounterpartyAiBlock = memo(function CounterpartyAiBlock({
  hasSelectedCounterparty,
  suggestion,
  onApply,
}: CounterpartyAiBlockProps) {
  if (hasSelectedCounterparty || !suggestion) return null;
  const label =
    suggestion.type === "new_counterparty" && suggestion.newCounterpartyName
      ? `Crear contraparte "${suggestion.newCounterpartyName}"`
      : suggestion.counterpartyName ?? "Contraparte sugerida";
  return (
    <SmartSuggestion
      grouped
      label={label}
      detail={suggestionReason(suggestion.reasons, "Contraparte sugerida")}
      onApply={() => onApply(suggestion)}
    />
  );
});

type RecurringAiBlockProps = {
  alreadyLinked: boolean;
  suggestion: MovementRecurringSuggestionResult | null;
  onApply: (suggestion: MovementRecurringSuggestionResult) => void;
};

/**
 * La recurrencia no modifica ninguna fila del formulario —propone crear una suscripción o un
 * ingreso fijo—, así que es la única sugerencia que va suelta, después de la tarjeta.
 */
export const RecurringAiBlock = memo(function RecurringAiBlock({
  alreadyLinked,
  suggestion,
  onApply,
}: RecurringAiBlockProps) {
  if (alreadyLinked || !suggestion) return null;
  const label =
    suggestion.type === "recurring_income"
      ? `Crear ingreso fijo "${suggestion.name}"`
      : `Crear suscripción "${suggestion.name}"`;
  return (
    <SmartSuggestion
      label={label}
      detail={suggestionReason(suggestion.reasons, `Se repite ${recurringFrequencyLabel(suggestion.frequency)}`)}
      onApply={() => onApply(suggestion)}
    />
  );
});

const styles = StyleSheet.create({
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.gold + "16",
    borderWidth: 1,
    borderColor: COLORS.gold + "44",
  },
  warningBody: { flex: 1 },
  warningTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  warningText: {
    marginTop: 2,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
});
