import { useRef } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  currencyCode: string;
  label?: string;
  error?: string;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
};

export function CurrencyInput({
  value,
  onChangeText,
  currencyCode,
  label,
  error,
  placeholder = "0.00",
  style,
}: Props) {
  const inputRef = useRef<TextInput>(null);

  function handleChange(text: string) {
    // Allow digits and a single decimal point
    const cleaned = text.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) return; // reject second dot
    if (parts[1] && parts[1].length > 2) return; // max 2 decimal places
    onChangeText(cleaned);
  }

  return (
    <TouchableOpacity
      style={[styles.container, error ? styles.containerError : null, style]}
      onPress={() => inputRef.current?.focus()}
      activeOpacity={1}
    >
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        <Text style={styles.currency}>{currencyCode}</Text>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={COLORS.textDisabled}
          returnKeyType="done"
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </TouchableOpacity>
  );
}

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
    fontSize: FONT_SIZE.xxxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
    padding: 0,
  },
  error: { fontSize: FONT_SIZE.xs, color: COLORS.danger },
});
