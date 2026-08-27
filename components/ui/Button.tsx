import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useEffect, useState } from "react";
import * as Haptics from "expo-haptics";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

type Props = PressableProps & {
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  loadingLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading = false,
  loadingLabel,
  disabled,
  style,
  onPress,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  // Si el guardado se alarga (red lenta o socket muerto tras cambiar de red), el spinner
  // mudo deja al usuario a ciegas sin saber si sigue vivo. A los 5 s se lo decimos. No
  // promete nada: solo informa. El fetch de Supabase aborta a los 12 s.
  const [takingLong, setTakingLong] = useState(false);
  useEffect(() => {
    if (!loading) {
      setTakingLong(false);
      return;
    }
    const timer = setTimeout(() => setTakingLong(true), 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  const activeLoadingLabel = takingLong ? "La red está lenta…" : loadingLabel;

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
        <>
          <ActivityIndicator
            size="small"
            color={variant === "primary" ? COLORS.actionText : COLORS.pine}
          />
          {activeLoadingLabel ? (
            <Text style={[styles.label, styles[`${variant}Label`], styles[`${size}Label`]]}>
              {activeLoadingLabel}
            </Text>
          ) : null}
        </>
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
    gap: SPACING.sm,
  },
  // Variants
  primary: {
    // Sin tono: es el elemento con mas contraste de la pantalla (16.5:1), asi que el pulgar
    // lo encuentra sin buscar, y libera el verde para significar solo "entro plata".
    backgroundColor: COLORS.action,
  },
  secondary: {
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  ghost: {
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  danger: {
    backgroundColor: SURFACE.dangerBg,
    borderWidth: 1,
    borderColor: SURFACE.dangerBorder,
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
    textAlign: "center",
    flexShrink: 1,
  },
  primaryLabel:   { color: COLORS.actionText },
  secondaryLabel: { color: COLORS.ink },
  ghostLabel:     { color: COLORS.ink },
  dangerLabel:    { color: COLORS.rosewood },
  smLabel: { fontSize: FONT_SIZE.sm },
  mdLabel: { fontSize: FONT_SIZE.md },
  lgLabel: { fontSize: FONT_SIZE.lg },
});
