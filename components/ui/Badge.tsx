import { StyleSheet, Text, View } from "react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS } from "../../constants/theme";

type Props = {
  count: number;
};

export function Badge({ count }: Props) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);

  return (
    <View style={styles.badge}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    // Rojo, no amarillo. El amarillo significa "vence en <= 7 dias" (lib/due-tone) y un
    // contador de notificaciones no es un vencimiento. Ademas la campana del inicio ya usa
    // este rojo: el mismo dato con el mismo color en las dos pantallas.
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.full,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.textInverse,
    fontSize: FONT_SIZE.xs - 1,
  },
});
