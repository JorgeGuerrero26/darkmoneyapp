import { useCallback, useEffect, useRef } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { Fingerprint } from "lucide-react-native";
import * as LocalAuthentication from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BlurView } from "expo-blur";

import { useUiStore } from "../../store/ui-store";
import { useAuth } from "../../lib/auth-context";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { Button } from "./Button";

const BG_TIMESTAMP_KEY = "darkmoney_bg_timestamp";
const LOCK_TIMEOUT_MS = 10_000; // 10 segundos en background → cierre de sesión
/** Tras login/registro: ignorar el timeout (Samsung Pass / autofill ponen la app en `inactive` un rato). */
const POST_LOGIN_GRACE_MS = 120_000;

/**
 * Maneja el bloqueo de seguridad de la app:
 * - Kill + reabrir con sesión ya restaurada → requiere reautenticación (no aplica tras login nuevo sin timestamp de background)
 * - Background real > 10s → requiere reautenticación
 * - Background ≤ 10s → continúa sin interrumpir
 *
 * Importante: NO usar el estado `inactive` para el cronómetro. En Android (p. ej. Samsung “guardar contraseña”)
 * la app pasa a `inactive` sin ir a background; si guardáramos timestamp ahí, >10s en el diálogo cerraría sesión.
 *
 * Reautenticación:
 * - Si biometría activada y disponible → muestra overlay de huella
 * - Si no → cierra sesión y redirige al login
 */
export function BiometricLock() {
  const { isBiometricLocked, biometricEnabled, setBiometricLocked } = useUiStore();
  const { session, signOut, hadSessionAtLaunchRef } = useAuth();

  // Previene que el chequeo inicial se dispare más de una vez por ciclo de vida
  const initialCheckDone = useRef(false);
  const prevUserIdRef = useRef<string | null>(null);
  const postLoginGraceUntilRef = useRef(0);

  // Login/registro en esta apertura (no sesión restaurada al arrancar): gracia para diálogos del sistema
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    const prev = prevUserIdRef.current;
    prevUserIdRef.current = uid;
    if (uid && prev === null && !hadSessionAtLaunchRef.current) {
      postLoginGraceUntilRef.current = Date.now() + POST_LOGIN_GRACE_MS;
    }
    if (!uid) {
      postLoginGraceUntilRef.current = 0;
    }
    // hadSessionAtLaunchRef: ref mutable; leemos .current en cada cambio de usuario
  }, [session?.user?.id]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const authenticate = useCallback(async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      setBiometricLocked(false);
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirma tu identidad para acceder",
      fallbackLabel: "Usar contraseña",
      disableDeviceFallback: false,
    });

    if (result.success) setBiometricLocked(false);
  }, [setBiometricLocked]);

  const requireReauth = useCallback(async () => {
    if (!session) return;

    if (biometricEnabled) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        setBiometricLocked(true);
        // Lanza la UI de biometría automáticamente
        void authenticate();
        return;
      }
    }

    // Sin biometría → cerrar sesión completamente
    try { await signOut(); } catch { /* silent */ }
  }, [session, biometricEnabled, setBiometricLocked, signOut, authenticate]);

  // ── Chequeo al iniciar (kill + reabrir) ───────────────────────────────────

  useEffect(() => {
    if (!session || initialCheckDone.current) return;
    initialCheckDone.current = true;

    // Si hay timestamp de background guardado, revisar si expiró
    void (async () => {
      const stored = await AsyncStorage.getItem(BG_TIMESTAMP_KEY);

      if (stored) {
        const elapsed = Date.now() - parseInt(stored, 10);
        await AsyncStorage.removeItem(BG_TIMESTAMP_KEY);
        if (elapsed > LOCK_TIMEOUT_MS && Date.now() >= postLoginGraceUntilRef.current) {
          void requireReauth();
        }
        // Elapsed ≤ 10s: volvió rápido, no hace falta reauth
      } else {
        // Sin timestamp: cold start sin pasar por background, o primer login (nunca se guardó BG).
        // Solo reautenticar si ya había sesión al arrancar (kill con sesión persistida).
        if (hadSessionAtLaunchRef.current) {
          void requireReauth();
        }
      }
    })();
  }, [session, requireReauth]);

  // ── AppState: background / foreground ─────────────────────────────────────

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      // Solo `background`: `inactive` incluye hojas del sistema (guardar contraseña, permisos, etc.)
      if (nextState === "background") {
        await AsyncStorage.setItem(BG_TIMESTAMP_KEY, String(Date.now()));
      } else if (nextState === "active") {
        const { isBiometricLocked: locked } = useUiStore.getState();

        if (locked) {
          // Ya está bloqueada → volver a pedir biometría
          void authenticate();
          return;
        }

        // Revisar si el tiempo en background superó el límite
        const stored = await AsyncStorage.getItem(BG_TIMESTAMP_KEY);
        if (!stored) return;

        const elapsed = Date.now() - parseInt(stored, 10);
        await AsyncStorage.removeItem(BG_TIMESTAMP_KEY);

        if (elapsed > LOCK_TIMEOUT_MS && Date.now() >= postLoginGraceUntilRef.current) {
          void requireReauth();
        }
      }
    });

    return () => subscription.remove();
  }, [authenticate, requireReauth]);

  // ── Overlay de bloqueo biométrico ─────────────────────────────────────────

  if (!isBiometricLocked) return null;

  return (
    <View style={styles.overlay}>
      <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.card}>

        {/* Ícono con anillo de brillo */}
        <View style={styles.iconRing}>
          <View style={styles.iconInner}>
            <Fingerprint size={44} color={COLORS.primary} strokeWidth={1.5} />
          </View>
        </View>

        {/* Texto */}
        <View style={styles.textBlock}>
          <Text style={styles.title}>App bloqueada</Text>
          <Text style={styles.subtitle}>
            Confirma tu identidad para{"\n"}continuar usando DarkMoney
          </Text>
        </View>

        {/* Acción */}
        <Button
          label="Desbloquear"
          variant="primary"
          size="lg"
          style={styles.btn}
          onPress={() => void authenticate()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  card: {
    alignItems: "center",
    gap: SPACING.xl,
    paddingVertical: SPACING.xxxl,
    paddingHorizontal: SPACING.xxl,
    backgroundColor: "rgba(9,13,18,0.94)",
    borderRadius: RADIUS.xl,
    marginHorizontal: SPACING.xl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 24,
    width: "100%",
    maxWidth: 340,
  },
  iconRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: GLASS.cardActive,
    borderWidth: 1.5,
    borderColor: GLASS.cardActiveBorder,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 10,
  },
  iconInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(107,228,197,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    alignItems: "center",
    gap: SPACING.xs,
  },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxl,
    color: COLORS.ink,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    lineHeight: 20,
  },
  btn: {
    alignSelf: "stretch",
    marginTop: SPACING.xs,
  },
});
