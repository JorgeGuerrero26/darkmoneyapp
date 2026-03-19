import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUiStore } from "../../store/ui-store";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";
import { TOAST_DURATION_MS } from "../../constants/config";

export function ToastContainer() {
  const { toasts, dismissToast } = useUiStore();
  if (toasts.length === 0) return null;
  const toast = toasts[0];
  return (
    <ToastItem
      key={toast.id}
      message={toast.message}
      variant={toast.variant}
      onDismiss={() => dismissToast(toast.id)}
    />
  );
}

type ToastItemProps = {
  message: string;
  variant: "success" | "error" | "info" | "warning";
  onDismiss: () => void;
};

const VARIANT_CONFIG = {
  success: {
    color: COLORS.success,
    bg: COLORS.successMuted,
    icon: "✓",
  },
  error: {
    color: COLORS.danger,
    bg: COLORS.dangerMuted,
    icon: "✕",
  },
  warning: {
    color: COLORS.warning,
    bg: COLORS.warningMuted,
    icon: "⚠",
  },
  info: {
    color: COLORS.info,
    bg: COLORS.infoMuted,
    icon: "i",
  },
};

function ToastItem({ message, variant, onDismiss }: ToastItemProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const config = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.info;

  useEffect(() => {
    // Slide in + fade in
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 70,
        friction: 12,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      // Slide up + fade out
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(onDismiss);
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [translateY, opacity, onDismiss]);

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { top: insets.top + SPACING.sm },
        { transform: [{ translateY }], opacity },
      ]}
    >
      <Pressable onPress={onDismiss}>
        <View style={[styles.card, { borderLeftColor: config.color }]}>
          {/* Tinted bg overlay */}
          <View style={[styles.tint, { backgroundColor: config.bg }]} />

          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: config.color + "22" }]}>
            <Text style={[styles.icon, { color: config.color }]}>{config.icon}</Text>
          </View>

          {/* Message */}
          <Text style={styles.message} numberOfLines={3}>
            {message}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    zIndex: 9999,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderLeftWidth: 3,
    paddingVertical: SPACING.md,
    paddingRight: SPACING.lg,
    paddingLeft: SPACING.md,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
    borderRadius: RADIUS.lg,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  icon: {
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
  },
  message: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
    color: COLORS.text,
    lineHeight: 18,
  },
});
