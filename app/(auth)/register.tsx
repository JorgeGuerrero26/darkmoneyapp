import { useState } from "react";
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

type FormErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
};

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!fullName.trim()) newErrors.fullName = "El nombre es requerido";
    if (!email.trim()) newErrors.email = "El correo es requerido";
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Correo inválido";
    if (!password) newErrors.password = "La contraseña es requerida";
    else if (password.length < 8) newErrors.password = "Mínimo 8 caracteres";
    if (password !== confirmPassword) newErrors.confirmPassword = "Las contraseñas no coinciden";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleRegister() {
    if (!validate()) return;
    setIsLoading(true);
    setErrors({});
    try {
      const result = await signUp({
        email: email.trim(),
        password,
        fullName: fullName.trim(),
      });
      if (result.needsEmailConfirmation) {
        setConfirmationSent(true);
      }
    } catch (err: unknown) {
      setErrors({ general: humanizeError(err) });
    } finally {
      setIsLoading(false);
    }
  }

  if (confirmationSent) {
    return (
      <View
        style={[
          styles.flex,
          styles.centered,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <Text style={styles.confirmEmoji}>📧</Text>
        <Text style={styles.confirmTitle}>Revisa tu correo</Text>
        <Text style={styles.confirmDesc}>
          Te enviamos un enlace de confirmación a{"\n"}
          <Text style={styles.emailHighlight}>{email}</Text>
          {"\n\n"}Confirma tu correo y luego inicia sesión.
        </Text>
        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.backButton}>
            <Text style={styles.backButtonText}>Ir al inicio de sesión</Text>
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
        <View style={styles.header}>
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Empieza a controlar tus finanzas</Text>
        </View>

        <View style={styles.form}>
          {errors.general ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errors.general}</Text>
            </View>
          ) : null}

          <Input
            label="Nombre completo"
            placeholder="Tu nombre"
            value={fullName}
            onChangeText={setFullName}
            error={errors.fullName}
            autoCapitalize="words"
            returnKeyType="next"
          />
          <Input
            label="Correo electrónico"
            placeholder="tu@correo.com"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
          />
          <Input
            label="Contraseña"
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            secureTextEntry
            returnKeyType="next"
          />
          <Input
            label="Confirmar contraseña"
            placeholder="Repite la contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            error={errors.confirmPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleRegister}
          />

          <Button
            label="Crear cuenta"
            onPress={handleRegister}
            loading={isLoading}
            style={styles.submitButton}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Inicia sesión</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  centered: { justifyContent: "center", alignItems: "center", paddingHorizontal: SPACING.xl },
  container: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.xxl,
  },
  header: { gap: SPACING.xs },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
  },
  form: { gap: SPACING.lg },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted,
    borderRadius: 8,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.danger,
  },
  errorBannerText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.sm,
  },
  submitButton: { marginTop: SPACING.sm },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: { color: COLORS.textMuted, fontSize: FONT_SIZE.sm },
  footerLink: { color: COLORS.primary, fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },
  // Confirmation screen
  confirmEmoji: { fontSize: 56, marginBottom: SPACING.lg },
  confirmTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: FONT_WEIGHT.bold,
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  confirmDesc: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  emailHighlight: { color: COLORS.primary, fontWeight: FONT_WEIGHT.semibold },
  backButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
  },
  backButtonText: { color: "#FFF", fontWeight: FONT_WEIGHT.semibold, fontSize: FONT_SIZE.md },
});
