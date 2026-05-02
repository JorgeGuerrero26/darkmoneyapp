import { useMemo } from "react";
import {
  ActivityIndicator,
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
  X, TrendingUp, TrendingDown, ArrowLeftRight,
  Layers, CheckCircle2, AlertTriangle, Clock,
} from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../ui/AmountDisplay";
import { ProgressBar } from "../ui/ProgressBar";
import { RingChart, type RingSegment } from "../ui/RingChart";
import { SparkLine } from "../ui/SparkLine";
import { parseDisplayDate } from "../../lib/date";
import { useAccountAnalyticsQuery } from "../../services/queries/workspace-data";
import { useWorkspace } from "../../lib/workspace-context";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import type { AccountSummary } from "../../types/domain";
import { SafeBlurView } from "../ui/SafeBlurView";
import { useDismissibleSheet } from "../ui/useDismissibleSheet";

type Props = {
  visible: boolean;
  account: AccountSummary | null;
  onClose: () => void;
};

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  posted:  CheckCircle2,
  pending: Clock,
  planned: AlertTriangle,
};
const STATUS_COLOR: Record<string, string> = {
  posted:  COLORS.income,
  pending: COLORS.warning,
  planned: COLORS.storm,
};

export function AccountAnalyticsModal({ visible, account, onClose }: Props) {
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { backdropStyle, panHandlers, sheetStyle } = useDismissibleSheet({ visible, onClose });
  const { data: movements = [], isLoading } = useAccountAnalyticsQuery(
    activeWorkspaceId,
    visible ? (account?.id ?? null) : null,
  );

  const currency = account?.currencyCode ?? "PEN";
  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";

  // ── Core metrics ────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    for (const m of movements) {
      if (m.destinationAccountId === account?.id && m.destinationAmount != null) {
        totalIn += m.destinationAmount;
      }
      if (m.sourceAccountId === account?.id && m.sourceAmount != null) {
        totalOut += m.sourceAmount;
      }
    }
    return {
      totalIn,
      totalOut,
      netFlow: totalIn - totalOut,
      count: movements.length,
    };
  }, [movements, account]);

  // ── Monthly flow (last 6 months) ─────────────────────────────────────
  const monthlyFlow = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM", { locale: es });
      let income = 0;
      let expense = 0;
      for (const m of movements) {
        if (m.occurredAt.slice(0, 7) !== key) continue;
        if (m.destinationAccountId === account?.id && m.destinationAmount != null) income += m.destinationAmount;
        if (m.sourceAccountId === account?.id && m.sourceAmount != null) expense += m.sourceAmount;
      }
      return { label, key, income, expense };
    });
  }, [movements, account]);

  const maxMonthly = Math.max(...monthlyFlow.flatMap((m) => [m.income, m.expense]), 1);

  // ── Top 5 expense categories ─────────────────────────────────────────
  const topCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of movements) {
      if (m.sourceAccountId !== account?.id || m.sourceAmount == null) continue;
      if (m.movementType === "transfer") continue;
      const cat = m.categoryName ?? "Sin categoría";
      map.set(cat, (map.get(cat) ?? 0) + m.sourceAmount);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [movements, account]);

  const maxCategoryAmount = topCategories[0]?.[1] ?? 1;

  // ── 8 most recent movements ──────────────────────────────────────────
  const recentMovements = useMemo(() => movements.slice(0, 8), [movements]);

  // ── Historical balance (running total, oldest→newest) ───────────────
  const balanceHistory = useMemo(() => {
    if (!account || movements.length === 0) return [];
    // movements come newest-first (DESC). Reconstruct balance going backwards.
    let bal = account.currentBalance;
    const points: number[] = [bal];
    for (const m of movements) {
      if (m.destinationAccountId === account.id && m.destinationAmount != null) {
        bal -= m.destinationAmount; // undo income
      }
      if (m.sourceAccountId === account.id && m.sourceAmount != null) {
        bal += m.sourceAmount; // undo expense
      }
      points.push(bal);
    }
    return points.reverse(); // oldest to newest
  }, [movements, account]);

  // ── Income/expense ring segments ────────────────────────────────────
  const ratioSegments = useMemo<RingSegment[]>(() => {
    if (metrics.totalIn <= 0 && metrics.totalOut <= 0) return [];
    return [
      { key: "in",  value: metrics.totalIn,  color: COLORS.income },
      { key: "out", value: metrics.totalOut, color: COLORS.expense },
    ];
  }, [metrics.totalIn, metrics.totalOut]);

  // ── Day-of-week spending pattern ────────────────────────────────────
  const { dowSpending, maxDowSpend } = useMemo(() => {
    const sums = new Array(7).fill(0) as number[];
    for (const m of movements) {
      if (m.sourceAccountId !== account?.id || m.sourceAmount == null) continue;
      if (m.movementType === "transfer") continue;
      sums[parseDisplayDate(m.occurredAt).getDay()] += m.sourceAmount;
    }
    // Mon–Sun order (getDay: 0=Sun, 1=Mon…6=Sat)
    const order = [1, 2, 3, 4, 5, 6, 0];
    const labels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const dowSpending = order.map((i, idx) => ({ label: labels[idx], total: sums[i] }));
    return { dowSpending, maxDowSpend: Math.max(...sums, 1) };
  }, [movements, account]);

  if (!account) return null;

  const isPositiveFlow = metrics.netFlow >= 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <SafeBlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
      </Animated.View>

      <View style={styles.sheet} pointerEvents="box-none">
        <Animated.View style={[styles.card, sheetStyle]}>
          <View {...panHandlers}>
            <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.accentDot, { backgroundColor: account.color + "33", borderColor: account.color + "55" }]}>
              <View style={[styles.accentDotInner, { backgroundColor: account.color }]} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>{account.name}</Text>
              <Text style={styles.subtitle}>
                {formatCurrency(account.currentBalance, currency)} · {account.currencyCode}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={18} color={COLORS.storm} />
            </TouchableOpacity>
          </View>
          </View>

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.loadingText}>Calculando métricas…</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {/* 4 Key metrics */}
              <View style={styles.currencyHintCard}>
                <Text style={styles.currencyHintTitle}>Moneda del análisis</Text>
                <Text style={styles.currencyHintBody}>
                  Este análisis usa la moneda propia de la cuenta ({currency}) para que entradas, salidas y saldo no mezclen divisas.
                </Text>
                {account.currentBalanceInBaseCurrency != null && currency !== baseCurrency ? (
                  <Text style={styles.currencyHintSub}>
                    Saldo actual equivalente: {formatCurrency(account.currentBalanceInBaseCurrency, baseCurrency)} en {baseCurrency}.
                  </Text>
                ) : null}
              </View>

              {/* 4 Key metrics */}
              <View style={styles.metricsGrid}>
                {[
                  { label: `Total entradas (${currency})`, value: formatCurrency(metrics.totalIn, currency), color: COLORS.income, Icon: TrendingUp },
                  { label: `Total salidas (${currency})`,  value: formatCurrency(metrics.totalOut, currency), color: COLORS.expense, Icon: TrendingDown },
                  { label: `Flujo neto (${currency})`,     value: formatCurrency(Math.abs(metrics.netFlow), currency), color: isPositiveFlow ? COLORS.income : COLORS.expense, Icon: ArrowLeftRight, prefix: isPositiveFlow ? "+" : "−" },
                  { label: "Movimientos",    value: String(metrics.count), color: COLORS.storm, Icon: Layers },
                ].map((m) => (
                  <View key={m.label} style={styles.metricCard}>
                    <m.Icon size={15} color={m.color} strokeWidth={2} />
                    <Text style={[styles.metricValue, { color: m.color }]}>
                      {m.prefix ?? ""}{m.value}
                    </Text>
                    <Text style={styles.metricLabel}>{m.label}</Text>
                  </View>
                ))}
              </View>

              {/* Income / expense ratio ring */}
              {ratioSegments.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Distribución entradas/salidas · {currency}</Text>
                  <View style={styles.ratioRow}>
                    <RingChart segments={ratioSegments} size={96} thickness={16} />
                    <View style={styles.ratioStats}>
                      {[
                        { label: "Entradas", value: metrics.totalIn, color: COLORS.income },
                        { label: "Salidas",  value: metrics.totalOut, color: COLORS.expense },
                      ].map((item) => {
                        const total = metrics.totalIn + metrics.totalOut;
                        const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                        return (
                          <View key={item.label} style={styles.ratioStatRow}>
                            <View style={[styles.ratioDot, { backgroundColor: item.color }]} />
                            <View style={styles.ratioStatText}>
                              <Text style={[styles.ratioStatValue, { color: item.color }]}>
                                {pct}%
                              </Text>
                              <Text style={styles.ratioStatLabel}>{item.label}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Historical balance sparkline */}
              {balanceHistory.length > 1 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Evolución del saldo · {currency}</Text>
                  <View style={styles.balanceSparkCard}>
                    <View style={styles.balanceSparkRow}>
                      <View>
                        <Text style={styles.balanceSparkLabel}>Primer registro</Text>
                        <Text style={[styles.balanceSparkValue, { color: balanceHistory[0] >= 0 ? COLORS.income : COLORS.expense }]}>
                          {formatCurrency(balanceHistory[0], currency)}
                        </Text>
                      </View>
                      <SparkLine
                        values={balanceHistory}
                        width={140}
                        height={52}
                        positiveColor={COLORS.income}
                        negativeColor={COLORS.expense}
                      />
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.balanceSparkLabel}>Actual</Text>
                        <Text style={[styles.balanceSparkValue, { color: account.currentBalance >= 0 ? COLORS.income : COLORS.expense }]}>
                          {formatCurrency(account.currentBalance, currency)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.balanceSparkHint}>
                      Basado en los últimos {movements.length} movimientos registrados
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Monthly flow chart */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Flujo mensual (últimos 6 meses) · {currency}</Text>
                <View style={styles.chart}>
                  {monthlyFlow.map((m) => (
                    <View key={m.key} style={styles.chartGroup}>
                      <View style={styles.barTracks}>
                        {/* Income bar */}
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { height: `${Math.round((m.income / maxMonthly) * 100)}%` as any, backgroundColor: COLORS.income }]} />
                        </View>
                        {/* Expense bar */}
                        <View style={styles.barTrack}>
                          <View style={[styles.barFill, { height: `${Math.round((m.expense / maxMonthly) * 100)}%` as any, backgroundColor: COLORS.expense + "CC" }]} />
                        </View>
                      </View>
                      <Text style={styles.barLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.chartLegend}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.income }]} />
                    <Text style={styles.legendText}>Entradas</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.expense }]} />
                    <Text style={styles.legendText}>Salidas</Text>
                  </View>
                </View>
              </View>

              {/* Top 5 categories */}
              {topCategories.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Top categorías de gasto · {currency}</Text>
                  {topCategories.map(([name, total]) => (
                    <View key={name} style={styles.catRow}>
                      <Text style={styles.catName} numberOfLines={1}>{name}</Text>
                      <View style={styles.catBarWrap}>
                        <View
                          style={[
                            styles.catBarFill,
                            { width: `${Math.round((total / maxCategoryAmount) * 100)}%` as any },
                          ]}
                        />
                      </View>
                      <Text style={styles.catAmount}>{formatCurrency(total, currency)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Day-of-week spending pattern */}
              {dowSpending.some((d) => d.total > 0) ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Gasto por día de semana · {currency}</Text>
                  <View style={styles.dowChart}>
                    {dowSpending.map((d) => {
                      const pct = Math.round((d.total / maxDowSpend) * 100);
                      return (
                        <View key={d.label} style={styles.dowBar}>
                          <View style={styles.dowTrack}>
                            <View
                              style={[
                                styles.dowFill,
                                { height: `${pct}%` as any },
                                pct === 100 && styles.dowFillPeak,
                              ]}
                            />
                          </View>
                          <Text style={styles.dowLabel}>{d.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Recent movements */}
              {recentMovements.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Movimientos recientes · {currency}</Text>
                  {recentMovements.map((m) => {
                    const isIncoming = m.destinationAccountId === account.id;
                    const amount = isIncoming ? (m.destinationAmount ?? 0) : (m.sourceAmount ?? 0);
                    const StatusIcon = STATUS_ICON[m.status] ?? CheckCircle2;
                    return (
                      <View key={m.id} style={styles.recentRow}>
                        <StatusIcon size={14} color={STATUS_COLOR[m.status] ?? COLORS.storm} />
                        <View style={styles.recentInfo}>
                          <Text style={styles.recentDesc} numberOfLines={1}>
                            {m.description ?? m.movementType}
                          </Text>
                          <Text style={styles.recentMeta}>
                            {m.categoryName ?? "Sin categoría"} · {format(parseDisplayDate(m.occurredAt), "d MMM", { locale: es })}
                          </Text>
                        </View>
                        <Text style={[styles.recentAmount, { color: isIncoming ? COLORS.income : COLORS.expense }]}>
                          {isIncoming ? "+" : "−"}{formatCurrency(amount, currency)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyText}>Sin movimientos registrados.</Text>
              )}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  card: {
    maxHeight: "92%",
    backgroundColor: "rgba(8,12,18,0.97)",
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: "rgba(255,255,255,0.18)",
    borderLeftColor: "rgba(255,255,255,0.10)",
    borderRightColor: "rgba(255,255,255,0.07)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 20,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.10)",
  },
  accentDot: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  accentDotInner: { width: 8, height: 8, borderRadius: RADIUS.full },
  headerText: { flex: 1 },
  title: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 1 },
  closeBtn: {
    padding: SPACING.xs,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: RADIUS.sm,
  },
  loadingWrap: {
    padding: SPACING.xxxl,
    alignItems: "center",
    gap: SPACING.md,
  },
  loadingText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  content: {
    padding: SPACING.lg,
    gap: SPACING.lg,
    paddingBottom: SPACING.xxxl,
  },
  currencyHintCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: 6,
  },
  currencyHintTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  currencyHintBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: 20,
  },
  currencyHintSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
  },

  // Metrics
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  metricCard: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
    borderLeftColor: "rgba(255,255,255,0.08)",
    borderRightColor: "rgba(255,255,255,0.06)",
    borderBottomColor: "rgba(255,255,255,0.04)",
    padding: SPACING.md,
    gap: 4,
    alignItems: "flex-start",
  },
  metricValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md },
  metricLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },

  // Section
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Monthly chart
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.xs,
    height: 80,
  },
  chartGroup: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  barTracks: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    width: "100%",
  },
  barTrack: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    borderRadius: 4,
    minHeight: 2,
  },
  barLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: COLORS.storm,
    textTransform: "capitalize",
  },
  chartLegend: {
    flexDirection: "row",
    gap: SPACING.md,
    justifyContent: "center",
    marginTop: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },

  // Top categories
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  catName: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
    width: 90,
  },
  catBarWrap: {
    flex: 1,
    height: 6,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: RADIUS.full,
    overflow: "hidden",
  },
  catBarFill: {
    height: "100%",
    backgroundColor: COLORS.expense + "CC",
    borderRadius: RADIUS.full,
  },
  catAmount: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.expense,
    width: 70,
    textAlign: "right",
  },

  // Recent movements
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  recentInfo: { flex: 1 },
  recentDesc: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  recentMeta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 1 },
  recentAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm },
  emptyText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    paddingVertical: SPACING.lg,
  },

  // Balance history sparkline
  balanceSparkCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.xs,
  },
  balanceSparkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  balanceSparkLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginBottom: 2,
  },
  balanceSparkValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
  },
  balanceSparkHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: COLORS.textDisabled,
    textAlign: "center",
  },

  // Ratio ring
  ratioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
  },
  ratioStats: { flex: 1, gap: SPACING.sm },
  ratioStatRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  ratioDot: { width: 10, height: 10, borderRadius: RADIUS.full },
  ratioStatText: { flex: 1 },
  ratioStatValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg },
  ratioStatLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 1 },

  // Day-of-week chart
  dowChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.xs,
    height: 64,
  },
  dowBar: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    height: "100%",
    justifyContent: "flex-end",
  },
  dowTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 4,
    overflow: "hidden",
  },
  dowFill: {
    width: "100%",
    backgroundColor: COLORS.expense + "99",
    borderRadius: 4,
    minHeight: 2,
  },
  dowFillPeak: { backgroundColor: COLORS.expense },
  dowLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 9,
    color: COLORS.storm,
    textTransform: "capitalize",
  },
});
