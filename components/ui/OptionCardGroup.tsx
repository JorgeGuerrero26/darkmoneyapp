import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

export type OptionCardItem<T extends string | number> = {
  value: T;
  title: string;
  description?: string;
  badgeLabel?: string;
  badgeColor?: string;
  disabled?: boolean;
};

type Props<T extends string | number> = {
  options: OptionCardItem<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

export function OptionCardGroup<T extends string | number>({
  options,
  value,
  onChange,
  style,
}: Props<T>) {
  return (
    <View style={[styles.root, style]}>
      {options.map((option) => {
        const selected = value === option.value;
        const badgeColor = option.badgeColor ?? COLORS.storm;
        return (
          <TouchableOpacity
            key={String(option.value)}
            style={[styles.card, selected && styles.cardSelected, option.disabled && styles.disabled]}
            onPress={() => {
              if (!option.disabled) onChange(option.value);
            }}
            activeOpacity={0.84}
            disabled={option.disabled}
          >
            <View style={styles.header}>
              <Text style={[styles.title, selected && styles.titleSelected]}>{option.title}</Text>
              {selected ? <View style={styles.checkDot} /> : null}
            </View>
            {option.description ? <Text style={styles.description}>{option.description}</Text> : null}
            {option.badgeLabel ? (
              <View style={[styles.badge, { borderColor: badgeColor + "55" }]}>
                <Text style={[styles.badgeText, { color: badgeColor }]}>{option.badgeLabel}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.sm,
  },
  card: {
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    gap: SPACING.xs,
  },
  cardSelected: {
    borderColor: COLORS.pine,
    backgroundColor: COLORS.pine + "18",
  },
  disabled: {
    opacity: 0.45,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  titleSelected: {
    color: COLORS.ink,
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.pine,
  },
  description: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  badge: {
    alignSelf: "flex-start",
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    backgroundColor: "transparent",
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
  },
});
