import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Action = {
  label: string;
  accessibilityLabel: string;
  icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

type Props = {
  bottomInset?: number;
  primary?: Action;
  secondary?: Action;
  primarySide?: "left" | "right";
  footNote?: string | null;
  footerAction?: { label: string; accessibilityLabel: string; onPress: () => void };
  showFooter?: boolean;
};

/** Acciones fijas de las pantallas de detalle; la acción principal siempre va en hueso. */
export function DetailActionBar({ bottomInset = 0, primary, secondary, primarySide = "left", footNote, footerAction, showFooter = false }: Props) {
  return (
    <View style={[styles.bar, { paddingBottom: bottomInset + SPACING.xs }]}>
      {primary || secondary ? (
        <View style={styles.row}>
          {primarySide === "right" && secondary ? <ActionButton action={secondary} /> : null}
          {primary ? <ActionButton action={primary} primary /> : null}
          {primarySide === "left" && secondary ? <ActionButton action={secondary} /> : null}
        </View>
      ) : null}
      {showFooter || footNote || footerAction ? (
        <View style={styles.footRow}>
          <Text style={styles.footNote}>{footNote ?? ""}</Text>
          {footerAction ? (
            <TouchableOpacity
              style={styles.footerAction}
              onPress={footerAction.onPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={footerAction.accessibilityLabel}
            >
              <Text style={styles.footerActionLabel}>{footerAction.label}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({ action, primary = false }: { action: Action; primary?: boolean }) {
  const Icon = action.icon;
  return (
    <TouchableOpacity
      style={[styles.btn, primary ? styles.primary : styles.secondary, (action.disabled || action.loading) && styles.disabled]}
      onPress={action.onPress}
      disabled={action.disabled || action.loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={action.accessibilityLabel}
    >
      {action.loading ? <ActivityIndicator size="small" color={primary ? COLORS.actionText : COLORS.fog} /> : <Icon size={16} color={primary ? COLORS.actionText : COLORS.fog} />}
      <Text style={[styles.btnLabel, primary ? styles.primaryLabel : styles.secondaryLabel]}>{action.label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    gap: SPACING.xs,
  },
  row: { flexDirection: "row", gap: SPACING.sm },
  btn: {
    flex: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  primary: { backgroundColor: COLORS.action },
  secondary: { borderWidth: 1, borderColor: SURFACE.cardBorder, backgroundColor: SURFACE.card },
  btnLabel: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  primaryLabel: { color: COLORS.actionText },
  secondaryLabel: { color: COLORS.fog },
  disabled: { opacity: 0.6 },
  footRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  footNote: { flexShrink: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  footerAction: { minHeight: 40, alignItems: "center", justifyContent: "center" },
  footerActionLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
});
