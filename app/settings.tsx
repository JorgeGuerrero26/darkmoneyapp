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
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { ChevronRight, Fingerprint, Pencil, ShieldCheck } from "lucide-react-native";

import { useAuth } from "../lib/auth-context";
import { useWorkspace, useWorkspaceListStore } from "../lib/workspace-context";
import { humanizeError } from "../lib/errors";
import { useUiStore } from "../store/ui-store";
import {
  fetchUserWorkspaces,
  useCreateSharedWorkspaceMutation,
  useCreateWorkspaceInvitationMutation,
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
  type WorkspaceInvitationInput,
} from "../services/queries/workspace-data";
import { useSyncExchangeRatePairMutation } from "../services/queries/exchange-rates";
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
import { DEFAULT_EXCHANGE_CURRENCY, normalizeSupportedCurrencyCode } from "../constants/currencies";
import type { WorkspaceRole } from "../types/domain";
import { SafeBlurView } from "../components/ui/SafeBlurView";
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

  // ── Profile ──────────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [baseCurrencyCode, setBaseCurrencyCode] = useState(normalizeSupportedCurrencyCode(profile?.baseCurrencyCode));
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // ── Biometrics ───────────────────────────────────────────────────────────
  const SECURE_EMAIL_KEY = "darkmoney_bio_email";
  const SECURE_PASS_KEY = "darkmoney_bio_password";

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [bioCredsStored, setBioCredsStored] = useState(false);
  const { biometricEnabled, setBiometricEnabled } = useUiStore();

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

  // ── Profile save ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!fullName.trim()) return;
    setIsSaving(true);
    try {
      await saveProfile({
        fullName: fullName.trim(),
        baseCurrencyCode,
        timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await syncDefaultExchangeCurrency(baseCurrencyCode);
      showToast("Perfil guardado", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarPress() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showToast("Se necesita permiso para acceder a la galería", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setIsUploadingAvatar(true);
    try {
      await saveAvatar(result.assets[0].uri);
      showToast("Foto de perfil actualizada", "warning");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleAvatarRemove() {
    setIsUploadingAvatar(true);
    try {
      await removeAvatar();
      showToast("Foto de perfil eliminada", "success");
    } catch {
      showToast("No se pudo eliminar la foto", "error");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  function handleSignOut() {
    setSignOutVisible(true);
  }

  const canInvite =
    activeWorkspace?.kind === "shared" &&
    (activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin");
  const dailyDigestEnabled = notificationPreferencesQuery.data?.dailyDigestEnabled !== false;
  const pushEnabled = notificationPreferencesQuery.data?.pushEnabled === true;
  const pushToken = notificationPreferencesQuery.data?.pushToken ?? null;
  const pushPlatform = notificationPreferencesQuery.data?.platform ?? null;
  const biometricActive = biometricEnabled && bioCredsStored;

  async function handlePushReconnect() {
    if (!profile?.id) return;
    try {
      const result = await registerForPushNotifications();
      if (result.ok) {
        await savePushTokenToSupabase(profile.id, result.token);
        await queryClient.invalidateQueries({ queryKey: ["notification-preferences", profile.id] });
        showToast("Notificaciones push activadas en este dispositivo", "success");
        return;
      }
      switch (result.reason) {
        case "permissions_denied":
          showToast(
            "Permisos denegados. Abre los ajustes del sistema para concederlos.",
            "warning",
          );
          break;
        case "expo_go":
          showToast(
            "Las notificaciones push no funcionan en Expo Go. Necesitas la app instalada desde Play Store.",
            "warning",
          );
          break;
        case "not_device":
          showToast("Las notificaciones push no están disponibles en simuladores.", "warning");
          break;
        case "module_unavailable":
          showToast("El módulo de notificaciones no está disponible en este build.", "warning");
          break;
        case "network_error":
          showToast("No pudimos contactar al servidor de Expo. Revisa tu conexión y reintenta.", "warning");
          break;
      }
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    }
  }

  async function handleDailyDigestToggle(nextValue: boolean) {
    try {
      await updateNotificationPreferencesMutation.mutateAsync({ dailyDigestEnabled: nextValue });
      showToast(
        nextValue ? "Digest diario activado" : "Digest diario desactivado",
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
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Profile */}
          <Card>
            <Text style={styles.sectionTitle}>Perfil</Text>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={handleAvatarPress}
              activeOpacity={0.8}
              disabled={isUploadingAvatar}
            >
              {profile?.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{profile?.initials ?? "DM"}</Text>
                </View>
              )}
              <View style={styles.avatarOverlay}>
                {isUploadingAvatar
                  ? <ActivityIndicator size="small" color={EXTENDED_PALETTE.white} />
                  : <Pencil size={20} color={EXTENDED_PALETTE.white} strokeWidth={2} />}
              </View>
            </TouchableOpacity>
            {profile?.avatarUrl ? (
              <TouchableOpacity onPress={handleAvatarRemove} disabled={isUploadingAvatar}>
                <Text style={styles.avatarRemoveText}>Eliminar foto</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.form}>
              <Input label="Nombre completo" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
              <Input label="Correo electrónico" value={profile?.email ?? ""} editable={false} style={styles.disabledInput} />
              <CurrencySelector
                label="Moneda base"
                value={baseCurrencyCode}
                onChange={setBaseCurrencyCode}
                hint={`Se sincronizara automaticamente contra ${DEFAULT_EXCHANGE_CURRENCY}.`}
              />
            </View>
            <Button label="Guardar perfil" onPress={handleSave} loading={isSaving} style={styles.saveButton} />
          </Card>

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
            <View style={styles.pushStatusBox}>
              <Text style={styles.pushStatusTitle}>Notificaciones push</Text>
              <Text style={styles.pushStatusDesc}>
                {pushEnabled && pushToken
                  ? `Activo en este dispositivo (${pushPlatform ?? Platform.OS}). Recibirás alertas y recordatorios.`
                  : "No configurado en este dispositivo. Si denegaste los permisos, ábrelos en los ajustes del sistema y luego pulsa reintentar."}
              </Text>
              <View style={styles.pushButtonRow}>
                <TouchableOpacity
                  style={styles.pushReconnectBtn}
                  onPress={() => void handlePushReconnect()}
                  disabled={notificationPreferencesQuery.isLoading}
                  activeOpacity={0.84}
                >
                  <Text style={styles.pushReconnectText}>
                    {pushEnabled && pushToken ? "Reintentar activación" : "Activar push"}
                  </Text>
                </TouchableOpacity>
                {!(pushEnabled && pushToken) ? (
                  <TouchableOpacity
                    style={styles.pushSecondaryBtn}
                    onPress={() => void Linking.openSettings()}
                    activeOpacity={0.84}
                  >
                    <Text style={styles.pushSecondaryText}>Abrir ajustes del sistema</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <Text style={styles.switchLabel}>Resumen diario informativo</Text>
                <Text style={styles.switchDesc}>
                  {pushEnabled
                    ? "Recibe un solo resumen al final del día con alertas informativas."
                    : "Se guardará tu preferencia aunque ahora no tengas push activo."}
                </Text>
              </View>
              <Switch
                value={dailyDigestEnabled}
                onValueChange={(v) => void handleDailyDigestToggle(v)}
                disabled={updateNotificationPreferencesMutation.isPending || notificationPreferencesQuery.isLoading}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor={EXTENDED_PALETTE.white}
              />
            </View>
          </Card>

          {/* Sign out */}
          <Button label="Cerrar sesión" variant="danger" size="lg" onPress={handleSignOut} />
        </ScrollView>
      </KeyboardAvoidingView>
      }
      overlays={
      <>
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
  flex: { flex: 1 },
  content: { padding: SPACING.lg, gap: SPACING.lg, paddingBottom: SPACING.xxxl },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
  },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: "center",
    marginBottom: SPACING.sm,
    overflow: "hidden",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SURFACE.imageScrim,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRemoveText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  avatarText: { fontSize: FONT_SIZE.xxl, fontFamily: FONT_FAMILY.heading, color: EXTENDED_PALETTE.white },
  form: { gap: SPACING.md },
  disabledInput: { opacity: 0.5 },
  saveButton: { marginTop: SPACING.lg },
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
  pushButtonRow: {
    marginTop: SPACING.xs,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
  },
  pushReconnectBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardActiveBorder,
    backgroundColor: SURFACE.cardActive,
  },
  pushReconnectText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.primary,
  },
  pushSecondaryBtn: {
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
    shadowColor: COLORS.primary,
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
    shadowColor: COLORS.primary,
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
