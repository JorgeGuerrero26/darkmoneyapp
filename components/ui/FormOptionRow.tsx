import type { ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Props = {
  label: string;
  /** Lo elegido ahora mismo. Si falta, la fila dice qué pasa cuando no eliges. */
  value?: string | null;
  placeholder?: string;
  /** Frase corta bajo la etiqueta. Solo si aporta algo que el nombre del campo no dice. */
  support?: string;
  /** Muestra de lo elegido: el color y el icono de una categoría, la bandera de una moneda. */
  leading?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
};

/**
 * La fila que muestra lo elegido y abre la lista al tocarla.
 *
 * Es la respuesta a dos de las cuatro reglas de la Revisión 05: **"lo obligatorio primero"** —la
 * apariencia baja a una fila en vez de abrir con 400 px de cuadrícula— y **"pasadas seis
 * opciones, selector"**, que ya se había aplicado a los filtros y a la moneda base.
 *
 * Un campo que se responde una vez no merece ocupar la pantalla mientras no se responde.
 */
export function FormOptionRow({
  label,
  value,
  placeholder = "Elegir",
  support,
  leading,
  onPress,
  disabled = false,
}: Props) {
  return (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? placeholder}`}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        {support ? <Text style={styles.support}>{support}</Text> : null}
      </View>
      <Text style={[styles.value, !value && styles.valuePlaceholder]} numberOfLines={1}>
        {value || placeholder}
      </Text>
      <ChevronRight size={16} color={COLORS.storm} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  rowDisabled: { opacity: 0.5 },
  leading: { flexShrink: 0 },
  copy: { flex: 1, gap: 2 },
  label: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  support: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  value: {
    flexShrink: 1,
    maxWidth: "45%",
    textAlign: "right",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
  },
  valuePlaceholder: { color: COLORS.storm, fontFamily: FONT_FAMILY.body },
});
