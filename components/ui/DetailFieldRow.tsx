import type { ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";

export type DetailFieldRowProps = {
  label: string;
  value: string;
  muted?: boolean;
  action?: boolean;
  onPress?: () => void;
  last?: boolean;
  valueAdornment?: ReactNode;
};

/** Fila de lectura compartida por los detalles de movimientos y cuentas. */
export function DetailFieldRow({
  label,
  value,
  muted = false,
  action = false,
  onPress,
  last = false,
  valueAdornment,
}: DetailFieldRowProps) {
  const body = (
    <>
      <Text style={[styles.label, action && styles.labelAction]}>{label}</Text>
      {valueAdornment}
      <Text style={[styles.value, (muted || action) && styles.valueMuted]} numberOfLines={2}>
        {value}
      </Text>
      {onPress ? <ChevronRight size={16} color={COLORS.storm} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, !last && styles.rowDivided]}>{body}</View>;
  }

  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowDivided]}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      {body}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  rowDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  label: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.storm,
  },
  value: {
    flexShrink: 1,
    maxWidth: "55%",
    textAlign: "right",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  labelAction: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  valueMuted: { fontFamily: FONT_FAMILY.body, color: COLORS.storm },
});
