import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

export type MetricSummaryCardOption = {
  value: string;
  label: string;
};

type Props = {
  label: string;
  value: string;
  options?: MetricSummaryCardOption[];
  selectedOption?: string | null;
  onOptionChange?: (value: string) => void;
};

export function MetricSummaryCard({
  label,
  value,
  options = [],
  selectedOption,
  onOptionChange,
}: Props) {
  const showOptions = options.length > 1 && onOptionChange;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>{value}</Text>
        </View>
        {showOptions ? (
          <View style={styles.options}>
            {options.map((option) => {
              const active = selectedOption === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => onOptionChange(option.value)}
                  activeOpacity={0.84}
                >
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: SPACING.md,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  value: {
    fontSize: FONT_SIZE.xl,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 4,
  },
  option: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  optionActive: {
    backgroundColor: COLORS.pine + "22",
    borderColor: COLORS.pine + "55",
  },
  optionText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  optionTextActive: {
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.pine,
  },
});
