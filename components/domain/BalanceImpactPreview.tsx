import { StyleSheet, Text, View } from "react-native";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  label: string;
  currentBalance: number;
  projectedBalance: number;
  currencyCode: string;
};

export function BalanceImpactPreview({
  label,
  currentBalance,
  projectedBalance,
  currencyCode,
}: Props) {
  const diff = projectedBalance - currentBalance;
  const isNegative = projectedBalance < 0;

  return (
    <View style={[styles.container, isNegative && styles.containerWarning]}>
      {isNegative && (
        <Text style={styles.warning}>⚠ El saldo quedaría negativo</Text>
      )}
      <Text style={styles.accountLabel}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.balanceLabel}>Actual</Text>
          <Text style={styles.balanceValue}>
            {formatCurrency(currentBalance, currencyCode)}
          </Text>
        </View>
        <Text style={styles.arrow}>→</Text>
        <View style={styles.col}>
          <Text style={styles.balanceLabel}>Proyectado</Text>
          <Text
            style={[
              styles.balanceValue,
              isNegative ? styles.negative : diff >= 0 ? styles.positive : styles.neutral,
            ]}
          >
            {formatCurrency(projectedBalance, currencyCode)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  containerWarning: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerMuted,
  },
  warning: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    fontWeight: FONT_WEIGHT.semibold,
  },
  accountLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  col: { flex: 1, gap: 2 },
  balanceLabel: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  balanceValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  },
  arrow: { fontSize: FONT_SIZE.lg, color: COLORS.textMuted },
  positive: { color: COLORS.income },
  negative: { color: COLORS.danger },
  neutral: { color: COLORS.text },
});
