import { useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import {
  X, TrendingUp, TrendingDown, ArrowLeftRight,
  Layers, CheckCircle2, AlertTriangle, Clock,
} from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../ui/AmountDisplay";
import { ProgressBar } from "../ui/ProgressBar";
import { parseDisplayDate } from "../../lib/date";
import { useAccountAnalyticsQuery } from "../../services/queries/workspace-data";
import { useWorkspace } from "../../lib/workspace-context";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import type { AccountSummary } from "../../types/domain";

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
  const { activeWorkspaceId } = useWorkspace();
  const { data: movements = [], isLoading } = useAccountAnalyticsQuery(
    activeWorkspaceId,
    visible ? (account?.id ?? null) : null,
  );

  const currency = account?.currencyCode ?? "PEN";

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

  if (!account) return null;

  const isPositiveFlow = metrics.netFlow >= 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
      </Pressable>

      <View style={styles.sheet} pointerEvents="box-none">
        <View style={styles.card}>
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
              <View style={styles.metricsGrid}>
                {[
                  { label: "Total entradas", value: formatCurrency(metrics.totalIn, currency), color: COLORS.income, Icon: TrendingUp },
                  { label: "Total salidas",  value: formatCurrency(metrics.totalOut, currency), color: COLORS.expense, Icon: TrendingDown },
                  { label: "Flujo neto",     value: formatCurrency(Math.abs(metrics.netFlow), currency), color: isPositiveFlow ? COLORS.income : COLORS.expense, Icon: ArrowLeftRight, prefix: isPositiveFlow ? "+" : "−" },
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

              {/* Monthly flow chart */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Flujo mensual (últimos 6 meses)</Text>
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
                  <Text style={styles.sectionTitle}>Top categorías de gasto</Text>
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

              {/* Recent movements */}
              {recentMovements.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Movimientos recientes</Text>
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
        </View>
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
});
