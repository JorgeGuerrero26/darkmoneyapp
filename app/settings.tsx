import { useEffect, useState } from "react";
import {
  Alert,
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
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../constants/theme";
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
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const { biometricEnabled, setBiometricEnabled } = useUiStore();

  useEffect(() => {
    void (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && isEnrolled);
    })();
  }, []);

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
    Alert.alert("Cerrar sesión", "¿Estás seguro de que quieres salir?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Salir", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  const canInvite = activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Configuración" />

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
                  <Text style={styles.switchLabel}>Bloqueo biométrico</Text>
                  <Text style={styles.switchDesc}>Bloquea la app al pasar a segundo plano</Text>
                </View>
                <Switch
                  value={biometricEnabled}
                  onValueChange={setBiometricEnabled}
                  trackColor={{ false: COLORS.border, true: COLORS.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </Card>
          ) : null}

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

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
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
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
  avatarText: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: "#FFF" },
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
    borderBottomColor: COLORS.border,
  },
  wsRowActive: { backgroundColor: COLORS.primary + "11", marginHorizontal: -SPACING.md, paddingHorizontal: SPACING.md, borderRadius: RADIUS.sm },
  wsInfo: { gap: 2 },
  wsName: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium, color: COLORS.text },
  wsKind: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  wsActiveBadge: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontWeight: FONT_WEIGHT.semibold },
  wsActions: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md, flexWrap: "wrap" },
  wsActionBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  wsActionText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: FONT_WEIGHT.medium },
  signOutButton: {
    paddingVertical: SPACING.md,
    alignItems: "center",
    backgroundColor: COLORS.dangerMuted,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  signOutText: { color: COLORS.danger, fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.md },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  switchInfo: { flex: 1, gap: 2, marginRight: SPACING.md },
  switchLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium, color: COLORS.text },
  switchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  // Sheet styles
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  sheetTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: COLORS.text, textAlign: "center" },
  sheetSubtitle: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, textAlign: "center", marginTop: -SPACING.sm },
  sheetBtn: { marginTop: SPACING.sm },
  fieldLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
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
    borderColor: COLORS.border,
    alignItems: "center",
  },
  rolePillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  rolePillText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, fontWeight: FONT_WEIGHT.medium },
  rolePillTextActive: { color: "#FFF" },
});
