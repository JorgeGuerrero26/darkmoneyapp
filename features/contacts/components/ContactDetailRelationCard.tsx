import { StyleSheet, Text, View } from "react-native";

import { Card } from "../../../components/ui/Card";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../../constants/theme";
import type { ContactAnalytics } from "../lib/useContactAnalytics";
import type { CounterpartyOverview } from "../../../types/domain";

const INSIGHT_DOT_SIZE = 6;

type Props = {
  contact: CounterpartyOverview;
  analytics: ContactAnalytics;
  baseCurrency: string;
};

export function ContactDetailRelationCard({ contact, analytics, baseCurrency }: Props) {
  return (
    <Card>
      <Text style={styles.sectionTitle}>Lectura rápida</Text>
      <Text style={styles.sectionSubtle}>Lecturas comparables expresadas en {baseCurrency}</Text>
      <Text style={[styles.relationshipHeadline, { color: analytics.relationshipTone }]}>
        {analytics.relationshipHeadline}
      </Text>
      <View style={styles.roleRow}>
        {analytics.receivableCount > 0 ? (
          <View style={[styles.roleChip, styles.roleChipIncome]}>
            <Text style={[styles.roleChipText, styles.roleChipTextIncome]}>Por cobrar</Text>
          </View>
        ) : null}
        {analytics.payableCount > 0 ? (
          <View style={[styles.roleChip, styles.roleChipExpense]}>
            <Text style={[styles.roleChipText, styles.roleChipTextExpense]}>Por pagar</Text>
          </View>
        ) : null}
        {contact.movementCount > 0 ? (
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>{contact.movementCount} movimientos</Text>
          </View>
        ) : null}
        {analytics.relatedSubscriptions.length > 0 ? (
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>Proveedor recurrente</Text>
          </View>
        ) : null}
        {analytics.relatedRecurringIncome.length > 0 ? (
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>Pagador recurrente</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.insightList}>
        {analytics.insightLines.map((line) => (
          <View key={line} style={styles.insightRow}>
            <View style={styles.insightDot} />
            <Text style={styles.insightText}>{line}</Text>
          </View>
        ))}
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
  sectionSubtle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.textDisabled,
    marginBottom: SPACING.xs,
  },
  relationshipHeadline: {
    fontSize: FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.heading,
  },
  roleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  roleChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgInput,
  },
  roleChipIncome: {
    backgroundColor: COLORS.income + "18",
  },
  roleChipExpense: {
    backgroundColor: COLORS.expense + "18",
  },
  roleChipText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
  },
  roleChipTextIncome: {
    color: COLORS.income,
  },
  roleChipTextExpense: {
    color: COLORS.expense,
  },
  insightList: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  insightDot: {
    width: INSIGHT_DOT_SIZE,
    height: INSIGHT_DOT_SIZE,
    borderRadius: INSIGHT_DOT_SIZE / 2,
    backgroundColor: COLORS.primary,
    marginTop: SPACING.sm,
  },
  insightText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    lineHeight: 20,
  },
});
