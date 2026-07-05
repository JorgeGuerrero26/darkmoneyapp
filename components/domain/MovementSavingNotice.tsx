import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Props = {
  savingCount: number;
};

/**
 * Indicador de creates de movimientos en vuelo (useIsMutating sobre
 * ["create-movement"]). Cubre el hueco donde el usuario cierra el formulario
 * con el request aún enviándose por red lenta: sin señal en la lista, asumía
 * que no se envió y lo registraba de nuevo → duplicado cuando el primer
 * request finalmente entraba.
 */
export function MovementSavingNotice({ savingCount }: Props) {
  if (savingCount <= 0) return null;
  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" color={COLORS.primary} />
      <View style={styles.textWrap}>
        <Text style={styles.title}>
          {savingCount === 1 ? "Guardando movimiento…" : `Guardando ${savingCount} movimientos…`}
        </Text>
        <Text style={styles.body}>
          Aún se está enviando al servidor. No lo registres de nuevo; aparecerá en la lista al confirmarse.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: SURFACE.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  textWrap: { flex: 1, gap: 2 },
  title: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  body: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    lineHeight: 16,
  },
});
