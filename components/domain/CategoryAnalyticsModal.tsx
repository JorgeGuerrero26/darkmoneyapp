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

import type { CategoryOverview, CategoryPostedMovement } from "../../types/domain";
import { formatCurrencyBreakdownLine } from "../../lib/analytics-currency";
import { catalogMovementAmount } from "../../lib/catalog-money";
import { buildCategoryAnalytics } from "../../features/categories/lib/category-analytics";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { useDismissibleSheet } from "../ui/useDismissibleSheet";

type Props = {
  visible: boolean;
  onClose: () => void;
  category: CategoryOverview | null;
  movements: CategoryPostedMovement[];
  baseCurrencyCode: string;
};

function ymLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return format(new Date(y, m - 1, 1), "MMM yy", { locale: es });
}

export function CategoryAnalyticsModal({
  visible,
  onClose,
  category,
  movements,
  baseCurrencyCode,
}: Props) {
  const insets = useSafeAreaInsets();
  const { backdropStyle, panHandlers, sheetStyle } = useDismissibleSheet({ visible, onClose });

  const analytics = useMemo(() => {
    if (!category) return null;
    const result = buildCategoryAnalytics(movements, category.id, baseCurrencyCode);
    const insightLines: string[] = [];
    if (result.totalLast12 > 0) {
      insightLines.push(
        `En los últimos 12 meses esta categoría movió ${formatCurrency(result.totalLast12, baseCurrencyCode)} comparables en ${baseCurrencyCode}.`,
      );
    }
    if (result.strongestMonth) {
      insightLines.push(
        `El mes más pesado fue ${ymLabel(result.strongestMonth.ym)} con ${formatCurrency(result.strongestMonth.totalBase, baseCurrencyCode)}.`,
      );
    }
    if (result.unconvertedCount) insightLines.push(`${result.unconvertedCount} movimientos sin conversión: se conservan en su moneda original y no se suman al gráfico.`);
    if (result.breakdown.length > 1) {
      insightLines.push(
        `Se detectaron ${result.breakdown.length} monedas distintas, por eso el gráfico y los totales comparables se expresan en ${baseCurrencyCode}.`,
      );
    } else if (result.breakdown[0]) {
      insightLines.push(`La actividad reciente se concentra en ${result.breakdown[0].currencyCode}.`);
    }
    return { ...result, insightLines };
  }, [baseCurrencyCode, category, movements]);

  if (!category || !analytics) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.md }, sheetStyle]}>
          <View style={styles.header} {...panHandlers}>
            <Text style={styles.title} numberOfLines={2}>
              Análisis · {category.name}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>Cerrar</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
              <Text style={styles.heroEyebrow}>Lectura comparable</Text>
              <Text style={styles.heroAmount}>{formatCurrency(analytics.totalBase, baseCurrencyCode)}</Text>
              <Text style={styles.heroCaption}>
                Total histórico comparable en la moneda base del espacio ({baseCurrencyCode})
              </Text>
              <Text style={styles.heroNativeLine}>
                Desglose nativo: {formatCurrencyBreakdownLine(analytics.breakdown)}
              </Text>
            </View>

            <View style={styles.metricsGrid}>
              <Metric label="Gastos aplicados" value={analytics.spent.map((item) => formatCurrency(item.amount, item.currencyCode)).join(" · ")} />
              <Metric label="Ingresos aplicados" value={analytics.received.map((item) => formatCurrency(item.amount, item.currencyCode)).join(" · ")} />
              <Metric label="Movimientos publicados" value={String(analytics.paymentCount)} />
              <Metric
                label={`Promedio por movimiento (${baseCurrencyCode})`}
                value={formatCurrency(analytics.averageBase, baseCurrencyCode)}
              />
              <Metric
                label={`Promedio por mes activo (${baseCurrencyCode})`}
                value={formatCurrency(analytics.averageActiveMonthBase, baseCurrencyCode)}
              />
              <Metric label="Uso en suscripciones" value={String(category.subscriptionCount)} />
              <Metric
                label={`Mejor mes (${baseCurrencyCode})`}
                value={
                  analytics.strongestMonth
                    ? formatCurrency(analytics.strongestMonth.totalBase, baseCurrencyCode)
                    : "—"
                }
              />
              <Metric label="Monedas detectadas" value={String(analytics.breakdown.length || 1)} />
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
                <Text style={styles.sectionTitle}>Monedas detectadas</Text>
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
                <Text style={styles.sectionTitle}>Último movimiento</Text>
                <View style={styles.latestCard}>
                  <Text style={styles.latestAmount}>
                    {formatCurrency(
                      catalogMovementAmount(analytics.latestMovement),
                      analytics.latestMovement.amountCurrencyCode ?? baseCurrencyCode,
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
              Los totales comparables y el gráfico se expresan en {baseCurrencyCode}. El desglose por moneda mantiene los importes originales para no perder contexto.
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
    borderColor: SURFACE.cardBorder,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: SURFACE.sheetBorder,
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
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
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
