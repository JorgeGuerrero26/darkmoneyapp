import { StyleSheet, Text, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";

import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Props = {
  label: string;
  currentBalance: number;
  projectedBalance: number;
  currencyCode: string;
  /**
   * La fila vive dentro de un grupo: sin caja propia, que la dibuja el grupo.
   *
   * Dos saldos con su propio borde apilados dibujan dos cajas, y el mockup pide una con las dos
   * cuentas dentro. El aviso de saldo negativo conserva su fondo: es lo único de aquí que sí es
   * una alarma.
   */
  grouped?: boolean;
};

/**
 * Cómo queda un saldo después del movimiento.
 *
 * **En una transferencia nadie gana ni pierde.** Antes el saldo que baja iba en rojo y el que
 * sube en verde, pero es la misma plata cambiándose de bolsillo: el patrimonio no se mueve un
 * centavo, y pintarlo así decía que la mitad de la operación fue una pérdida.
 *
 * Ahora los montos van **en hueso**, con el saldo anterior tachado al costado para que se vea el
 * movimiento sin teñirlo. El rojo se reserva para lo único que sí es un problema: que el saldo
 * quede **negativo de verdad**.
 */
export function BalanceImpactPreview({
  label,
  currentBalance,
  projectedBalance,
  currencyCode,
  grouped = false,
}: Props) {
  const isNegative = projectedBalance < 0;

  return (
    <View
      style={[
        styles.container,
        grouped && !isNegative && styles.containerGrouped,
        isNegative && styles.containerWarning,
      ]}
    >
      {isNegative ? (
        <View style={styles.warningRow}>
          <AlertTriangle size={13} color={COLORS.danger} />
          <Text style={styles.warning}>El saldo quedaría negativo</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <Text style={styles.accountLabel} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.amounts}>
          <Text style={styles.previous}>{formatCurrency(currentBalance, currencyCode)}</Text>
          <Text style={[styles.projected, isNegative && styles.projectedNegative]}>
            {formatCurrency(projectedBalance, currencyCode)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    gap: SPACING.xs,
  },
  containerGrouped: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  containerWarning: {
    borderColor: COLORS.danger,
    backgroundColor: COLORS.dangerMuted,
  },
  warningRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  warning: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  accountLabel: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.fog, fontFamily: FONT_FAMILY.body },
  amounts: { flexDirection: "row", alignItems: "baseline", gap: SPACING.sm },
  // Tachado y en gris: se ve de dónde viene el saldo sin que compita con el resultado.
  previous: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.headingMedium,
    textDecorationLine: "line-through",
  },
  projected: {
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
  },
  projectedNegative: { color: COLORS.danger },
});
