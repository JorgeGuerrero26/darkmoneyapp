import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { ACCOUNT_INSTITUTIONS, type AccountInstitution } from "../../../../lib/account-institutions";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import { InstitutionAvatar } from "../InstitutionAvatar";

type Props = {
  value: string | null;
  onChange: (code: string | null) => void;
  label?: string;
};

/**
 * Optional institution picker for an account. Renders a "Ninguna" option +
 * a searchable list of brands from the client catalog. Pure presentational.
 */
export function InstitutionPicker({ value, onChange, label = "Institución" }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo<readonly AccountInstitution[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ACCOUNT_INSTITUTIONS;
    return ACCOUNT_INSTITUTIONS.filter(
      (i) => i.label.toLowerCase().includes(q) || i.code.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Institución financiera">
      <Text style={styles.sectionLabel}>{label}</Text>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar institución..."
        placeholderTextColor={COLORS.storm}
        accessibilityLabel="Buscar institución financiera"
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {/* "Ninguna" — clears the selection */}
        <TouchableOpacity
          style={[styles.chip, value === null && styles.chipActive]}
          onPress={() => onChange(null)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === null }}
          accessibilityLabel="Sin institución"
        >
          <View style={[styles.avatarShell, { backgroundColor: SURFACE.separator }]}>
            <Text style={styles.avatarText}>—</Text>
          </View>
          <Text style={[styles.chipLabel, value === null && styles.chipLabelActive]}>Ninguna</Text>
        </TouchableOpacity>

        {filtered.map((inst) => {
          const selected = value === inst.code;
          return (
            <TouchableOpacity
              key={inst.code}
              style={[styles.chip, selected && styles.chipActive]}
              onPress={() => onChange(inst.code)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={inst.label}
            >
              <InstitutionAvatar code={inst.code} size={28} />
              <Text
                style={[styles.chipLabel, selected && styles.chipLabelActive]}
                numberOfLines={1}
              >
                {inst.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {filtered.length === 0 ? (
        <Text style={styles.emptyText}>Sin resultados</Text>
      ) : null}
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
  search: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    marginBottom: SPACING.sm,
  },
  row: { flexDirection: "row", gap: SPACING.sm, paddingRight: SPACING.lg },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    maxWidth: 180,
  },
  chipActive: {
    borderColor: COLORS.pine,
    backgroundColor: COLORS.pine + "1A",
  },
  chipLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
  },
  chipLabelActive: { color: COLORS.ink },
  avatarShell: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  emptyText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginTop: SPACING.sm,
  },
});
