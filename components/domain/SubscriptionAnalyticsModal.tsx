import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronDown } from "lucide-react-native";

import type { SubscriptionPostedMovement, SubscriptionSummary } from "../../types/domain";
import { buildSubscriptionAnalytics } from "../../features/subscriptions/lib/subscription-analytics";
import { subscriptionCadenceSuffix } from "../../lib/subscription-helpers";
import { formatCurrency } from "../ui/AmountDisplay";
import { AnalyticsRow } from "../ui/AnalyticsRow";
import { BottomSheet } from "../ui/BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  subscription: SubscriptionSummary | null;
  movements: SubscriptionPostedMovement[];
  baseCurrencyCode: string;
};

export function SubscriptionAnalyticsModal({ visible, onClose, subscription, movements, baseCurrencyCode }: Props) {
  const router = useRouter();
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [calculationOpen, setCalculationOpen] = useState(false);
  useEffect(() => {
    if (!visible) return;
    setShowAllMonths(false);
    setCalculationOpen(false);
  }, [visible, subscription?.id]);
  const analysis = useMemo(
    () => subscription ? buildSubscriptionAnalytics(subscription, movements, baseCurrencyCode) : null,
    [subscription, movements, baseCurrencyCode],
  );

  if (!subscription || !analysis) return null;

  const monthlyRows = showAllMonths ? analysis.months : analysis.months.slice(-6);
  const monthlyMax = Math.max(1, ...analysis.months.map((month) => month.total));
  const missingConversion = analysis.paymentCount - analysis.comparableCount;
  const showComparableTotal = analysis.comparableCount > 0
    && (analysis.currencies.length > 1 || analysis.currencies[0]?.code !== baseCurrencyCode.toUpperCase());
  const hasRecentPayments = analysis.months.some((month) => month.total > 0);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Analítica de suscripción"
      entranceAnimation="springFade"
      snapHeight={0.9}
      headerStyle={styles.header}
      contentStyle={styles.content}
    >
      <Text style={styles.subtitle}>{subscription.name}</Text>

      <View style={styles.hero}>
        <Text style={styles.kicker}>COSTO POR COBRO</Text>
        <Text style={styles.heroAmount} adjustsFontSizeToFit numberOfLines={1}>
          {formatCurrency(subscription.amount, subscription.currencyCode)}
        </Text>
        <Text style={styles.heroDetail}>
          {subscriptionCadenceSuffix(subscription.intervalCount, subscription.frequency)}
          {subscription.status !== "active" ? ` · ${subscription.status === "paused" ? "Pausada" : "Cancelada"}` : ""}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Lo que cuesta</Text>
        <Text style={styles.sectionSubtitle}>Equivalente según el plan guardado</Text>
        {analysis.monthlyEstimate != null && analysis.annualEstimate != null ? (
          <>
            <AnalyticsRow label="Al mes" value={formatCurrency(analysis.monthlyEstimate, subscription.currencyCode)} />
            <AnalyticsRow label="Al año" value={formatCurrency(analysis.annualEstimate, subscription.currencyCode)} last />
          </>
        ) : (
          <Text style={styles.empty}>Esta frecuencia no permite estimar un costo anual confiable.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pagos anotados</Text>
        <Text style={styles.sectionSubtitle}>
          {analysis.paymentCount === 0
            ? "Aún no hay pagos para analizar"
            : `${analysis.paymentCount} ${analysis.paymentCount === 1 ? "pago" : "pagos"} en el historial`}
        </Text>
        {analysis.currencies.map((row, index) => (
          <AnalyticsRow
            key={row.code}
            label={`Total en ${row.code}`}
            detail={`${row.count} ${row.count === 1 ? "pago" : "pagos"}`}
            value={formatCurrency(row.total, row.code)}
            last={index === analysis.currencies.length - 1 && !analysis.latestPayment && !showComparableTotal}
          />
        ))}
        {showComparableTotal ? (
          <AnalyticsRow
            label={`Total comparable en ${baseCurrencyCode}`}
            detail={`${analysis.comparableCount} de ${analysis.paymentCount} pagos`}
            value={formatCurrency(analysis.comparableTotal, baseCurrencyCode)}
            last={!analysis.latestPayment}
          />
        ) : null}
        {analysis.latestPayment ? (
          <AnalyticsRow
            label="Último pago"
            detail={format(new Date(analysis.latestPayment.occurredAt), "d MMM yyyy", { locale: es })}
            value={formatCurrency(
              Math.abs(analysis.latestPayment.sourceAmount ?? analysis.latestPayment.destinationAmount ?? 0),
              analysis.latestPayment.amountCurrencyCode ?? subscription.currencyCode,
            )}
            onPress={() => {
              onClose();
              router.push(`/movement/${analysis.latestPayment!.id}?from=subscription`);
            }}
            last
          />
        ) : null}
      </View>

      {analysis.comparableCount > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mes a mes</Text>
          <Text style={styles.sectionSubtitle}>
            {analysis.comparableCount} pagos comparables en {baseCurrencyCode}
            {missingConversion > 0 ? ` · ${missingConversion} sin conversión` : ""}
          </Text>
          {hasRecentPayments ? monthlyRows.map((month) => (
            <View key={month.key} style={styles.monthRow}>
              <View style={styles.monthHeading}>
                <Text style={styles.monthLabel}>{month.label}</Text>
                <Text style={styles.monthAmount}>
                  {month.total > 0 ? formatCurrency(month.total, baseCurrencyCode) : "—"}
                </Text>
              </View>
              <View style={styles.track}>
                {month.total > 0 ? (
                  <View style={[styles.fill, { width: `${Math.max(2, month.total / monthlyMax * 100)}%` }]} />
                ) : null}
              </View>
            </View>
          )) : <Text style={styles.empty}>No hubo pagos comparables en los últimos 12 meses.</Text>}
          {hasRecentPayments ? (
            <Pressable onPress={() => setShowAllMonths((value) => !value)} style={styles.expand} accessibilityRole="button">
              <Text style={styles.expandLabel}>{showAllMonths ? "Ver 6 meses" : "Ver 12 meses"}</Text>
              <ChevronDown size={16} color={COLORS.storm} style={showAllMonths && styles.chevronOpen} />
            </Pressable>
          ) : null}
        </View>
      ) : analysis.paymentCount > 0 ? (
        <Text style={styles.note}>Los pagos no tienen un importe comparable en {baseCurrencyCode}; por eso no se muestra un total entre monedas.</Text>
      ) : null}

      <Pressable
        style={styles.calculationRow}
        onPress={() => setCalculationOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: calculationOpen }}
      >
        <Text style={styles.calculationLabel}>Cómo se calcula</Text>
        <ChevronDown size={16} color={COLORS.storm} style={calculationOpen && styles.chevronOpen} />
      </Pressable>
      {calculationOpen ? (
        <Text style={styles.calculationText}>
          El costo mensual y anual se estiman con el importe y la frecuencia del plan. Los pagos anotados son movimientos reales vinculados a esta suscripción. Cada moneda se suma por separado; la vista mensual usa solo pagos con conversión a {baseCurrencyCode} o hechos en esa moneda. No se suman monedas distintas sin conversión.
        </Text>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACING.xl, borderBottomWidth: 0 },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, paddingBottom: SPACING.xxxl },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  hero: { paddingTop: SPACING.lg, paddingBottom: SPACING.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, letterSpacing: 1, color: COLORS.storm },
  heroAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, color: COLORS.ink, marginTop: SPACING.sm },
  heroDetail: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs },
  section: { marginTop: SPACING.xl },
  sectionTitle: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl, color: COLORS.ink },
  sectionSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs, marginBottom: SPACING.sm },
  empty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, paddingVertical: SPACING.md },
  monthRow: { minHeight: 52, justifyContent: "center", gap: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  monthHeading: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.sm },
  monthLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  monthAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  track: { height: 4, backgroundColor: SURFACE.track, borderRadius: RADIUS.full, overflow: "hidden" },
  fill: { height: "100%", backgroundColor: COLORS.ink, borderRadius: RADIUS.full },
  expand: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  expandLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  note: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  calculationRow: { minHeight: 56, marginTop: SPACING.xl, flexDirection: "row", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  calculationLabel: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.fog },
  calculationText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 21, color: COLORS.storm },
});
