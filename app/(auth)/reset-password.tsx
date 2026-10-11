import { FormFeedbackProvider, FormScrollView, FormSubmitBar } from "../../components/ui/FormFeedback";
import { requiredField, passwordField } from "../../lib/form-field-rules";
import { authFormError } from "../../lib/form-errors";
import { CheckCircle2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { Input } from "../../components/ui/Input";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";

function extractRecoveryTokens(url: string | null) {
  if (!url) return null;

  const parsed = Linking.parse(url);
  const queryParams = parsed.queryParams ?? {};
  const accessTokenFromQuery = queryParams.access_token;
  const refreshTokenFromQuery = queryParams.refresh_token;
  const accessToken =
    typeof accessTokenFromQuery === "string" ? accessTokenFromQuery : undefined;
  const refreshToken =
    typeof refreshTokenFromQuery === "string" ? refreshTokenFromQuery : undefined;
  if (accessToken && refreshToken) return { accessToken, refreshToken };

  const fragment = url.split("#")[1] ?? "";
  const fragmentParams = new URLSearchParams(fragment);
  const accessTokenFromFragment = fragmentParams.get("access_token") ?? undefined;
  const refreshTokenFromFragment = fragmentParams.get("refresh_token") ?? undefined;
  if (accessTokenFromFragment && refreshTokenFromFragment) {
    return {
      accessToken: accessTokenFromFragment,
      refreshToken: refreshTokenFromFragment,
    };
  }

  return null;
}

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Handle deep link token: Supabase may send recovery tokens in query params or URL fragment.
  useEffect(() => {
    async function applyRecoverySession(url: string | null) {
      if (!url || !supabase) return;
      const tokens = extractRecoveryTokens(url);
      if (tokens) {
        await supabase.auth.setSession({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        });
      }
    }

    void Linking.getInitialURL().then(applyRecoverySession);
    const subscription = Linking.addEventListener("url", ({ url }) => {
      void applyRecoverySession(url);
    });

    return () => subscription.remove();
  }, []);

  async function handleSubmit() {


    setIsLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(() => router.replace("/(app)/dashboard"), 2000);
    } catch (err: unknown) {
      throw authFormError(err);
    } finally {
      setIsLoading(false);
    }
  }

  if (done) {
    return (
      <View style={[styles.flex, styles.centered, { paddingTop: insets.top }]}>
        <CheckCircle2 size={56} color={COLORS.primary} />
        <Text style={styles.title}>Contraseña actualizada</Text>
        <Text style={styles.subtitle}>Redirigiendo...</Text>
      </View>
    );
  }

  const validationFields = { password: passwordField(password, 8), confirmPassword: requiredField(confirmPassword, "Confirma tu contraseña", password !== confirmPassword ? "Las contraseñas no coinciden" : null) };

  return (
    <FormFeedbackProvider onSubmit={handleSubmit} busy={isLoading} fields={validationFields}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <FormScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + SPACING.xl, paddingBottom: insets.bottom + SPACING.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={styles.title}>Nueva contraseña</Text>
          <Text style={styles.subtitle}>Ingresa y confirma tu nueva contraseña.</Text>
        </View>


        <Input fieldId="password"
          label="Nueva contraseña"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          returnKeyType="next"
        />
        <Input fieldId="confirmPassword"
          label="Confirmar contraseña"
          placeholder="Repite la contraseña"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <FormSubmitBar label="Actualizar contraseña" onSubmit={handleSubmit} loading={isLoading} />
      </FormScrollView>
    </KeyboardAvoidingView>
    </FormFeedbackProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  centered: { justifyContent: "center", alignItems: "center", paddingHorizontal: SPACING.xl },
  container: { flexGrow: 1, paddingHorizontal: SPACING.xl, gap: SPACING.xl },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: COLORS.text, marginBottom: SPACING.sm },
  subtitle: { fontSize: FONT_SIZE.md, color: COLORS.textMuted },
  errorBanner: { backgroundColor: COLORS.dangerMuted, borderRadius: 8, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.danger },
  errorBannerText: { color: COLORS.danger, fontSize: FONT_SIZE.sm },
});
