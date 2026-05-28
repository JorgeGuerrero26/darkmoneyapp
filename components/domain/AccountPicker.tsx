import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import type { AccountSummary } from "../../types/domain";

export function AccountPicker({
  label,
  accounts,
  selectedId,
  onSelect,
  error,
}: {
  label: string;
  accounts: AccountSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  error?: string;
}) {
  return (
    <View style={styles.pickerWrap} accessibilityLabel={label}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {error ? (
        <Text
          style={styles.fieldError}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountRow}>
        {accounts.map((acc) => {
          const isSelected = selectedId === acc.id;
          return (
            <TouchableOpacity
              key={acc.id}
              style={[
                styles.accountChip,
                isSelected && { borderColor: acc.color, backgroundColor: acc.color + "22" },
              ]}
              onPress={() => onSelect(acc.id)}
              accessibilityRole="button"
              accessibilityLabel={`${acc.name}, ${acc.currencyCode}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.accountChipName, isSelected && { color: acc.color }]}>
                {acc.name}
              </Text>
              <Text style={styles.accountChipBalance}>
                {acc.currencyCode}
              </Text>
            </TouchableOpacity>
          );
        })}
        {accounts.length === 0 && (
          <Text style={styles.emptyPicker}>Sin cuentas activas</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerWrap: { gap: SPACING.sm },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodySemibold,
    textTransform: "uppercase",
  },
  accountRow: {
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  accountChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: SURFACE.card,
    gap: 2,
    minWidth: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  accountChipName: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  accountChipBalance: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  emptyPicker: { fontSize: FONT_SIZE.sm, color: COLORS.storm },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger },
});
