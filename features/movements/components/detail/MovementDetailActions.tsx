import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Copy, Pencil } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";

type Props = {
  /** El borde inferior del teléfono: la barra se apoya encima, no debajo. */
  bottomInset?: number;
  onPressEdit: () => void;
  onPressDuplicate: () => void;
  onPressVoid: () => void;
};

/**
 * Editar, duplicar y anular — que no son tres acciones del mismo tamaño.
 *
 * Estaban en una fila de tres botones iguales, a la misma altura y con el mismo peso. **Solo uno
 * de los tres no se puede deshacer con otro toque**, y estaba a un centímetro de los otros dos.
 *
 * Editar es la principal y va en hueso; duplicar, en contorno; anular baja al final, en texto y
 * separada. El rojo tampoco hace falta: la posición y el peso ya dicen que es distinta, y el
 * rojo en esta app significa saldo negativo.
 */
export const MovementDetailActions = memo(function MovementDetailActions({
  bottomInset = 0,
  onPressEdit,
  onPressDuplicate,
  onPressVoid,
}: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: bottomInset + SPACING.xs }]}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, styles.primary]}
          onPress={onPressEdit}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Editar movimiento"
        >
          <Pencil size={16} color={COLORS.actionText} />
          <Text style={[styles.btnLabel, styles.primaryLabel]}>Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.secondary]}
          onPress={onPressDuplicate}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Duplicar movimiento"
        >
          <Copy size={16} color={COLORS.fog} />
          <Text style={[styles.btnLabel, styles.secondaryLabel]}>Duplicar</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.void}
        onPress={onPressVoid}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Anular movimiento"
      >
        <Text style={styles.voidLabel}>Anular movimiento</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.xs,
  },
  row: { flexDirection: "row", gap: SPACING.sm },
  btn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  primary: { backgroundColor: COLORS.action },
  secondary: { borderWidth: 1, borderColor: SURFACE.cardBorder, backgroundColor: SURFACE.card },
  btnLabel: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  primaryLabel: { color: COLORS.actionText },
  secondaryLabel: { color: COLORS.fog },
  void: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  voidLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
});
