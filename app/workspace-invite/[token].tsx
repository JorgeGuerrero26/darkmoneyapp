import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { humanizeError } from "../../lib/errors";
import { setPendingWorkspaceInviteToken } from "../../lib/pending-workspace-invite";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";
import { fetchUserWorkspaces } from "../../services/queries/workspace-data";

export default function WorkspaceInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const { setActiveWorkspaceId, setWorkspaces } = useWorkspace();
  const { showToast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [invite, setInvite] = useState<any>(null);
  const [error, setError] = useState<string | undefined>();
  const [isAccepting, setIsAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (!token) return;
    void loadInvite();
  }, [token]);

  async function loadInvite() {
    if (!supabase) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("workspace-invite-details", {
        body: { token },
      });
      if (error) throw error;
      if (!data.ok) throw new Error(data.error ?? "Invitación inválida");
      setInvite(data.invite);
    } catch (err: unknown) {
      setError(humanizeError(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAccept() {
    if (!supabase || !session) {
      if (token) await setPendingWorkspaceInviteToken(token);
      router.replace("/(auth)/login");
      return;
    }
    setIsAccepting(true);
    try {
      const { data, error } = await supabase.functions.invoke("accept-workspace-invitation", {
        body: { token },
      });
      if (error) throw error;
      if (!data.ok && !data.alreadyAccepted) throw new Error(data.error ?? "Error al aceptar");
      if (data.workspaceId) {
        const refreshedWorkspaces = await queryClient.fetchQuery({
          queryKey: ["user-workspaces", session.user.id],
          queryFn: () => fetchUserWorkspaces(session.user.id),
        });
        setWorkspaces(refreshedWorkspaces);
        setActiveWorkspaceId(data.workspaceId);
      }
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      showToast(data.alreadyAccepted ? "Esta invitación ya estaba aceptada" : "Te uniste al workspace", "success");
      setAccepted(true);
      setTimeout(() => router.replace("/(app)/dashboard"), 1500);
    } catch (err: unknown) {
      const message = humanizeError(err);
      setError(message);
      showToast(message, "error");
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Invitación a workspace" />

      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator color={COLORS.primary} size="large" />
        ) : error ? (
          <Card>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : accepted ? (
          <View style={styles.centered}>
            <Text style={{ fontSize: 56 }}>🎉</Text>
            <Text style={styles.successText}>¡Te uniste al workspace!</Text>
          </View>
        ) : invite ? (
          <Card>
            <Text style={styles.label}>Te invitan a unirte a</Text>
            <Text style={styles.workspaceName}>{invite.workspace?.name}</Text>
            <Text style={styles.detail}>
              Tipo: {invite.workspace?.kind === "personal" ? "Personal" : "Compartido"}
            </Text>
            <Text style={styles.detail}>
              Rol: {invite.invitation?.role}
            </Text>
            {invite.workspace?.description ? (
              <Text style={styles.description}>{invite.workspace.description}</Text>
            ) : null}
            <Button
              label="Aceptar invitación"
              onPress={handleAccept}
              loading={isAccepting}
              style={styles.acceptButton}
            />
          </Card>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, justifyContent: "center", padding: SPACING.lg },
  centered: { alignItems: "center", gap: SPACING.md },
  label: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: SPACING.xs },
  workspaceName: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: COLORS.text, marginBottom: SPACING.sm },
  detail: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: 2 },
  description: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginTop: SPACING.sm },
  errorText: { color: COLORS.danger, fontSize: FONT_SIZE.sm },
  successText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.success },
  acceptButton: { marginTop: SPACING.lg },
});
