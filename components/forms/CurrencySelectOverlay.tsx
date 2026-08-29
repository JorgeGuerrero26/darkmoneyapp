import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { SUPPORTED_CURRENCIES } from "../../constants/currencies";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { SearchableSelectSheet, type SelectOption } from "../ui/SearchableSelectSheet";
import { TextField } from "../ui/TextField";

type Props = {
  visible: boolean;
  onClose: () => void;
  value: string;
  onChange: (code: string) => void;
  title?: string;
};

/**
 * La moneda, detrás de una fila.
 *
 * Venían ocho cápsulas en una fila que se desplaza —con la última cortada por el borde— más un
 * campo de texto libre debajo para "otra moneda". Dos controles para una sola pregunta, y el
 * segundo invisible hasta que te desplazas. Pasadas seis opciones el control correcto es un
 * selector, que aquí además busca entre las 22.
 */
export function CurrencySelectOverlay({ visible, onClose, value, onChange, title = "Moneda" }: Props) {
  const options = useMemo<SelectOption<string>[]>(
    () => SUPPORTED_CURRENCIES.map((currency) => ({ value: currency.code, label: currency.code, meta: currency.name })),
    [],
  );

  return (
    <SearchableSelectSheet
      inline
      visible={visible}
      title={title}
      options={options}
      value={value}
      onChange={onChange}
      onClose={onClose}
    />
  );
}

type CustomProps = {
  value: string;
  onChange: (code: string) => void;
};

/**
 * El código libre solo aparece cuando la cuenta YA tiene una moneda fuera de la lista.
 *
 * Se conserva para no romper cuentas existentes en, digamos, JPY: quitarlo del todo dejaría un
 * saldo con una moneda que el formulario no sabe volver a guardar. Para las nuevas no hace
 * falta, porque las tasas de cambio solo existen para las soportadas.
 */
export function CustomCurrencyField({ value, onChange }: CustomProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.label}>Código de moneda</Text>
      <TextField
        style={styles.input}
        value={value}
        onChangeText={(t) => onChange(t.toUpperCase())}
        placeholder="Ej. JPY"
        placeholderTextColor={COLORS.storm}
        maxLength={5}
        autoCapitalize="characters"
        accessibilityLabel="Código de moneda personalizado"
      />
      <Text style={styles.hint}>
        Esta cuenta usa una moneda fuera de la lista. Las conversiones automáticas no la cubren.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: SPACING.xs },
  label: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  hint: { fontSize: FONT_SIZE.xs, color: COLORS.storm, lineHeight: 16 },
});
