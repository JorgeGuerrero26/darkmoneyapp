import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { COLORS, FONT_SIZE, FONT_WEIGHT } from "../../constants/theme";
import type { MovementType } from "../../types/domain";

type Props = {
  amount: number;
  currencyCode: string;
  movementType?: MovementType;
  size?: "sm" | "md" | "lg" | "xl";
  style?: StyleProp<TextStyle>;
};

export function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function AmountDisplay({ amount, currencyCode, movementType, size = "md", style }: Props) {
  let color = COLORS.text;
  let prefix = "";

  if (movementType === "income" || movementType === "refund") {
    color = COLORS.income;
    prefix = "+";
  } else if (movementType === "expense" || movementType === "subscription_payment" || movementType === "obligation_payment") {
    color = COLORS.expense;
    prefix = "-";
  } else if (movementType === "transfer") {
    color = COLORS.transfer;
  }

  const formatted = formatCurrency(Math.abs(amount), currencyCode);

  return (
    <Text style={[styles.base, styles[size], { color }, style]}>
      {prefix}{formatted}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontWeight: FONT_WEIGHT.semibold,
  },
  sm: { fontSize: FONT_SIZE.sm },
  md: { fontSize: FONT_SIZE.md },
  lg: { fontSize: FONT_SIZE.lg },
  xl: { fontSize: FONT_SIZE.xxl },
});
