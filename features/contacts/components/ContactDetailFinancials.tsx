import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../components/ui/Card";
import { ProgressBar } from "../../../components/ui/ProgressBar";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../../constants/theme";
import type { ContactAnalytics } from "../lib/useContactAnalytics";
import type { CounterpartyOverview } from "../../../types/domain";

type Props = {
  contact: CounterpartyOverview;
  analytics: ContactAnalytics;
  baseCurrency: string;
};

export function ContactDetailFinancials({ contact, analytics, baseCurrency }: Props) {
  const hasFinancials =
    analytics.receivableCount > 0 || analytics.payableCount > 0 || contact.movementCount > 0;
  const hasFlow = analytics.inflowTotal > 0 || analytics.outflowTotal > 0;
  const hasHealth = analytics.receivableCount > 0 || analytics.payableCount > 0;

  if (!hasFinancials && !hasFlow && !hasHealth) return null;

  return (
    <>
      {hasFinancials ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumen financiero</Text>
          <Text style={styles.sectionSubtle}>
            Totales convertidos a {baseCurrency} para no mezclar monedas.
          </Text>
          <View style={styles.statsGrid}>
            {analytics.receivableCount > 0 ? (
              <View style={styles.statCard}>
                <Text style={[styles.statAmount, { color: COLORS.income }]}>
                  {formatCurrency(analytics.receivablePendingTotal, baseCurrency)}
                </Text>
                <Text style={styles.statLabel}>{analytics.receivableCount} por cobrar</Text>
              </View>
            ) : null}
            {analytics.payableCount > 0 ? (
              <View style={styles.statCard}>
                <Text style={[styles.statAmount, { color: COLORS.expense }]}>
                  {formatCurrency(analytics.payablePendingTotal, baseCurrency)}
                </Text>
                <Text style={styles.statLabel}>{analytics.payableCount} por pagar</Text>
              </View>
            ) : null}
            {contact.movementCount > 0 ? (
              <View style={styles.statCard}>
                <Text style={styles.statAmount}>{contact.movementCount}</Text>
                <Text style={styles.statLabel}>movimientos</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {hasFlow ? (
        <Card>
          <Text style={styles.sectionTitle}>Flujo total</Text>
          <View style={styles.flowRow}>
            <View style={styles.flowItem}>
              <Text style={styles.flowLabel}>Ingresos</Text>
              <Text style={[styles.flowAmount, { color: COLORS.income }]}>
                {formatCurrency(analytics.inflowTotal, baseCurrency)}
              </Text>
            </View>
            <View style={styles.flowItem}>
              <Text style={styles.flowLabel}>Egresos</Text>
              <Text style={[styles.flowAmount, { color: COLORS.expense }]}>
                {formatCurrency(analytics.outflowTotal, baseCurrency)}
              </Text>
            </View>
            <View style={styles.flowItem}>
              <Text style={styles.flowLabel}>Neto</Text>
              <Text
                style={[
                  styles.flowAmount,
                  { color: analytics.netFlowAmount >= 0 ? COLORS.income : COLORS.expense },
                ]}
              >
                {formatCurrency(analytics.netFlowAmount, baseCurrency)}
              </Text>
            </View>
          </View>
          <View style={styles.progressWrap}>
            <Text style={styles.progressCaption}>
              {analytics.inflowTotal >= analytics.outflowTotal
                ? "Predominan ingresos"
                : "Predominan egresos"}
            </Text>
            <ProgressBar percent={analytics.flowBalancePercent} alertPercent={100} />
          </View>
        </Card>
      ) : null}

      {hasHealth ? (
        <Card>
          <Text style={styles.sectionTitle}>Salud de la relación</Text>
          {analytics.receivableCount > 0 ? (
            <View style={styles.healthBlock}>
              <View style={styles.healthHeader}>
                <Text style={styles.healthLabel}>Cobranza acumulada</Text>
                <Text style={styles.healthPercent}>{analytics.collectionProgressPercent}%</Text>
              </View>
              <ProgressBar percent={analytics.collectionProgressPercent} alertPercent={100} />
            </View>
          ) : null}
          {analytics.payableCount > 0 ? (
            <View style={styles.healthBlock}>
              <View style={styles.healthHeader}>
                <Text style={styles.healthLabel}>Pagos ya cubiertos</Text>
                <Text style={styles.healthPercent}>{analytics.paymentProgressPercent}%</Text>
              </View>
              <ProgressBar percent={analytics.paymentProgressPercent} alertPercent={100} />
            </View>
          ) : null}
          <View style={styles.miniGrid}>
            {analytics.averageOpenExposure > 0 ? (
              <View style={styles.miniCard}>
                <Text style={styles.miniCardLabel}>Exposición promedio</Text>
                <Text style={styles.miniCardValue}>
                  {formatCurrency(analytics.averageOpenExposure, baseCurrency)}
                </Text>
              </View>
            ) : null}
            {analytics.lastActivityAt ? (
              <View style={styles.miniCard}>
                <Text style={styles.miniCardLabel}>Actividad más reciente</Text>
                <Text style={styles.miniCardValue}>
                  {format(new Date(analytics.lastActivityAt), "d MMM yyyy", { locale: es })}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: SPACING.xs,
  },
  sectionSubtle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.textDisabled,
    marginBottom: SPACING.xs,
  },
  statsGrid: { flexDirection: "row", gap: SPACING.sm },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  statAmount: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.bold, color: COLORS.text },
  statLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  flowRow: { flexDirection: "row", gap: SPACING.md, marginTop: SPACING.sm },
  flowItem: { flex: 1, gap: SPACING.xs },
  flowLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  flowAmount: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  progressWrap: { marginTop: SPACING.md, gap: SPACING.xs },
  progressCaption: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  healthBlock: { gap: SPACING.xs, marginTop: SPACING.sm },
  healthHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  healthLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  healthPercent: { fontSize: FONT_SIZE.xs, color: COLORS.text, fontWeight: FONT_WEIGHT.semibold },
  miniGrid: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  miniCard: {
    flex: 1,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.xs,
  },
  miniCardLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  miniCardValue: { fontSize: FONT_SIZE.sm, color: COLORS.text, fontWeight: FONT_WEIGHT.semibold },
});
