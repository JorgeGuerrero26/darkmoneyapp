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
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

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
          color={variant === "primary" ? COLORS.textInverse : COLORS.pine}
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
    backgroundColor: COLORS.pine,
  },
  secondary: {
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  ghost: {
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  danger: {
    backgroundColor: GLASS.dangerBg,
    borderWidth: 1,
    borderColor: GLASS.dangerBorder,
  },
  // Sizes
  sm: { paddingVertical: SPACING.xs + 2, paddingHorizontal: SPACING.md },
  md: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl },
  lg: { paddingVertical: SPACING.md + 2, paddingHorizontal: SPACING.xxl },
  // States
  disabled: { opacity: 0.45 },
  pressed:  { opacity: 0.78 },
  // Labels
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
  },
  primaryLabel:   { color: COLORS.textInverse },
  secondaryLabel: { color: COLORS.ink },
  ghostLabel:     { color: COLORS.ink },
  dangerLabel:    { color: COLORS.rosewood },
  smLabel: { fontSize: FONT_SIZE.sm },
  mdLabel: { fontSize: FONT_SIZE.md },
  lgLabel: { fontSize: FONT_SIZE.lg },
});
