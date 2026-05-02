import { useMemo } from "react";
import {
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import type { SubscriptionPostedMovement, SubscriptionSummary } from "../../types/domain";
import { buildCurrencyBreakdown, formatCurrencyBreakdownLine } from "../../lib/analytics-currency";
import {
  getSubscriptionAnnualCost,
  movementAmountForSubscriptionAnalytics,
} from "../../lib/subscription-helpers";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { useDismissibleSheet } from "../ui/useDismissibleSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  subscription: SubscriptionSummary | null;
  movements: SubscriptionPostedMovement[];
  baseCurrencyCode: string;
};

function ymFromOccurredAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "yyyy-MM");
}

function ymLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return format(new Date(y, m - 1, 1), "MMM yy", { locale: es });
}

export function SubscriptionAnalyticsModal({
  visible,
  onClose,
  subscription,
  movements,
  baseCurrencyCode,
}: Props) {
  const insets = useSafeAreaInsets();
  const { backdropStyle, panHandlers, sheetStyle } = useDismissibleSheet({ visible, onClose });

  const filtered = useMemo(() => {
    if (!subscription) return [];
    return movements
      .filter((movement) => movement.subscriptionId === subscription.id)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }, [movements, subscription]);

  const analytics = useMemo(() => {
    if (!subscription) return null;

    const annualNative = getSubscriptionAnnualCost(
      subscription.amount,
      subscription.frequency,
      subscription.intervalCount,
    );
    const monthlyNative = annualNative / 12;
    const annualBase = subscription.amountInBaseCurrency != null
      ? getSubscriptionAnnualCost(
          subscription.amountInBaseCurrency,
          subscription.frequency,
          subscription.intervalCount,
        )
      : null;
    const monthlyBase = annualBase != null ? annualBase / 12 : null;

    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(format(date, "yyyy-MM"));
    }
    const totalsByMonth = new Map<string, number>();
    for (const key of monthKeys) totalsByMonth.set(key, 0);

    let totalBase = 0;
    let comparableCount = 0;
    for (const movement of filtered) {
      if (movement.amountInBaseCurrency != null && Number.isFinite(movement.amountInBaseCurrency)) {
        totalBase += movement.amountInBaseCurrency;
        comparableCount += 1;
        const ym = ymFromOccurredAt(movement.occurredAt);
        if (ym && totalsByMonth.has(ym)) {
          totalsByMonth.set(ym, (totalsByMonth.get(ym) ?? 0) + movement.amountInBaseCurrency);
        }
      }
    }

    const totalNative = filtered.reduce(
      (sum, movement) => sum + movementAmountForSubscriptionAnalytics(movement),
      0,
    );
    const averageBase = comparableCount > 0 ? totalBase / comparableCount : 0;
    const breakdown = buildCurrencyBreakdown(
      filtered.map((movement) => ({
        currencyCode: movement.amountCurrencyCode ?? subscription.currencyCode,
        amount: movementAmountForSubscriptionAnalytics(movement),
        amountInBaseCurrency: movement.amountInBaseCurrency ?? null,
      })),
    );
    const last12 = monthKeys.map((ym) => ({ ym, totalBase: totalsByMonth.get(ym) ?? 0 }));
    const maxBar = Math.max(1, ...last12.map((item) => item.totalBase));
    const strongestMonth = last12.reduce<{ ym: string; totalBase: number } | null>(
      (best, current) => (!best || current.totalBase > best.totalBase ? current : best),
      null,
    );
    const latestMovement = filtered[0] ?? null;

    const insightLines: string[] = [];
    if (monthlyBase != null) {
      insightLines.push(
        `El plan equivale aproximadamente a ${formatCurrency(monthlyBase, baseCurrencyCode)} al mes en ${baseCurrencyCode}.`,
      );
    }
    if (strongestMonth && strongestMonth.totalBase > 0) {
      insightLines.push(
        `El mayor mes registrado fue ${ymLabel(strongestMonth.ym)} con ${formatCurrency(strongestMonth.totalBase, baseCurrencyCode)} comparables.`,
      );
    }
    if (breakdown.length > 1) {
      insightLines.push(
        `Los pagos reales se detectaron en ${breakdown.length} monedas, por eso el histórico comparable se expresa en ${baseCurrencyCode}.`,
      );
    }

    return {
      paymentCount: filtered.length,
      totalNative,
      totalBase,
      averageBase,
      monthlyNative,
      annualNative,
      monthlyBase,
      annualBase,
      breakdown,
      last12,
      maxBar,
      strongestMonth,
      latestMovement,
      insightLines,
    };
  }, [baseCurrencyCode, filtered, subscription]);

  if (!subscription || !analytics) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md }, sheetStyle]}>
          <View style={styles.header} {...panHandlers}>
            <Text style={styles.title} numberOfLines={2}>
              Análisis · {subscription.name}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
              <Text style={styles.heroEyebrow}>Plan y pagos comparables</Text>
              <Text style={styles.heroAmount}>
                {formatCurrency(analytics.totalBase, baseCurrencyCode)}
              </Text>
              <Text style={styles.heroCaption}>
                Total publicado comparable en {baseCurrencyCode}
              </Text>
              <Text style={styles.heroNativeLine}>
                Pagos detectados: {formatCurrencyBreakdownLine(analytics.breakdown)}
              </Text>
            </View>

            <View style={styles.metricsGrid}>
              <Metric label="Pagos registrados" value={String(analytics.paymentCount)} />
              <Metric
                label={`Promedio publicado (${baseCurrencyCode})`}
                value={formatCurrency(analytics.averageBase, baseCurrencyCode)}
              />
              <Metric
                label={`Plan mensual (${subscription.currencyCode})`}
                value={formatCurrency(analytics.monthlyNative, subscription.currencyCode)}
              />
              <Metric
                label={`Plan anual (${subscription.currencyCode})`}
                value={formatCurrency(analytics.annualNative, subscription.currencyCode)}
              />
              {analytics.monthlyBase != null ? (
                <Metric
                  label={`Plan mensual (${baseCurrencyCode})`}
                  value={formatCurrency(analytics.monthlyBase, baseCurrencyCode)}
                />
              ) : null}
              {analytics.annualBase != null ? (
                <Metric
                  label={`Plan anual (${baseCurrencyCode})`}
                  value={formatCurrency(analytics.annualBase, baseCurrencyCode)}
                />
              ) : null}
            </View>

            {analytics.insightLines.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Lectura rápida</Text>
                <View style={styles.insightList}>
                  {analytics.insightLines.map((line) => (
                    <View key={line} style={styles.insightRow}>
                      <View style={styles.insightDot} />
                      <Text style={styles.insightText}>{line}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Últimos 12 meses · comparable en {baseCurrencyCode}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.barRow}>
                {analytics.last12.map(({ ym, totalBase }) => {
                  const barH = Math.max(4, (totalBase / analytics.maxBar) * 128);
                  return (
                    <View key={ym} style={styles.barCol}>
                      <View style={styles.barTrack}>
                        <View style={[styles.barFill, { height: barH }]} />
                      </View>
                      <Text style={styles.barLabel} numberOfLines={1}>
                        {ymLabel(ym)}
                      </Text>
                      <Text style={styles.barAmount} numberOfLines={1}>
                        {totalBase > 0 ? formatCurrency(totalBase, baseCurrencyCode) : "—"}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            {analytics.breakdown.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Monedas detectadas en pagos</Text>
                <View style={styles.breakdownList}>
                  {analytics.breakdown.map((row) => (
                    <View key={row.currencyCode} style={styles.breakdownCard}>
                      <Text style={styles.breakdownTitle}>{row.currencyCode}</Text>
                      <Text style={styles.breakdownValue}>{formatCurrency(row.total, row.currencyCode)}</Text>
                      <Text style={styles.breakdownSub}>
                        {row.totalInBaseCurrency != null
                          ? `≈ ${formatCurrency(row.totalInBaseCurrency, baseCurrencyCode)} en ${baseCurrencyCode}`
                          : `Sin equivalencia confiable a ${baseCurrencyCode}`}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {analytics.latestMovement ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Último pago detectado</Text>
                <View style={styles.latestCard}>
                  <Text style={styles.latestAmount}>
                    {formatCurrency(
                      movementAmountForSubscriptionAnalytics(analytics.latestMovement),
                      analytics.latestMovement.amountCurrencyCode ?? subscription.currencyCode,
                    )}
                  </Text>
                  <Text style={styles.latestSub}>
                    {format(new Date(analytics.latestMovement.occurredAt), "d 'de' MMMM yyyy", { locale: es })}
                  </Text>
                  {analytics.latestMovement.amountInBaseCurrency != null ? (
                    <Text style={styles.latestSub}>
                      Comparable: {formatCurrency(analytics.latestMovement.amountInBaseCurrency, baseCurrencyCode)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <Text style={styles.hint}>
              El plan conserva su moneda original ({subscription.currencyCode}). Los históricos comparables se muestran en {baseCurrencyCode} para que no se mezclen pagos en distintas monedas sin conversión.
            </Text>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "92%",
    backgroundColor: COLORS.bgModal,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: GLASS.sheetBorder,
  },
  title: {
    flex: 1,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    marginRight: SPACING.md,
  },
  close: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.primary,
  },
  body: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xl },
  heroCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.lg,
    gap: SPACING.xs,
  },
  heroEyebrow: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroAmount: {
    fontSize: FONT_SIZE.xxl,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
  },
  heroCaption: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
  },
  heroNativeLine: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.primary,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  metricCard: {
    width: "48%",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: 4,
  },
  metricLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  insightList: { gap: SPACING.sm },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  insightDot: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    marginTop: 6,
  },
  insightText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    lineHeight: 20,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  barCol: { width: 74, alignItems: "center" },
  barTrack: {
    width: 32,
    height: 128,
    borderRadius: RADIUS.sm,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: RADIUS.sm,
    borderBottomRightRadius: RADIUS.sm,
  },
  barLabel: {
    marginTop: 6,
    fontSize: 10,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  barAmount: {
    marginTop: 2,
    fontSize: 9,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
    textAlign: "center",
  },
  breakdownList: { gap: SPACING.sm },
  breakdownCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: 4,
  },
  breakdownTitle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.primary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  breakdownValue: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  breakdownSub: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
  },
  latestCard: {
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: 4,
  },
  latestAmount: {
    fontSize: FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
  },
  latestSub: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
  },
  hint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
});
