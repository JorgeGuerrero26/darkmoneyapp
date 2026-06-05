import { StyleSheet, Text, View } from "react-native";

import { Card } from "../../../components/ui/Card";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../../constants/theme";
import type { BudgetOverview } from "../../../types/domain";

type Props = {
  budget: BudgetOverview;
};

export function BudgetDetailQuickStats({ budget }: Props) {
  const remainingColor = budget.remainingAmount < 0 ? COLORS.expense : COLORS.income;

  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={styles.label}>Límite</Text>
          <Text style={styles.value}>{formatCurrency(budget.limitAmount, budget.currencyCode)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cell}>
          <Text style={styles.label}>Gastado</Text>
          <Text style={styles.value}>{formatCurrency(budget.spentAmount, budget.currencyCode)}</Text>
        </View>
      </View>
      <View style={[styles.row, styles.rowBottom]}>
        <View style={styles.cell}>
          <Text style={styles.label}>{budget.remainingAmount < 0 ? "Excedido por" : "Restante"}</Text>
          <Text style={[styles.value, { color: remainingColor }]}>
            {formatCurrency(Math.abs(budget.remainingAmount), budget.currencyCode)}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.cell}>
          <Text style={styles.label}>Movimientos</Text>
          <Text style={styles.value}>{budget.movementCount}</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  rowBottom: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cell: {
    flex: 1,
    gap: SPACING.xs,
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.sm,
  },
  label: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  value: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  },
});
