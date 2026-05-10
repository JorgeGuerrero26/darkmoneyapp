import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

export type BulkAction = {
  key: string;
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  tone?: "neutral" | "danger" | "primary";
  disabled?: boolean;
};

type Props = {
  selectedCount: number;
  onClear: () => void;
  actions: BulkAction[];
};

export function BulkActionBar({ selectedCount, onClear, actions }: Props) {
  if (selectedCount <= 0) return null;

  return (
    <View style={styles.root}>
      <Text style={styles.count}>{selectedCount} seleccionado{selectedCount === 1 ? "" : "s"}</Text>
      <View style={styles.actions}>
        {actions.map((action) => {
          const Icon = action.icon;
          const color =
            action.tone === "danger"
              ? COLORS.danger
              : action.tone === "primary"
                ? COLORS.primary
                : COLORS.ink;
          return (
            <TouchableOpacity
              key={action.key}
              style={[styles.action, action.disabled && styles.disabled]}
              onPress={action.onPress}
              disabled={action.disabled}
              activeOpacity={0.84}
            >
              {Icon ? <Icon size={14} color={color} strokeWidth={2} /> : null}
              <Text style={[styles.actionText, { color }]}>{action.label}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.clear} onPress={onClear} activeOpacity={0.84}>
          <Text style={styles.clearText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    gap: SPACING.sm,
  },
  count: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  disabled: {
    opacity: 0.45,
  },
  actionText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  clear: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  clearText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
});
