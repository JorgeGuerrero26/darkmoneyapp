import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { BottomSheet } from "./BottomSheet";

export type MetricSummaryBarItem = {
  key: string;
  value: string;
  label: string;
  compactLabel?: string;
  color?: string;
  icon?: LucideIcon;
  strong?: boolean;
  helpTitle?: string;
  helpDescription?: string;
};

export type MetricSummaryBarAction = {
  key: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

type Props = {
  items: MetricSummaryBarItem[];
  trailingLabel?: string | null;
  actions?: MetricSummaryBarAction[];
};

export function MetricSummaryBar({ items, trailingLabel, actions = [] }: Props) {
  const [selectedHelpItem, setSelectedHelpItem] = useState<MetricSummaryBarItem | null>(null);

  if (items.length === 0) return null;
  const showActions = actions.length > 0;

  return (
    <>
      <View style={styles.root}>
        {items.map((item, index) => {
          const Icon = item.icon;
          const hasHelp = Boolean(item.helpTitle || item.helpDescription);
          const itemContent = (
            <View style={[styles.item, hasHelp && styles.itemWithHelp]}>
              {Icon ? <Icon size={11} color={item.color ?? COLORS.storm} strokeWidth={2.5} /> : null}
              <Text
                style={[item.strong ? styles.valueStrong : styles.value, item.color ? { color: item.color } : null]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.1}
              >
                {item.value}
              </Text>
              <Text
                style={styles.label}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                maxFontSizeMultiplier={1.1}
              >
                {item.compactLabel ?? item.label}
              </Text>
            </View>
          );

          return (
            <View key={item.key} style={styles.itemWrap}>
              {index > 0 ? <View style={styles.separator} /> : null}
              {hasHelp ? (
                <Pressable
                  style={styles.helpPressable}
                  onPress={() => setSelectedHelpItem(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Explicar ${item.label}`}
                >
                  {itemContent}
                </Pressable>
              ) : itemContent}
            </View>
          );
        })}
        {trailingLabel ? <Text style={styles.trailing}>{trailingLabel}</Text> : null}
        {showActions ? (
          <View style={styles.actions}>
            {actions.map((action) => (
              <Pressable
                key={action.key}
                style={[styles.action, action.active && styles.actionActive, action.disabled && styles.actionDisabled]}
                onPress={action.onPress}
                disabled={action.disabled}
              >
                <Text style={[styles.actionText, action.active && styles.actionTextActive, action.destructive && styles.actionTextDestructive]}>
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <BottomSheet
        visible={Boolean(selectedHelpItem)}
        onClose={() => setSelectedHelpItem(null)}
        title={selectedHelpItem?.helpTitle ?? selectedHelpItem?.label}
        snapHeight={0.34}
      >
        <View style={styles.helpContent}>
          <View style={styles.helpMetricRow}>
            <Text style={[styles.helpMetricValue, selectedHelpItem?.color ? { color: selectedHelpItem.color } : null]}>
              {selectedHelpItem?.value}
            </Text>
            <Text style={styles.helpMetricLabel}>{selectedHelpItem?.label}</Text>
          </View>
          {selectedHelpItem?.helpDescription ? (
            <Text style={styles.helpDescription}>{selectedHelpItem.helpDescription}</Text>
          ) : null}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xs + 2,
    backgroundColor: SURFACE.separator,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: SURFACE.sheetBorder,
    gap: SPACING.sm,
  },
  itemWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    gap: SPACING.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  itemWithHelp: {
    paddingVertical: 2,
  },
  helpPressable: {
    flex: 1,
    minWidth: 0,
  },
  separator: {
    width: 0.5,
    height: 16,
    backgroundColor: SURFACE.cardBorder,
  },
  // lineHeight explicito: sin el, las fuentes custom con fontScale grande (MIUI)
  // dibujan glifos mas altos que la caja de linea y el texto sale cortado.
  value: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    lineHeight: FONT_SIZE.xs + 6,
    color: COLORS.ink,
  },
  valueStrong: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm + 6,
    color: COLORS.ink,
  },
  label: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    lineHeight: 15,
    color: COLORS.textDisabled,
    flexShrink: 1,
    minWidth: 0,
  },
  trailing: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 9,
    color: COLORS.textDisabled,
    marginLeft: "auto",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: "auto",
  },
  action: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  actionActive: {
    backgroundColor: COLORS.pine + "22",
    borderColor: COLORS.pine + "55",
  },
  actionDisabled: {
    opacity: 0.42,
  },
  actionText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  actionTextActive: {
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.pine,
  },
  actionTextDestructive: {
    color: COLORS.danger,
  },
  helpContent: {
    gap: SPACING.md,
  },
  helpMetricRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: SPACING.xs,
  },
  helpMetricValue: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
  },
  helpMetricLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  helpDescription: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    lineHeight: 21,
    color: COLORS.textMuted,
  },
});
