import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUiStore } from "../../store/ui-store";
import { COLORS, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
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

function ToastItem({ message, variant, onDismiss }: ToastItemProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(translateY, {
        toValue: -80,
        duration: 250,
        useNativeDriver: true,
      }).start(onDismiss);
    }, TOAST_DURATION_MS);

    return () => clearTimeout(timer);
  }, [translateY, onDismiss]);

  const bgColor =
    variant === "success"
      ? COLORS.success
      : variant === "error"
        ? COLORS.danger
        : variant === "warning"
          ? COLORS.warning
          : COLORS.info;

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: bgColor, top: insets.top + SPACING.sm },
        { transform: [{ translateY }] },
      ]}
    >
      <Text style={styles.message}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.lg,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  message: {
    color: "#FFFFFF",
    fontSize: FONT_SIZE.sm,
    fontWeight: "600",
    textAlign: "center",
  },
});
