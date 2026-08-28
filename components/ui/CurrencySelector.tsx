import { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Check, ChevronRight } from "lucide-react-native";

import { SUPPORTED_CURRENCIES } from "../../constants/currencies";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { BottomSheet } from "./BottomSheet";
import { PillSelector } from "./PillSelector";

type Props = {
  label: string;
  value: string;
  onChange: (currencyCode: string) => void;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  /**
   * `grid` reparte las 22 monedas en cápsulas; `row` muestra una fila con la elegida y abre la
   * lista al tocarla.
   *
   * Veintidós cápsulas ocupan 200 px para responder algo que casi nunca se cambia, así que en
   * pantallas de preferencias va `row` — el mismo patrón que `FilterToolbar` usa cuando hay más
   * de seis opciones. El `grid` se queda en onboarding, donde elegir moneda ES el paso.
   */
  variant?: "grid" | "row";
};

export function CurrencySelector({ label, value, onChange, hint, style, variant = "grid" }: Props) {
  const [open, setOpen] = useState(false);

  if (variant === "row") {
    return (
      <View style={style}>
        <TouchableOpacity style={styles.row} onPress={() => setOpen(true)} activeOpacity={0.82}>
          <View style={styles.rowCopy}>
            <Text style={styles.rowLabel}>{label}</Text>
            {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
          </View>
          <Text style={styles.rowValue}>{value}</Text>
          <ChevronRight size={16} color={COLORS.storm} />
        </TouchableOpacity>

        <BottomSheet visible={open} onClose={() => setOpen(false)} title="Moneda base" snapHeight={0.6}>
          {SUPPORTED_CURRENCIES.map((currency) => {
            const active = currency.code === value;
            return (
              <TouchableOpacity
                key={currency.code}
                style={styles.sheetRow}
                onPress={() => {
                  onChange(currency.code);
                  setOpen(false);
                }}
                activeOpacity={0.82}
              >
                <View style={styles.sheetCopy}>
                  <Text style={[styles.sheetCode, active && styles.sheetCodeActive]}>{currency.code}</Text>
                  <Text style={styles.sheetName}>{currency.name}</Text>
                </View>
                {active ? <Check size={16} color={COLORS.ink} /> : null}
              </TouchableOpacity>
            );
          })}
        </BottomSheet>
      </View>
    );
  }

  return (
    <View style={[styles.root, style]}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <PillSelector
        options={SUPPORTED_CURRENCIES.map((currency) => ({
          value: currency.code,
          label: currency.code,
        }))}
        value={value}
        onChange={onChange}
        horizontal={false}
        wrap
        contentContainerStyle={styles.options}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.xs,
  },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  hint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    opacity: 0.68,
    marginBottom: SPACING.xs,
  },
  options: {
    paddingTop: SPACING.xs,
  },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  rowCopy: { flex: 1, gap: 2 },
  rowLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  rowHint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  rowValue: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.fog,
  },
  sheetRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.card,
    marginBottom: SPACING.xs,
  },
  sheetCopy: { flex: 1, gap: 2 },
  sheetCode: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.fog,
  },
  sheetCodeActive: { color: COLORS.ink },
  sheetName: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
});
