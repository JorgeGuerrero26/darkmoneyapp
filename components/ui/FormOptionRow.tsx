import { useRef, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { FieldFeedbackMessage, useFormField } from "./FormFeedback";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Props = {
  label: string;
  fieldId?: string;
  /** Lo elegido ahora mismo. Si falta, la fila dice qué pasa cuando no eliges. */
  value?: string | null;
  placeholder?: string;
  /** Frase corta bajo la etiqueta. Solo si aporta algo que el nombre del campo no dice. */
  support?: string;
  /** Muestra de lo elegido: el color y el icono de una categoría, la bandera de una moneda. */
  leading?: ReactNode;
  /**
   * Ocupa el sitio del valor, a la derecha. Para lo que se enseña en vez de decirse: la
   * apariencia elegida es su propio ícono, no la palabra "Cambiar".
   */
  trailing?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  /**
   * La fila vive dentro de un grupo: sin caja propia, separada por una línea fina.
   *
   * Tres filas con su propio borde apiladas dibujan tres cajas; el grupo dibuja UNA y el
   * borde interior lo pone el separador.
   */
  grouped?: boolean;
  /** Última del grupo: sin línea debajo. */
  last?: boolean;
  /**
   * Fila de acción, no de campo: la etiqueta va apagada.
   *
   * "Repartir entre varias categorías" no guarda un valor, abre un editor. En hueso pleno se
   * lee como un campo más del grupo.
   */
  muted?: boolean;
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
  fieldId,
  value,
  placeholder = "Elegir",
  support,
  leading,
  trailing,
  onPress,
  disabled = false,
  grouped = false,
  last = false,
  muted = false,
}: Props) {
  const fieldRef = useRef<View>(null);
  const feedback = useFormField(fieldId, onPress, fieldRef, true);
  const invalid = feedback?.kind === "invalid";
  const missing = feedback?.kind === "missing";
  return (
    <TouchableOpacity ref={fieldRef}
      style={[
        styles.row,
        grouped ? styles.rowGrouped : styles.rowStandalone,
        grouped && !last && styles.rowDivided,
        invalid && { backgroundColor: COLORS.dangerStrong + "12" },
        disabled && styles.rowDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={missing ? `${label}: ${feedback.message}` : trailing ? label : `${label}: ${value || placeholder}`}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.copy}>
        <Text style={[styles.label, muted && styles.labelMuted, invalid && { color: COLORS.dangerStrong }]}>{label}</Text>
        {support && !feedback ? <Text style={styles.support}>{support}</Text> : null}
        {invalid ? <FieldFeedbackMessage feedback={feedback} /> : null}
      </View>
      {missing ? <View style={{ width: 7, height: 7, borderRadius: RADIUS.full, backgroundColor: COLORS.warning }} /> : null}
      {trailing ?? (
        <Text style={[styles.value, !value && styles.valuePlaceholder, missing && { color: COLORS.warning }]} numberOfLines={1}>
          {missing ? feedback.message : value || placeholder}
        </Text>
      )}
      <ChevronRight size={16} color={missing ? COLORS.warning : COLORS.storm} />
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
  },
  rowStandalone: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  rowGrouped: { backgroundColor: "transparent" },
  rowDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  rowDisabled: { opacity: 0.5 },
  leading: { flexShrink: 0 },
  copy: { flex: 1, gap: 2 },
  label: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  labelMuted: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.fog },
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
