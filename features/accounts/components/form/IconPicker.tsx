import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ACCOUNT_ICON_OPTIONS } from "../../../../lib/account-icons";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Tint color used for the selected icon highlight. */
  tint: string;
  label?: string;
};

export function IconPicker({ value, onChange, tint, label = "Ícono" }: Props) {
  return (
    <View>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.grid}>
        {ACCOUNT_ICON_OPTIONS.map((item) => {
          const selected = value === item.value;
          return (
            <TouchableOpacity
              key={item.value}
              style={[
                styles.btn,
                selected && { borderColor: tint, backgroundColor: tint + "22" },
              ]}
              onPress={() => onChange(item.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Seleccionar icono ${item.label}`}
            >
              <item.Icon size={22} color={selected ? tint : COLORS.storm} />
            </TouchableOpacity>
          );
        })}
      </View>
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
  grid: {
    flexDirection: "row",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
});
