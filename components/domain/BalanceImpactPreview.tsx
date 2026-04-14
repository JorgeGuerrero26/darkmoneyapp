import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle, ArrowRight } from "lucide-react-native";
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
  const isDecreasing = diff < 0;

  return (
    <View style={[styles.container, isNegative && styles.containerWarning]}>
      {isNegative && (
        <View style={styles.warningRow}>
          <AlertTriangle size={13} color={COLORS.danger} />
          <Text style={styles.warning}>El saldo quedaría negativo</Text>
        </View>
      )}
      <Text style={styles.accountLabel}>{label}</Text>
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={styles.balanceLabel}>Actual</Text>
          <Text style={styles.balanceValue}>
            {formatCurrency(currentBalance, currencyCode)}
          </Text>
        </View>
        <ArrowRight size={16} color={COLORS.textMuted} />
        <View style={styles.col}>
          <Text style={styles.balanceLabel}>Proyectado</Text>
          <Text
            style={[
              styles.balanceValue,
              isNegative ? styles.negative : isDecreasing ? styles.negative : styles.positive,
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
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
  positive: { color: COLORS.income },
  negative: { color: COLORS.danger },
  neutral: { color: COLORS.text },
});
