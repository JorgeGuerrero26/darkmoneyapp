import { StyleSheet, Text, View } from "react-native";

import { useIsOnline } from "../../hooks/useIsOnline";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  /** Cuándo aplica. Por defecto siempre que no haya internet; algunos formularios solo lo necesitan según lo elegido. */
  when?: boolean;
  title?: string;
  message: string;
};

/**
 * Aviso AMARILLO dentro del formulario: «esto necesita internet y ahora no hay».
 *
 * Es para lo que la app ya sabe de antemano que no puede hacerse sin conexión (subir fotos, editar un pago, mover dinero
 * al crear una deuda): se avisa al abrir el formulario, para que nadie descubra el límite al guardar. El rojo queda para
 * lo que falló de verdad. Mismo color que el resto de lo relacionado con el modo sin conexión (la línea de estado).
 */
export function OfflineNotice({ when = true, title = "Sin internet", message }: Props) {
  const online = useIsOnline();
  if (online || !when) return null;
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: 4,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.warning + "14",
    borderWidth: 1,
    borderColor: COLORS.warning + "30",
  },
  title: { fontSize: FONT_SIZE.sm, color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold },
  body: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.body, lineHeight: 18 },
});
