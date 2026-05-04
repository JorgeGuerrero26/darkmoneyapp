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
import { useRouter } from "expo-router";
import { differenceInCalendarDays, format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock3,
  TrendingUp,
  X,
} from "lucide-react-native";

import { useWorkspace } from "../../lib/workspace-context";
import { buildCurrencyBreakdown, formatCurrencyBreakdownLine } from "../../lib/analytics-currency";
import { parseDisplayDate } from "../../lib/date";
import { convertAmountToWorkspaceBase } from "../../lib/subscription-helpers";
import { useRecurringIncomeOccurrencesQuery } from "../../services/queries/workspace-data";
import type {
  ExchangeRateSummary,
  RecurringIncomeOccurrenceSummary,
  RecurringIncomeSummary,
} from "../../types/domain";
import { formatCurrency } from "../ui/AmountDisplay";
import { RingChart, type RingSegment } from "../ui/RingChart";
import { ProgressBar } from "../ui/ProgressBar";
import { SafeBlurView } from "../ui/SafeBlurView";
import { useDismissibleSheet } from "../ui/useDismissibleSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  visible: boolean;
  item: RecurringIncomeSummary | null;
  baseCurrencyCode: string;
  exchangeRates: ExchangeRateSummary[];
  onClose: () => void;
};

type TimelineFilter = "all" | "on_time" | "late";

type EnrichedOccurrence = RecurringIncomeOccurrenceSummary & {
  amountInBaseCurrency: number | null;
  latenessDays: number;
};

function ymFromDate(ymd: string) {
  const date = parseDisplayDate(ymd);
  return format(date, "yyyy-MM");
}

function ymLabel(ym: string) {
  const [year, month] = ym.split("-").map(Number);
  if (!year || !month) return ym;
  return format(new Date(year, month - 1, 1), "MMM yy", { locale: es });
}

function formatOccurrenceDate(ymd: string) {
  return format(parseDisplayDate(ymd), "d MMM yyyy", { locale: es });
}

function buildLast12MonthKeys() {
  const now = new Date();
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
    return format(date, "yyyy-MM");
  });
}

export function RecurringIncomeAnalyticsModal({
  visible,
  item,
  baseCurrencyCode,
  exchangeRates,
  onClose,
}: Props) {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();
  const { backdropStyle, panHandlers, sheetStyle } = useDismissibleSheet({ visible, onClose });
  const { data: occurrences = [], isLoading } = useRecurringIncomeOccurrencesQuery(
    activeWorkspaceId,
    visible ? (item?.id ?? null) : null,
  );

  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");

  useEffect(() => {
    if (!visible) return;
    setSelectedMonthKey(null);
    setTimelineFilter("all");
  }, [visible, item?.id]);

  const analytics = useMemo(() => {
    if (!item) return null;

    const rows: EnrichedOccurrence[] = occurrences
      .map((occurrence) => ({
        ...occurrence,
        amountInBaseCurrency: convertAmountToWorkspaceBase(
          occurrence.amount,
          occurrence.currencyCode,
          baseCurrencyCode,
          exchangeRates,
        ),
        latenessDays: Math.max(
          0,
          differenceInCalendarDays(
            parseDisplayDate(occurrence.actualDate),
            parseDisplayDate(occurrence.expectedDate),
          ),
        ),
      }))
      .sort((left, right) => {
        const dateCompare = right.actualDate.localeCompare(left.actualDate);
        if (dateCompare !== 0) return dateCompare;
        return (right.createdAt ?? "").localeCompare(left.createdAt ?? "");
      });

    const monthKeys = buildLast12MonthKeys();
    const totalsByMonth = new Map<string, { total: number; count: number }>();
    for (const key of monthKeys) totalsByMonth.set(key, { total: 0, count: 0 });

    let totalBase = 0;
    let comparableCount = 0;
    for (const occurrence of rows) {
      if (occurrence.amountInBaseCurrency == null || !Number.isFinite(occurrence.amountInBaseCurrency)) continue;
      totalBase += occurrence.amountInBaseCurrency;
      comparableCount += 1;
      const ym = ymFromDate(occurrence.actualDate);
      if (!totalsByMonth.has(ym)) continue;
      const current = totalsByMonth.get(ym)!;
      current.total += occurrence.amountInBaseCurrency;
      current.count += 1;
    }

    const totalNative = rows.reduce((sum, occurrence) => sum + occurrence.amount, 0);
    const onTimeCount = rows.filter((occurrence) => occurrence.status === "on_time").length;
    const lateCount = rows.length - onTimeCount;
    const lateRows = rows.filter((occurrence) => occurrence.latenessDays > 0);
    const averageBase = comparableCount > 0 ? totalBase / comparableCount : 0;
    const averageLateDays = lateRows.length > 0
      ? lateRows.reduce((sum, occurrence) => sum + occurrence.latenessDays, 0) / lateRows.length
      : 0;
    const maxAmount = rows.reduce((max, occurrence) => Math.max(max, occurrence.amount), 0);
    const breakdown = buildCurrencyBreakdown(
      rows.map((occurrence) => ({
        currencyCode: occurrence.currencyCode,
        amount: occurrence.amount,
        amountInBaseCurrency: occurrence.amountInBaseCurrency,
      })),
    );

    const monthly = monthKeys.map((ym) => ({
      ym,
      total: Math.round(((totalsByMonth.get(ym)?.total ?? 0) + Number.EPSILON) * 100) / 100,
      count: totalsByMonth.get(ym)?.count ?? 0,
    }));
    const maxMonthly = Math.max(1, ...monthly.map((entry) => entry.total));

    const latest = rows[0] ?? null;
    const biggest = [...rows].sort((left, right) => right.amount - left.amount)[0] ?? null;
    const punctualityPct = rows.length > 0 ? (onTimeCount / rows.length) * 100 : 0;

    return {
      rows,
      totalBase,
      totalNative,
      comparableCount,
      averageBase,
      averageLateDays,
      maxAmount,
      breakdown,
      monthly,
      maxMonthly,
      onTimeCount,
      lateCount,
      latest,
      biggest,
      punctualityPct,
    };
  }, [baseCurrencyCode, exchangeRates, item, occurrences]);

  const monthlySelection = useMemo(() => {
    if (!analytics) return null;
    const lastWithData = [...analytics.monthly].reverse().find((entry) => entry.count > 0)?.ym ?? null;
    const lastMonth = analytics.monthly.length > 0 ? analytics.monthly[analytics.monthly.length - 1].ym : null;
    const key = selectedMonthKey ?? lastWithData ?? lastMonth;
    if (!key) return null;
    const entry = analytics.monthly.find((month) => month.ym === key) ?? null;
    if (!entry) return null;
    return {
      ...entry,
      label: ymLabel(entry.ym),
      rows: analytics.rows.filter((occurrence) => ymFromDate(occurrence.actualDate) === entry.ym),
    };
  }, [analytics, selectedMonthKey]);

  const filteredTimeline = useMemo(() => {
    if (!analytics) return [];
    if (timelineFilter === "all") return analytics.rows;
    return analytics.rows.filter((occurrence) => occurrence.status === timelineFilter);
  }, [analytics, timelineFilter]);

  const punctualitySegments = useMemo<RingSegment[]>(() => {
    if (!analytics || analytics.rows.length === 0) return [];
    return [
      { key: "on_time", value: analytics.onTimeCount, color: COLORS.income },
      { key: "late", value: analytics.lateCount, color: COLORS.gold },
    ];
  }, [analytics]);

  if (!item || !analytics) return null;

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
                <Text style={styles.title} numberOfLines={2}>Análisis · {item.name}</Text>
                <Text style={styles.subtitle}>
                  {item.payer?.trim() ? item.payer : "Sin pagador"} · {item.frequencyLabel}
                </Text>
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
                  <Text style={styles.heroEyebrow}>Cobros registrados</Text>
                  <Text style={styles.heroAmount}>{formatCurrency(analytics.totalBase, baseCurrencyCode)}</Text>
                  <Text style={styles.heroCaption}>
                    Total comparable en {baseCurrencyCode}
                  </Text>
                  <Text style={styles.heroNativeLine}>
                    Historial detectado: {formatCurrencyBreakdownLine(analytics.breakdown)}
                  </Text>
                </View>
                <View style={styles.heroChart}>
                  {punctualitySegments.length > 0 ? (
                    <RingChart segments={punctualitySegments} size={98} thickness={16} />
                  ) : null}
                </View>
              </View>

              <View style={styles.heroProgressBlock}>
                <View style={styles.heroProgressMeta}>
                  <Text style={styles.heroProgressLabel}>Puntualidad</Text>
                  <Text style={styles.heroProgressValue}>{Math.round(analytics.punctualityPct)}%</Text>
                </View>
                <ProgressBar percent={analytics.punctualityPct} alertPercent={70} height={8} />
              </View>
            </View>

            <View style={styles.metricsGrid}>
              <MetricCard
                icon={<TrendingUp size={15} color={COLORS.primary} />}
                label="Base actual"
                value={formatCurrency(item.amount, item.currencyCode)}
              />
              <MetricCard
                icon={<BarChart3 size={15} color={COLORS.primary} />}
                label="Llegadas"
                value={String(analytics.rows.length)}
              />
              <MetricCard
                icon={<CheckCircle2 size={15} color={COLORS.primary} />}
                label="A tiempo"
                value={String(analytics.onTimeCount)}
              />
              <MetricCard
                icon={<Clock3 size={15} color={COLORS.primary} />}
                label="Retraso prom."
                value={analytics.lateCount > 0 ? `${Math.round(analytics.averageLateDays)} días` : "0 días"}
              />
              <MetricCard
                icon={<Calendar size={15} color={COLORS.primary} />}
                label="Próxima llegada"
                value={formatOccurrenceDate(item.nextExpectedDate)}
              />
              <MetricCard
                icon={<ArrowUpRight size={15} color={COLORS.primary} />}
                label={`Promedio (${baseCurrencyCode})`}
                value={formatCurrency(analytics.averageBase, baseCurrencyCode)}
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Ritmo por mes</Text>
                <Text style={styles.sectionHint}>Toca una barra para ver el detalle</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartRow}>
                {analytics.monthly.map((entry) => {
                  const height = Math.max(8, (entry.total / analytics.maxMonthly) * 120);
                  const isActive = monthlySelection?.ym === entry.ym;
                  return (
                    <TouchableOpacity
                      key={entry.ym}
                      style={styles.chartCol}
                      onPress={() => setSelectedMonthKey(entry.ym)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.barTrack, isActive && styles.barTrackActive]}>
                        <View style={[styles.barFill, { height }, isActive && styles.barFillActive]} />
                      </View>
                      <Text style={[styles.barLabel, isActive && styles.barLabelActive]} numberOfLines={1}>
                        {ymLabel(entry.ym)}
                      </Text>
                      <Text style={styles.barAmount} numberOfLines={1}>
                        {entry.total > 0 ? formatCurrency(entry.total, baseCurrencyCode) : "—"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {monthlySelection ? (
                <View style={styles.selectionCard}>
                  <Text style={styles.selectionTitle}>{monthlySelection.label}</Text>
                  <Text style={styles.selectionValue}>
                    {formatCurrency(monthlySelection.total, baseCurrencyCode)}
                  </Text>
                  <Text style={styles.selectionSub}>
                    {monthlySelection.count} llegada{monthlySelection.count !== 1 ? "s" : ""} registradas
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Lectura rápida</Text>
              <View style={styles.insightCard}>
                <Text style={styles.insightText}>
                  {analytics.latest
                    ? `La última llegada fue ${formatOccurrenceDate(analytics.latest.actualDate)} por ${formatCurrency(analytics.latest.amount, analytics.latest.currencyCode)}.`
                    : "Aún no hay llegadas confirmadas para este ingreso fijo."}
                </Text>
                <Text style={styles.insightText}>
                  {analytics.biggest
                    ? `La mayor llegada registrada fue de ${formatCurrency(analytics.biggest.amount, analytics.biggest.currencyCode)}.`
                    : "Todavía no hay monto máximo para comparar."}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Historial en línea de tiempo</Text>
                <View style={styles.pillRow}>
                  {[
                    { id: "all" as const, label: "Todo" },
                    { id: "on_time" as const, label: "A tiempo" },
                    { id: "late" as const, label: "Tardías" },
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.pill, timelineFilter === option.id && styles.pillActive]}
                      onPress={() => setTimelineFilter(option.id)}
                    >
                      <Text style={[styles.pillText, timelineFilter === option.id && styles.pillTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {isLoading ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyBody}>Cargando historial…</Text>
                </View>
              ) : filteredTimeline.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Sin eventos para mostrar</Text>
                  <Text style={styles.emptyBody}>
                    No hay llegadas que coincidan con ese filtro.
                  </Text>
                </View>
              ) : (
                <View style={styles.timelineCard}>
                  {filteredTimeline.map((occurrence, index) => {
                    const isLate = occurrence.status === "late";
                    const tint = isLate ? COLORS.gold : COLORS.income;
                    const isLast = index === filteredTimeline.length - 1;
                    return (
                      <View
                        key={occurrence.id}
                        style={[styles.timelineRow, !isLast && styles.timelineRowBorder]}
                      >
                        <View style={styles.timelineRail}>
                          {!isLast ? (
                            <View style={[styles.timelineLine, { backgroundColor: `${tint}33` }]} />
                          ) : null}
                          <View style={[styles.timelineDot, { borderColor: `${tint}55`, backgroundColor: `${tint}18` }]}>
                            <View style={[styles.timelineDotInner, { backgroundColor: tint }]} />
                          </View>
                        </View>

                        <View style={styles.timelineContent}>
                          <View style={styles.timelineSurface}>
                            <View style={styles.timelineTopRow}>
                              <View style={styles.timelineMetaRow}>
                                <View style={styles.timelineDatePill}>
                                  <Text style={styles.timelineDatePillText}>
                                    {formatOccurrenceDate(occurrence.actualDate)}
                                  </Text>
                                </View>
                                <View style={[styles.timelineImpactPill, { backgroundColor: `${tint}18`, borderColor: `${tint}33` }]}>
                                  <Text style={[styles.timelineImpactText, { color: tint }]}>
                                    {isLate ? `${occurrence.latenessDays} día${occurrence.latenessDays !== 1 ? "s" : ""} tarde` : "A tiempo"}
                                  </Text>
                                </View>
                              </View>
                              <Text style={[styles.timelineAmount, { color: tint }]}>
                                {formatCurrency(occurrence.amount, occurrence.currencyCode)}
                              </Text>
                            </View>

                            <Text style={styles.timelineType}>
                              Esperada: {formatOccurrenceDate(occurrence.expectedDate)}
                            </Text>

                            {occurrence.notes?.trim() ? (
                              <Text style={styles.timelineDescription}>
                                {occurrence.notes.trim()}
                              </Text>
                            ) : null}

                            {occurrence.movementId ? (
                              <TouchableOpacity
                                style={styles.timelineAction}
                                onPress={() => {
                                  onClose();
                                  router.push(`/movement/${occurrence.movementId}`);
                                }}
                                activeOpacity={0.85}
                              >
                                <Text style={styles.timelineActionText}>Ver movimiento</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
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
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>{icon}</View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
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
  heroChart: {
    minWidth: 102,
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
  heroAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxl,
    color: COLORS.ink,
  },
  heroCaption: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  heroNativeLine: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  heroProgressBlock: {
    gap: SPACING.xs,
  },
  heroProgressMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroProgressLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  heroProgressValue: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
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
    color: COLORS.ink,
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
  selectionCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: 3,
  },
  selectionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  selectionValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
  },
  selectionSub: {
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
  timelineCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  timelineRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    alignItems: "flex-start",
  },
  timelineRowBorder: {
    marginBottom: SPACING.xs,
  },
  timelineRail: {
    width: 24,
    alignItems: "center",
    position: "relative",
    minHeight: 88,
  },
  timelineLine: {
    position: "absolute",
    top: 18,
    bottom: -SPACING.md,
    width: 2,
    borderRadius: RADIUS.full,
  },
  timelineDot: {
    width: 18,
    height: 18,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  timelineDotInner: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
  },
  timelineContent: {
    flex: 1,
    minWidth: 0,
  },
  timelineSurface: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  timelineTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  timelineMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    flexWrap: "wrap",
    flex: 1,
  },
  timelineDatePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  timelineDatePillText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 10,
    color: COLORS.storm,
  },
  timelineImpactPill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  timelineImpactText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: 10,
  },
  timelineType: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  timelineAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
  },
  timelineDescription: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    lineHeight: 18,
  },
  timelineAction: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    backgroundColor: COLORS.primary + "14",
  },
  timelineActionText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
});
