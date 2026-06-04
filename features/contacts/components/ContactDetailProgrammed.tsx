import { StyleSheet, Text, View } from "react-native";

import { Card } from "../../../components/ui/Card";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../../constants/theme";
import type { ContactAnalytics } from "../lib/useContactAnalytics";

type Props = {
  analytics: ContactAnalytics;
  baseCurrency: string;
};

export function ContactDetailProgrammed({ analytics, baseCurrency }: Props) {
  if (
    analytics.relatedSubscriptions.length === 0 &&
    analytics.relatedRecurringIncome.length === 0
  ) {
    return null;
  }

  return (
    <Card>
      <Text style={styles.sectionTitle}>Relación programada</Text>
      <View style={styles.statsGrid}>
        {analytics.relatedSubscriptions.length > 0 ? (
          <View style={styles.statCard}>
            <Text style={[styles.statAmount, { color: COLORS.expense }]}>
              {formatCurrency(analytics.scheduledExpenseTotal, baseCurrency)}
            </Text>
            <Text style={styles.statLabel}>
              {analytics.relatedSubscriptions.length} suscrip. activas
            </Text>
          </View>
        ) : null}
        {analytics.relatedRecurringIncome.length > 0 ? (
          <View style={styles.statCard}>
            <Text style={[styles.statAmount, { color: COLORS.income }]}>
              {formatCurrency(analytics.scheduledIncomeTotal, baseCurrency)}
            </Text>
            <Text style={styles.statLabel}>
              {analytics.relatedRecurringIncome.length} ingresos activos
            </Text>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
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
});
