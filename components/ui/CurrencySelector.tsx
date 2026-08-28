import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { SUPPORTED_CURRENCIES } from "../../constants/currencies";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import { PillSelector } from "./PillSelector";

type Props = {
  label: string;
  value: string;
  onChange: (currencyCode: string) => void;
  hint?: string;
  style?: StyleProp<ViewStyle>;
};

export function CurrencySelector({ label, value, onChange, hint, style }: Props) {
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
});
