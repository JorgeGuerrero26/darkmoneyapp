import { useMemo } from "react";
import { Text, View } from "react-native";
import { differenceInDays } from "date-fns";
import { AlertTriangle, Brain, Clock, Sparkles, Tag, TrendingUp } from "lucide-react-native";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { normalizeAnalyticsText } from "../../../../services/analytics/movement-features";
import type { DashboardMovementRow } from "../../../../services/queries/workspace-data";
import { isCategorizedCashflow } from "../../lib/aggregations";
import type { DashboardProjectionModel } from "../../lib/advanced-types";
import { SectionTitle } from "../simple/SectionTitle";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

type LearningPanelProps = {
  movements: DashboardMovementRow[];
  projectionModel: DashboardProjectionModel;
  activeCurrency: string;
  weeklyPatternInsight: { dayLabel: string; share: number } | null;
  categoryConcentration: { label: string; topCategory: string | null; topShare: number | null };
  categorySuggestionsCount: number;
  anomalySignalsCount: number;
  acceptedFeedbackCount: number;
  cashCushionDays: number;
  cashCushionLabel: string;
};

export function LearningPanel({
  movements,
  projectionModel,
  activeCurrency,
  weeklyPatternInsight,
  categoryConcentration,
  categorySuggestionsCount,
  anomalySignalsCount,
  acceptedFeedbackCount,
  cashCushionDays,
  cashCushionLabel,
}: LearningPanelProps) {
  const learning = useMemo(() => {
    const posted = movements.filter((movement) => movement.status === "posted");
    const useful = posted.filter((movement) => movement.movementType !== "obligation_opening");
    const categorizedBase = useful.filter(isCategorizedCashflow);
    const categorizedCount = categorizedBase.filter((movement) => movement.categoryId != null).length;
    const categorizedRate = categorizedBase.length > 0 ? categorizedCount / categorizedBase.length : 0;
    const oldest = useful[useful.length - 1];
    const historyDays = oldest ? Math.max(1, differenceInDays(new Date(), new Date(oldest.occurredAt))) : 0;
    const readinessScore = Math.round(
      Math.min(1, useful.length / 120) * 40 + Math.min(1, historyDays / 120) * 25 + categorizedRate * 35,
    );
    const phases = [
      { step: 1, title: "Base", description: "La app ya puede leer totales y ritmos simples.", progress: Math.min(1, useful.length / 10) },
      { step: 2, title: "Patrones", description: "Empieza a distinguir hábitos y semanas raras.", progress: Math.min(1, Math.min(useful.length / 30, historyDays / 30)) },
      { step: 3, title: "Proyecciones", description: "Ya puede estimar presión futura con más confianza.", progress: Math.min(1, Math.min(useful.length / 70, historyDays / 60, categorizedRate / 0.6)) },
      { step: 4, title: "Alertas finas", description: "Lista para señales más finas y anomalías.", progress: Math.min(1, Math.min(useful.length / 120, historyDays / 120, categorizedRate / 0.82)) },
    ];
    const descriptionGroups = new Map<string, { label: string; count: number }>();
    for (const movement of useful) {
      const normalized = normalizeAnalyticsText(movement.description ?? "");
      if (normalized.length < 3) continue;
      const current = descriptionGroups.get(normalized);
      descriptionGroups.set(normalized, {
        label: movement.description?.trim() || "Movimiento repetido",
        count: (current?.count ?? 0) + 1,
      });
    }
    const repeatedDescription =
      Array.from(descriptionGroups.values()).filter((item) => item.count >= 2).sort((a, b) => b.count - a.count)[0] ?? null;

    const insights: string[] = [];
    if (categorizedRate < 0.55) insights.push("Tus categorías aún necesitan trabajo para que las comparaciones sean más confiables.");
    if (useful.length < 25) insights.push("Todavía falta un poco de historia para detectar hábitos más estables.");
    if (acceptedFeedbackCount > 0)
      insights.push(
        `${acceptedFeedbackCount} corrección${acceptedFeedbackCount === 1 ? "" : "es"} tuya ya alimenta${acceptedFeedbackCount === 1 ? "" : "n"} el aprendizaje de categorías.`,
      );
    if (historyDays >= 45 && categorizedRate >= 0.6) insights.push("Ya hay una base decente para empezar a notar patrones y presión futura.");
    if (insights.length === 0) insights.push("La base del workspace ya está suficientemente sana para lecturas más finas.");
    return { categorizedRate, historyDays, insights, phases, readinessScore, repeatedDescription, usefulCount: useful.length };
  }, [acceptedFeedbackCount, movements]);

  const learningSignals = useMemo(() => {
    const projectionDelta = Math.abs(projectionModel.expectedBalance - projectionModel.conservativeBalance);
    return [
      {
        icon: Clock,
        color: COLORS.primary,
        label: "Patrón semanal",
        title: weeklyPatternInsight ? `${weeklyPatternInsight.dayLabel} concentra ${weeklyPatternInsight.share}% del gasto` : "Todavía no hay un día dominante",
        body: weeklyPatternInsight
          ? "Úsalo para decidir si ese día necesita un límite, alerta o revisión de hábitos."
          : "La app necesita más movimientos por día para separar hábito real de semanas aisladas.",
      },
      {
        icon: Tag,
        color: COLORS.warning,
        label: "Categorías",
        title: categoryConcentration.topCategory ? `${categoryConcentration.topCategory} pesa ${categoryConcentration.topShare ?? 0}%` : "Sin categoría dominante clara",
        body: categoryConcentration.topCategory
          ? `La lectura aparece ${categoryConcentration.label.toLowerCase()}; si esa categoría sube, mueve fuerte tu mes.`
          : "Cuando haya más gastos categorizados, aquí verás qué parte del mes está mandando.",
      },
      {
        icon: Sparkles,
        color: COLORS.gold,
        label: "Repeticiones",
        title: learning.repeatedDescription
          ? `${learning.repeatedDescription.label} aparece ${learning.repeatedDescription.count} veces`
          : "Aún no hay comercios repetidos fuertes",
        body: learning.repeatedDescription
          ? "Esto ayuda a sugerir categorías y detectar suscripciones o pagos que se repiten."
          : "Cuando detecte textos parecidos, podrá anticipar categorías y posibles recurrentes.",
      },
      {
        icon: TrendingUp,
        color: COLORS.income,
        label: "Proyección",
        title: `${projectionModel.confidence}% de confianza · ${projectionModel.confidenceLabel}`,
        body: `La banda actual tiene ${formatCurrency(projectionDelta, activeCurrency)} entre piso y esperado. Caja libre: ${cashCushionDays}d (${cashCushionLabel}).`,
      },
      {
        icon: AlertTriangle,
        color: categorySuggestionsCount > 0 || anomalySignalsCount > 0 ? COLORS.gold : COLORS.primary,
        label: "Acciones útiles",
        title:
          categorySuggestionsCount > 0 || anomalySignalsCount > 0
            ? `${categorySuggestionsCount} sugerencia${categorySuggestionsCount === 1 ? "" : "s"} · ${anomalySignalsCount} alerta${anomalySignalsCount === 1 ? "" : "s"}`
            : acceptedFeedbackCount > 0
              ? `${acceptedFeedbackCount} aprendizaje${acceptedFeedbackCount === 1 ? "" : "s"} aplicado${acceptedFeedbackCount === 1 ? "" : "s"}`
              : "Sin acciones críticas de aprendizaje",
        body:
          categorySuggestionsCount > 0 || anomalySignalsCount > 0
            ? "Primero atiende estas señales: mejoran categorización, anomalías y confianza de forecast."
            : acceptedFeedbackCount > 0
              ? "La app ya está usando respuestas tuyas para reconocer mejor movimientos parecidos."
              : "Puedes usar esta capa como monitoreo, no como lista urgente.",
      },
    ];
  }, [
    acceptedFeedbackCount,
    activeCurrency,
    anomalySignalsCount,
    cashCushionDays,
    cashCushionLabel,
    categoryConcentration.label,
    categoryConcentration.topCategory,
    categoryConcentration.topShare,
    categorySuggestionsCount,
    learning.repeatedDescription,
    projectionModel.confidence,
    projectionModel.confidenceLabel,
    projectionModel.conservativeBalance,
    projectionModel.expectedBalance,
    weeklyPatternInsight,
  ]);

  return (
    <Card>
      <SectionTitle>Aprendiendo de ti</SectionTitle>
      <Text style={subStyles.executiveIntro}>
        Esta capa no es solo un porcentaje: te muestra dónde la app ya ve patrones y qué decisiones puede ayudarte a tomar con esa base.
      </Text>
      <View style={subStyles.learningTopGrid}>
        <View style={subStyles.learningMetricCard}><Brain size={16} color={COLORS.primary} /><Text style={subStyles.learningMetricValue}>{learning.usefulCount}</Text><Text style={subStyles.learningMetricLabel}>Movimientos útiles</Text></View>
        <View style={subStyles.learningMetricCard}><Clock size={16} color={COLORS.secondary} /><Text style={subStyles.learningMetricValue}>{learning.historyDays} d</Text><Text style={subStyles.learningMetricLabel}>Historia observada</Text></View>
        <View style={subStyles.learningMetricCard}><Tag size={16} color={COLORS.warning} /><Text style={subStyles.learningMetricValue}>{Math.round(learning.categorizedRate * 100)}%</Text><Text style={subStyles.learningMetricLabel}>Categorías útiles</Text></View>
        <View style={subStyles.learningMetricCard}><Sparkles size={16} color={COLORS.income} /><Text style={subStyles.learningMetricValue}>{learning.readinessScore}%</Text><Text style={subStyles.learningMetricLabel}>Confianza actual</Text></View>
        <View style={subStyles.learningMetricCard}><Brain size={16} color={COLORS.gold} /><Text style={subStyles.learningMetricValue}>{acceptedFeedbackCount}</Text><Text style={subStyles.learningMetricLabel}>Respuestas usadas</Text></View>
      </View>
      <Text style={subStyles.learningGroupTitle}>Dónde ya ve señales</Text>
      <View style={subStyles.learningSignalList}>
        {learningSignals.map((signal, index) => {
          const Icon = signal.icon;
          return (
            <View key={signal.label} style={[subStyles.learningSignalCard, index === 0 && subStyles.learningSignalCardWide]}>
              <View style={subStyles.learningSignalHeader}>
                <View style={[subStyles.learningSignalIcon, { backgroundColor: signal.color + "18" }]}>
                  <Icon size={15} color={signal.color} />
                </View>
                <Text style={[subStyles.learningSignalKicker, { color: signal.color }]}>{signal.label}</Text>
              </View>
              <Text style={subStyles.learningSignalTitle}>{signal.title}</Text>
              <Text style={subStyles.learningSignalBody}>{signal.body}</Text>
            </View>
          );
        })}
      </View>
      <Text style={subStyles.learningGroupTitle}>Madurez del análisis</Text>
      <View style={subStyles.phaseList}>
        {learning.phases.map((phase) => (
          <View key={phase.step} style={subStyles.phaseCard}>
            <View style={subStyles.phaseHeader}>
              <Text style={subStyles.phaseTitle}>Fase {phase.step} · {phase.title}</Text>
              <Text style={subStyles.phasePct}>{Math.round(phase.progress * 100)}%</Text>
            </View>
            <Text style={subStyles.phaseBody}>{phase.description}</Text>
            <View style={subStyles.phaseTrack}>
              <View style={[subStyles.phaseFill, { width: `${Math.max(6, phase.progress * 100)}%` }]} />
            </View>
          </View>
        ))}
      </View>
      <View style={subStyles.learningInsightList}>
        {learning.insights.map((insight) => (
          <View key={insight} style={subStyles.learningInsightRow}>
            <Sparkles size={14} color={COLORS.gold} />
            <Text style={subStyles.learningInsightText}>{insight}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
