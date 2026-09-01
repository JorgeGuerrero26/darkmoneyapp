import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../../constants/theme";

type Props = {
  label: string;
  value: string;
  /** El valor es un hueco, no un dato: "Agregar", "No", "Sin categoría". Va en gris. */
  muted?: boolean;
  /**
   * La fila hace algo que el formulario de edición no hace: adjuntar un comprobante, asociar el
   * movimiento a un crédito. Ahí el peso lo lleva la etiqueta, que es la acción, y el valor dice
   * en qué estado está.
   */
  action?: boolean;
  /** Si falta, la fila no se toca y no lleva chevron. */
  onPress?: () => void;
  /** Última de la lista: sin línea debajo. */
  last?: boolean;
};

/**
 * Una fila del detalle: el nombre del dato a la izquierda, el dato a la derecha.
 *
 * Al revés que en un formulario, donde el nombre del campo manda y el valor lo acompaña: aquí lo
 * que se viene a leer es el dato, así que el rótulo va en gris y el valor en hueso.
 *
 * **Sin chevrón y sin toque**, porque no son botones. Había tres maneras de llegar al mismo
 * formulario —"Toca para editar" bajo el monto, el botón "Editar" y la tarjeta de datos— y
 * ninguna llevaba al campo que tocaste: las tres abrían el formulario completo. El chevrón se
 * reserva para las dos filas que sí hacen algo distinto: adjuntar un comprobante y asociar el
 * movimiento a un crédito, que abren su propia hoja y no están en la edición.
 */
export function MovementDetailRow({
  label,
  value,
  muted = false,
  action = false,
  onPress,
  last = false,
}: Props) {
  const body = (
    <>
      <Text style={[styles.label, action && styles.labelAction]}>{label}</Text>
      <Text style={[styles.value, (muted || action) && styles.valueMuted]} numberOfLines={2}>
        {value}
      </Text>
      {onPress ? <ChevronRight size={16} color={COLORS.storm} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, !last && styles.rowDivided]}>{body}</View>;
  }

  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowDivided]}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  rowDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  label: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.storm,
  },
  value: {
    flexShrink: 1,
    maxWidth: "55%",
    textAlign: "right",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  labelAction: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  valueMuted: { fontFamily: FONT_FAMILY.body, color: COLORS.storm },
});
