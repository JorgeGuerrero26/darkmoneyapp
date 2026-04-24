import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { Fingerprint, Pencil } from "lucide-react-native";

import { useAuth } from "../lib/auth-context";
import { useWorkspace, useWorkspaceListStore } from "../lib/workspace-context";
import { humanizeError } from "../lib/errors";
import { useUiStore } from "../store/ui-store";
import {
  fetchUserWorkspaces,
  useCreateSharedWorkspaceMutation,
  useCreateWorkspaceInvitationMutation,
  type WorkspaceInvitationInput,
} from "../services/queries/workspace-data";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { useToast } from "../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../constants/theme";
import type { WorkspaceRole } from "../types/domain";
import { SafeBlurView } from "../components/ui/SafeBlurView";
import { useDismissibleSheet } from "../components/ui/useDismissibleSheet";

const ROLE_OPTIONS: { label: string; value: Exclude<WorkspaceRole, "owner"> }[] = [
  { label: "Administrador", value: "admin" },
  { label: "Miembro", value: "member" },
  { label: "Lector", value: "viewer" },
];

function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile, saveProfile, saveAvatar, removeAvatar, signOut } = useAuth();
  const { activeWorkspace, activeWorkspaceId, setActiveWorkspaceId, setWorkspaces } = useWorkspace();
  const { workspaces } = useWorkspaceListStore();
  const { showToast } = useToast();

  // ── Profile ──────────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [baseCurrencyCode, setBaseCurrencyCode] = useState(profile?.baseCurrencyCode ?? "PEN");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saveSuccess, setSaveSuccess] = useState(false);
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

  // ── Sign out dialog ───────────────────────────────────────────────────────
  const [signOutVisible, setSignOutVisible] = useState(false);

  // ── Workspace invite sheet ────────────────────────────────────────────────
  const [inviteSheetOpen, setInviteSheetOpen] = useState(false);
  const inviteSheetDismiss = useDismissibleSheet({
    visible: inviteSheetOpen,
    onClose: () => setInviteSheetOpen(false),
  });
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
  const createSheetDismiss = useDismissibleSheet({
    visible: createWsSheetOpen,
    onClose: () => setCreateWsSheetOpen(false),
  });
  const [newWsName, setNewWsName] = useState("");
  const [newWsCurrency, setNewWsCurrency] = useState(profile?.baseCurrencyCode ?? "PEN");
  const createWsMutation = useCreateSharedWorkspaceMutation();

  function openCreateWsSheet() {
    setNewWsName("");
    setNewWsCurrency(profile?.baseCurrencyCode ?? "PEN");
    setCreateWsSheetOpen(true);
  }

  async function handleCreateWorkspace() {
    if (!newWsName.trim() || !profile?.id) return;
    try {
      const workspace = await createWsMutation.mutateAsync({
        name: newWsName.trim(),
        baseCurrencyCode: newWsCurrency.trim().toUpperCase() || null,
      });
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
    setSaveError(undefined);
    setSaveSuccess(false);
    try {
      await saveProfile({
        fullName: fullName.trim(),
        baseCurrencyCode: baseCurrencyCode.trim().toUpperCase(),
        timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setSaveError(humanizeError(err));
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Configuración" onBack={() => router.replace("/(app)/more")} />

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
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <Pencil size={20} color="#FFF" strokeWidth={2} />}
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
              <Input
                label="Moneda base"
                value={baseCurrencyCode}
                onChangeText={(v) => setBaseCurrencyCode(v.toUpperCase())}
                autoCapitalize="characters"
                maxLength={3}
                hint="Código de 3 letras (PEN, USD, EUR…)"
              />
            </View>
            {saveError ? <Text style={styles.errorText}>{saveError}</Text>
              : saveSuccess ? <Text style={styles.successText}>✓ Perfil guardado</Text>
              : null}
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
                    {bioCredsStored
                      ? "Activo · puedes entrar sin contraseña"
                      : "Inicia sesión tocando tu huella"}
                  </Text>
                </View>
                <Switch
                  value={biometricEnabled && bioCredsStored}
                  onValueChange={(v) => void handleBiometricToggle(v)}
                  trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </Card>
          ) : null}

          {/* Sign out */}
          <Button label="Cerrar sesión" variant="danger" size="lg" onPress={handleSignOut} />
        </ScrollView>
      </KeyboardAvoidingView>

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

      {/* Sign out confirmation modal */}
      <Modal
        visible={signOutVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSignOutVisible(false)}
      >
        <View style={styles.soOverlay}>
          <View style={styles.soCard}>
            <View style={styles.soIconWrap}>
              <Text style={styles.soIcon}>👋</Text>
            </View>
            <Text style={styles.soTitle}>¿Cerrar sesión?</Text>
            <Text style={styles.soBody}>
              Se cerrará tu sesión en este dispositivo. Podrás volver a ingresar cuando quieras.
            </Text>
            <Button
              label="Cerrar sesión"
              variant="danger"
              size="lg"
              style={styles.soFullBtn}
              onPress={() => { setSignOutVisible(false); void signOut(); }}
            />
            <Button
              label="Cancelar"
              variant="ghost"
              size="md"
              style={styles.soFullBtn}
              onPress={() => setSignOutVisible(false)}
            />
          </View>
        </View>
      </Modal>

      {/* ── Invite member sheet ───────────────────────────────────────── */}
      <Modal visible={inviteSheetOpen} transparent animationType="fade" onRequestClose={() => setInviteSheetOpen(false)}>
        <Animated.View style={[styles.overlay, inviteSheetDismiss.backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setInviteSheetOpen(false)} />
          <Animated.View
            style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }, inviteSheetDismiss.sheetStyle]}
            onStartShouldSetResponder={() => true}
            {...inviteSheetDismiss.panHandlers}
          >
            <Text style={styles.sheetTitle}>Invitar miembro</Text>
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
          </Animated.View>
        </Animated.View>
      </Modal>

      {/* ── Create workspace sheet ────────────────────────────────────── */}
      <Modal visible={createWsSheetOpen} transparent animationType="fade" onRequestClose={() => setCreateWsSheetOpen(false)}>
        <Animated.View style={[styles.overlay, createSheetDismiss.backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateWsSheetOpen(false)} />
          <Animated.View
            style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }, createSheetDismiss.sheetStyle]}
            onStartShouldSetResponder={() => true}
            {...createSheetDismiss.panHandlers}
          >
            <Text style={styles.sheetTitle}>Nuevo workspace</Text>
            <Text style={styles.sheetSubtitle}>Se creará un workspace compartido</Text>

            <Input
              label="Nombre *"
              value={newWsName}
              onChangeText={setNewWsName}
              placeholder="Ej. Empresa ABC"
              autoCapitalize="words"
            />
            <Input
              label="Moneda base"
              value={newWsCurrency}
              onChangeText={(v) => setNewWsCurrency(v.toUpperCase())}
              autoCapitalize="characters"
              maxLength={3}
              hint="PEN, USD, EUR…"
            />

            <Button
              label="Crear workspace"
              onPress={handleCreateWorkspace}
              loading={createWsMutation.isPending}
              style={styles.sheetBtn}
            />
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: COLORS.bg },
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
    backgroundColor: "rgba(0,0,0,0.38)",
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
  avatarText: { fontSize: FONT_SIZE.xxl, fontFamily: FONT_FAMILY.heading, color: "#FFF" },
  form: { gap: SPACING.md },
  disabledInput: { opacity: 0.5 },
  saveButton: { marginTop: SPACING.lg },
  errorText: { color: COLORS.danger, fontSize: FONT_SIZE.sm, marginTop: SPACING.sm },
  successText: { color: COLORS.success, fontSize: FONT_SIZE.sm, marginTop: SPACING.sm },
  wsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: GLASS.separator,
  },
  wsRowActive: { backgroundColor: COLORS.primary + "11", marginHorizontal: -SPACING.md, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm },
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
  // Sheet styles
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.mist,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  sheetTitle: { fontSize: FONT_SIZE.lg, fontFamily: FONT_FAMILY.heading, color: COLORS.ink, textAlign: "center" },
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
    borderColor: GLASS.cardBorder,
    alignItems: "center",
  },
  rolePillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rolePillText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  rolePillTextActive: { color: "#FFF" },
  // Sign out modal
  soOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  soCard: {
    width: "100%",
    backgroundColor: COLORS.mist,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: GLASS.sheetBorder,
    alignItems: "center",
    gap: SPACING.sm,
  },
  soIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.dangerMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xs,
  },
  soIcon: { fontSize: 32 },
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
  soFullBtn: { alignSelf: "stretch" },
  bioSetupInput: { width: "100%", alignSelf: "stretch" },
  bioCard: {
    width: "100%",
    backgroundColor: "rgba(9,13,18,0.96)",
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxxl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
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
    backgroundColor: GLASS.cardActive,
    borderWidth: 1.5,
    borderColor: GLASS.cardActiveBorder,
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
    backgroundColor: "rgba(107,228,197,0.08)",
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
