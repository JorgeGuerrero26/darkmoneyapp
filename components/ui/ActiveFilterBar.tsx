import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS, ELEVATION, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

export type ActiveFilterItem = {
  key: string;
  label: string;
  onRemove: () => void;
};

type Props = {
  items: ActiveFilterItem[];
  clearLabel?: string;
  onClear?: () => void;
};

export function ActiveFilterBar({ items, clearLabel = "Limpiar", onClear }: Props) {
  if (items.length === 0) return null;

  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        {items.map((item) => (
          <TouchableOpacity key={item.key} style={styles.chip} onPress={item.onRemove} activeOpacity={0.84}>
            <Text style={styles.chipText}>{item.label} x</Text>
          </TouchableOpacity>
        ))}
        {onClear ? (
          <TouchableOpacity onPress={onClear} activeOpacity={0.84}>
            <Text style={styles.clearText}>{clearLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingVertical: SPACING.xs,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.xs,
    alignItems: "center",
  },
  chip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "18",
    ...ELEVATION[1],
  },
  chipText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  clearText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
    paddingHorizontal: SPACING.xs,
  },
});
