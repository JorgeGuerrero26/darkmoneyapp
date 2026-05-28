import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Battery, Bell, ChevronDown, Eye, ShieldCheck } from "lucide-react-native";
import {
  AppState,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { hasSeenNotificationOnboarding } from "./notification-onboarding";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { getNotificationsModule } from "../../lib/notifications-runtime";
import { notificationDetection } from "../../lib/notification-detection-native";
import { FINANCIAL_APPS, packageNamesForEnabledApps, type FinancialAppKey } from "../../lib/notification-detection-apps";
import {
  useNotificationDetectionSettingsQuery,
  useUpsertNotificationDetectionSettingMutation,
  type NotificationDetectionAppSetting,
} from "../../services/queries/notification-detection";
import { useWorkspaceSnapshotQuery, useDashboardAnalyticsQuery } from "../../services/queries/workspace-data";
import { useMovementPatternsQuery } from "../../services/queries/movement-patterns";
import { buildPatternMaps } from "../../lib/movement-patterns";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import type { AccountSummary } from "../../types/domain";

const Notifications = getNotificationsModule();

export default function NotificationDetectionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ from?: string | string[] }>();
  const fromParam = Array.isArray(params.from) ? params.from[0] : params.from;
  const { handleBack } = useOriginBackNavigation({
    originRoutes: { settings: "/(app)/settings" },
  });
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = await hasSeenNotificationOnboarding();
      if (cancelled) return;
      if (!seen && Platform.OS === "android" && notificationDetection.isAvailable()) {
        const suffix = fromParam ? `?from=${encodeURIComponent(fromParam)}` : "";
        router.replace((`/(app)/notification-onboarding${suffix}`) as never);
        return;
      }
      setOnboardingChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [fromParam, router]);
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: patternMovements } = useMovementPatternsQuery(activeWorkspaceId);
  const { data: dashboardAnalytics } = useDashboardAnalyticsQuery(activeWorkspaceId, profile?.id);
  const settingsQuery = useNotificationDetectionSettingsQuery(profile?.id, activeWorkspaceId);
  const upsertSetting = useUpsertNotificationDetectionSettingMutation(profile?.id, activeWorkspaceId);

  const [nativeAvailable, setNativeAvailable] = useState(false);
  const [notificationAccess, setNotificationAccess] = useState(false);
  const [overlayAccess, setOverlayAccess] = useState(false);
  const [pushAccess, setPushAccess] = useState(false);
  const [batteryOptimized, setBatteryOptimized] = useState(true);
  const [accountPickerFor, setAccountPickerFor] = useState<FinancialAppKey | null>(null);

  const activeAccounts = useMemo(
    () => (snapshot?.accounts ?? []).filter((account) => !account.isArchived),
    [snapshot?.accounts],
  );
  const settings = settingsQuery.data ?? FINANCIAL_APPS.map((app) => ({
    financialAppKey: app.key,
    enabled: app.defaultEnabled ?? true,
    defaultAccountId: null,
  }));
  const settingsByKey = useMemo(
    () => new Map(settings.map((setting) => [setting.financialAppKey, setting])),
    [settings],
  );
  const detectionEnabled = settings.some((setting) => setting.enabled);
  const selectedSetting = accountPickerFor ? settingsByKey.get(accountPickerFor) ?? null : null;

  const refreshPermissions = useCallback(async () => {
    const available = notificationDetection.isAvailable();
    setNativeAvailable(available);
    if (!available) return;
    const [hasNotificationAccess, hasOverlayAccess, pushPermissions, ignoringBattery] = await Promise.all([
      notificationDetection.isNotificationAccessEnabled(),
      notificationDetection.canDrawOverlays(),
      Notifications?.getPermissionsAsync?.(),
      notificationDetection.isIgnoringBatteryOptimizations(),
    ]);
    setNotificationAccess(hasNotificationAccess);
    setOverlayAccess(hasOverlayAccess);
    setPushAccess(pushPermissions?.status === "granted");
    setBatteryOptimized(ignoringBattery);
    if (hasNotificationAccess) notificationDetection.requestActiveNotificationScan();
  }, []);

  useEffect(() => {
    void refreshPermissions();
  }, [refreshPermissions]);

  useFocusEffect(
    useCallback(() => {
      void refreshPermissions();
    }, [refreshPermissions]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshPermissions();
    });
    return () => subscription.remove();
  }, [refreshPermissions]);

  const wordToCategory = useMemo(() => {
    if (!patternMovements) return undefined;
    const maps = buildPatternMaps(patternMovements);
    const result: Record<string, { id: number; count: number }[]> = {};
    for (const [word, entries] of maps.wordToCategory) {
      result[word] = entries.slice(0, 5);
    }
    return result;
  }, [patternMovements]);

  const learningFeedbackForNative = useMemo(() => {
    return (dashboardAnalytics?.learningFeedback ?? [])
      .filter(
        (fb) =>
          fb.acceptedCategoryId != null &&
          (fb.feedbackKind === "accepted_category_suggestion" || fb.feedbackKind === "manual_category_change"),
      )
      .map((fb) => ({
        normalizedDescription: fb.normalizedDescription ?? "",
        acceptedCategoryId: fb.acceptedCategoryId,
      }));
  }, [dashboardAnalytics?.learningFeedback]);

  useEffect(() => {
    if (!nativeAvailable) return;
    const enabledKeys = settings.filter((setting) => setting.enabled).map((setting) => setting.financialAppKey);
    notificationDetection.setDetectionEnabled(enabledKeys.length > 0);
    notificationDetection.setAllowedPackages(packageNamesForEnabledApps(enabledKeys));
    notificationDetection.setRuntimeContext({
      userId: profile?.id ?? null,
      workspaceId: activeWorkspaceId ?? null,
      accounts: activeAccounts.map((account) => ({
        id: account.id,
        name: account.name,
        currencyCode: account.currencyCode,
      })),
      categories: (snapshot?.categories ?? [])
        .filter((category) => category.isActive)
        .map((category) => ({ id: category.id, name: category.name, kind: category.kind })),
      settings,
      wordToCategory: wordToCategory ?? {},
      learningFeedback: learningFeedbackForNative,
    });
  }, [activeAccounts, activeWorkspaceId, nativeAvailable, profile?.id, settings, snapshot?.categories, wordToCategory, learningFeedbackForNative]);

  async function requestPushPermission() {
    if (Platform.OS !== "android" || !Notifications) return;
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") {
      setPushAccess(true);
      return;
    }
    const result = await Notifications.requestPermissionsAsync();
    setPushAccess(result.status === "granted");
  }

  function patchSetting(key: FinancialAppKey, patch: Partial<NotificationDetectionAppSetting>) {
    const app = FINANCIAL_APPS.find((item) => item.key === key);
    const current = settingsByKey.get(key) ?? { financialAppKey: key, enabled: app?.defaultEnabled ?? true, defaultAccountId: null };
    upsertSetting.mutate({ ...current, ...patch, financialAppKey: key });
  }

  function accountName(accountId?: number | null) {
    if (!accountId) return "Elegir cuenta";
    return activeAccounts.find((account) => account.id === accountId)?.name ?? "Cuenta no disponible";
  }

  if (!onboardingChecked) {
    return <View style={[styles.screen, { paddingTop: insets.top }]} />;
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Detección automática" onBack={handleBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xl }]}>
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <View style={styles.iconBubble}>
              <ShieldCheck size={18} color={COLORS.primary} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>Movimientos desde notificaciones</Text>
              <Text style={styles.text}>
                DarkMoney analiza solo las apps financieras que actives para sugerir movimientos. No registra nada sin tu confirmación.
              </Text>
            </View>
          </View>
        </Card>

        {!nativeAvailable ? (
          <Card style={styles.card}>
            <Text style={styles.title}>Detección no disponible en este build</Text>
            <Text style={styles.text}>
              La detección automática de movimientos desde notificaciones requiere la app instalada desde Play Store (build nativo de Android). En Expo Go o en web no está disponible.
            </Text>
            <TouchableOpacity
              style={styles.bannerCta}
              onPress={() => void Linking.openSettings()}
              activeOpacity={0.84}
            >
              <Text style={styles.bannerCtaText}>Abrir ajustes del sistema</Text>
            </TouchableOpacity>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Text style={styles.title}>Permisos</Text>
            <PermissionRow
              icon={<Bell size={17} color={COLORS.primary} />}
              label="Acceso a notificaciones"
              enabled={notificationAccess}
              onActivate={() => {
                notificationDetection.openNotificationAccessSettings();
              }}
              activateLabel="Abrir ajustes"
            />
            <PermissionRow
              icon={<Bell size={17} color={COLORS.secondary} />}
              label="Notificaciones de DarkMoney"
              enabled={pushAccess}
              onActivate={Notifications ? requestPushPermission : () => void Linking.openSettings()}
              activateLabel={Notifications ? "Activar" : "Abrir ajustes"}
            />
            <PermissionRow
              icon={<Eye size={17} color={COLORS.warning} />}
              label="Mostrar sobre otras apps"
              enabled={overlayAccess}
              onActivate={() => {
                notificationDetection.openOverlaySettings();
              }}
              activateLabel="Abrir ajustes"
            />
            <PermissionRow
              icon={<Battery size={17} color={COLORS.success ?? COLORS.primary} />}
              label="Sin restricción de batería"
              enabled={batteryOptimized}
              onActivate={() => {
                notificationDetection.requestIgnoreBatteryOptimizations();
              }}
              activateLabel="Desactivar optimización"
            />
          </Card>
        )}

        <Card style={styles.card}>
          <View style={styles.switchHeader}>
            <View style={styles.copy}>
              <Text style={styles.title}>Apps financieras</Text>
              <Text style={styles.text}>
                Elige qué apps puede analizar DarkMoney y a qué cuenta se asignará cada movimiento detectado.
              </Text>
            </View>
            <Text style={[styles.statePill, detectionEnabled ? styles.stateOn : styles.stateOff]}>
              {detectionEnabled ? "Activa" : "Apagada"}
            </Text>
          </View>

          {FINANCIAL_APPS.map((app) => {
            const setting = settingsByKey.get(app.key) ?? { financialAppKey: app.key, enabled: true, defaultAccountId: null };
            return (
              <View key={app.key} style={styles.appRow}>
                <View style={styles.appTop}>
                  <View style={styles.copy}>
                    <Text style={styles.appTitle}>{app.label}</Text>
                    <Text style={styles.appSubtitle}>{app.subtitle}</Text>
                  </View>
                  <Switch
                    value={setting.enabled}
                    onValueChange={(enabled) => patchSetting(app.key, { enabled })}
                    trackColor={{ false: COLORS.border, true: COLORS.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                <TouchableOpacity
                  style={[styles.accountButton, !setting.enabled && styles.disabledSurface]}
                  disabled={!setting.enabled}
                  activeOpacity={0.82}
                  onPress={() => setAccountPickerFor(app.key)}
                >
                  <Text style={styles.accountLabel}>Cuenta predeterminada</Text>
                  <View style={styles.accountValueRow}>
                    <Text style={styles.accountValue}>{accountName(setting.defaultAccountId)}</Text>
                    <ChevronDown size={16} color={COLORS.textMuted} />
                  </View>
                </TouchableOpacity>
              </View>
            );
          })}
        </Card>

        <Button
          label="Ver tutorial paso a paso"
          variant="ghost"
          onPress={() => router.push("/(app)/notification-onboarding?replay=1" as never)}
        />
      </ScrollView>

      <Modal visible={Boolean(accountPickerFor)} transparent animationType="fade" onRequestClose={() => setAccountPickerFor(null)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.title}>Cuenta predeterminada</Text>
            <Text style={styles.text}>Se usará como primera opción al registrar movimientos detectados.</Text>
            <ScrollView style={styles.accountList}>
              {activeAccounts.map((account: AccountSummary) => (
                <TouchableOpacity
                  key={account.id}
                  style={[
                    styles.accountOption,
                    selectedSetting?.defaultAccountId === account.id && styles.accountOptionActive,
                  ]}
                  onPress={() => {
                    if (accountPickerFor) patchSetting(accountPickerFor, { defaultAccountId: account.id });
                    setAccountPickerFor(null);
                  }}
                >
                  <Text style={styles.accountOptionName}>{account.name}</Text>
                  <Text style={styles.accountOptionMeta}>{account.currencyCode}</Text>
                </TouchableOpacity>
              ))}
              {activeAccounts.length === 0 ? <Text style={styles.text}>No hay cuentas activas.</Text> : null}
            </ScrollView>
            <Button label="Cancelar" variant="secondary" onPress={() => setAccountPickerFor(null)} />
          </Card>
        </View>
      </Modal>
    </View>
  );
}

function PermissionRow({
  icon, label, enabled, onActivate, activateLabel,
}: {
  icon: ReactNode;
  label: string;
  enabled: boolean;
  onActivate?: () => void;
  activateLabel?: string;
}) {
  return (
    <View style={styles.permissionRow}>
      <View style={styles.permissionIcon}>{icon}</View>
      <View style={styles.permissionBody}>
        <Text style={styles.permissionLabel}>{label}</Text>
        {!enabled && onActivate ? (
          <TouchableOpacity onPress={onActivate} style={styles.activateButton}>
            <Text style={styles.activateLabel}>{activateLabel ?? "Activar"}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={[styles.permissionValue, enabled ? styles.ok : styles.warn]}>
        {enabled ? "Activo" : "Pendiente"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md },
  card: { padding: SPACING.md, gap: SPACING.md },
  headerRow: { flexDirection: "row", gap: SPACING.md },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary + "1A",
  },
  copy: { flex: 1, gap: SPACING.xs },
  title: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  text: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20 },
  permissionRow: {
    minHeight: 44,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.subtle,
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  permissionIcon: { width: 24, alignItems: "center" },
  permissionBody: { flex: 1, gap: 3 },
  permissionLabel: { color: COLORS.text, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm },
  permissionValue: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  activateButton: { alignSelf: "flex-start" },
  activateLabel: { color: COLORS.primary, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  bannerCta: {
    alignSelf: "flex-start",
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    backgroundColor: COLORS.primary + "14",
  },
  bannerCtaText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.primary,
  },
  ok: { color: COLORS.income },
  warn: { color: COLORS.warning },
  switchHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  statePill: {
    overflow: "hidden",
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  stateOn: { color: COLORS.primary, backgroundColor: COLORS.successMuted },
  stateOff: { color: COLORS.textMuted, backgroundColor: SURFACE.subtle },
  appRow: {
    gap: SPACING.sm,
    borderRadius: RADIUS.lg,
    backgroundColor: SURFACE.subtle,
    padding: SPACING.md,
  },
  appTop: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  appTitle: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm },
  appSubtitle: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, lineHeight: 17 },
  accountButton: {
    minHeight: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  disabledSurface: { opacity: 0.55 },
  accountLabel: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs },
  accountValueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  accountValue: { flex: 1, color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.62)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  modalCard: { maxHeight: "76%", padding: SPACING.md, gap: SPACING.md },
  accountList: { maxHeight: 360 },
  accountOption: {
    minHeight: 52,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    justifyContent: "center",
    gap: 2,
  },
  accountOptionActive: {
    backgroundColor: COLORS.primary + "12",
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
  },
  accountOptionName: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm },
  accountOptionMeta: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
});
