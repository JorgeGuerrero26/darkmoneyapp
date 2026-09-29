import { useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, Sparkles } from "lucide-react-native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { movementDisplayAccountId } from "../../../../lib/movement-display";
import type { PatternCluster } from "../../../../services/analytics/pattern-clustering";
import { sortMovementsRecentFirst } from "../../lib/aggregations";
import type { DashboardAnomalyFinding } from "../../lib/advanced-types";
import type { DashboardMovementRow } from "../../lib/dashboard-row";
import { categorySpendRows, expenseTitle, type WeeklySpendPattern } from "../../lib/patterns-view";

type Rise = { categoryId: number | null; name: string; current: number; previous: number; delta: number; movementIds: number[] };
type Habit = PatternCluster & { lastLabel: string; title: string; accountName: string | null };

type Props = {
  anomalies: DashboardAnomalyFinding[];
  rises: Rise[];
  habits: Habit[];
  categoryTotals: ReadonlyMap<number | null, number>;
  categoryNames: ReadonlyMap<number, string>;
  accountNames: ReadonlyMap<number, string>;
  movements: DashboardMovementRow[];
  currency: string;
  weeklySpend: WeeklySpendPattern;
  onReviewAnomalies: (movementIds: number[]) => void;
  onOpenAnomaly: (movementId: number) => void;
  onOpenAi: () => void;
  onOpenRise: (rise: Rise) => void;
  onOpenCategory: (categoryId: number | null) => void;
  onOpenRemainingCategories: (categoryIds: Array<number | null>) => void;
  onOpenDay: (day: { fullLabel: string; total: number; average: number; count: number; movements: DashboardMovementRow[] }) => void;
  onOpenHabit: (habit: Habit) => void;
};

const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DAY_INITIALS = ["L", "M", "X", "J", "V", "S", "D"];

function SectionHeading({ title, scope, badge }: { title: string; scope: string; badge?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.headingRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {badge ? <Text style={styles.badge}>{badge}</Text> : null}
      </View>
      <Text style={styles.scope}>{scope}</Text>
    </View>
  );
}

export function PatternsTab({
  anomalies, rises, habits, categoryTotals, categoryNames, accountNames, movements,
  currency, weeklySpend, onReviewAnomalies, onOpenAnomaly, onOpenAi, onOpenRise,
  onOpenCategory, onOpenRemainingCategories, onOpenDay, onOpenHabit,
}: Props) {
  const movementMap = useMemo(() => new Map(movements.map((movement) => [movement.id, movement])), [movements]);
  const categorySpend = useMemo(() => categorySpendRows(categoryTotals, categoryNames), [categoryTotals, categoryNames]);
  const maxDay = Math.max(...weeklySpend.days.map((day) => day.average), 1);
  const monthName = format(new Date(), "LLLL", { locale: es });

  return (
    <View style={styles.page}>
      <View style={styles.section}>
        <SectionHeading
          title="Fuera de costumbre"
          scope="Mucho más caros que lo que sueles pagar ahí"
          badge={anomalies.length > 0 ? `${anomalies.length} por revisar` : undefined}
        />
        {anomalies.length === 0 ? <Text style={styles.empty}>No hay gastos fuera de costumbre para revisar.</Text> : (
          <>
            {anomalies.map((item) => {
              const movement = movementMap.get(item.movementId);
              const accountId = movement ? movementDisplayAccountId(movement) : null;
              const accountName = accountId == null ? null : accountNames.get(accountId);
              const ratio = item.baselineAmount && item.baselineAmount > 0 ? Math.round(item.amount / item.baselineAmount) : null;
              return (
                <TouchableOpacity key={item.key} style={styles.row} onPress={() => onOpenAnomaly(item.movementId)} activeOpacity={0.82}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{expenseTitle(movement?.description ?? item.title, accountName)}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {item.occurredAt ? format(new Date(item.occurredAt), "d MMM", { locale: es }) : "Fecha reciente"}
                      {item.baselineAmount != null ? ` · sueles pagar ${formatCurrency(item.baselineAmount, currency)}` : " · posible duplicado"}
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowAmount}>−{formatCurrency(item.amount, currency)}</Text>
                    <Text style={styles.expenseMeta}>{ratio != null ? `${ratio}× lo normal` : "Revisar"}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.reviewButton}
              onPress={() => onReviewAnomalies(anomalies.map((item) => item.movementId))}
              activeOpacity={0.84}
            >
              <Text style={styles.reviewButtonText}>Revisar los {anomalies.length}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <TouchableOpacity style={styles.aiRow} onPress={onOpenAi} activeOpacity={0.84} accessibilityRole="button">
        <View style={styles.aiIcon}><Sparkles size={18} color={COLORS.pro} /></View>
        <View style={styles.rowCopy}>
          <Text style={styles.rowTitle}>Informe con IA</Text>
          <Text style={styles.rowMeta}>Explica estos patrones en palabras</Text>
        </View>
        <ArrowRight size={16} color={COLORS.storm} />
      </TouchableOpacity>

      <View style={styles.section}>
        <SectionHeading title="Lo que subió" scope="Últimos 14 días frente a los 14 anteriores" />
        {rises.length === 0 ? <Text style={styles.empty}>No hay subidas fuertes en este periodo.</Text> : rises.map((item) => (
          <TouchableOpacity key={`${item.categoryId ?? "none"}-${item.name}`} style={styles.row} onPress={() => onOpenRise(item)} activeOpacity={0.82}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {item.previous > 0
                  ? `${formatCurrency(item.previous, currency)} → ${formatCurrency(item.current, currency)}`
                  : "Nuevo · no había gastos antes"}
              </Text>
            </View>
            <Text style={styles.riseAmount}>+{formatCurrency(item.delta, currency)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <SectionHeading title="En qué se va" scope={`${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} · ${formatCurrency(categorySpend.total, currency)} en gastos`} />
        {categorySpend.visible.length === 0 ? <Text style={styles.empty}>Aún no hay gastos este mes.</Text> : categorySpend.visible.map((item, index) => (
          <TouchableOpacity key={`${item.id ?? "none"}`} style={styles.categoryRow} onPress={() => onOpenCategory(item.id)} activeOpacity={0.82}>
            <View style={styles.categoryTop}>
              <Text style={[styles.rowTitle, styles.categoryName]} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.categoryShare}>{Math.round(item.share * 100)}%</Text>
              <Text style={styles.categoryAmount}>{formatCurrency(item.amount, currency)}</Text>
            </View>
            <View style={styles.barTrack}><View style={[styles.barFill, index === 0 && styles.barFillLeader, { width: `${item.share * 100}%` }]} /></View>
          </TouchableOpacity>
        ))}
        {categorySpend.rest.length > 0 ? (
          <TouchableOpacity style={styles.row} onPress={() => onOpenRemainingCategories(categorySpend.rest.map((item) => item.id))} activeOpacity={0.82}>
            <Text style={[styles.rowTitle, styles.rowCopy]}>
              {categorySpend.rest.length === 1 ? "1 categoría más" : `${categorySpend.rest.length} categorías más`}
            </Text>
            <Text style={styles.categoryAmount}>{formatCurrency(categorySpend.rest.reduce((sum, item) => sum + item.amount, 0), currency)}</Text>
            <ArrowRight size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ) : null}
      </View>

      {weeklySpend.hasExpenses ? (
        <View style={styles.section}>
          <SectionHeading title={`Tu día más caro: ${DAY_NAMES[weeklySpend.top.index]}`} scope="Gasto promedio por día de la semana · últimos 90 días" />
          <View style={styles.weekChart}>
            {weeklySpend.days.map((day) => (
              <TouchableOpacity
                key={day.index}
                style={styles.weekColumn}
                disabled={day.count === 0}
                onPress={() => onOpenDay({
                  fullLabel: DAY_NAMES[day.index], total: day.total, average: day.average,
                  count: day.count, movements: sortMovementsRecentFirst(day.movements),
                })}
                activeOpacity={0.82}
                accessibilityLabel={`${DAY_NAMES[day.index]}: ${formatCurrency(day.average, currency)} en promedio`}
              >
                <Text style={[styles.weekAmount, day.index === weeklySpend.top.index && styles.weekAmountTop]} numberOfLines={1}>
                  {day.index === weeklySpend.top.index ? Math.round(day.average).toLocaleString("es-PE") : " "}
                </Text>
                <View style={styles.weekBarBox}>
                  <View style={[styles.weekBar, day.index === weeklySpend.top.index && styles.weekBarTop, { height: Math.max(2, day.average / maxDay * 74) }]} />
                </View>
                <Text style={[styles.weekLabel, day.index === weeklySpend.top.index && styles.weekLabelTop]}>{DAY_INITIALS[day.index]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeading title="Lo que se repite" scope="Últimos 90 días" />
        {habits.length === 0 ? <Text style={styles.empty}>Todavía no hay movimientos repetidos suficientes.</Text> : habits.map((habit) => {
          return (
            <TouchableOpacity key={`${habit.type}-${habit.label}-${habit.movementIds.join("-")}`} style={styles.row} onPress={() => onOpenHabit(habit)} activeOpacity={0.82}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle} numberOfLines={1}>{habit.title}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {habit.accountName
                    ? `${habit.count} veces · unos ${formatCurrency(habit.average, currency)} · ${habit.accountName}`
                    : `${habit.count} veces · unos ${formatCurrency(habit.average, currency)} cada vez`}
                </Text>
              </View>
              <Text style={[styles.habitAmount, habit.type === "Ingreso" && styles.incomeAmount]} numberOfLines={1}>
                {habit.type === "Ingreso" ? "+" : ""}{formatCurrency(habit.total, currency)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACING.xxxl },
  section: { gap: SPACING.xs },
  sectionHeading: { gap: SPACING.xs, marginBottom: SPACING.sm },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  sectionTitle: { flex: 1, fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  scope: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  badge: { color: COLORS.expense, backgroundColor: COLORS.dangerMuted, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.full, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  row: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  rowCopy: { flex: 1, minWidth: 0, gap: SPACING.xs },
  rowTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  rowMeta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  rowRight: { alignItems: "flex-end", gap: SPACING.xs },
  rowAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  expenseMeta: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.expense },
  riseAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.expense },
  habitAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  incomeAmount: { color: COLORS.income },
  reviewButton: { backgroundColor: COLORS.action, borderRadius: RADIUS.md, alignItems: "center", paddingVertical: SPACING.md, marginTop: SPACING.md },
  reviewButtonText: { color: COLORS.actionText, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  aiRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md, padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: SURFACE.card, borderWidth: 1, borderColor: SURFACE.cardBorder },
  aiIcon: { width: 36, height: 36, borderRadius: RADIUS.lg, backgroundColor: COLORS.proMuted, alignItems: "center", justifyContent: "center" },
  empty: { paddingVertical: SPACING.md, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  categoryRow: { gap: SPACING.sm, paddingVertical: SPACING.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  categoryTop: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  categoryName: { flex: 1, minWidth: 0 },
  categoryShare: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  categoryAmount: { minWidth: 100, textAlign: "right", fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  barTrack: { height: 4, borderRadius: RADIUS.full, backgroundColor: SURFACE.track, overflow: "hidden" },
  barFill: { height: 4, borderRadius: RADIUS.full, backgroundColor: COLORS.storm },
  barFillLeader: { backgroundColor: COLORS.ink },
  weekChart: { flexDirection: "row", gap: SPACING.xs, paddingTop: SPACING.lg },
  weekColumn: { flex: 1, alignItems: "center", gap: SPACING.xs },
  weekAmount: { minHeight: 17, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  weekAmountTop: { color: COLORS.ink },
  weekBarBox: { height: 74, width: "100%", justifyContent: "flex-end", alignItems: "center" },
  weekBar: { width: "70%", borderTopLeftRadius: RADIUS.sm, borderTopRightRadius: RADIUS.sm, backgroundColor: COLORS.storm },
  weekBarTop: { backgroundColor: COLORS.ink },
  weekLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  weekLabelTop: { color: COLORS.ink },
});
