import { CheckCircle2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [generalError, setGeneralError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  // Handle deep link token — Supabase sends the token in the URL fragment
  useEffect(() => {
    async function handleDeepLink() {
      const url = await Linking.getInitialURL();
      if (!url || !supabase) return;
      // Extract access_token and refresh_token from the URL hash/params
      const parsed = Linking.parse(url);
      const params = parsed.queryParams ?? {};
      const accessToken = params.access_token as string | undefined;
      const refreshToken = params.refresh_token as string | undefined;
      if (accessToken && refreshToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
    }
    void handleDeepLink();
  }, []);

  async function handleSubmit() {
    setPasswordError(undefined);
    setConfirmError(undefined);
    setGeneralError(undefined);

    if (!password) { setPasswordError("La contraseña es requerida"); return; }
    if (password.length < 8) { setPasswordError("Mínimo 8 caracteres"); return; }
    if (password !== confirmPassword) { setConfirmError("Las contraseñas no coinciden"); return; }

    setIsLoading(true);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(() => router.replace("/(app)/dashboard"), 2000);
    } catch (err: unknown) {
      setGeneralError(humanizeError(err));
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

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
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

        {generalError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{generalError}</Text>
          </View>
        ) : null}

        <Input
          label="Nueva contraseña"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChangeText={setPassword}
          error={passwordError}
          secureTextEntry
          returnKeyType="next"
        />
        <Input
          label="Confirmar contraseña"
          placeholder="Repite la contraseña"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={confirmError}
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <Button label="Actualizar contraseña" onPress={handleSubmit} loading={isLoading} />
      </ScrollView>
    </KeyboardAvoidingView>
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
