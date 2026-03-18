import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  style,
  onPress,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  function handlePress(e: Parameters<NonNullable<PressableProps["onPress"]>>[0]) {
    void Haptics.impactAsync(
      variant === "danger"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );
    onPress?.(e);
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[size],
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
      disabled={isDisabled}
      onPress={handlePress}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? COLORS.textInverse : COLORS.primary}
        />
      ) : (
        <Text style={[styles.label, styles[`${variant}Label`], styles[`${size}Label`]]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  // Variants
  primary: {
    backgroundColor: COLORS.primary,
  },
  secondary: {
    backgroundColor: COLORS.bgCard,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  danger: {
    backgroundColor: COLORS.danger,
  },
  // Sizes
  sm: { paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md },
  md: { paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.lg },
  lg: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl },
  // States
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  // Labels
  label: {
    fontWeight: FONT_WEIGHT.semibold,
  },
  primaryLabel: { color: "#FFFFFF" },
  secondaryLabel: { color: COLORS.text },
  ghostLabel: { color: COLORS.primary },
  dangerLabel: { color: "#FFFFFF" },
  smLabel: { fontSize: FONT_SIZE.sm },
  mdLabel: { fontSize: FONT_SIZE.md },
  lgLabel: { fontSize: FONT_SIZE.lg },
});
