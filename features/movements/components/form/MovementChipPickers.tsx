import { memo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

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
  const [query, setQuery] = useState("");
  if (counterparties.length === 0) return null;
  // Mismo umbral y buscador insensible a tildes que CategoryPicker: con 20+
  // contrapartes el scroll horizontal no escala.
  const showSearch = counterparties.length > CATEGORY_SEARCH_THRESHOLD;
  const normalizedQuery = normalizeSearchText(query);
  const visibleCounterparties = showSearch && normalizedQuery
    ? counterparties.filter(
        // La seleccionada queda siempre visible para poder deseleccionarla aunque no matchee.
        (cp) => cp.id === selectedId || normalizeSearchText(cp.name).includes(normalizedQuery),
      )
    : counterparties;
  return (
    <View style={styles.pickerWrap} accessibilityLabel={label}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {showSearch ? (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar contraparte…"
          placeholderTextColor={COLORS.storm}
          style={styles.searchInput}
          accessibilityLabel="Buscar contraparte"
        />
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        <Chip
          label="Ninguna"
          active={selectedId === null}
          onPress={() => onSelect(null)}
        />
        {visibleCounterparties.map((cp) => (
          <Chip
            key={cp.id}
            label={cp.name}
            active={selectedId === cp.id}
            onPress={() => onSelect(cp.id)}
          />
        ))}
        {showSearch && normalizedQuery && visibleCounterparties.length === 0 ? (
          <Text style={styles.emptyResult}>Sin coincidencias</Text>
        ) : null}
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

// Con muchas categorías el scroll horizontal no escala; sobre este umbral aparece el buscador.
const CATEGORY_SEARCH_THRESHOLD = 12;

// Búsqueda insensible a tildes: "credito" debe encontrar "Crédito".
function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export const CategoryPicker = memo(function CategoryPicker({
  label,
  categories,
  selectedId,
  onSelect,
}: CategoryProps) {
  const [query, setQuery] = useState("");
  const showSearch = categories.length > CATEGORY_SEARCH_THRESHOLD;
  const normalizedQuery = normalizeSearchText(query);
  const visibleCategories = showSearch && normalizedQuery
    ? categories.filter(
        // La seleccionada queda siempre visible para poder deseleccionarla aunque no matchee.
        (cat) => cat.id === selectedId || normalizeSearchText(cat.name).includes(normalizedQuery),
      )
    : categories;
  return (
    <View style={styles.pickerWrap} accessibilityLabel={label}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {showSearch ? (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar categoría…"
          placeholderTextColor={COLORS.storm}
          style={styles.searchInput}
          accessibilityLabel="Buscar categoría"
        />
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} keyboardShouldPersistTaps="handled">
        <Chip
          label="Sin categoría"
          active={selectedId === null}
          onPress={() => onSelect(null)}
        />
        {visibleCategories.map((cat) => (
          <Chip
            key={cat.id}
            label={cat.name}
            active={selectedId === cat.id}
            onPress={() => onSelect(cat.id)}
          />
        ))}
        {showSearch && normalizedQuery && visibleCategories.length === 0 ? (
          <Text style={styles.emptyResult}>Sin coincidencias</Text>
        ) : null}
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
  searchInput: {
    borderWidth: 1,
    borderColor: SURFACE.softBorder,
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
  },
  emptyResult: { fontSize: FONT_SIZE.sm, color: COLORS.storm, alignSelf: "center" },
});
