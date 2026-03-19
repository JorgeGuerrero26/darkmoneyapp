import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle, Zap } from "lucide-react-native";
import { Card } from "../ui/Card";
import { ProgressBar } from "../ui/ProgressBar";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";
import type { BudgetOverview } from "../../types/domain";

type Props = {
  budget: BudgetOverview;
  onPress?: () => void;
};

export function BudgetCard({ budget, onPress }: Props) {
  const statusColor = budget.isOverLimit
    ? COLORS.danger
    : budget.isNearLimit
      ? COLORS.warning
      : COLORS.success;

  return (
    <Card onPress={onPress}>
      <View style={styles.header}>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {budget.name}
          </Text>
          <Text style={styles.scope}>{budget.scopeLabel}</Text>
        </View>
        <View style={styles.amounts}>
          <Text style={[styles.percent, { color: statusColor }]}>
            {Math.round(budget.usedPercent)}%
          </Text>
        </View>
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
          <AlertTriangle size={12} color={COLORS.danger} />
          <Text style={styles.overLimitLabel}>Presupuesto excedido</Text>
        </View>
      ) : budget.isNearLimit ? (
        <View style={styles.alertRow}>
          <Zap size={12} color={COLORS.warning} />
          <Text style={styles.nearLimitLabel}>Cerca del límite</Text>
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
    gap: 2,
  },
  name: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  },
  scope: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  amounts: {
    alignItems: "flex-end",
  },
  percent: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
  },
  progressWrap: {
    marginBottom: SPACING.sm,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  spent: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
  },
  limit: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  alertRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: SPACING.sm,
  },
  overLimitLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    fontWeight: FONT_WEIGHT.semibold,
  },
  nearLimitLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
