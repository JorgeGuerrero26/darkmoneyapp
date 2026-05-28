import { memo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  RADIUS,
  SPACING,
  SURFACE,
} from "../../../../constants/theme";
import type { CategorySummary, CounterpartySummary } from "../../../../types/domain";

type CounterpartyProps = {
  label: string;
  counterparties: CounterpartySummary[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

export const CounterpartyPicker = memo(function CounterpartyPicker({
  label,
  counterparties,
  selectedId,
  onSelect,
}: CounterpartyProps) {
  if (counterparties.length === 0) return null;
  return (
    <View style={styles.pickerWrap} accessibilityLabel={label}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip
          label="Ninguna"
          active={selectedId === null}
          onPress={() => onSelect(null)}
        />
        {counterparties.map((cp) => (
          <Chip
            key={cp.id}
            label={cp.name}
            active={selectedId === cp.id}
            onPress={() => onSelect(cp.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
});

type CategoryProps = {
  label: string;
  categories: CategorySummary[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

export const CategoryPicker = memo(function CategoryPicker({
  label,
  categories,
  selectedId,
  onSelect,
}: CategoryProps) {
  return (
    <View style={styles.pickerWrap} accessibilityLabel={label}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Chip
          label="Sin categoría"
          active={selectedId === null}
          onPress={() => onSelect(null)}
        />
        {categories.map((cat) => (
          <Chip
            key={cat.id}
            label={cat.name}
            active={selectedId === cat.id}
            onPress={() => onSelect(cat.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
});

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
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
  row: {
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.softBorder,
    backgroundColor: SURFACE.card,
  },
  chipActive: {
    backgroundColor: COLORS.pine + "28",
    borderColor: COLORS.pine + "99",
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  chipText: { fontSize: FONT_SIZE.sm, color: COLORS.storm },
  chipTextActive: { color: COLORS.pine, fontFamily: FONT_FAMILY.bodySemibold },
});
