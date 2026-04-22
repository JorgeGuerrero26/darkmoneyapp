import { Pressable, StyleSheet, Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { useHaptics } from "../../hooks/useHaptics";

type Props = {
  label: string;
  detail?: string;
  onApply: () => void;
};

export function SmartSuggestion({ label, detail, onApply }: Props) {
  const haptics = useHaptics();
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => { haptics.light(); onApply(); }}
    >
      <Sparkles size={13} color={COLORS.primary} strokeWidth={2} />
      <View style={styles.copy}>
        <Text style={styles.text} numberOfLines={1}>
          Sugerido:{" "}
          <Text style={styles.value}>{label}</Text>
        </Text>
        {detail ? <Text style={styles.detail} numberOfLines={1}>{detail}</Text> : null}
      </View>
      <View style={styles.applyBadge}>
        <Text style={styles.applyText}>Aplicar</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    backgroundColor: "rgba(107,228,197,0.06)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(107,228,197,0.20)",
    marginTop: -SPACING.xs,
  },
  copy: {
    flex: 1,
  },
  pressed: { opacity: 0.7 },
  text: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  value: {
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.primary,
  },
  detail: {
    marginTop: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: COLORS.storm,
  },
  applyBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    backgroundColor: GLASS.cardActive,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: GLASS.cardActiveBorder,
  },
  applyText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
  },
});
