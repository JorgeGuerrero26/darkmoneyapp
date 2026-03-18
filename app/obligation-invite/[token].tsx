import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { formatCurrency } from "../../components/ui/AmountDisplay";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";

export default function ObligationInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();

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
      const { data, error } = await supabase.functions.invoke(
        "obligation-share-invite-details",
        { body: { token } },
      );
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
    if (!supabase || !session) { router.replace("/(auth)/login"); return; }
    setIsAccepting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "accept-obligation-share",
        { body: { token } },
      );
      if (error) throw error;
      if (!data.ok && !data.alreadyAccepted) throw new Error(data.error ?? "Error al aceptar");
      setAccepted(true);
      setTimeout(() => router.replace("/(app)/dashboard"), 1500);
    } catch (err: unknown) {
      setError(humanizeError(err));
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Obligación compartida" />

      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator color={COLORS.primary} size="large" />
        ) : error ? (
          <Card><Text style={styles.errorText}>{error}</Text></Card>
        ) : accepted ? (
          <View style={styles.centered}>
            <Text style={{ fontSize: 56 }}>✅</Text>
            <Text style={styles.successText}>¡Acceso concedido!</Text>
          </View>
        ) : invite ? (
          <Card>
            <Text style={styles.label}>Te comparten una obligación</Text>
            <Text style={styles.title}>{invite.title}</Text>
            <Text style={styles.detail}>
              {invite.direction === "receivable" ? "Por cobrar" : "Por pagar"} ·{" "}
              {invite.counterparty}
            </Text>
            <Text style={styles.amount}>
              {formatCurrency(invite.currentPrincipalAmount ?? invite.principalAmount, invite.currencyCode)}
            </Text>
            <Text style={styles.detail}>
              Pendiente: {formatCurrency(invite.pendingAmount, invite.currencyCode)}
            </Text>
            <Button
              label="Aceptar y ver obligación"
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
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: COLORS.text, marginBottom: SPACING.sm },
  detail: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, marginBottom: 2 },
  amount: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.text, marginVertical: SPACING.sm },
  errorText: { color: COLORS.danger, fontSize: FONT_SIZE.sm },
  successText: { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: COLORS.success },
  acceptButton: { marginTop: SPACING.lg },
});
