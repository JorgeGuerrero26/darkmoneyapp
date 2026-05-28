import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../../constants/theme";

// Palette is visible to the user — these hex values are part of the design intent,
// not theme tokens, so they stay literal here.
export const ACCOUNT_COLORS = [
  "#1b6a58", "#2d9076", "#4566d6", "#6f82f1",
  "#b48b34", "#d39d3a", "#8f3e3e", "#c55f5f",
  "#8366f2", "#9c7dff", "#c46a31", "#6b7280",
];

type Props = {
  value: string;
  onChange: (color: string) => void;
  label?: string;
};

export function ColorPicker({ value, onChange, label = "Color" }: Props) {
  return (
    <View>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.grid}>
        {ACCOUNT_COLORS.map((c) => {
          const selected = value === c;
          return (
            <TouchableOpacity
              key={c}
              style={[styles.dot, { backgroundColor: c }, selected && styles.dotActive]}
              onPress={() => onChange(c)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Color ${c}`}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  grid: {
    flexDirection: "row",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
  },
  dotActive: {
    borderColor: COLORS.ink,
    borderWidth: 3,
  },
});
