import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle, Zap } from "lucide-react-native";
import { Card } from "../ui/Card";
import { ProgressBar } from "../ui/ProgressBar";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import type { BudgetOverview } from "../../types/domain";

type Props = {
  budget: BudgetOverview;
  onPress?: () => void;
};

export function BudgetCard({ budget, onPress }: Props) {
  const statusColor = budget.isOverLimit
    ? COLORS.rosewood
    : budget.isNearLimit
      ? COLORS.gold
      : COLORS.pine;

  return (
    <Card onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{budget.name}</Text>
          <Text style={styles.scope}>{budget.scopeLabel}</Text>
        </View>
        <Text style={[styles.percent, { color: statusColor }]}>
          {Math.round(budget.usedPercent)}%
        </Text>
      </View>

      <View style={styles.progressWrap}>
        <ProgressBar percent={budget.usedPercent} alertPercent={budget.alertPercent} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.spent}>
          {formatCurrency(budget.spentAmount, budget.currencyCode)} gastado
        </Text>
        <Text style={styles.limit}>
          de {formatCurrency(budget.limitAmount, budget.currencyCode)}
        </Text>
      </View>

      {budget.isOverLimit ? (
        <View style={styles.alertRow}>
          <AlertTriangle size={12} color={COLORS.rosewood} />
          <Text style={[styles.alertLabel, { color: COLORS.rosewood }]}>Presupuesto excedido</Text>
        </View>
      ) : budget.isNearLimit ? (
        <View style={styles.alertRow}>
          <Zap size={12} color={COLORS.gold} />
          <Text style={[styles.alertLabel, { color: COLORS.gold }]}>Cerca del límite</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  scope: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  percent: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxl,
  },
  progressWrap: {
    marginBottom: SPACING.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  spent: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  limit: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: SPACING.sm,
  },
  alertLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
});
