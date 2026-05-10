import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

export type PillSelectorOption<T extends string | number> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type Props<T extends string | number> = {
  options: PillSelectorOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  horizontal?: boolean;
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function PillSelector<T extends string | number>({
  options,
  value,
  onChange,
  horizontal = true,
  wrap = false,
  style,
  contentContainerStyle,
}: Props<T>) {
  const content = (
    <View style={[wrap ? styles.wrapRow : styles.row, contentContainerStyle]}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <TouchableOpacity
            key={String(option.value)}
            style={[styles.pill, active && styles.pillActive, option.disabled && styles.disabled]}
            onPress={() => {
              if (option.disabled) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            activeOpacity={0.84}
            disabled={option.disabled}
          >
            <Text style={[styles.pillText, active && styles.pillTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  if (!horizontal) {
    return <View style={style}>{content}</View>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style}>
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  wrapRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  pillActive: {
    backgroundColor: COLORS.pine,
    borderColor: COLORS.pine,
  },
  disabled: {
    opacity: 0.45,
  },
  pillText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  pillTextActive: {
    color: COLORS.textInverse,
  },
});
