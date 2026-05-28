import { forwardRef, useState, type ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  containerStyle?: StyleProp<ViewStyle>;
  rightElement?: ReactNode;
};

export const Input = forwardRef<TextInput, Props>(function Input(
  {
    label,
    error,
    hint,
    containerStyle,
    style,
    onFocus,
    onBlur,
    rightElement,
    accessibilityLabel,
    accessibilityHint,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const resolvedAccessibilityLabel = accessibilityLabel ?? label ?? rest.placeholder;
  const resolvedAccessibilityHint = accessibilityHint ?? (error ? `${hint ? `${hint}. ` : ""}Error: ${error}` : hint);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputWrap, focused && styles.inputWrapFocused, error ? styles.inputWrapError : null]}>
        <TextInput
          ref={ref}
          style={[styles.input, style]}
          placeholderTextColor={COLORS.storm}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          accessibilityLabel={resolvedAccessibilityLabel}
          accessibilityHint={resolvedAccessibilityHint}
          {...rest}
        />
        {rightElement ? <View style={styles.rightSlot}>{rightElement}</View> : null}
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
      {!error && hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    gap: SPACING.xs,
  },
  label: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE.input,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
  },
  inputWrapFocused: {
    borderColor: SURFACE.inputFocus,
  },
  inputWrapError: {
    borderColor: SURFACE.dangerBorder,
  },
  input: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
  },
  rightSlot: {
    paddingRight: SPACING.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  inputFocused: {
    borderColor: SURFACE.inputFocus,
  },
  inputError: {
    borderColor: SURFACE.dangerBorder,
  },
  error: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.rosewood,
  },
  hint: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
});
