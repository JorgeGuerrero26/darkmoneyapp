import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import type { LucideIcon } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

export type HeaderActionItem = {
  key: string;
  icon?: LucideIcon;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  activeColor?: string;
  inactiveColor?: string;
  onPress: () => void;
};

type Props = {
  actions: HeaderActionItem[];
};

export function HeaderActionGroup({ actions }: Props) {
  if (actions.length === 0) return null;

  return (
    <View style={styles.root}>
      {actions.map((action) => {
        const Icon = action.icon;
        const activeColor = action.activeColor ?? COLORS.primary;
        const inactiveColor = action.inactiveColor ?? COLORS.storm;
        const color = action.active ? activeColor : inactiveColor;

        return (
          <TouchableOpacity
            key={action.key}
            style={[styles.action, action.active && styles.actionActive, action.disabled && styles.actionDisabled]}
            onPress={() => {
              if (action.disabled) return;
              void Haptics.selectionAsync();
              action.onPress();
            }}
            disabled={action.disabled}
            activeOpacity={0.84}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel ?? action.label ?? action.key}
          >
            {Icon ? <Icon size={14} color={color} strokeWidth={2} /> : null}
            {action.label ? (
              <Text style={[styles.label, action.active && styles.labelActive]}>
                {action.label}
              </Text>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  action: {
    minHeight: 34,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  actionActive: {
    backgroundColor: COLORS.primary + "18",
    borderColor: COLORS.primary + "44",
  },
  actionDisabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  labelActive: {
    color: COLORS.primary,
  },
});
