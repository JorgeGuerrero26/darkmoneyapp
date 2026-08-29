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
              style={[styles.accountChip, isSelected && styles.accountChipSelected]}
              onPress={() => onSelect(acc.id)}
              accessibilityRole="button"
              accessibilityLabel={`${acc.name}, ${acc.currencyCode}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.accountChipName, isSelected && styles.accountChipNameSelected]}>
                {acc.name}
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
    borderColor: "rgba(244,241,236,0.12)",
    backgroundColor: SURFACE.card,
    gap: 2,
    minWidth: 100,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  // Estar seleccionado se ve IGUAL en toda la app: borde hueso, etiqueta hueso, sin color.
  // Antes el borde usaba `acc.color` —el color de la cuenta—, asi que el mismo estado se
  // pintaba naranja en la cuenta origen y azul en la destino, y el azul no existe en el
  // sistema. El color queda libre para decir de que TIPO es el movimiento, que es lo unico
  // que aqui depende del color.
  accountChipSelected: {
    borderColor: COLORS.ink,
    backgroundColor: SURFACE.cardActive,
  },
  accountChipName: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  accountChipNameSelected: { color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold },
  emptyPicker: { fontSize: FONT_SIZE.sm, color: COLORS.storm },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger },
});
