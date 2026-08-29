import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
};

/**
 * Dos o tres opciones excluyentes y cortas, repartidas en todo el ancho.
 *
 * "Ambos / Gasto / Ingreso" venía como cápsulas sueltas, que es el control de *filtrar* —donde
 * puede no haber ninguna activa, o varias—. Aquí siempre hay exactamente una elegida y las
 * opciones son del mismo peso: el segmentado lo dice con la forma, sin que haya que leer cuál
 * está resaltada.
 *
 * Pasadas tres opciones o con etiquetas largas deja de servir: ahí va `FormOptionRow` con un
 * `SearchableSelectSheet`.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label }: Props<T>) {
  return (
    <View style={styles.root}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.track}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => onChange(option.value)}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.xs },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  track: {
    flexDirection: "row",
    padding: 3,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.input,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
  },
  segmentActive: { backgroundColor: COLORS.action },
  text: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
  },
  textActive: { color: COLORS.actionText, fontFamily: FONT_FAMILY.bodySemibold },
});
