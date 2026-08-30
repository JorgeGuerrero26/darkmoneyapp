import { Pressable, StyleSheet, Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { useHaptics } from "../../hooks/useHaptics";

type Props = {
  /** Lo que se propone: el texto limpio, el nombre de la categoría. */
  label: string;
  /** Una razón corta, la más fuerte. O qué clase de sugerencia es. */
  detail?: string;
  onApply: () => void;
  /**
   * La sugerencia vive dentro de la tarjeta del campo que va a cambiar: sin caja propia, con
   * el fondo un paso más claro para que se lea como una propuesta y no como un valor puesto.
   */
  grouped?: boolean;
};

/**
 * Una sugerencia de la app, pegada al campo que modifica.
 *
 * **Se muestra cuando existe.** Mientras se calcula no se anuncia y, si no hay resultado, no se
 * ocupa espacio en decirlo: tres tarjetas de 76 px ("Revisando antes de guardar", "Buscando
 * contraparte", "Detectando recurrencia") describían procesos internos con los que el usuario
 * no podía hacer nada, y al terminar sin resultado dejaban dos líneas grises diciendo que no
 * había nada que decir.
 *
 * **Sin porcentaje.** Un número sin umbral no le dice a nadie si aceptar o revisar: ¿68 % es
 * suficiente? Si el sistema solo propone por encima de su propio corte, el número no cambia
 * ninguna decisión. Lo que sirve es la razón en palabras — "Porque corregiste esto antes"—,
 * que además es verificable.
 *
 * **Sin color.** La marca es el destello en gris. Lo que distingue una sugerencia no es el
 * color: es que trae un botón para aceptarla.
 */
export function SmartSuggestion({ label, detail, onApply, grouped = false }: Props) {
  const haptics = useHaptics();
  return (
    <View style={[styles.row, grouped ? styles.rowGrouped : styles.rowStandalone]}>
      <Sparkles size={14} color={COLORS.storm} strokeWidth={1.6} />
      <View style={styles.copy}>
        <Text style={styles.label} numberOfLines={1}>{label}</Text>
        {detail ? <Text style={styles.detail} numberOfLines={1}>{detail}</Text> : null}
      </View>
      <Pressable
        style={({ pressed }) => [styles.useBtn, pressed && styles.pressed]}
        onPress={() => { haptics.light(); onApply(); }}
        accessibilityRole="button"
        accessibilityLabel={`Usar ${label}`}
        hitSlop={6}
      >
        <Text style={styles.useText}>Usar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: SURFACE.input,
  },
  rowGrouped: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  rowStandalone: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  copy: { flex: 1, gap: 2 },
  label: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  detail: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  useBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
  },
  pressed: { opacity: 0.7 },
  useText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
});
