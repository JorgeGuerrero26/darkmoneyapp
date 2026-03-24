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
    backgroundColor: COLORS.gold,
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
