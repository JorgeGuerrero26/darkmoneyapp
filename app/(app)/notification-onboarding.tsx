import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Battery, Bell, CheckCircle2, Eye, ShieldCheck } from "lucide-react-native";

import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { notificationDetection } from "../../lib/notification-detection-native";
import { getNotificationsModule } from "../../lib/notifications-runtime";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

const Notifications = getNotificationsModule();

export const NOTIFICATION_ONBOARDING_SEEN_KEY = "notification_onboarding_seen_v1";

/**
 * Helper used by other screens (settings, dashboard) to decide whether to redirect a
 * new user to the onboarding flow. Returns true if onboarding has already been completed.
 */
export async function hasSeenNotificationOnboarding(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(NOTIFICATION_ONBOARDING_SEEN_KEY);
    return value === "1";
  } catch {
    return false;
  }
}

type StepKey = "intro" | "notification_access" | "overlay" | "battery";

const STEP_ORDER: StepKey[] = ["intro", "notification_access", "overlay", "battery"];

export default function NotificationOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: { settings: "/(app)/settings" },
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [notificationAccess, setNotificationAccess] = useState(false);
  const [overlayAccess, setOverlayAccess] = useState(false);
  const [batteryOptimized, setBatteryOptimized] = useState(true);

  const refreshPermissions = useCallback(async () => {
    const available = notificationDetection.isAvailable();
    setNativeAvailable(available);
    if (!available) return;
    const [hasNotificationAccess, hasOverlayAccess, ignoringBattery] = await Promise.all([
      notificationDetection.isNotificationAccessEnabled(),
      notificationDetection.canDrawOverlays(),
      notificationDetection.isIgnoringBatteryOptimizations(),
    ]);
    setNotificationAccess(hasNotificationAccess);
    setOverlayAccess(hasOverlayAccess);
    setBatteryOptimized(ignoringBattery);
  }, []);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  // Re-check when the user comes back from the system Settings screen.
  useFocusEffect(useCallback(() => {
    void refreshPermissions();
  }, [refreshPermissions]));

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshPermissions();
    });
    return () => sub.remove();
  }, [refreshPermissions]);

  const currentStep: StepKey = STEP_ORDER[stepIndex];
  const totalSteps = STEP_ORDER.length;

  const goNext = useCallback(() => {
    setStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
  }, [totalSteps]);

  const finish = useCallback(async () => {
    try {
      await AsyncStorage.setItem(NOTIFICATION_ONBOARDING_SEEN_KEY, "1");
    } catch {
      // Non-blocking: even if AsyncStorage fails, do not trap the user.
    }
    router.replace("/(app)/notification-detection" as never);
  }, [router]);

  const requestNotificationsPush = useCallback(async () => {
    if (!Notifications) return;
    await Notifications.requestPermissionsAsync();
  }, []);

  const stepContent = useMemo(() => {
    switch (currentStep) {
      case "intro":
        return {
          icon: <Bell size={36} color={COLORS.primary} />,
          title: "Detección automática de movimientos",
          body:
            "DarkMoney lee las notificaciones de tus apps bancarias para sugerirte registros rápidos. Nada se envía a terceros: el análisis ocurre en tu teléfono.",
          status: undefined as boolean | undefined,
          cta: { label: "Continuar", onPress: goNext },
          help: undefined as string | undefined,
        };
      case "notification_access":
        return {
          icon: <ShieldCheck size={36} color={COLORS.primary} />,
          title: "Acceso a notificaciones",
          body:
            "Permite que DarkMoney lea las notificaciones de Yape, BCP, Interbank, BBVA y otras apps que actives. Solo procesamos las que vienen de apps financieras seleccionadas.",
          status: notificationAccess,
          cta: notificationAccess
            ? { label: "Listo, continuar", onPress: goNext }
            : { label: "Abrir ajustes del sistema", onPress: () => notificationDetection.openNotificationAccessSettings() },
          help: notificationAccess
            ? undefined
            : "En la lista del sistema busca DarkMoney y activa el acceso. Luego vuelve aquí.",
        };
      case "overlay":
        return {
          icon: <Eye size={36} color={COLORS.primary} />,
          title: "Permiso de superposición",
          body:
            "Para mostrarte el registro rápido sin abrir la app (incluso con la pantalla bloqueada), necesitamos permiso para dibujar encima de otras apps.",
          status: overlayAccess,
          cta: overlayAccess
            ? { label: "Listo, continuar", onPress: goNext }
            : { label: "Activar superposición", onPress: () => notificationDetection.openOverlaySettings() },
          help: overlayAccess
            ? undefined
            : "Sin este permiso, el registro rápido se abre como diálogo cuando la app está abierta.",
        };
      case "battery":
        return {
          icon: <Battery size={36} color={COLORS.primary} />,
          title: "Optimización de batería",
          body:
            "Para que la detección funcione siempre (incluso con la app cerrada), Android necesita dejar de optimizar la batería de DarkMoney.",
          status: batteryOptimized,
          cta: batteryOptimized
            ? { label: "Finalizar", onPress: () => void finish() }
            : { label: "Permitir uso en segundo plano", onPress: () => notificationDetection.requestIgnoreBatteryOptimizations() },
          help: batteryOptimized
            ? undefined
            : "Sin esta exclusión, las notificaciones detectadas pueden retrasarse o perderse cuando el teléfono está inactivo.",
        };
    }
  }, [batteryOptimized, currentStep, finish, goNext, notificationAccess, overlayAccess]);

  const isLastStep = stepIndex === totalSteps - 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScreenHeader title="Configurar detección" onBack={handleBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.lg }]}>
        <View style={styles.progress}>
          {STEP_ORDER.map((_, index) => (
            <View
              key={index}
              style={[styles.progressDot, index <= stepIndex ? styles.progressDotActive : null]}
            />
          ))}
        </View>

        <Card style={styles.card}>
          <View style={styles.iconWrap}>{stepContent.icon}</View>
          <Text style={styles.title}>{stepContent.title}</Text>
          <Text style={styles.body}>{stepContent.body}</Text>

          {typeof stepContent.status === "boolean" ? (
            <View style={[styles.statusRow, stepContent.status ? styles.statusOk : styles.statusPending]}>
              {stepContent.status ? (
                <>
                  <CheckCircle2 size={18} color={COLORS.success} />
                  <Text style={styles.statusOkText}>Activo</Text>
                </>
              ) : (
                <Text style={styles.statusPendingText}>Pendiente</Text>
              )}
            </View>
          ) : null}

          {stepContent.help ? <Text style={styles.help}>{stepContent.help}</Text> : null}

          <Button
            label={stepContent.cta.label}
            onPress={stepContent.cta.onPress}
            variant="primary"
            style={styles.cta}
          />

          {!isLastStep && stepIndex > 0 ? (
            <Button label="Omitir este paso" onPress={goNext} variant="ghost" style={styles.skipBtn} />
          ) : null}

          {!nativeAvailable && stepIndex > 0 ? (
            <Text style={styles.help}>
              Tu dispositivo no soporta la detección nativa. Podrás registrar movimientos manualmente.
            </Text>
          ) : null}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bgVoid },
  content: { padding: SPACING.lg },
  progress: { flexDirection: "row", gap: SPACING.xs, justifyContent: "center", marginBottom: SPACING.md },
  progressDot: { width: 28, height: 4, borderRadius: 2, backgroundColor: COLORS.border },
  progressDotActive: { backgroundColor: COLORS.primary },
  card: { padding: SPACING.lg, gap: SPACING.md, borderRadius: RADIUS.lg },
  iconWrap: { alignItems: "center", marginTop: SPACING.sm, marginBottom: SPACING.xs },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
    textAlign: "center",
  },
  body: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.fog,
    textAlign: "center",
    lineHeight: 22,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    alignSelf: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  statusOk: { backgroundColor: COLORS.success + "1A" },
  statusPending: { backgroundColor: COLORS.warning + "1A" },
  statusOkText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.success },
  statusPendingText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.warning },
  help: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
  },
  cta: { marginTop: SPACING.sm },
  skipBtn: { marginTop: SPACING.xs },
});
