import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Search, X, type LucideIcon } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

export type FilterToolbarOption<T extends string> = {
  value: T;
  label: string;
};

export type FilterToolbarAction = {
  key: string;
  icon: LucideIcon;
  onPress: () => void;
  active?: boolean;
  accessibilityLabel: string;
  activeColor?: string;
  inactiveColor?: string;
};

type Props<T extends string> = {
  options: FilterToolbarOption<T>[];
  value?: T;
  onChange?: (value: T) => void;
  selectedValues?: T[];
  onSelectedValuesChange?: (values: T[]) => void;
  allValue?: T;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  actions?: FilterToolbarAction[];
};

export function FilterToolbar<T extends string>({
  options,
  value,
  onChange,
  selectedValues,
  onSelectedValuesChange,
  allValue,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar",
  actions = [],
}: Props<T>) {
  const hasSearch = Boolean(onSearchChange);
  const multiSelect = Boolean(selectedValues && onSelectedValuesChange);
  const activeValues = selectedValues ?? [];

  function isActive(optionValue: T) {
    if (!multiSelect) return value === optionValue;
    if (allValue && optionValue === allValue) return activeValues.length === 0;
    return activeValues.includes(optionValue);
  }

  function handleOptionPress(optionValue: T) {
    void Haptics.selectionAsync();

    if (!multiSelect) {
      onChange?.(optionValue);
      return;
    }

    if (allValue && optionValue === allValue) {
      onSelectedValuesChange?.([]);
      return;
    }

    const next = activeValues.includes(optionValue)
      ? activeValues.filter((selected) => selected !== optionValue)
      : [...activeValues, optionValue];
    onSelectedValuesChange?.(next);
  }

  return (
    <View style={styles.root}>
      {hasSearch ? (
        <View style={styles.searchBox}>
          <Search size={16} color={COLORS.storm} strokeWidth={2} />
          <TextInput
            value={searchValue ?? ""}
            onChangeText={onSearchChange}
            placeholder={searchPlaceholder}
            placeholderTextColor={COLORS.textDisabled}
            style={styles.searchInput}
          />
          {(searchValue ?? "").length > 0 ? (
            <TouchableOpacity
              onPress={() => onSearchChange?.("")}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Limpiar búsqueda"
            >
              <X size={15} color={COLORS.storm} strokeWidth={2} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={styles.controlsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
          style={styles.filtersScroll}
        >
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.filterChip, isActive(option.value) && styles.filterChipActive]}
              onPress={() => handleOptionPress(option.value)}
            >
              <Text style={[styles.filterChipText, isActive(option.value) && styles.filterChipTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {actions.map((action) => {
          const Icon = action.icon;
          const activeColor = action.activeColor ?? COLORS.primary;
          const inactiveColor = action.inactiveColor ?? COLORS.storm;
          return (
            <TouchableOpacity
              key={action.key}
              style={[styles.actionButton, action.active && styles.actionButtonActive]}
              onPress={action.onPress}
              accessibilityRole="button"
              accessibilityLabel={action.accessibilityLabel}
            >
              <Icon size={13} color={action.active ? activeColor : inactiveColor} strokeWidth={2} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.sm,
    paddingTop: SPACING.md,
  },
  searchBox: {
    marginHorizontal: SPACING.lg,
    minHeight: 42,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  searchInput: {
    flex: 1,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    paddingVertical: SPACING.sm,
  },
  filtersScroll: { flexGrow: 0 },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingRight: SPACING.lg,
  },
  filtersRow: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    alignItems: "center",
  },
  filterChip: {
    paddingHorizontal: SPACING.md,
    minHeight: 38,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: COLORS.pine + "22",
    borderColor: COLORS.pine + "55",
  },
  filterChipText: {
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm + 4,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  filterChipTextActive: { color: COLORS.pine },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  actionButtonActive: {
    backgroundColor: COLORS.primary + "22",
    borderColor: COLORS.primary + "44",
  },
});
