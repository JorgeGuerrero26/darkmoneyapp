import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  BarChart3,
  Calendar,
  Clock3,
  Gauge,
  Target,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react-native";
import {
  differenceInCalendarDays,
  format,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";

import type { BudgetComputedMetrics } from "../../lib/budget-metrics";
import type { BudgetOverview } from "../../types/domain";
import { parseDisplayDate } from "../../lib/date";
import { formatCurrency } from "../ui/AmountDisplay";
import { ProgressBar } from "../ui/ProgressBar";
import { RingChart, type RingSegment } from "../ui/RingChart";
import { SafeBlurView } from "../ui/SafeBlurView";
import { useDismissibleSheet } from "../ui/useDismissibleSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  visible: boolean;
  budget: BudgetOverview | null;
  analytics: BudgetComputedMetrics | null;
  onClose: () => void;
};

type TimelineGrouping = "day" | "week";

type TimelineBucket = {
  key: string;
  label: string;
  total: number;
  count: number;
};

function formatPeriodLabel(fromYmd: string, toYmd: string) {
  const from = parseDisplayDate(fromYmd);
  const to = parseDisplayDate(toYmd);
  return `${format(from, "d MMM", { locale: es })} al ${format(to, "d MMM yyyy", { locale: es })}`;
}

function buildTimelineBuckets(
  analytics: BudgetComputedMetrics,
  grouping: TimelineGrouping,
  currencyCode: string,
): { buckets: TimelineBucket[]; maxAmount: number; totalLabel: string } {
  const map = new Map<string, TimelineBucket>();

  for (const contribution of analytics.contributions) {
    const occurredDate = parseDisplayDate(contribution.occurredAt);
    const bucketDate =
      grouping === "week"
        ? startOfWeek(occurredDate, { weekStartsOn: 1 })
        : occurredDate;
    const key = format(bucketDate, "yyyy-MM-dd");
    const label =
      grouping === "week"
        ? `Sem ${format(bucketDate, "d MMM", { locale: es })}`
        : format(occurredDate, "d MMM", { locale: es });

    const previous = map.get(key);
    if (previous) {
      previous.total += contribution.amountInBudgetCurrency;
      previous.count += 1;
      continue;
    }

    map.set(key, {
      key,
      label,
      total: contribution.amountInBudgetCurrency,
      count: 1,
    });
  }

  const buckets = [...map.values()]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((bucket) => ({
      ...bucket,
      total: Math.round((bucket.total + Number.EPSILON) * 100) / 100,
    }));

  return {
    buckets,
    maxAmount: Math.max(1, ...buckets.map((bucket) => bucket.total)),
    totalLabel: `Montos en ${currencyCode}`,
  };
}

export function BudgetAnalyticsModal({ visible, budget, analytics, onClose }: Props) {
  const { backdropStyle, panHandlers, sheetStyle } = useDismissibleSheet({ visible, onClose });
  const [grouping, setGrouping] = useState<TimelineGrouping>("day");
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setGrouping("day");
    setSelectedBucketKey(null);
  }, [visible, budget?.id]);

  const timeline = useMemo(() => {
    if (!budget || !analytics) {
      return { buckets: [] as TimelineBucket[], maxAmount: 1, totalLabel: "" };
    }
    return buildTimelineBuckets(analytics, grouping, budget.currencyCode);
  }, [analytics, budget, grouping]);

  useEffect(() => {
    if (timeline.buckets.length === 0) {
      setSelectedBucketKey(null);
      return;
    }
    if (!selectedBucketKey || !timeline.buckets.some((bucket) => bucket.key === selectedBucketKey)) {
      setSelectedBucketKey(timeline.buckets[timeline.buckets.length - 1]?.key ?? null);
    }
  }, [selectedBucketKey, timeline.buckets]);

  const selectedBucket = useMemo(
    () => timeline.buckets.find((bucket) => bucket.key === selectedBucketKey) ?? null,
    [selectedBucketKey, timeline.buckets],
  );

  const derived = useMemo(() => {
    if (!budget || !analytics) return null;

    const today = new Date();
    const from = parseDisplayDate(budget.periodStart);
    const to = parseDisplayDate(budget.periodEnd);
    const totalDays = Math.max(1, differenceInCalendarDays(to, from) + 1);
    const elapsedDays = Math.min(totalDays, Math.max(1, differenceInCalendarDays(today, from) + 1));
    const remainingDays = Math.max(0, differenceInCalendarDays(to, today));
    const projectedSpentAmount =
      analytics.spentAmount > 0 ? Math.round(((analytics.spentAmount / elapsedDays) * totalDays + Number.EPSILON) * 100) / 100 : 0;
    const projectedPercent =
      budget.limitAmount > 0 ? Math.round(((projectedSpentAmount / budget.limitAmount) * 100 + Number.EPSILON) * 100) / 100 : 0;

    const biggestContribution = analytics.contributions[0] ?? null;

    const ringSegments: RingSegment[] = analytics.spentAmount <= budget.limitAmount
      ? [
          { key: "spent", value: analytics.spentAmount, color: budget.isOverLimit ? COLORS.rosewood : COLORS.primary },
          { key: "remaining", value: Math.max(0, budget.limitAmount - analytics.spentAmount), color: "rgba(255,255,255,0.14)" },
        ]
      : [
          { key: "limit", value: budget.limitAmount, color: COLORS.primary },
          { key: "over", value: analytics.spentAmount - budget.limitAmount, color: COLORS.rosewood },
        ];

    return {
      periodLabel: formatPeriodLabel(budget.periodStart, budget.periodEnd),
      totalDays,
      elapsedDays,
      remainingDays,
      projectedSpentAmount,
      projectedPercent,
      biggestContribution,
      ringSegments,
    };
  }, [analytics, budget]);

  if (!budget || !analytics || !derived) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <SafeBlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
      </Animated.View>

      <View style={styles.sheet} pointerEvents="box-none">
        <Animated.View style={[styles.card, sheetStyle]}>
          <View {...panHandlers}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title} numberOfLines={2}>Análisis · {budget.name}</Text>
                <Text style={styles.subtitle}>{budget.scopeLabel}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                <X size={18} color={COLORS.storm} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.heroInfo}>
                  <Text style={styles.heroEyebrow}>Consumo real del período</Text>
                  <Text style={styles.heroPercent}>{Math.round(analytics.usedPercent)}%</Text>
                  <Text style={styles.heroMeta}>
                    {formatCurrency(analytics.spentAmount, budget.currencyCode)} de {formatCurrency(budget.limitAmount, budget.currencyCode)}
                  </Text>
                </View>
                <View style={styles.ringWrap}>
                  <RingChart segments={derived.ringSegments} size={104} thickness={16} />
                </View>
              </View>

              <ProgressBar percent={analytics.usedPercent} alertPercent={budget.alertPercent} height={8} />

              <View style={styles.heroChips}>
                <View style={styles.heroChip}>
                  <Calendar size={13} color={COLORS.primary} />
                  <Text style={styles.heroChipText}>{derived.periodLabel}</Text>
                </View>
                <View style={styles.heroChip}>
                  <BarChart3 size={13} color={COLORS.primary} />
                  <Text style={styles.heroChipText}>{analytics.movementCount} movimientos que sí consumen</Text>
                </View>
              </View>

              <Text style={styles.heroHint}>
                Este cálculo solo suma salidas reales. Ingresos y transferencias no consumen el presupuesto.
              </Text>
            </View>

            <View style={styles.metricsGrid}>
              <MetricCard
                icon={<Wallet size={15} color={COLORS.primary} />}
                label="Disponible"
                value={formatCurrency(Math.max(analytics.remainingAmount, 0), budget.currencyCode)}
                tone={analytics.remainingAmount < 0 ? COLORS.rosewood : COLORS.ink}
              />
              <MetricCard
                icon={<Target size={15} color={COLORS.primary} />}
                label="Ticket promedio"
                value={formatCurrency(analytics.averageMovementAmount, budget.currencyCode)}
              />
              <MetricCard
                icon={<TrendingUp size={15} color={COLORS.primary} />}
                label="Mayor movimiento"
                value={formatCurrency(analytics.maxMovementAmount, budget.currencyCode)}
              />
              <MetricCard
                icon={<Gauge size={15} color={COLORS.primary} />}
                label="Proyección al cierre"
                value={`${Math.round(derived.projectedPercent)}%`}
                subtitle={formatCurrency(derived.projectedSpentAmount, budget.currencyCode)}
              />
              <MetricCard
                icon={<Clock3 size={15} color={COLORS.primary} />}
                label="Días transcurridos"
                value={`${derived.elapsedDays}/${derived.totalDays}`}
              />
              <MetricCard
                icon={<Calendar size={15} color={COLORS.primary} />}
                label="Días restantes"
                value={String(derived.remainingDays)}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Ritmo del gasto</Text>
                <View style={styles.pillRow}>
                  {(["day", "week"] as const).map((value) => (
                    <TouchableOpacity
                      key={value}
                      style={[styles.pill, grouping === value && styles.pillActive]}
                      onPress={() => setGrouping(value)}
                    >
                      <Text style={[styles.pillText, grouping === value && styles.pillTextActive]}>
                        {value === "day" ? "Día" : "Semana"}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {timeline.buckets.length > 0 ? (
                <>
                  <Text style={styles.sectionHint}>{timeline.totalLabel}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chartRow}
                  >
                    {timeline.buckets.map((bucket) => {
                      const height = Math.max(10, (bucket.total / timeline.maxAmount) * 120);
                      const isActive = bucket.key === selectedBucket?.key;
                      return (
                        <TouchableOpacity
                          key={bucket.key}
                          style={styles.chartCol}
                          onPress={() => setSelectedBucketKey(bucket.key)}
                          activeOpacity={0.85}
                        >
                          <View style={[styles.barTrack, isActive && styles.barTrackActive]}>
                            <View style={[styles.barFill, { height }, isActive && styles.barFillActive]} />
                          </View>
                          <Text style={[styles.barLabel, isActive && styles.barLabelActive]} numberOfLines={1}>
                            {bucket.label}
                          </Text>
                          <Text style={styles.barAmount} numberOfLines={1}>
                            {formatCurrency(bucket.total, budget.currencyCode)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {selectedBucket ? (
                    <View style={styles.selectedBucketCard}>
                      <Text style={styles.selectedBucketTitle}>{selectedBucket.label}</Text>
                      <Text style={styles.selectedBucketValue}>
                        {formatCurrency(selectedBucket.total, budget.currencyCode)}
                      </Text>
                      <Text style={styles.selectedBucketSub}>
                        {selectedBucket.count} movimiento{selectedBucket.count !== 1 ? "s" : ""} en este tramo
                      </Text>
                    </View>
                  ) : null}
                </>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Sin gasto consumido</Text>
                  <Text style={styles.emptyBody}>
                    No hay salidas publicadas dentro del período y alcance de este presupuesto.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                Movimientos que explican este {Math.round(analytics.usedPercent)}%
              </Text>
              <Text style={styles.sectionHint}>
                Cada fila muestra cuánto aporta al gasto del presupuesto y qué parte del límite representa.
              </Text>

              {analytics.contributions.length > 0 ? (
                <View style={styles.contributionList}>
                  {analytics.contributions.slice(0, 8).map((contribution) => {
                    const showNative =
                      contribution.nativeCurrencyCode !== budget.currencyCode ||
                      Math.abs(contribution.nativeAmount - contribution.amountInBudgetCurrency) > 0.009;
                    return (
                      <View key={contribution.movementId} style={styles.contributionCard}>
                        <View style={styles.contributionTop}>
                          <View style={styles.contributionInfo}>
                            <Text style={styles.contributionTitle} numberOfLines={1}>
                              {contribution.description}
                            </Text>
                            <Text style={styles.contributionMeta}>
                              {format(parseDisplayDate(contribution.occurredAt), "d MMM yyyy", { locale: es })}
                              {contribution.accountName ? ` · ${contribution.accountName}` : ""}
                              {contribution.categoryName ? ` · ${contribution.categoryName}` : ""}
                            </Text>
                          </View>
                          <Text style={styles.contributionAmount}>
                            {formatCurrency(contribution.amountInBudgetCurrency, budget.currencyCode)}
                          </Text>
                        </View>

                        <View style={styles.contributionTags}>
                          <View style={styles.contributionTag}>
                            <Text style={styles.contributionTagText}>
                              {contribution.shareOfBudget.toFixed(1)}% del límite
                            </Text>
                          </View>
                          <View style={styles.contributionTag}>
                            <Text style={styles.contributionTagText}>
                              {contribution.shareOfSpent.toFixed(1)}% del gasto
                            </Text>
                          </View>
                        </View>

                        {showNative ? (
                          <Text style={styles.contributionNative}>
                            Origen: {formatCurrency(contribution.nativeAmount, contribution.nativeCurrencyCode)}
                          </Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Nada que explique el porcentaje</Text>
                  <Text style={styles.emptyBody}>
                    Si aquí no aparecen movimientos, el presupuesto debería estar en 0%.
                  </Text>
                </View>
              )}
            </View>

            {derived.biggestContribution ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Lectura rápida</Text>
                <View style={styles.insightCard}>
                  <Text style={styles.insightText}>
                    El movimiento más pesado es "{derived.biggestContribution.description}" y por sí solo representa{" "}
                    {derived.biggestContribution.shareOfBudget.toFixed(1)}% del límite.
                  </Text>
                  <Text style={styles.insightText}>
                    Si mantienes el ritmo actual, cerrarías cerca de {Math.round(derived.projectedPercent)}%.
                  </Text>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function MetricCard({
  icon,
  label,
  value,
  subtitle,
  tone = COLORS.ink,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tone?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone }]}>{value}</Text>
      {subtitle ? <Text style={styles.metricSub}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    flex: 1,
    justifyContent: "flex-end",
  },
  card: {
    maxHeight: "92%",
    backgroundColor: COLORS.bgModal,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginTop: SPACING.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: GLASS.sheetBorder,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  heroCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  heroInfo: {
    flex: 1,
    gap: 4,
  },
  ringWrap: {
    minWidth: 108,
    alignItems: "center",
    justifyContent: "center",
  },
  heroEyebrow: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroPercent: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: 40,
    color: COLORS.ink,
    lineHeight: 44,
  },
  heroMeta: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  heroChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  heroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  heroChipText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
  },
  heroHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  metricCard: {
    width: "48%",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: 5,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.05)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  metricLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 10,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
  },
  metricSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.sm,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  sectionHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  pillRow: {
    flexDirection: "row",
    gap: 6,
  },
  pill: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  pillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pillText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  pillTextActive: {
    color: "#FFF",
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  chartCol: {
    width: 68,
    alignItems: "center",
    gap: 6,
  },
  barTrack: {
    width: 30,
    height: 120,
    borderRadius: RADIUS.md,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barTrackActive: {
    borderColor: COLORS.primary + "88",
    backgroundColor: COLORS.primary + "14",
  },
  barFill: {
    width: "100%",
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: RADIUS.md,
    borderBottomRightRadius: RADIUS.md,
  },
  barFillActive: {
    backgroundColor: COLORS.gold,
  },
  barLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
    color: COLORS.storm,
    textAlign: "center",
  },
  barLabelActive: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  barAmount: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 9,
    color: COLORS.ink,
    textAlign: "center",
  },
  selectedBucketCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: 3,
  },
  selectedBucketTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectedBucketValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  selectedBucketSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  contributionList: {
    gap: SPACING.sm,
  },
  contributionCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  contributionTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  contributionInfo: {
    flex: 1,
    gap: 3,
  },
  contributionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  contributionMeta: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  contributionAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  contributionTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  contributionTag: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  contributionTagText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
    color: COLORS.primary,
  },
  contributionNative: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  insightCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  insightText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 20,
  },
  emptyCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: 6,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  emptyBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },
});
