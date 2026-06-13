import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { Card } from "./Card";

export type DetailQuickAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
};

type Props = {
  actions: DetailQuickAction[];
  title?: string;
  style?: StyleProp<ViewStyle>;
};

export function DetailQuickActions({ actions, title = "Acciones rapidas", style }: Props) {
  if (actions.length === 0) return null;

  return (
    <Card style={[styles.card, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.grid}>
        {actions.map((action) => {
          const Icon = action.icon;
          const color = action.color ?? COLORS.primary;
          return (
            <Pressable
              key={action.key}
              onPress={action.onPress}
              disabled={action.disabled}
              style={({ pressed }) => [
                styles.action,
                { borderColor: color + "55", backgroundColor: color + "10" },
                pressed && styles.actionPressed,
                action.disabled && styles.actionDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel ?? action.label}
            >
              <Icon size={17} color={color} strokeWidth={2} />
              <Text style={[styles.actionLabel, { color }]} numberOfLines={1}>
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: SPACING.sm,
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  action: {
    flexGrow: 1,
    flexBasis: 92,
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  actionPressed: {
    opacity: 0.68,
  },
  actionDisabled: {
    opacity: 0.42,
  },
  actionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
});
