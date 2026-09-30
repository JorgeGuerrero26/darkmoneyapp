import { ArrowRight, Sparkles } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { displayCategoryName } from "../../../../lib/category-display-name";
import type { DashboardReviewInbox } from "../../lib/dashboard-builders";
import type { DashboardCategorySuggestion } from "../../lib/advanced-types";
import { buildHealthScore, type BuildHealthScoreInput } from "../../lib/health";
import type { SystemState } from "../../lib/system-state";

type Props = {
  healthInputs: BuildHealthScoreInput;
  historyReady: boolean;
  historyMonths: number;
  savingsAverage: number | null;
  savingsCurrent: number | null;
  incomeStability: string;
  system: SystemState;
  potentialScore: number;
  review: DashboardReviewInbox;
  suggestions: DashboardCategorySuggestion[];
  currency: string;
  applyingSuggestionId: number | null;
  acceptingAll: boolean;
  collectionRate: number | null;
  collectionResolved: number;
  collectionTotal: number;
  exposure: Array<{ code: string; amount: number }>;
  onOpenAi: () => void;
  onOpenSavings: () => void;
  onOpenIncome: () => void;
  onOpenIssue: (key: "uncategorized" | "duplicates" | "pending" | "no-counterparty" | "subscriptions" | "obligations") => void;
  onAcceptSuggestion: (suggestion: DashboardCategorySuggestion) => void;
  onAcceptAll: () => void;
};

function MetricRow({ title, detail, value, warning, onPress }: { title: string; detail?: string; value: string; warning?: boolean; onPress?: () => void }) {
  const content = <>
    <View style={styles.flex}>
      <Text style={styles.rowTitle}>{title}</Text>
      {detail ? <Text style={[styles.meta, warning && styles.warning]}>{detail}</Text> : null}
    </View>
    <Text style={[styles.rowValue, warning && styles.warning]}>{value}</Text>
  </>;
  return onPress ? <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">{content}</Pressable> : <View style={styles.row}>{content}</View>;
}

export function HealthTab({ healthInputs, historyReady, historyMonths, savingsAverage, savingsCurrent, incomeStability, system, potentialScore, review, suggestions, currency, applyingSuggestionId, acceptingAll, collectionRate, collectionResolved, collectionTotal, exposure, onOpenAi, onOpenSavings, onOpenIncome, onOpenIssue, onAcceptSuggestion, onAcceptAll }: Props) {
  const health = buildHealthScore(healthInputs);
  const reserve = health.coverageMonths;
  const reserveWarning = reserve != null && reserve < 3;
  const issues = [
    { key: "uncategorized" as const, title: "Sin categoría", detail: review.uncategorizedExpenseShare > 0 ? `Son el ${review.uncategorizedExpenseShare}% de tu gasto` : "Falta clasificar estos movimientos", count: review.uncategorizedCount },
    { key: "duplicates" as const, title: "Posibles duplicados", detail: "Pueden estar inflando tus totales", count: review.duplicateExpenseGroups },
    { key: "subscriptions" as const, title: "Suscripciones incompletas", detail: "Sin cuenta o con fecha vencida", count: review.subscriptionsAttentionCount },
    { key: "no-counterparty" as const, title: "Sin contacto", detail: "No se sabe a quién pagaste", count: review.noCounterpartyCount },
    { key: "pending" as const, title: "Pendientes de aplicar", detail: "Aún no afectan tu saldo", count: review.pendingMovementsCount },
    { key: "obligations" as const, title: "Cobros o pagos por revisar", detail: "Sin plan, vencidos o sin actividad", count: review.obligationsWithoutPlanCount + review.staleObligationsCount + review.overdueObligationsCount },
  ].filter((issue) => issue.count > 0);
  const exposureTotal = exposure.reduce((sum, item) => sum + item.amount, 0);

  return <View style={styles.page}>
    <View style={styles.section}>
      <Text style={styles.kicker}>TUS FINANZAS</Text>
      <View style={styles.heroLine}>
        <Text style={styles.hero}>{historyReady ? health.score : "—"}</Text>
        <Text style={styles.heroSuffix}>/100</Text>
        {historyReady ? <View style={styles.pill}><Text style={styles.pillText}>{health.score >= 80 ? "Buen estado" : health.score >= 60 ? "Por mejorar" : "Requiere atención"}</Text></View> : null}
      </View>
      <Text style={styles.meta}>{!historyReady ? "Calculando con meses completos…" : reserveWarning ? `Lo que más la baja: tu reserva cubre ${reserve != null && reserve < 1 ? "menos de un mes" : "menos de tres meses"}` : "Así se ven tus finanzas con los meses completos disponibles"}</Text>

      <View style={styles.rows}>
        <MetricRow title="Reserva" detail={reserveWarning ? "Lo sano es de 3 a 6 meses" : "Meses de gasto cubiertos por tu caja"} value={historyReady && reserve != null ? `${reserve.toFixed(1)} meses` : "—"} warning={reserveWarning} />
        <MetricRow title="Ahorro" detail={historyReady ? `Promedio de ${historyMonths} meses · este mes ${savingsCurrent == null ? "sin ingresos" : `${Math.round(savingsCurrent)}%`}` : "Esperando historial completo"} value={savingsAverage == null || !historyReady ? "—" : `${Math.round(savingsAverage)}%`} onPress={onOpenSavings} />
        <MetricRow title="Ingresos" detail={incomeStability === "Historial insuficiente" ? "Se necesitan al menos tres meses con ingresos" : "Cambian de un mes a otro"} value={historyReady ? incomeStability.replace("Muy estable", "Estables").replace("Moderado", "Moderados").replace("Variable", "Variables") : "—"} onPress={onOpenIncome} />
        <MetricRow title="Deudas" value={healthInputs.totalPayable > 0 ? formatCurrency(healthInputs.totalPayable, currency) : "Ninguna"} />
        <MetricRow title="Pagos" value={healthInputs.overdueCount > 0 ? `${healthInputs.overdueCount} vencidos` : "Al día"} />
        {collectionRate != null ? <MetricRow title="Cobros" detail={`${collectionResolved} de ${collectionTotal} resueltos en 30 días`} value={`${collectionRate}%`} /> : null}
      </View>

      <Pressable style={styles.aiRow} onPress={onOpenAi} disabled={!historyReady} accessibilityRole="button">
        <View style={styles.aiIcon}><Sparkles size={18} color={COLORS.pro} /></View>
        <View style={styles.flex}><Text style={styles.rowTitle}>Informe con IA</Text><Text style={styles.meta}>Qué afecta tus datos y pendientes</Text></View>
        <ArrowRight size={16} color={COLORS.storm} />
      </Pressable>
    </View>

    <View style={styles.section}>
      <Text style={styles.kicker}>TUS DATOS</Text>
      <View style={styles.heroLine}>
        <Text style={styles.hero}>{system.score}%</Text>
        <View style={styles.pill}><Text style={styles.pillText}>{system.status}</Text></View>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${system.score}%` }]} />
        <View style={[styles.thresholdMark, { left: `${system.threshold}%` }]} />
        {potentialScore > system.score ? <View style={[styles.goalMark, { left: `${potentialScore}%` }]} /> : null}
      </View>
      <Text style={styles.meta}>{potentialScore > system.score ? `Resolviendo lo de abajo llegas a ${potentialScore}% · ` : ""}bajo {system.threshold}% las proyecciones pierden fiabilidad</Text>

      <View style={styles.rows}>
        {issues.length ? issues.map((issue) => <Pressable key={issue.key} style={styles.row} onPress={() => onOpenIssue(issue.key)} accessibilityRole="button">
          <View style={styles.flex}><Text style={styles.rowTitle}>{issue.title}</Text><Text style={styles.meta}>{issue.detail}</Text></View>
          <Text style={styles.rowValue}>{issue.count}</Text><ArrowRight size={15} color={COLORS.storm} />
        </Pressable>) : <Text style={styles.meta}>No hay pendientes que afecten tus datos.</Text>}
      </View>

      {suggestions.length > 0 ? <View style={styles.suggestionCard}>
        <View style={styles.suggestionHeader}><View style={styles.flex}><Text style={styles.sectionTitle}>Categorías sugeridas</Text><Text style={styles.meta}>Según cómo categorizaste antes</Text></View><Text style={styles.meta}>{suggestions.length}</Text></View>
        {suggestions.map((suggestion) => <View key={suggestion.movementId} style={styles.suggestionRow}>
          <View style={styles.flex}><Text style={styles.rowTitle} numberOfLines={1}>{suggestion.description.trim() || "Movimiento sin descripción"} · {formatCurrency(suggestion.amount, currency)}</Text><Text style={styles.meta}>→ {displayCategoryName(suggestion.suggestedCategoryName)}</Text></View>
          <Pressable style={styles.acceptButton} onPress={() => onAcceptSuggestion(suggestion)} disabled={acceptingAll || applyingSuggestionId != null} accessibilityRole="button"><Text style={styles.acceptText}>{applyingSuggestionId === suggestion.movementId ? "Guardando" : "Aceptar"}</Text></Pressable>
        </View>)}
        {suggestions.length > 1 ? <Pressable style={styles.acceptAll} onPress={onAcceptAll} disabled={acceptingAll || applyingSuggestionId != null} accessibilityRole="button"><Text style={styles.acceptAllText}>{acceptingAll ? "Aplicando…" : `Aceptar las ${suggestions.length}`}</Text></Pressable> : null}
      </View> : null}

      {exposure.length > 1 && exposureTotal > 0 ? <View style={styles.exposure}><Text style={styles.sectionTitle}>Exposición por moneda</Text>{exposure.map((item) => <MetricRow key={item.code} title={item.code} value={`${Math.round(item.amount / exposureTotal * 100)}%`} />)}</View> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  page: { gap: SPACING.xxxl },
  section: { gap: SPACING.md },
  flex: { flex: 1, minWidth: 0 },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, letterSpacing: 2, color: COLORS.storm },
  heroLine: { flexDirection: "row", alignItems: "baseline", gap: SPACING.sm },
  hero: { fontFamily: FONT_FAMILY.heading, fontSize: 44, color: COLORS.ink },
  heroSuffix: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm },
  pill: { alignSelf: "center", paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.full, backgroundColor: SURFACE.subtle },
  pillText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.fog },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20, color: COLORS.storm },
  warning: { color: COLORS.expense },
  rows: { marginTop: SPACING.sm },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  rowTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  rowValue: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  aiRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.md, borderRadius: RADIUS.xl, backgroundColor: SURFACE.subtle, borderWidth: 1, borderColor: SURFACE.separator, marginTop: SPACING.md },
  aiIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.full, backgroundColor: COLORS.proMuted },
  track: { height: 7, borderRadius: RADIUS.full, backgroundColor: SURFACE.input },
  fill: { height: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.ink },
  thresholdMark: { position: "absolute", top: -4, width: 2, height: 15, backgroundColor: COLORS.fog },
  goalMark: { position: "absolute", top: -4, width: 2, height: 15, backgroundColor: COLORS.income },
  suggestionCard: { padding: SPACING.md, borderRadius: RADIUS.xl, backgroundColor: SURFACE.subtle, borderWidth: 1, borderColor: SURFACE.separator, marginTop: SPACING.lg },
  suggestionHeader: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, marginBottom: SPACING.sm },
  sectionTitle: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  suggestionRow: { minHeight: 69, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  acceptButton: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: SURFACE.input },
  acceptText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  acceptAll: { minHeight: 47, alignItems: "center", justifyContent: "center", marginTop: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: COLORS.action },
  acceptAllText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.actionText },
  exposure: { marginTop: SPACING.lg },
});
