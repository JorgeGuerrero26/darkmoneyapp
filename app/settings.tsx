import { useEffect, useState } from "react";
import {
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
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "../lib/auth-context";
import { useWorkspace, useWorkspaceListStore } from "../lib/workspace-context";
import { humanizeError } from "../lib/errors";
import { useUiStore } from "../store/ui-store";
import {
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

const ROLE_OPTIONS: { label: string; value: Exclude<WorkspaceRole, "owner"> }[] = [
  { label: "Administrador", value: "admin" },
  { label: "Miembro", value: "member" },
  { label: "Lector", value: "viewer" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, saveProfile, signOut } = useAuth();
  const { activeWorkspace, activeWorkspaceId } = useWorkspace();
  const { workspaces } = useWorkspaceListStore();
  const { showToast } = useToast();

  // ── Profile ──────────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [baseCurrencyCode, setBaseCurrencyCode] = useState(profile?.baseCurrencyCode ?? "PEN");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [saveSuccess, setSaveSuccess] = useState(false);

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
  const [newWsCurrency, setNewWsCurrency] = useState(profile?.baseCurrencyCode ?? "PEN");
  const createWsMutation = useCreateSharedWorkspaceMutation();

  function openCreateWsSheet() {
    setNewWsName("");
    setNewWsCurrency(profile?.baseCurrencyCode ?? "PEN");
    setCreateWsSheetOpen(true);
  }

  async function handleCreateWorkspace() {
    if (!newWsName.trim()) return;
    try {
      await createWsMutation.mutateAsync({
        name: newWsName.trim(),
        baseCurrencyCode: newWsCurrency.trim().toUpperCase() || null,
      });
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

  function handleSignOut() {
    setSignOutVisible(true);
  }

  const canInvite = activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Configuración" onBack={() => router.replace("/(app)/more")} />

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          {/* Profile */}
          <Card>
            <Text style={styles.sectionTitle}>Perfil</Text>
            <View style={styles.profileAvatar}>
              <Text style={styles.avatarText}>{profile?.initials ?? "DM"}</Text>
            </View>
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
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.8}>
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </TouchableOpacity>
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
          <View style={styles.soCard}>
            <View style={[styles.soIconWrap, { backgroundColor: COLORS.primary + "22" }]}>
              <Text style={styles.soIcon}>🫆</Text>
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
            <TouchableOpacity
              style={[styles.soConfirm, { backgroundColor: COLORS.primary }]}
              onPress={() => void handleBioSetupConfirm()}
              activeOpacity={0.8}
            >
              <Text style={styles.soConfirmText}>Activar huella digital</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.soCancel} onPress={handleBioSetupCancel}>
              <Text style={styles.soCancelText}>Cancelar</Text>
            </TouchableOpacity>
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
            <TouchableOpacity
              style={styles.soConfirm}
              onPress={() => { setSignOutVisible(false); void signOut(); }}
              activeOpacity={0.8}
            >
              <Text style={styles.soConfirmText}>Cerrar sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.soCancel}
              onPress={() => setSignOutVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.soCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Invite member sheet ───────────────────────────────────────── */}
      <Modal visible={inviteSheetOpen} transparent animationType="slide" onRequestClose={() => setInviteSheetOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setInviteSheetOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]} onStartShouldSetResponder={() => true}>
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
          </View>
        </Pressable>
      </Modal>

      {/* ── Create workspace sheet ────────────────────────────────────── */}
      <Modal visible={createWsSheetOpen} transparent animationType="slide" onRequestClose={() => setCreateWsSheetOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setCreateWsSheetOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + SPACING.lg }]} onStartShouldSetResponder={() => true}>
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
          </View>
        </Pressable>
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
  profileAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: SPACING.lg,
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
  signOutButton: {
    paddingVertical: SPACING.md,
    alignItems: "center",
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  signOutText: { color: COLORS.danger, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
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
  soConfirm: {
    width: "100%",
    backgroundColor: COLORS.danger,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
  },
  soConfirmText: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: "#FFFFFF",
  },
  soCancel: {
    width: "100%",
    paddingVertical: SPACING.sm,
    alignItems: "center",
  },
  soCancelText: { fontSize: FONT_SIZE.md, color: COLORS.storm },
  bioSetupInput: { width: "100%", alignSelf: "stretch" },
});
