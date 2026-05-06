import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

export type ResourceCardAction = {
  key: string;
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
};

type Props = {
  title: string;
  subtitle?: string | null;
  leading?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  actions?: ResourceCardAction[];
  footer?: ReactNode;
  selected?: boolean;
  archived?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function ResourceCard({
  title,
  subtitle,
  leading,
  meta,
  trailing,
  actions = [],
  footer,
  selected,
  archived,
  disabled,
  onPress,
  onLongPress,
  style,
  contentStyle,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        archived && styles.archived,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      delayLongPress={400}
      accessibilityRole={onPress ? "button" : undefined}
    >
      <View style={[styles.mainRow, contentStyle]}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}

        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? <View style={styles.meta}>{meta}</View> : null}
        </View>

        {actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Pressable
                  key={action.key}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
                  onPress={(event) => {
                    event.stopPropagation();
                    action.onPress();
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={action.accessibilityLabel}
                >
                  <Icon size={14} color={action.color ?? COLORS.storm} strokeWidth={2} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Pressable>
  );
}

export function ResourceCardIcon({
  icon: Icon,
  color,
}: {
  icon: LucideIcon;
  color: string;
}) {
  return (
    <View style={[styles.iconWrap, { backgroundColor: color + "18" }]}>
      <Icon size={20} color={color} strokeWidth={2} />
    </View>
  );
}

export function ResourceCardBadge({
  label,
  color,
  icon: Icon,
}: {
  label: string;
  color: string;
  icon?: LucideIcon;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: color + "15" }]}>
      {Icon ? <Icon size={9} color={color} strokeWidth={2} /> : null}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function ResourceCardMetaText({
  children,
}: {
  children: ReactNode;
}) {
  return <Text style={styles.metaText} numberOfLines={1}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.xl,
    backgroundColor: GLASS.card,
    padding: SPACING.lg,
    // Non-uniform borders — top edge brighter (specular reflection of light from above)
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: "rgba(255,255,255,0.20)",    // brightest — light hits top
    borderLeftColor: "rgba(255,255,255,0.12)",   // medium — side light
    borderRightColor: "rgba(255,255,255,0.09)",  // slightly dimmer
    borderBottomColor: "rgba(255,255,255,0.05)", // dimmest — opposite to light source
    // Deep diffuse shadow for floating depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.48,
    shadowRadius: 20,
    elevation: 10,
  },
  selected: {
    borderTopColor: "rgba(107,228,197,0.38)",
    borderLeftColor: "rgba(107,228,197,0.25)",
    borderRightColor: "rgba(107,228,197,0.20)",
    borderBottomColor: "rgba(107,228,197,0.14)",
    backgroundColor: COLORS.primary + "10",
  },
  archived: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.48,
  },
  pressed: {
    opacity: 0.82,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  leading: {
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  actionButton: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  actionPressed: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  trailing: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  footer: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: GLASS.separator,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.1,
  },
  metaText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    flexShrink: 1,
  },
});
