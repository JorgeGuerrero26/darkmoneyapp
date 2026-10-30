import { FormFeedbackProvider, FormScrollView, FormSubmitBar } from "../../components/ui/FormFeedback";
import { requiredField, emailField, passwordField } from "../../lib/form-field-rules";
import { authFormError } from "../../lib/form-errors";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../lib/auth-context";
import { Input } from "../../components/ui/Input";
import { GoogleSignInButton } from "../../components/domain/GoogleSignInButton";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";


export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);


  async function handleRegister() {
    setIsLoading(true);
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
      throw authFormError(err);
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

  const validationFields = { fullName: requiredField(fullName, "Escribe tu nombre"), email: emailField(email), password: passwordField(password, 8), confirmPassword: requiredField(confirmPassword, "Confirma tu contraseña", password !== confirmPassword ? "Las contraseñas no coinciden" : null) };

  return (
    <FormFeedbackProvider onSubmit={handleRegister} busy={isLoading} fields={validationFields}>
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
        <View style={styles.header}>
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Empieza a controlar tus finanzas</Text>
        </View>

        <View style={styles.form}>

          <Input fieldId="fullName"
            label="Nombre completo"
            placeholder="Tu nombre"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            returnKeyType="next"
          />
          <Input fieldId="email"
            label="Correo electrónico"
            placeholder="tu@correo.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            returnKeyType="next"
          />
          <Input fieldId="password"
            label="Contraseña"
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
            onSubmitEditing={handleRegister}
          />

          <FormSubmitBar label="Crear cuenta" onSubmit={handleRegister} loading={isLoading} />

          <GoogleSignInButton disabled={isLoading} />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>¿Ya tienes cuenta? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Inicia sesión</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </FormScrollView>
    </KeyboardAvoidingView>
    </FormFeedbackProvider>
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
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.storm,
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
  footerText: { color: COLORS.storm, fontSize: FONT_SIZE.sm },
  footerLink: { color: COLORS.primary, fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold },
  // Confirmation screen
  confirmEmoji: { fontSize: 56, marginBottom: SPACING.lg },
  confirmTitle: {
    fontSize: FONT_SIZE.xxl,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
    marginBottom: SPACING.md,
  },
  confirmDesc: {
    fontSize: FONT_SIZE.md,
    color: COLORS.storm,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  emailHighlight: { color: COLORS.primary, fontFamily: FONT_FAMILY.bodySemibold },
  backButton: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  backButtonText: { color: "#FFF", fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
});
