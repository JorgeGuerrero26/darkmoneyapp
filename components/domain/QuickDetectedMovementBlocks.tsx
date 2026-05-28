import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SmartSuggestion, SmartSuggestionEmpty, SmartSuggestionLoading } from "../ui/SmartSuggestion";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { recurringFrequencyLabel, type MovementRecurringSuggestionResult } from "../../lib/movement-recurring-suggestions";
import type { CounterpartySuggestionResult } from "../../lib/movement-counterparty-suggestions";
import type { MovementRiskExplanation } from "../../lib/movement-risk-analysis";
import type { MovementBudgetImpact } from "../../lib/movement-budget-impact";
import type { DescriptionCleanupResult } from "../../lib/movement-description-cleanup";

type DescriptionCleanupBlockProps = {
  loading: boolean;
  cleanup: DescriptionCleanupResult | null;
  onApply: (cleanedDescription: string) => void;
};

export const DescriptionCleanupBlock = memo(function DescriptionCleanupBlock({
  loading,
  cleanup,
  onApply,
}: DescriptionCleanupBlockProps) {
  if (loading) {
    return (
      <SmartSuggestionLoading
        title="Limpiando descripción"
        detail="Estamos revisando si el texto de la notificación puede quedar más claro."
      />
    );
  }
  if (!cleanup) return null;
  return (
    <SmartSuggestion
      label={cleanup.cleanedDescription}
      detail={`Descripción limpia · ${Math.round(cleanup.confidence * 100)}% · ${cleanup.reasons.join(" · ")}`}
      onApply={() => onApply(cleanup.cleanedDescription)}
    />
  );
});

type CounterpartySuggestionBlockProps = {
  loading: boolean;
  attempted: boolean;
  hasSelectedCounterparty: boolean;
  suggestion: CounterpartySuggestionResult | null;
  onApply: (suggestion: CounterpartySuggestionResult) => void;
};

export const CounterpartySuggestionBlock = memo(function CounterpartySuggestionBlock({
  loading,
  attempted,
  hasSelectedCounterparty,
  suggestion,
  onApply,
}: CounterpartySuggestionBlockProps) {
  if (loading) {
    return (
      <SmartSuggestionLoading
        title="Buscando contraparte"
        detail="Revisando si este movimiento corresponde a un contacto o comercio."
      />
    );
  }
  if (attempted && !suggestion) {
    return <SmartSuggestionEmpty message="Sin sugerencia de contraparte" />;
  }
  if (hasSelectedCounterparty || !suggestion) return null;
  const label =
    suggestion.type === "new_counterparty" && suggestion.newCounterpartyName
      ? `Crear contraparte "${suggestion.newCounterpartyName}"`
      : suggestion.counterpartyName ?? "Contraparte sugerida";
  const detail = `${suggestion.source === "deepseek" ? "Mejor sugerencia · " : ""}${Math.round(suggestion.confidence * 100)}% · ${suggestion.reasons.join(" · ")}`;
  return <SmartSuggestion label={label} detail={detail} onApply={() => onApply(suggestion)} />;
});

type RecurringSuggestionBlockProps = {
  loading: boolean;
  attempted: boolean;
  alreadyLinked: boolean;
  suggestion: MovementRecurringSuggestionResult | null;
  onApply: (suggestion: MovementRecurringSuggestionResult) => void;
};

export const RecurringSuggestionBlock = memo(function RecurringSuggestionBlock({
  loading,
  attempted,
  alreadyLinked,
  suggestion,
  onApply,
}: RecurringSuggestionBlockProps) {
  if (loading) {
    return (
      <SmartSuggestionLoading
        title="Detectando recurrencia"
        detail="Revisando si este movimiento se repite como cargo o ingreso fijo."
      />
    );
  }
  if (attempted && !suggestion && !alreadyLinked) {
    return <SmartSuggestionEmpty message="Sin detección de recurrencia" />;
  }
  if (alreadyLinked || !suggestion) return null;
  const label =
    suggestion.type === "recurring_income"
      ? `Crear ingreso fijo "${suggestion.name}"`
      : `Crear suscripción "${suggestion.name}"`;
  const detail = `${suggestion.source === "deepseek" ? "Mejor sugerencia · " : ""}${Math.round(suggestion.confidence * 100)}% · ${recurringFrequencyLabel(suggestion.frequency)} · ${suggestion.reasons.join(" · ")}`;
  return <SmartSuggestion label={label} detail={detail} onApply={() => onApply(suggestion)} />;
});

type RiskBlockProps = {
  loading: boolean;
  risk: MovementRiskExplanation | null;
};

export const RiskBlock = memo(function RiskBlock({ loading, risk }: RiskBlockProps) {
  if (loading) {
    return (
      <SmartSuggestionLoading
        title="Revisando antes de guardar"
        detail="Analizando si este movimiento podría estar repetido o fuera de patrón."
      />
    );
  }
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
  loading: boolean;
  impact: MovementBudgetImpact | null;
};

export const BudgetBlock = memo(function BudgetBlock({ loading, impact }: BudgetBlockProps) {
  if (loading) {
    return (
      <SmartSuggestionLoading
        title="Revisando presupuesto"
        detail="Calculando si este movimiento afecta un presupuesto sensible."
      />
    );
  }
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
