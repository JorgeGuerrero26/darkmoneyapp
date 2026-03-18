import { useCallback, useEffect } from "react";
import { AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

import { useUiStore } from "../../store/ui-store";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

/**
 * Manages biometric locking behavior:
 * - Locks when app goes to background
 * - Prompts authentication when app returns to foreground
 * Renders a fullscreen lock overlay when locked.
 */
export function BiometricLock() {
  const { isBiometricLocked, biometricEnabled, setBiometricLocked } = useUiStore();

  const authenticate = useCallback(async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      // No biometrics available — unlock silently
      setBiometricLocked(false);
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirma tu identidad para acceder",
      fallbackLabel: "Usar contraseña",
      disableDeviceFallback: false,
    });

    if (result.success) {
      setBiometricLocked(false);
    }
  }, [setBiometricLocked]);

  // Lock when app goes to background; prompt auth when it returns
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      const { biometricEnabled: enabled } = useUiStore.getState();
      if (!enabled) return;

      if (nextState === "background" || nextState === "inactive") {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (hasHardware && isEnrolled) {
          setBiometricLocked(true);
        }
      } else if (nextState === "active") {
        const { isBiometricLocked: locked } = useUiStore.getState();
        if (locked) void authenticate();
      }
    });
    return () => subscription.remove();
  }, [authenticate, setBiometricLocked]);

  if (!biometricEnabled || !isBiometricLocked) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.title}>App bloqueada</Text>
        <Text style={styles.subtitle}>Autentícate para continuar</Text>
        <TouchableOpacity style={styles.btn} onPress={() => void authenticate()}>
          <Text style={styles.btnText}>Desbloquear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  card: {
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.xl,
  },
  lockIcon: { fontSize: 48 },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  btn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    marginTop: SPACING.sm,
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
  },
});
