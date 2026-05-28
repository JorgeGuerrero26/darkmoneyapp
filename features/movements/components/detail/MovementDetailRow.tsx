import { StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../../constants/theme";

export function MovementDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function MovementDetailDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  label: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    flex: 1,
  },
  value: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.bodyMedium,
    flex: 2,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: SURFACE.separator,
    marginVertical: SPACING.sm,
  },
});
