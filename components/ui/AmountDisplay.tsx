import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { COLORS, FONT_SIZE, FONT_WEIGHT } from "../../constants/theme";
import type { MovementType } from "../../types/domain";
import {
  movementDisplayAmount,
  movementDisplayColor,
  movementDisplayPrefix,
} from "../../lib/movement-display";

type Props = {
  amount: number;
  currencyCode: string;
  movementType?: MovementType;
  sourceAmount?: number | null;
  destinationAmount?: number | null;
  size?: "sm" | "md" | "lg" | "xl";
  style?: StyleProp<TextStyle>;
};

import { formatCurrency as formatCurrencyPure, maskedCurrencyLabel } from "../../lib/format-currency";
import { useUiStore } from "../../store/ui-store";

/**
 * Versión con modo privacidad del formateador puro: los 81 consumidores de UI
 * importan desde aquí. Lectura imperativa del store — el re-render lo fuerzan
 * las suscripciones de pantalla/fila (ver useUiStore((s) => s.privacyMode)).
 */
export function formatCurrency(amount: number, currencyCode: string): string {
  if (useUiStore.getState().privacyMode) return maskedCurrencyLabel(currencyCode);
  return formatCurrencyPure(amount, currencyCode);
}

export function AmountDisplay({
  amount,
  currencyCode,
  movementType,
  sourceAmount,
  destinationAmount,
  size = "md",
  style,
}: Props) {
  let color = COLORS.text;
  let prefix = "";
  let displayAmount = Math.abs(amount);

  if (movementType === "obligation_payment") {
    color = movementDisplayColor({
      movementType,
      sourceAmount,
      destinationAmount,
    });
    prefix = movementDisplayPrefix({
      movementType,
      sourceAmount,
      destinationAmount,
    });
    displayAmount = movementDisplayAmount({
      movementType,
      sourceAmount,
      destinationAmount,
    });
  } else if (movementType === "income" || movementType === "refund") {
    color = COLORS.income;
    prefix = "+";
  } else if (movementType === "expense" || movementType === "subscription_payment") {
    color = COLORS.expense;
    prefix = "-";
  } else if (movementType === "transfer") {
    color = COLORS.transfer;
  }

  const formatted = formatCurrency(displayAmount, currencyCode);

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
