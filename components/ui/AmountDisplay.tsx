import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT } from "../../constants/theme";
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
  size?: "sm" | "md" | "lg" | "xl" | "display";
  style?: StyleProp<TextStyle>;
  /** Sobrescribe el color derivado del tipo. Para quien ya lo calculo con mas contexto. */
  color?: string;
  /** Idem con el signo. "" fuerza sin signo; undefined deja el derivado del tipo. */
  prefix?: string;
};

import {
  formatCurrency as formatCurrencyPure,
  formatCurrencyParts,
  maskedCurrencyLabel,
} from "../../lib/format-currency";
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

/**
 * La cifra SIN el símbolo de moneda: "6,800.00".
 *
 * Para la cinta de resumen, donde la moneda ya la lleva la etiqueta ("NETO PEN"). Repetir el
 * símbolo en cada columna no añade nada y sí quita ancho: con tres columnas en 393px, un
 * "S/ 3,143.50" a 20px no entra, y la cifra —que es lo único que importa ahí— acaba
 * encogiéndose hasta desaparecer.
 *
 * Respeta el modo privacidad igual que `formatCurrency`.
 */
export function formatAmountPlain(amount: number, currencyCode: string, signed = false): string {
  if (useUiStore.getState().privacyMode) return "••••";
  const { integer, fraction } = formatCurrencyParts(amount, currencyCode);
  const sign = signed ? (amount < 0 ? "−" : "+") : amount < 0 ? "−" : "";
  return `${sign}${integer}${fraction}`;
}

export function AmountDisplay({
  amount,
  currencyCode,
  movementType,
  sourceAmount,
  destinationAmount,
  size = "md",
  style,
  color: colorOverride,
  prefix: prefixOverride,
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

  if (colorOverride) color = colorOverride;
  if (prefixOverride !== undefined) prefix = prefixOverride;

  const fontSize = SIZE_PX[size];

  // Modo privacidad: la cifra es "S/ ••••" y no hay nada que jerarquizar.
  if (useUiStore.getState().privacyMode) {
    return (
      <Text style={[styles.base, { fontSize, color }, style]}>
        {maskedCurrencyLabel(currencyCode)}
      </Text>
    );
  }

  const { symbol, integer, fraction } = formatCurrencyParts(displayAmount, currencyCode);

  return (
    <Text style={[styles.base, { fontSize, color }, style]}>
      {/* El signo va a tamaño completo a propósito: es información, no puntuación. */}
      {prefix ? <Text style={styles.sign}>{prefix}</Text> : null}
      {/* 43 % y peso medio: sabes en qué moneda estás sin que la moneda compita. */}
      <Text style={[styles.symbol, { fontSize: Math.round(fontSize * 0.43) }]}>{symbol} </Text>
      {/* Lo único a tamaño completo. El tracking negativo aprieta la cifra en columna. */}
      <Text style={[styles.integer, { letterSpacing: -0.035 * fontSize }]}>{integer}</Text>
      {/* 48 % y tinta al 55 %: presentes para la exactitud, invisibles para el vistazo. */}
      {fraction ? (
        <Text style={[styles.fraction, { fontSize: Math.round(fontSize * 0.48), color: color + "8C" }]}>
          {fraction}
        </Text>
      ) : null}
    </Text>
  );
}

const SIZE_PX: Record<NonNullable<Props["size"]>, number> = {
  sm: FONT_SIZE.sm,
  md: FONT_SIZE.md,
  lg: FONT_SIZE.lg,
  xl: FONT_SIZE.xxl,
  display: FONT_SIZE.display,
};

const styles = StyleSheet.create({
  base: {
    fontFamily: FONT_FAMILY.heading,
    fontWeight: FONT_WEIGHT.semibold,
  },
  sign:    { fontFamily: FONT_FAMILY.heading },
  symbol:  { fontFamily: FONT_FAMILY.headingMedium, color: COLORS.storm },
  integer: { fontFamily: FONT_FAMILY.heading },
  fraction:{ fontFamily: FONT_FAMILY.heading },
});
