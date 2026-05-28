import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { sortByLabel } from "../../../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";

// Type presets (default icon + color per account type). Used when the user
// picks a new type and hasn't manually customized icon/color yet.
export const TYPE_PRESETS: Record<string, { icon: string; color: string }> = {
  cash:        { icon: "banknote",    color: "#b48b34" },
  bank:        { icon: "landmark",    color: "#4566d6" },
  savings:     { icon: "piggy-bank",  color: "#1b6a58" },
  credit_card: { icon: "credit-card", color: "#8f3e3e" },
  investment:  { icon: "trending-up", color: "#8366f2" },
  loan:        { icon: "briefcase",   color: "#c46a31" },
  other:       { icon: "wallet",      color: "#6b7280" },
};

export const ACCOUNT_TYPES = sortByLabel([
  { label: "Efectivo", value: "cash" },
  { label: "Banco", value: "bank" },
  { label: "Ahorro", value: "savings" },
  { label: "Tarjeta", value: "credit_card" },
  { label: "Inversión", value: "investment" },
  { label: "Préstamo", value: "loan" },
  { label: "Otro", value: "other" },
]);

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
};

export function AccountTypePicker({ value, onChange, label = "Tipo" }: Props) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Tipo de cuenta">
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {ACCOUNT_TYPES.map((t) => {
            const selected = value === t.value;
            return (
              <TouchableOpacity
                key={t.value}
                style={[styles.pill, selected && styles.pillActive]}
                onPress={() => onChange(t.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={t.label}
              >
                <Text style={[styles.pillText, selected && styles.pillTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  row: { flexDirection: "row", gap: SPACING.sm },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  pillActive: { backgroundColor: COLORS.pine, borderColor: COLORS.pine },
  pillText: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  pillTextActive: { color: COLORS.textInverse },
});
