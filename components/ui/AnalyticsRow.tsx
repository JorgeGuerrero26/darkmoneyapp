import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";

type Props = {
  label: string;
  value: string;
  detail?: string;
  valueColor?: string;
  onPress?: () => void;
  last?: boolean;
};

/** A two-line ledger row shared by analytical sheets. */
export function AnalyticsRow({ label, value, detail, valueColor, onPress, last = false }: Props) {
  const body = (
    <>
      <View style={styles.copy}>
        <Text style={styles.label} numberOfLines={2}>{label}</Text>
        {detail ? <Text style={styles.detail} numberOfLines={2}>{detail}</Text> : null}
      </View>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {onPress ? <ChevronRight size={16} color={COLORS.storm} /> : null}
    </>
  );

  const rowStyle = [styles.row, !last && styles.divider];
  return onPress ? (
    <TouchableOpacity
      style={rowStyle}
      onPress={onPress}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      {body}
    </TouchableOpacity>
  ) : <View style={rowStyle}>{body}</View>;
}

const styles = StyleSheet.create({
  row: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  copy: { flex: 1, gap: SPACING.xs / 2 },
  label: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  detail: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  value: { maxWidth: "46%", fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
});
