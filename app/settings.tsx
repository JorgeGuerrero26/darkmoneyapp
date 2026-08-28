import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { ChevronRight, Fingerprint, Mail, ShieldCheck } from "lucide-react-native";

import { useAuth } from "../lib/auth-context";
import { useWorkspace, useWorkspaceListStore } from "../lib/workspace-context";
import { humanizeError } from "../lib/errors";
import { useUiStore } from "../store/ui-store";
import { useDashboardAiTone } from "../features/dashboard/hooks/useDashboardAiTone";
import { DASHBOARD_AI_TONE_OPTIONS } from "../features/dashboard/lib/dashboard-ai-content";
import {
  fetchUserWorkspaces,
  useCreateSharedWorkspaceMutation,
  useCreateWorkspaceInvitationMutation,
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
  type WorkspaceInvitationInput,
} from "../services/queries/workspace-data";
import { useSyncExchangeRatePairMutation } from "../services/queries/exchange-rates";
import {
  inboundEmailAddress,
  useInboundEmailAliasQuery,
  useRotateInboundEmailAliasMutation,
} from "../services/queries/inbound-email-alias";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { BottomSheet } from "../components/ui/BottomSheet";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { CurrencySelector } from "../components/ui/CurrencySelector";
import { ResourceContextNote } from "../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../components/ui/ResourceModuleTemplate";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { useToast } from "../hooks/useToast";
import { COLORS, EXTENDED_PALETTE, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../constants/theme";
import { IOS_FLOATING_TAB_BAR_SPACE } from "../constants/floating-tab-bar";
import { DEFAULT_EXCHANGE_CURRENCY, normalizeSupportedCurrencyCode } from "../constants/currencies";
import type { WorkspaceRole } from "../types/domain";
import { SafeBlurView } from "../components/ui/SafeBlurView";
import { CHANGELOG, CHANGELOG_OLDER } from "../constants/changelog";
import { useOriginBackNavigation } from "../hooks/useOriginBackNavigation";
import { registerForPushNotifications, savePushTokenToSupabase } from "../hooks/usePushNotifications";

const ROLE_OPTIONS: { label: string; value: Exclude<WorkspaceRole, "owner"> }[] = [
  { label: "Administrador", value: "admin" },
  { label: "Miembro", value: "member" },
  { label: "Lector", value: "viewer" },
];

function SettingsScreen() {
  const insets = useSafeAreaInsets();

  // ── Sign out dialog (must be before useOriginBackNavigation) ────────────
  const [signOutVisible, setSignOutVisible] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [changelogVisible, setChangelogVisible] = useState(false);

  const { handleBack } = useOriginBackNavigation({ skipInterception: signingOut });
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, saveProfile, saveAvatar, removeAvatar, signOut } = useAuth();
  const { activeWorkspace, activeWorkspaceId, setActiveWorkspaceId, setWorkspaces } = useWorkspace();
  const { workspaces } = useWorkspaceListStore();
  const { showToast } = useToast();
  const notificationPreferencesQuery = useNotificationPreferencesQuery(profile?.id ?? null);
  const updateNotificationPreferencesMutation = useUpdateNotificationPreferencesMutation(profile?.id ?? null);
  const syncExchangeRatePair = useSyncExchangeRatePairMutation();

  // ── Detección por correo ─────────────────────────────────────────────────
  const inboundAliasQuery = useInboundEmailAliasQuery(profile?.id ?? null, activeWorkspaceId);
  const rotateInboundAlias = useRotateInboundEmailAliasMutation(
    profile?.id ?? null,
    activeWorkspaceId,
  );

  const handleCopyInboundAddress = async () => {
    if (!inboundAliasQuery.data) return;
    await Clipboard.setStringAsync(inboundEmailAddress(inboundAliasQuery.data));
    showToast("Dirección copiada", "success");
  };

  const handleRotateInboundAlias = async () => {
    try {
      await rotateInboundAlias.mutateAsync();
      showToast("Dirección lista. Actualiza el filtro de Gmail.", "success");
    } catch (err) {
      showToast(humanizeError(err), "error");
    }
  };


  // ── Notificaciones push ──────────────────────────────────────────────────
  // El sistema tiene bloqueados los permisos de notificación para la app:
  // muestra la ayuda contextual con acceso directo a los ajustes.
  const [pushPermissionBlocked, setPushPermissionBlocked] = useState(false);

  // ── Biometrics ───────────────────────────────────────────────────────────
  const SECURE_EMAIL_KEY = "darkmoney_bio_email";
  const SECURE_PASS_KEY = "darkmoney_bio_password";

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [bioCredsStored, setBioCredsStored] = useState(false);
  const { biometricEnabled, setBiometricEnabled, dashboardMode, setDashboardMode } = useUiStore();
  const { tone: aiTone, setTone: setAiTone } = useDashboardAiTone(profile?.id ?? null);

  // Password setup modal (shown after biometric auth when enabling)
  const [bioSetupVisible, setBioSetupVisible] = useState(false);
  const [bioSetupPassword, setBioSetupPassword] = useState("");
  const [bioSetupError, setBioSetupError] = useState("");

  useEffect(() => {
    void (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
      if (hasHardware && isEnrolled) {
        const stored = await SecureStore.getItemAsync(SECURE_EMAIL_KEY);
        setBioCredsStored(Boolean(stored));
      }
    })();
  }, []);

  async function handleBiometricToggle(newValue: boolean) {
    if (newValue) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirma tu huella para activar el acceso biométrico",
        fallbackLabel: "Usar contraseña",
        disableDeviceFallback: false,
      });
      if (result.success) {
        setBioSetupPassword("");
        setBioSetupError("");
        setBioSetupVisible(true);
      }
    } else {
      setBiometricEnabled(false);
      await SecureStore.deleteItemAsync(SECURE_EMAIL_KEY);
      await SecureStore.deleteItemAsync(SECURE_PASS_KEY);
      setBioCredsStored(false);
    }
  }

  async function handleBioSetupConfirm() {
    if (!bioSetupPassword.trim()) {
      setBioSetupError("Ingresa tu contraseña para continuar");
      return;
    }
    setBioSetupError("");
    const email = profile?.email ?? "";
    await SecureStore.setItemAsync(SECURE_EMAIL_KEY, email);
    await SecureStore.setItemAsync(SECURE_PASS_KEY, bioSetupPassword);
    setBiometricEnabled(true);
    setBioCredsStored(true);
    setBioSetupVisible(false);
    setBioSetupPassword("");
    showToast("Acceso con huella activado", "success");
  }

  function handleBioSetupCancel() {
    setBioSetupVisible(false);
    setBioSetupPassword("");
    setBioSetupError("");
  }

  async function confirmSignOut() {
    setSigningOut(true);
    await signOut().finally(() => setSigningOut(false));
  }

  // ── Workspace invite sheet ────────────────────────────────────────────────
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const [toneSheetOpen, setToneSheetOpen] = useState(false);
  const [inboundSheetOpen, setInboundSheetOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<WorkspaceRole, "owner">>("member");
  const [inviteNote, setInviteNote] = useState("");
  const inviteMutation = useCreateWorkspaceInvitationMutation(activeWorkspaceId);

  function openInviteSheet() {
    setInviteEmail("");
    setInviteRole("member");
    setInviteNote("");
    setInviteSheetOpen(true);
  }

  async function handleSendInvite() {
    if (!inviteEmail.trim() || !activeWorkspaceId) return;
    const input: WorkspaceInvitationInput = {
      workspaceId: activeWorkspaceId,
      invitedEmail: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
      note: inviteNote.trim() || null,
    };
    try {
      const result = await inviteMutation.mutateAsync(input);
      setInviteSheetOpen(false);
      if (result.alreadyMember) {
        showToast(`${result.invitedEmail} ya es miembro`, "info");
      } else if (result.emailSent) {
        showToast(`Invitación enviada a ${result.invitedEmail}`, "success");
      } else {
        showToast("Invitación creada (sin email)", "success");
      }
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  // ── Create workspace sheet ────────────────────────────────────────────────
  const [createWsSheetOpen, setCreateWsSheetOpen] = useState(false);
  const [newWsName, setNewWsName] = useState("");
  const [newWsCurrency, setNewWsCurrency] = useState(normalizeSupportedCurrencyCode(profile?.baseCurrencyCode));
  const createWsMutation = useCreateSharedWorkspaceMutation();

  function openCreateWsSheet() {
    setNewWsName("");
    setNewWsCurrency(normalizeSupportedCurrencyCode(profile?.baseCurrencyCode));
    setCreateWsSheetOpen(true);
  }

  async function syncDefaultExchangeCurrency(currencyCode: string) {
    const normalized = normalizeSupportedCurrencyCode(currencyCode);
    if (normalized === DEFAULT_EXCHANGE_CURRENCY) return;

    try {
      await syncExchangeRatePair.mutateAsync({
        fromCurrencyCode: normalized,
        toCurrencyCode: DEFAULT_EXCHANGE_CURRENCY,
      });
    } catch (err: unknown) {
      showToast(`No se pudo sincronizar ${normalized}/${DEFAULT_EXCHANGE_CURRENCY}: ${humanizeError(err)}`, "warning");
    }
  }

  async function handleCreateWorkspace() {
    if (!newWsName.trim() || !profile?.id) return;
    try {
      const workspace = await createWsMutation.mutateAsync({
        name: newWsName.trim(),
        baseCurrencyCode: newWsCurrency,
      });
      await syncDefaultExchangeCurrency(newWsCurrency);
      const refreshedWorkspaces = await queryClient.fetchQuery({
        queryKey: ["user-workspaces", profile.id],
        queryFn: () => fetchUserWorkspaces(profile.id),
      });
      setWorkspaces(refreshedWorkspaces);
      setActiveWorkspaceId(workspace.id);
      setCreateWsSheetOpen(false);
      showToast("Workspace creado", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  function handleSignOut() {
    setSignOutVisible(true);
  }

  const activeToneLabel =
    DASHBOARD_AI_TONE_OPTIONS.find((option) => option.id === aiTone)?.label ??
    DASHBOARD_AI_TONE_OPTIONS[0].label;

  const canInvite =
    activeWorkspace?.kind === "shared" &&
    (activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin");
  const dailyDigestEnabled = notificationPreferencesQuery.data?.dailyDigestEnabled !== false;
  const predictiveAlertsEnabled = notificationPreferencesQuery.data?.predictiveAlertsEnabled !== false;
  const pushEnabled = notificationPreferencesQuery.data?.pushEnabled === true;
  const pushToken = notificationPreferencesQuery.data?.pushToken ?? null;
  const biometricActive = biometricEnabled && bioCredsStored;

  async function handlePushToggle(nextValue: boolean) {
    if (!profile?.id) return;

    if (!nextValue) {
      try {
        await updateNotificationPreferencesMutation.mutateAsync({
          dailyDigestEnabled,
          predictiveAlertsEnabled,
          pushEnabled: false,
        });
        setPushPermissionBlocked(false);
        showToast("Avisos desactivados en este teléfono", "success");
      } catch (err: unknown) {
        showToast(humanizeError(err), "error");
      }
      return;
    }

    try {
      const result = await registerForPushNotifications();
      if (result.ok) {
        await savePushTokenToSupabase(profile.id, result.token);
        await queryClient.invalidateQueries({ queryKey: ["notification-preferences", profile.id] });
        setPushPermissionBlocked(false);
        showToast("Listo: los avisos llegarán a este teléfono", "success");
        return;
      }
      switch (result.reason) {
        case "permissions_denied":
          // El teléfono tiene bloqueadas las notificaciones para la app: mostrar
          // la ayuda contextual con acceso directo a los ajustes del sistema.
          setPushPermissionBlocked(true);
          break;
        case "network_error":
          showToast("Sin conexión. Revisa tu internet e inténtalo de nuevo.", "warning");
          break;
        default:
          // expo_go / not_device / module_unavailable: entornos de desarrollo.
          showToast("Los avisos no están disponibles en este entorno.", "warning");
          break;
      }
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleDailyDigestToggle(nextValue: boolean) {
    try {
      await updateNotificationPreferencesMutation.mutateAsync({
        dailyDigestEnabled: nextValue,
        predictiveAlertsEnabled,
      });
      showToast(
        nextValue ? "Digest diario activado" : "Digest diario desactivado",
        "success",
      );
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handlePredictiveAlertsToggle(nextValue: boolean) {
    try {
      await updateNotificationPreferencesMutation.mutateAsync({
        dailyDigestEnabled,
        predictiveAlertsEnabled: nextValue,
      });
      showToast(
        nextValue ? "Alertas predictivas activadas" : "Alertas predictivas desactivadas",
        "success",
      );
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={<ScreenHeader title="Configuración" onBack={handleBack} />}
      context={<ResourceContextNote>Administra perfil, workspaces, seguridad y preferencias del dispositivo.</ResourceContextNote>}
      list={
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            // Despeja el safe area + la franja de la píldora flotante de iOS.
            { paddingBottom: insets.bottom + IOS_FLOATING_TAB_BAR_SPACE + SPACING.xxxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >

          {/* 620 px de formulario para algo que se toca una vez al año. Vive en /profile. */}
          <TouchableOpacity
            style={styles.settingsNavRow}
            activeOpacity={0.82}
            onPress={() => router.push("/(app)/profile?from=settings" as any)}
          >
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.profileRowAvatar} />
            ) : (
              <View style={[styles.settingsNavIcon, styles.profileRowFallback]}>
                <Text style={styles.profileRowInitials}>{profile?.initials ?? "DM"}</Text>
              </View>
            )}
            <View style={styles.settingsNavCopy}>
              <Text style={styles.switchLabel}>{profile?.fullName || "Tu perfil"}</Text>
              <Text style={styles.switchDesc}>
                {profile?.email ?? ""}
                {profile?.baseCurrencyCode ? ` · ${normalizeSupportedCurrencyCode(profile.baseCurrencyCode)}` : ""}
              </Text>
            </View>
            <ChevronRight size={16} color={COLORS.storm} />
          </TouchableOpacity>

          {/* Workspaces */}
          <Card>
            <Text style={styles.sectionTitle}>Workspaces</Text>
            {workspaces.map((ws) => (
              <View key={ws.id} style={[styles.wsRow, ws.id === activeWorkspaceId && styles.wsRowActive]}>
                <View style={styles.wsInfo}>
                  <Text style={styles.wsName}>{ws.name}</Text>
                  <Text style={styles.wsKind}>
                    {ws.kind === "personal" ? "Personal" : "Compartido"} · {ws.role}
                  </Text>
                </View>
                {ws.id === activeWorkspaceId ? <Text style={styles.wsActiveBadge}>Activo</Text> : null}
              </View>
            ))}

            <View style={styles.wsActions}>
              {canInvite ? (
                <TouchableOpacity style={styles.wsActionBtn} onPress={openInviteSheet}>
                  <Text style={styles.wsActionText}>＋ Invitar miembro</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.wsActionBtn} onPress={openCreateWsSheet}>
                <Text style={styles.wsActionText}>＋ Crear workspace</Text>
              </TouchableOpacity>
            </View>
          </Card>

          {/* Seguridad */}
          {biometricAvailable ? (
            <Card>
              <Text style={styles.sectionTitle}>Seguridad</Text>
              <View style={styles.switchRow}>
                <View style={styles.switchInfo}>
                  <Text style={styles.switchLabel}>Acceso con huella digital</Text>
                  <Text style={styles.switchDesc}>
                    {biometricActive
                      ? "Activo · puedes entrar sin contraseña"
                      : bioCredsStored
                        ? "Desactivado · tus credenciales siguen guardadas"
                        : "Actívalo para entrar tocando tu huella"}
                  </Text>
                </View>
                <Switch
                  value={biometricActive}
                  onValueChange={(v) => void handleBiometricToggle(v)}
                  trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  thumbColor={EXTENDED_PALETTE.white}
                />
              </View>
            </Card>
          ) : null}

          <Card>
            <Text style={styles.sectionTitle}>Vista del inicio</Text>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Modo avanzado</Text>
                <Text style={styles.switchDesc}>
                  {dashboardMode === "advanced"
                    ? "Ves patrones, flujo, historial y salud de tus finanzas"
                    : "Ves lo esencial: saldo, movimientos y alertas"}
                </Text>
              </View>
              <Switch
                value={dashboardMode === "advanced"}
                onValueChange={(v) => setDashboardMode(v ? "advanced" : "simple")}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={EXTENDED_PALETTE.white}
              />
            </View>

            {/* El tono es el REGISTRO con que la IA te habla, no lo que se le pide: la caché
                guarda una respuesta por tono y el contrato con el servidor no cambia. Es una
                preferencia, así que se elige una vez aquí en lugar de repintarse en las cinco
                pestañas del dashboard. */}
            {dashboardMode === "advanced" ? (
              <TouchableOpacity
                style={styles.aiToneRow}
                onPress={() => setToneSheetOpen(true)}
                activeOpacity={0.82}
              >
                <Text style={[styles.switchLabel, styles.aiToneLabel]}>Cómo te habla el asistente</Text>
                <Text style={styles.aiToneValue}>{activeToneLabel}</Text>
                <ChevronRight size={16} color={COLORS.storm} />
              </TouchableOpacity>
            ) : null}
          </Card>

          <Card>
            <Text style={styles.sectionTitle}>Notificaciones</Text>
            <TouchableOpacity
              style={styles.settingsNavRow}
              activeOpacity={0.82}
              onPress={() => router.push("/(app)/notification-detection?from=settings" as any)}
            >
              <View style={styles.settingsNavIcon}>
                <ShieldCheck size={18} color={COLORS.primary} />
              </View>
              <View style={styles.settingsNavCopy}>
                <Text style={styles.switchLabel}>Detección automática</Text>
                <Text style={styles.switchDesc}>Sugiere movimientos desde apps financieras seleccionadas.</Text>
              </View>
              <ChevronRight size={16} color={COLORS.storm} />
            </TouchableOpacity>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Notificaciones push</Text>
              </View>
              <Switch
                value={pushEnabled && Boolean(pushToken)}
                onValueChange={(v) => void handlePushToggle(v)}
                disabled={updateNotificationPreferencesMutation.isPending || notificationPreferencesQuery.isLoading}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={EXTENDED_PALETTE.white}
              />
            </View>
            {pushPermissionBlocked ? (
              <View style={styles.pushStatusBox}>
                <Text style={styles.pushStatusTitle}>Permisos bloqueados en el sistema</Text>
                <Text style={styles.pushStatusDesc}>
                  El teléfono tiene bloqueadas las notificaciones para DarkMoney. Ábrelas en los
                  ajustes del sistema y vuelve a activar el interruptor.
                </Text>
                <TouchableOpacity
                  style={styles.pushSecondaryBtn}
                  onPress={() => void Linking.openSettings()}
                  activeOpacity={0.84}
                >
                  <Text style={styles.pushSecondaryText}>Abrir ajustes del sistema</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Resumen diario informativo</Text>
              </View>
              <Switch
                value={dailyDigestEnabled}
                onValueChange={(v) => void handleDailyDigestToggle(v)}
                disabled={updateNotificationPreferencesMutation.isPending || notificationPreferencesQuery.isLoading}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={EXTENDED_PALETTE.white}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Alertas predictivas</Text>
                <Text style={styles.switchDesc}>
                  Aviso cuando tu saldo proyectado no cubre el mes o tus compromisos.
                </Text>
              </View>
              <Switch
                value={predictiveAlertsEnabled}
                onValueChange={(v) => void handlePredictiveAlertsToggle(v)}
                disabled={updateNotificationPreferencesMutation.isPending || notificationPreferencesQuery.isLoading}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={EXTENDED_PALETTE.white}
              />
            </View>
          </Card>

          {/* En iOS no existe la detección de notificaciones de Android, así que esta es la vía;
              pero es configuración de una sola vez, no una tarjeta permanente con dos botones. */}
          <TouchableOpacity
            style={styles.settingsNavRow}
            activeOpacity={0.82}
            onPress={() => setInboundSheetOpen(true)}
          >
            <View style={styles.settingsNavIcon}>
              <Mail size={18} color={COLORS.primary} />
            </View>
            <View style={styles.settingsNavCopy}>
              <Text style={styles.switchLabel}>Detectar pagos por correo</Text>
              <Text style={styles.switchDesc}>
                {inboundAliasQuery.data ? inboundEmailAddress(inboundAliasQuery.data) : "Sin dirección todavía"}
              </Text>
            </View>
            <ChevronRight size={16} color={COLORS.storm} />
          </TouchableOpacity>

          {/* Es la única acción irreversible de la pantalla, así que NO se pinta como el
              control más llamativo: va en texto, al final, donde se busca a propósito. */}
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutRow} activeOpacity={0.7}>
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </TouchableOpacity>

          {Constants.expoConfig?.version ? (
            <TouchableOpacity
              onPress={() => setChangelogVisible(true)}
              accessibilityLabel="Ver novedades de cada versión"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.versionText}>Versión {Constants.expoConfig.version} · Ver novedades</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      }
      overlays={
      <>
      {/* Changelog / novedades por versión */}
      <Modal
        visible={changelogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setChangelogVisible(false)}
      >
        <View style={styles.soOverlay}>
          <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.changelogCard}>
            <Text style={styles.soTitle}>Novedades de DarkMoney</Text>
            <Text style={styles.changelogSubtitle}>Lo que ha ido mejorando en cada versión</Text>
            <ScrollView style={styles.changelogScroll} showsVerticalScrollIndicator={false}>
              {CHANGELOG.map((entry) => (
                <View key={entry.version} style={styles.changelogEntry}>
                  <View style={styles.changelogVersionRow}>
                    <Text style={styles.changelogVersion}>v{entry.version}</Text>
                    <Text style={styles.changelogEntryTitle}>{entry.title}</Text>
                  </View>
                  {entry.changes.map((change, i) => (
                    <View key={i} style={styles.changelogBulletRow}>
                      <Text style={styles.changelogBulletDot}>•</Text>
                      <Text style={styles.changelogBulletText}>{change}</Text>
                    </View>
                  ))}
                </View>
              ))}
              <Text style={styles.changelogOlder}>{CHANGELOG_OLDER}</Text>
            </ScrollView>
            <Button
              label="Cerrar"
              variant="primary"
              size="lg"
              style={styles.bioFullBtn}
              onPress={() => setChangelogVisible(false)}
            />
          </View>
        </View>
      </Modal>

      {/* Biometric setup — password prompt */}
      <Modal
        visible={bioSetupVisible}
        transparent
        animationType="fade"
        onRequestClose={handleBioSetupCancel}
      >
        <View style={styles.soOverlay}>
          <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.bioCard}>
            <View style={styles.bioIconRing}>
              <View style={styles.bioIconInner}>
                <Fingerprint size={40} color={COLORS.primary} strokeWidth={1.5} />
              </View>
            </View>
            <Text style={styles.soTitle}>Activar acceso con huella</Text>
            <Text style={styles.soBody}>
              Ingresa tu contraseña una vez para vincularla a tu huella digital. No la guardaremos en ningún servidor.
            </Text>
            <Input
              label="Contraseña"
              value={bioSetupPassword}
              onChangeText={setBioSetupPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="off"
              importantForAutofill="no"
              error={bioSetupError}
              containerStyle={styles.bioSetupInput}
            />
            <Button
              label="Activar huella digital"
              variant="primary"
              size="lg"
              style={styles.bioFullBtn}
              onPress={() => void handleBioSetupConfirm()}
            />
            <Button
              label="Cancelar"
              variant="ghost"
              size="md"
              style={styles.bioFullBtn}
              onPress={handleBioSetupCancel}
            />
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={signOutVisible}
        icon="👋"
        title="¿Cerrar sesión?"
        body="Se cerrará tu sesión en este dispositivo. Podrás volver a ingresar cuando quieras."
        confirmLabel="Cerrar sesión"
        cancelLabel="Cancelar"
        destructive
        confirmLoading={signingOut}
        confirmLoadingLabel="Cerrando sesión"
        onCancel={() => setSignOutVisible(false)}
        onConfirm={() => { void confirmSignOut(); }}
      />

      {/* ── Invite member sheet ───────────────────────────────────────── */}
      {/* El tono es el REGISTRO con que la IA te habla. La explicación de cada uno se lee
          aquí, que es cuando importa: en la fila solo va el valor elegido. */}
      <BottomSheet visible={toneSheetOpen} onClose={() => setToneSheetOpen(false)} title="Cómo te habla el asistente">
        {DASHBOARD_AI_TONE_OPTIONS.map((option) => {
          const active = option.id === aiTone;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.toneSheetRow, active && styles.toneSheetRowActive]}
              onPress={() => {
                setAiTone(option.id);
                setToneSheetOpen(false);
              }}
              activeOpacity={0.84}
            >
              <Text style={[styles.toneSheetTitle, active && styles.toneSheetTitleActive]}>{option.label}</Text>
              <Text style={styles.toneSheetBody}>{option.description}</Text>
            </TouchableOpacity>
          );
        })}
      </BottomSheet>

      <BottomSheet visible={inboundSheetOpen} onClose={() => setInboundSheetOpen(false)} title="Detectar pagos por correo">
        {inboundAliasQuery.data ? (
          <>
            <Text selectable style={styles.inboundAddress}>
              {inboundEmailAddress(inboundAliasQuery.data)}
            </Text>
            <Button
              label="Copiar dirección"
              variant="secondary"
              size="md"
              onPress={() => void handleCopyInboundAddress()}
            />
            {/* Los dominios van completos y son los reales: Yape usa yape.pe (NO
                yape.com.pe), y un filtro con el dominio equivocado no reenvía nada,
                en silencio. */}
            <Text style={styles.inboundHelp}>
              En Gmail: Configuración › Filtros › Crear filtro con{"\n"}
              De: notificacionesbcp.com.pe OR yape.pe{"\n"}
              Acción: Reenviar a esta dirección{"\n"}
              Gmail te pedirá confirmar el reenvío una vez.
            </Text>
            <Button
              label="Generar una nueva"
              variant="ghost"
              size="md"
              loading={rotateInboundAlias.isPending}
              loadingLabel="Generando…"
              onPress={() => void handleRotateInboundAlias()}
            />
          </>
        ) : (
          <>
            <Text style={styles.inboundHelp}>
              Genera una dirección privada y reenvía ahí los correos de tu banco. DarkMoney
              no accede al resto de tu correo, y nada se registra sin que tú lo confirmes.
            </Text>
            <Button
              label="Generar dirección"
              variant="secondary"
              size="md"
              loading={rotateInboundAlias.isPending}
              loadingLabel="Generando…"
              onPress={() => void handleRotateInboundAlias()}
            />
          </>
        )}
      </BottomSheet>
      <BottomSheet
        visible={inviteSheetOpen}
        onClose={() => setInviteSheetOpen(false)}
        title="Invitar miembro"
        snapHeight={0.72}
        backdropColor={SURFACE.scrim}
      >
        <Text style={styles.sheetSubtitle}>Workspace: {activeWorkspace?.name}</Text>

        <Input
          label="Email *"
          value={inviteEmail}
          onChangeText={setInviteEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="correo@ejemplo.com"
        />

        <View style={styles.roleSection}>
          <Text style={styles.fieldLabel}>Rol</Text>
          <View style={styles.roleRow}>
            {ROLE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.rolePill, inviteRole === opt.value && styles.rolePillActive]}
                onPress={() => setInviteRole(opt.value)}
              >
                <Text style={[styles.rolePillText, inviteRole === opt.value && styles.rolePillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <Input
          label="Mensaje (opcional)"
          value={inviteNote}
          onChangeText={setInviteNote}
          placeholder="Hola, te invito a..."
          multiline
          numberOfLines={2}
        />

        <Button
          label="Enviar invitación"
          onPress={handleSendInvite}
          loading={inviteMutation.isPending}
          style={styles.sheetBtn}
        />
      </BottomSheet>

      {/* ── Create workspace sheet ────────────────────────────────────── */}
      <BottomSheet
        visible={createWsSheetOpen}
        onClose={() => setCreateWsSheetOpen(false)}
        title="Nuevo workspace"
        snapHeight={0.62}
        backdropColor={SURFACE.scrim}
      >
        <Text style={styles.sheetSubtitle}>Se creará un workspace compartido</Text>

        <Input
          label="Nombre *"
          value={newWsName}
          onChangeText={setNewWsName}
          placeholder="Ej. Empresa ABC"
          autoCapitalize="words"
        />
        <CurrencySelector
          label="Moneda base"
          value={newWsCurrency}
          onChange={setNewWsCurrency}
          hint={`El tipo de cambio contra ${DEFAULT_EXCHANGE_CURRENCY} se guardara automaticamente.`}
        />

        <Button
          label="Crear workspace"
          onPress={handleCreateWorkspace}
          loading={createWsMutation.isPending}
          style={styles.sheetBtn}
        />
      </BottomSheet>
      </>
      }
    />
  );
}

const styles = StyleSheet.create({
  aiToneRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  // El violeta se queda: es COLORS.pro, el color de la IA en todo el sistema. Lo que sobraba
  // eran las dos tarjetas de 90 px, no el color.
  aiToneLabel: { flex: 1 },
  aiToneValue: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.pro },
  toneSheetRow: {
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  toneSheetRowActive: { borderColor: COLORS.pro, backgroundColor: COLORS.proMuted },
  toneSheetTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.fog },
  toneSheetTitleActive: { color: COLORS.pro },
  toneSheetBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, lineHeight: 16 },
  profileRowAvatar: { width: 36, height: 36, borderRadius: 18 },
  profileRowFallback: { backgroundColor: COLORS.primary },
  profileRowInitials: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.sm,
    color: EXTENDED_PALETTE.white,
  },
  signOutRow: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  flex: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxxl },
  versionText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    textAlign: "center",
  },
  inboundAddress: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.pine,
    marginBottom: SPACING.sm,
  },
  inboundHelp: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  wsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: SURFACE.separator,
  },
  wsRowActive: { backgroundColor: SURFACE.cardActive, marginHorizontal: -SPACING.md, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm },
  wsInfo: { gap: 2 },
  wsName: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  wsKind: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  wsActiveBadge: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontFamily: FONT_FAMILY.bodySemibold },
  wsActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md, flexWrap: "wrap" },
  wsActionBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  wsActionText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontFamily: FONT_FAMILY.bodyMedium },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchInfo: { flex: 1, gap: 2, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  settingsNavRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  settingsNavIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE.cardActive,
  },
  settingsNavCopy: { flex: 1, gap: 2 },
  pushStatusBox: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    gap: SPACING.xs,
  },
  pushStatusTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  pushStatusDesc: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    lineHeight: 18,
  },
  pushSecondaryBtn: {
    alignSelf: "flex-start",
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: "transparent",
  },
  pushSecondaryText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
  },
  sheetSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center", marginTop: -SPACING.sm },
  sheetBtn: { marginTop: SPACING.sm },
  fieldLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  roleSection: { gap: SPACING.sm },
  roleRow: { flexDirection: "row", gap: SPACING.sm },
  rolePill: {
    flex: 1,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
  },
  rolePillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rolePillText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  rolePillTextActive: { color: COLORS.textInverse },
  // Sign out modal
  soOverlay: {
    flex: 1,
    backgroundColor: SURFACE.scrimStrong,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  soTitle: {
    fontSize: FONT_SIZE.lg,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
    textAlign: "center",
  },
  changelogCard: {
    width: "100%",
    maxHeight: "82%",
    backgroundColor: SURFACE.deepNavy,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xl,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    gap: SPACING.sm,
  },
  changelogSubtitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
    marginBottom: SPACING.xs,
  },
  changelogScroll: { alignSelf: "stretch" },
  changelogEntry: {
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: SURFACE.cardBorder,
    gap: SPACING.xs,
  },
  changelogVersionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    flexWrap: "wrap",
  },
  changelogVersion: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.void,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    overflow: "hidden",
  },
  changelogEntryTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
    flexShrink: 1,
  },
  changelogBulletRow: { flexDirection: "row", gap: SPACING.xs, paddingRight: SPACING.sm },
  changelogBulletDot: { color: COLORS.primary, fontSize: FONT_SIZE.sm, lineHeight: 20 },
  changelogBulletText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 20 },
  changelogOlder: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontStyle: "italic",
    paddingVertical: SPACING.md,
    textAlign: "center",
  },
  soBody: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  bioSetupInput: { width: "100%", alignSelf: "stretch" },
  bioCard: {
    width: "100%",
    backgroundColor: SURFACE.deepNavy,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxxl,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
    gap: SPACING.lg,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 20,
  },
  bioIconRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: SURFACE.cardActive,
    borderWidth: 1.5,
    borderColor: SURFACE.cardActiveBorder,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  bioIconInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: SURFACE.cardActive,
    alignItems: "center",
    justifyContent: "center",
  },
  bioFullBtn: { alignSelf: "stretch" },
});

export default function SettingsScreenRoot() {
  return (
    <ErrorBoundary>
      <SettingsScreen />
    </ErrorBoundary>
  );
}
