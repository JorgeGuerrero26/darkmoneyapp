import { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Search } from "lucide-react-native";

import { BottomSheet } from "./BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

export type SelectOption<T = number | null> = {
  value: T;
  label: string;
  meta?: string;
};

type Props<T = number | null> = {
  visible: boolean;
  title: string;
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  onClose: () => void;
};

export function SearchableSelectSheet<T = number | null>({
  visible,
  title,
  options,
  value,
  onChange,
  onClose,
}: Props<T>) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(q) || opt.meta?.toLowerCase().includes(q));
  }, [options, query]);

  function handleSelect(opt: SelectOption<T>) {
    onChange(opt.value);
    setQuery("");
    onClose();
  }

  function handleClose() {
    setQuery("");
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose} title={title} snapHeight={0.6}>
      <View style={styles.searchRow}>
        <Search size={16} color={COLORS.textMuted} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar..."
          placeholderTextColor={COLORS.textMuted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(_, i) => String(i)}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const active = item.value === value;
          return (
            <TouchableOpacity
              style={[styles.option, active && styles.optionActive]}
              onPress={() => handleSelect(item)}
              activeOpacity={0.78}
            >
              <Text style={[styles.optionLabel, active && styles.optionLabelActive]} numberOfLines={1}>
                {item.label}
              </Text>
              {item.meta ? (
                <Text style={styles.optionMeta} numberOfLines={1}>{item.meta}</Text>
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>Sin resultados para "{query}"</Text>
        }
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE.input,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    height: 44,
    gap: SPACING.sm,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    height: "100%",
  },
  list: { maxHeight: 380 },
  option: {
    minHeight: 52,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    justifyContent: "center",
    gap: 2,
  },
  optionActive: {
    backgroundColor: COLORS.primary + "14",
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
  },
  optionLabel: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
  },
  optionLabelActive: { color: COLORS.primary, fontFamily: FONT_FAMILY.bodySemibold },
  optionMeta: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  empty: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    textAlign: "center",
    paddingVertical: SPACING.xl,
  },
});
