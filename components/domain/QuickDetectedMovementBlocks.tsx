import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SmartSuggestion } from "../ui/SmartSuggestion";
import { suggestionReason } from "../../lib/suggestion-reason";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { recurringFrequencyLabel, type MovementRecurringSuggestionResult } from "../../lib/movement-recurring-suggestions";
import type { CounterpartySuggestionResult } from "../../lib/movement-counterparty-suggestions";
import type { MovementRiskExplanation } from "../../lib/movement-risk-analysis";
import type { MovementBudgetImpact } from "../../lib/movement-budget-impact";
import type { DescriptionCleanupResult } from "../../lib/movement-description-cleanup";

type DescriptionCleanupBlockProps = {
  cleanup: DescriptionCleanupResult | null;
  onApply: (cleanedDescription: string) => void;
};

export const DescriptionCleanupBlock = memo(function DescriptionCleanupBlock({
  cleanup,
  onApply,
}: DescriptionCleanupBlockProps) {
  if (!cleanup) return null;
  return (
    <SmartSuggestion
      label={cleanup.cleanedDescription}
      detail="Descripción sugerida"
      onApply={() => onApply(cleanup.cleanedDescription)}
    />
  );
});

type CounterpartySuggestionBlockProps = {
  hasSelectedCounterparty: boolean;
  suggestion: CounterpartySuggestionResult | null;
  onApply: (suggestion: CounterpartySuggestionResult) => void;
};

export const CounterpartySuggestionBlock = memo(function CounterpartySuggestionBlock({
  hasSelectedCounterparty,
  suggestion,
  onApply,
}: CounterpartySuggestionBlockProps) {
  if (hasSelectedCounterparty || !suggestion) return null;
  const label =
    suggestion.type === "new_counterparty" && suggestion.newCounterpartyName
      ? `Crear contraparte "${suggestion.newCounterpartyName}"`
      : suggestion.counterpartyName ?? "Contraparte sugerida";
  return (
    <SmartSuggestion
      label={label}
      detail={suggestionReason(suggestion.reasons, "Contraparte sugerida")}
      onApply={() => onApply(suggestion)}
    />
  );
});

type RecurringSuggestionBlockProps = {
  alreadyLinked: boolean;
  suggestion: MovementRecurringSuggestionResult | null;
  onApply: (suggestion: MovementRecurringSuggestionResult) => void;
};

export const RecurringSuggestionBlock = memo(function RecurringSuggestionBlock({
  alreadyLinked,
  suggestion,
  onApply,
}: RecurringSuggestionBlockProps) {
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

type RiskBlockProps = {
  risk: MovementRiskExplanation | null;
};

export const RiskBlock = memo(function RiskBlock({ risk }: RiskBlockProps) {
  if (!risk) return null;
  return (
    <View style={styles.riskWarning}>
      <Text style={styles.riskWarningTitle}>{risk.title}</Text>
      <Text style={styles.riskWarningText}>
        {risk.source === "deepseek" ? "Revisión inteligente: " : ""}
        {risk.explanation}
      </Text>
    </View>
  );
});

type BudgetBlockProps = {
  impact: MovementBudgetImpact | null;
};

export const BudgetBlock = memo(function BudgetBlock({ impact }: BudgetBlockProps) {
  if (!impact) return null;
  return (
    <View style={styles.riskWarning}>
      <Text style={styles.riskWarningTitle}>{impact.title}</Text>
      <Text style={styles.riskWarningText}>
        {impact.source === "deepseek" ? "Recomendación inteligente: " : ""}
        {impact.recommendation}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  riskWarning: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(245,181,82,0.35)",
    backgroundColor: "rgba(245,181,82,0.10)",
    padding: SPACING.md,
    gap: 2,
  },
  riskWarningTitle: {
    color: COLORS.gold,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  riskWarningText: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
  },
});
