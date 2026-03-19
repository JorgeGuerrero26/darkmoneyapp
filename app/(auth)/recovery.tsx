import { useState } from "react";
import { ArrowLeft } from "lucide-react-native";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { COLORS, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";

export default function RecoveryScreen() {
  const insets = useSafeAreaInsets();
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [generalError, setGeneralError] = useState<string | undefined>();

  async function handleReset() {
    setEmailError(undefined);
    setGeneralError(undefined);
    if (!email.trim()) { setEmailError("El correo es requerido"); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setEmailError("Correo inválido"); return; }

    setIsLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err: unknown) {
      setGeneralError(humanizeError(err));
    } finally {
      setIsLoading(false);
    }
  }

  if (sent) {
    return (
      <View
        style={[
          styles.flex,
          styles.centered,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Text style={{ fontSize: 56, marginBottom: SPACING.lg }}>📩</Text>
        <Text style={styles.title}>Correo enviado</Text>
        <Text style={styles.desc}>
          Revisa tu bandeja de entrada y sigue el enlace para restablecer tu contraseña.
        </Text>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.backButton}>
            <Text style={styles.backButtonText}>Volver al inicio de sesión</Text>
          </TouchableOpacity>
        </Link>
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
          <Text style={styles.title}>Recuperar contraseña</Text>
          <Text style={styles.subtitle}>
            Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
          </Text>
        </View>

        {generalError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{generalError}</Text>
          </View>
        ) : null}

        <Input
          label="Correo electrónico"
          placeholder="tu@correo.com"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          keyboardType="email-address"
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={handleReset}
        />

        <Button label="Enviar enlace" onPress={handleReset} loading={isLoading} />

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.backLink}>
            <ArrowLeft size={14} color={COLORS.primary} />
            <Text style={styles.backLinkText}>Volver al inicio de sesión</Text>
          </TouchableOpacity>
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  centered: { justifyContent: "center", alignItems: "center", paddingHorizontal: SPACING.xl },
  container: { flexGrow: 1, paddingHorizontal: SPACING.xl, gap: SPACING.xl },
  title: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: COLORS.text, marginBottom: SPACING.sm },
  subtitle: { fontSize: FONT_SIZE.md, color: COLORS.textMuted, lineHeight: 22 },
  desc: { fontSize: FONT_SIZE.md, color: COLORS.textMuted, textAlign: "center", lineHeight: 22, marginBottom: SPACING.xl },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted, borderRadius: 8, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.danger,
  },
  errorBannerText: { color: COLORS.danger, fontSize: FONT_SIZE.sm },
  backLink: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: SPACING.sm },
  backLinkText: { color: COLORS.primary, fontSize: FONT_SIZE.sm },
  backButton: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.xl, backgroundColor: COLORS.primary, borderRadius: 10 },
  backButtonText: { color: "#FFF", fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.md },
});
