import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";

export const POPULAR_CURRENCIES = ["PEN", "USD", "EUR", "MXN", "COP", "ARS", "CLP", "BRL"];

type Props = {
  /** Currently selected popular currency (ignored when customValue has text). */
  value: string;
  /** Free-form custom code entered by the user (overrides popular pills when non-empty). */
  customValue: string;
  onChange: (value: string) => void;
  onCustomChange: (custom: string) => void;
  label?: string;
};

export function CurrencyPicker({
  value,
  customValue,
  onChange,
  onCustomChange,
  label = "Moneda",
}: Props) {
  const customActive = customValue.length > 0;
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Moneda de la cuenta">
      <Text style={styles.sectionLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {POPULAR_CURRENCIES.map((c) => {
            const selected = value === c && !customActive;
            return (
              <TouchableOpacity
                key={c}
                style={[styles.pill, selected && styles.pillActive]}
                onPress={() => {
                  onChange(c);
                  onCustomChange("");
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Moneda ${c}`}
              >
                <Text style={[styles.pillText, selected && styles.pillTextActive]}>
                  {c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <TextInput
        style={styles.textInput}
        value={customValue}
        onChangeText={(t) => onCustomChange(t.toUpperCase())}
        placeholder="Otra moneda (ej. JPY)"
        placeholderTextColor={COLORS.storm}
        maxLength={5}
        autoCapitalize="characters"
        accessibilityLabel="Código de moneda personalizado"
        accessibilityHint="Tres letras ISO. Sobrescribe la selección de arriba."
      />
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
  textInput: {
    marginTop: SPACING.sm,
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
  },
});
