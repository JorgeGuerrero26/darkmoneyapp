import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AlertCircle } from "lucide-react-native";

import { SmartSuggestion, SmartSuggestionEmpty, SmartSuggestionLoading } from "../../../../components/ui/SmartSuggestion";
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
  loading: boolean;
  risk: MovementRiskExplanation | null;
};

export const RiskWarningBlock = memo(function RiskWarningBlock({ loading, risk }: RiskBlockProps) {
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
  loading: boolean;
  impact: MovementBudgetImpact | null;
};

export const BudgetImpactBlock = memo(function BudgetImpactBlock({ loading, impact }: BudgetImpactBlockProps) {
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
  loading: boolean;
  cleanup: DescriptionCleanupResult | null;
  onApply: (cleaned: string) => void;
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
        detail="Estamos revisando si el texto puede quedar más claro antes de guardar."
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

type CategoryAiBlockProps = {
  loading: boolean;
  attempted: boolean;
  errored?: boolean;
  hasLocalSuggestion: boolean;
  suggestion: CategorySuggestionState | null;
  onApply: (suggestion: CategorySuggestionState) => void;
};

export const CategoryAiBlock = memo(function CategoryAiBlock({
  loading,
  attempted,
  errored,
  hasLocalSuggestion,
  suggestion,
  onApply,
}: CategoryAiBlockProps) {
  if (loading) {
    return (
      <SmartSuggestionLoading
        detail={
          hasLocalSuggestion
            ? "Puede confirmar la sugerencia actual; si aparece una mejor, la actualizaremos."
            : "Buscando una categoría más precisa para este movimiento."
        }
      />
    );
  }
  if (errored && !suggestion) {
    return <SmartSuggestionEmpty message="IA no disponible" />;
  }
  if (attempted && !suggestion) {
    return <SmartSuggestionEmpty message="IA sin sugerencia" />;
  }
  if (!suggestion) return null;
  return (
    <SmartSuggestion
      label={suggestion.categoryName}
      detail={`${suggestion.source === "deepseek" ? "Mejor sugerencia · " : ""}${Math.round(suggestion.confidence * 100)}% · ${suggestion.reasons.join(" · ")}`}
      onApply={() => onApply(suggestion)}
    />
  );
});

type CounterpartyAiBlockProps = {
  loading: boolean;
  attempted: boolean;
  hasSelectedCounterparty: boolean;
  suggestion: CounterpartySuggestionResult | null;
  onApply: (suggestion: CounterpartySuggestionResult) => void;
};

export const CounterpartyAiBlock = memo(function CounterpartyAiBlock({
  loading,
  attempted,
  hasSelectedCounterparty,
  suggestion,
  onApply,
}: CounterpartyAiBlockProps) {
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

type RecurringAiBlockProps = {
  loading: boolean;
  attempted: boolean;
  alreadyLinked: boolean;
  suggestion: MovementRecurringSuggestionResult | null;
  onApply: (suggestion: MovementRecurringSuggestionResult) => void;
};

export const RecurringAiBlock = memo(function RecurringAiBlock({
  loading,
  attempted,
  alreadyLinked,
  suggestion,
  onApply,
}: RecurringAiBlockProps) {
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
