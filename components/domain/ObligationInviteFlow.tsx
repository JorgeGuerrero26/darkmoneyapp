import { CheckCircle2 } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import {
  cancelObligationInviteScheduledReminder,
  scheduleObligationInviteDeferredReminder,
} from "../../lib/obligation-invite-local-notif";
import { setPendingObligationInviteToken } from "../../lib/pending-obligation-invite";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ScreenHeader } from "../layout/ScreenHeader";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

type InvitePreview = {
  title: string;
  direction: string;
  counterparty: string;
  currencyCode: string;
  principalAmount: number;
  currentPrincipalAmount?: number;
  pendingAmount: number;
  status?: "pending" | "accepted" | "declined";
  ownerDisplayName?: string | null;
  message?: string | null;
};

type Props = {
  token: string;
};

export function ObligationInviteFlow({ token }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const [isLoading, setIsLoading] = useState(true);
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [decisionOpen, setDecisionOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    void loadInvite();
  }, [token]);

  useEffect(() => {
    if (invite && invite.status !== "accepted" && !error && !accepted && !declined) {
      setDecisionOpen(true);
    }
  }, [invite, error, accepted, declined]);

  async function loadInvite() {
    if (!supabase) return;
    setIsLoading(true);
    setError(undefined);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok: boolean;
        error?: string;
        invite?: InvitePreview;
      }>("obligation-share-invite-details", { body: { token } });
      if (fnError) throw fnError;
      if (!data?.ok) throw new Error(data?.error ?? "Invitación inválida");
      setInvite(data.invite ?? null);
      setAlreadyAccepted(data.invite?.status === "accepted");
    } catch (err: unknown) {
      setError(humanizeError(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAccept() {
    if (!supabase) return;
    if (!session) {
      await setPendingObligationInviteToken(token);
      router.replace("/(auth)/login");
      setDecisionOpen(false);
      return;
    }
    setIsAccepting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok: boolean;
        error?: string;
        alreadyAccepted?: boolean;
      }>("accept-obligation-share", { body: { token } });
      if (fnError) throw fnError;
      if (!data?.ok && !data?.alreadyAccepted) {
        throw new Error(data?.error ?? "Error al aceptar");
      }
      await cancelObligationInviteScheduledReminder(token);
      void queryClient.invalidateQueries({ queryKey: ["pending-obligation-share-invites"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["obligation-shares"] });
      void queryClient.invalidateQueries({ queryKey: ["shared-obligations"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (data?.alreadyAccepted) {
        setAlreadyAccepted(true);
        setDecisionOpen(false);
        return;
      }
      setAccepted(true);
      setDecisionOpen(false);
      setTimeout(() => router.replace("/(app)/obligations"), 1500);
    } catch (err: unknown) {
      setError(humanizeError(err));
    } finally {
      setIsAccepting(false);
    }
  }

  async function handleDecline() {
    if (!supabase) return;
    if (!session) {
      await setPendingObligationInviteToken(token);
      router.replace("/(auth)/login");
      setDecisionOpen(false);
      return;
    }
    setIsDeclining(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke<{
        ok: boolean;
        error?: string;
        alreadyAccepted?: boolean;
        alreadyDeclined?: boolean;
      }>("decline-obligation-share", { body: { token } });
      if (fnError) throw fnError;
      if (data?.alreadyAccepted) {
        setAlreadyAccepted(true);
        setDecisionOpen(false);
        return;
      }
      if (!data?.ok && !data?.alreadyDeclined) {
        throw new Error(data?.error ?? "No se pudo rechazar la solicitud");
      }
      await cancelObligationInviteScheduledReminder(token);
      void queryClient.invalidateQueries({ queryKey: ["pending-obligation-share-invites"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setDeclined(true);
      setDecisionOpen(false);
    } catch (err: unknown) {
      setError(humanizeError(err));
      setDecisionOpen(false);
    } finally {
      setIsDeclining(false);
    }
  }

  async function handleDefer() {
    setDecisionOpen(false);
    await scheduleObligationInviteDeferredReminder(token, 3600);
    router.replace("/(app)/dashboard");
  }

  function handleCloseModal() {
    setDecisionOpen(false);
    router.replace("/(app)/dashboard");
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Obligación compartida" />

      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator color={COLORS.primary} size="large" />
        ) : error ? (
          <Card>
            <Text style={styles.errorText}>{error}</Text>
            <Button label="Volver" variant="secondary" onPress={() => router.back()} style={styles.mt} />
          </Card>
        ) : alreadyAccepted ? (
          <View style={styles.centered}>
            <CheckCircle2 size={56} color={COLORS.primary} />
            <Text style={styles.successText}>Solicitud ya aceptada</Text>
            <Text style={styles.hint}>
              Este registro ya está disponible en Créditos y deudas.
            </Text>
            <Button
              label="Ver créditos y deudas"
              onPress={() => router.replace("/(app)/obligations")}
              style={styles.mt}
            />
          </View>
        ) : accepted ? (
          <View style={styles.centered}>
            <CheckCircle2 size={56} color={COLORS.primary} />
            <Text style={styles.successText}>¡Acceso concedido!</Text>
            <Text style={styles.hint}>Te llevamos a Créditos y deudas…</Text>
          </View>
        ) : declined ? (
          <View style={styles.centered}>
            <Text style={styles.successText}>Solicitud rechazada</Text>
            <Text style={styles.hint}>
              La invitación fue cerrada y ya no aparecerá como pendiente.
            </Text>
            <Button
              label="Volver a notificaciones"
              variant="secondary"
              onPress={() => router.replace("/notifications")}
              style={styles.mt}
            />
          </View>
        ) : invite ? (
          <Card>
            <Text style={styles.label}>
              {invite.direction === "receivable" ? "Solicitud de deuda" : "Solicitud de crédito"}
            </Text>
            <Text style={styles.title}>{invite.title}</Text>
            <Text style={styles.detail}>
              {invite.direction === "receivable" ? "Por cobrar" : "Por pagar"} · {invite.counterparty}
            </Text>
            <Text style={styles.amount}>
              {formatCurrency(
                invite.currentPrincipalAmount ?? invite.principalAmount,
                invite.currencyCode,
              )}
            </Text>
            <Text style={styles.detail}>
              Pendiente: {formatCurrency(invite.pendingAmount, invite.currencyCode)}
            </Text>
            {invite.message ? (
              <Text style={styles.inviteMessage}>{invite.message}</Text>
            ) : null}
            {!session ? (
              <Text style={styles.loginHint}>Inicia sesión para aceptar la invitación.</Text>
            ) : null}
          </Card>
        ) : null}
      </View>

      <Modal
        visible={decisionOpen && Boolean(invite) && !accepted && !alreadyAccepted && !declined && !error}
        transparent
        animationType="fade"
        onRequestClose={handleCloseModal}
      >
        <Pressable style={styles.modalBackdrop} onPress={handleCloseModal}>
          <Pressable style={[styles.modalCard, { marginBottom: insets.bottom + SPACING.md }]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>¿Aceptar invitación?</Text>
            <Text style={styles.modalBody}>
              {invite?.title ? `«${invite.title}»` : "Este registro"} se agregará a Créditos y deudas en modo compartido.
              También puedes rechazar la solicitud si no reconoces este registro.
            </Text>
            <Button
              label={session ? "Aceptar y ver créditos/deudas" : "Iniciar sesión y aceptar"}
              onPress={() => void handleAccept()}
              loading={isAccepting}
              disabled={isDeclining}
              style={styles.modalBtn}
            />
            <Button
              label="Rechazar solicitud"
              variant="secondary"
              onPress={() => void handleDecline()}
              loading={isDeclining}
              disabled={isAccepting}
              style={styles.modalBtn}
            />
            <Button
              label="Decidir después"
              variant="secondary"
              onPress={() => void handleDefer()}
              disabled={isAccepting || isDeclining}
              style={styles.modalBtn}
            />
            <Text style={styles.modalFootnote}>
              Si el enlace del correo no abre la app, revisa esta solicitud desde Notificaciones.
            </Text>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, justifyContent: "center", padding: SPACING.lg },
  centered: { alignItems: "center", gap: SPACING.md },
  label: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: SPACING.xs },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  detail: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: 2 },
  amount: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
    marginVertical: SPACING.sm,
  },
  inviteMessage: {
    marginTop: SPACING.md,
    padding: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
    backgroundColor: COLORS.primary + "12",
    color: COLORS.storm,
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
  },
  errorText: { color: COLORS.danger, fontSize: FONT_SIZE.sm },
  successText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.success },
  hint: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  loginHint: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.sm,
    color: COLORS.warning,
  },
  mt: { marginTop: SPACING.md },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  modalTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  modalBody: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, lineHeight: 20, marginBottom: SPACING.md },
  modalBtn: { marginTop: SPACING.sm },
  modalFootnote: {
    marginTop: SPACING.md,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    textAlign: "center",
  },
});
