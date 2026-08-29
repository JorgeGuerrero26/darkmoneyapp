import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { formatCurrencyParts } from "../../lib/format-currency";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  currencyCode: string;
  label?: string;
  error?: string;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
};

export const CurrencyInput = forwardRef<TextInput, Props>(function CurrencyInput({
  value,
  onChangeText,
  currencyCode,
  label,
  error,
  placeholder = "0.00",
  style,
}, ref) {
  const inputRef = useRef<TextInput>(null);
  useImperativeHandle(ref, () => inputRef.current as TextInput, []);

  function handleChange(text: string) {
    // Allow digits and a single decimal point
    const cleaned = text.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) return; // reject second dot
    if (parts[0] && parts[0].length > 12) return; // max 12 integer digits
    if (parts[1] && parts[1].length > 2) return; // max 2 decimal places
    onChangeText(cleaned);
  }

  // El campo mostraba el codigo ISO y el numero sin sus dos decimales: "PEN 21.3". El mismo
  // monto en el resto de la app es "S/ 21.30". `formatCurrencyParts` ya resuelve el simbolo,
  // y de paso esquiva la divergencia de Hermes con `formatToParts()` en el telefono.
  const currencySymbol = formatCurrencyParts(0, currencyCode).symbol || currencyCode;

  // Al salir del campo se completan los decimales: 21.3 escrito queda como 21.30.
  function handleBlur() {
    const trimmed = value.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;
    const normalized = parsed.toFixed(2);
    if (normalized !== trimmed) onChangeText(normalized);
  }

  return (
    <TouchableOpacity
      style={[styles.container, error ? styles.containerError : null, style]}
      onPress={() => inputRef.current?.focus()}
      activeOpacity={1}
    >
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <Text style={styles.currency}>{currencySymbol}</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="done"
          onBlur={handleBlur}
          accessibilityLabel={label ? `${label} en ${currencyCode}` : `Monto en ${currencyCode}`}
          accessibilityHint={error ? `Error: ${error}` : undefined}
        />
      </View>
      {error ? (
        <Text
          style={styles.error}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  containerError: { borderColor: COLORS.danger },
  label: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    fontWeight: "500",
  },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  currency: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    minWidth: 40,
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZE.amountInput,
    fontFamily: FONT_FAMILY.heading,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: -0.035 * FONT_SIZE.amountInput,
    color: COLORS.text,
    padding: 0,
  },
  error: { fontSize: FONT_SIZE.xs, color: COLORS.danger },
});
