import { useCallback, useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "../../lib/auth-context";
import { useUiStore } from "../../store/ui-store";
import { humanizeError } from "../../lib/errors";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const SECURE_EMAIL_KEY = "darkmoney_bio_email";
const SECURE_PASS_KEY = "darkmoney_bio_password";

type FormErrors = { email?: string; password?: string; general?: string };

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const { biometricEnabled, setBiometricEnabled } = useUiStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isBioLoading, setIsBioLoading] = useState(false);

  // Whether device supports biometrics + has enrolled credentials
  const [bioAvailable, setBioAvailable] = useState(false);
  // Whether we have stored credentials (i.e. user previously enabled biometric login)
  const [bioCredsStored, setBioCredsStored] = useState(false);
  // Dialog asking user to enable biometric login after password login
  const [bioPromptVisible, setBioPromptVisible] = useState(false);
  // Pending credentials waiting for user decision
  const [pendingCreds, setPendingCreds] = useState<{ email: string; password: string } | null>(null);

  // On mount: check biometric hardware + stored credentials
  useEffect(() => {
    void (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const available = hasHardware && isEnrolled;
      setBioAvailable(available);

      if (available) {
        const stored = await SecureStore.getItemAsync(SECURE_EMAIL_KEY);
        setBioCredsStored(Boolean(stored));
      }
    })();
  }, []);

  // Auto-trigger biometric login on mount if enabled + creds stored
  useEffect(() => {
    if (biometricEnabled && bioCredsStored && bioAvailable) {
      void triggerBiometricLogin();
    }
    // Only on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bioCredsStored]);

  const triggerBiometricLogin = useCallback(async () => {
    setIsBioLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Accede a DarkMoney",
        fallbackLabel: "Usar contraseña",
        disableDeviceFallback: false,
      });

      if (!result.success) return;

      const storedEmail = await SecureStore.getItemAsync(SECURE_EMAIL_KEY);
      const storedPass = await SecureStore.getItemAsync(SECURE_PASS_KEY);

      if (!storedEmail || !storedPass) return;

      await signIn(storedEmail, storedPass);
    } catch (err) {
      setErrors({ general: humanizeError(err) });
    } finally {
      setIsBioLoading(false);
    }
  }, [signIn]);

  function validate(): boolean {
    const newErrors: FormErrors = {};
    if (!email.trim()) newErrors.email = "El correo es requerido";
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Correo inválido";
    if (!password) newErrors.password = "La contraseña es requerida";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleLogin() {
    if (!validate()) return;
    setIsLoading(true);
    setErrors({});
    try {
      await signIn(email.trim(), password);
      // After successful login, offer to enable biometric if available and not already set up
      if (bioAvailable && !bioCredsStored) {
        setPendingCreds({ email: email.trim(), password });
        setBioPromptVisible(true);
      }
    } catch (err: unknown) {
      setErrors({ general: humanizeError(err) });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleEnableBiometric() {
    if (!pendingCreds) return;
    await SecureStore.setItemAsync(SECURE_EMAIL_KEY, pendingCreds.email);
    await SecureStore.setItemAsync(SECURE_PASS_KEY, pendingCreds.password);
    setBiometricEnabled(true);
    setBioCredsStored(true);
    setPendingCreds(null);
    setBioPromptVisible(false);
  }

  function handleDeclineBiometric() {
    setPendingCreds(null);
    setBioPromptVisible(false);
  }

  const showBioButton = bioAvailable && bioCredsStored;

  return (
    <>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            { paddingTop: insets.top + SPACING.xxxl, paddingBottom: insets.bottom + SPACING.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Image
              source={require("../../assets/images/logo-darkmoney.png")}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>Inicia sesión en tu cuenta</Text>
          </View>

          <View style={styles.form}>
            {errors.general ? (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{errors.general}</Text>
              </View>
            ) : null}

            {/* Biometric quick-access button */}
            {showBioButton ? (
              <TouchableOpacity
                style={styles.bioBtn}
                onPress={() => void triggerBiometricLogin()}
                disabled={isBioLoading}
                activeOpacity={0.8}
              >
                <Text style={styles.bioBtnIcon}>🫆</Text>
                <View>
                  <Text style={styles.bioBtnTitle}>Acceder con huella digital</Text>
                  <Text style={styles.bioBtnSub}>Toca para autenticarte</Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {showBioButton ? (
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>o ingresa tu contraseña</Text>
                <View style={styles.dividerLine} />
              </View>
            ) : null}

            <Input
              label="Correo electrónico"
              placeholder="tu@correo.com"
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
              returnKeyType="next"
            />

            <Input
              label="Contraseña"
              placeholder="Tu contraseña"
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="off"
              importantForAutofill="no"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />

            <Button
              label="Iniciar sesión"
              onPress={handleLogin}
              loading={isLoading}
              style={styles.submitButton}
            />

            <Link href="/(auth)/recovery" asChild>
              <TouchableOpacity style={styles.forgotLink}>
                <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>¿No tienes cuenta? </Text>
            <Link href="/(auth)/register" asChild>
              <TouchableOpacity>
                <Text style={styles.footerLink}>Regístrate</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Dialog: offer to enable biometric after first password login */}
      <Modal
        visible={bioPromptVisible}
        transparent
        animationType="fade"
        onRequestClose={handleDeclineBiometric}
      >
        <View style={styles.dialogOverlay}>
          <View style={styles.dialogCard}>
            <Text style={styles.dialogIcon}>🫆</Text>
            <Text style={styles.dialogTitle}>Acceso rápido con huella</Text>
            <Text style={styles.dialogBody}>
              Activa el acceso con huella digital para no tener que escribir tu contraseña cada vez que abras la app.
            </Text>
            <TouchableOpacity style={styles.dialogConfirm} onPress={() => void handleEnableBiometric()}>
              <Text style={styles.dialogConfirmText}>Activar huella digital</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dialogCancel} onPress={handleDeclineBiometric}>
              <Text style={styles.dialogCancelText}>Ahora no</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.bg },
  container: { flexGrow: 1, paddingHorizontal: SPACING.xl, gap: SPACING.xxl },
  header: { alignItems: "center", gap: SPACING.sm },
  logo: {
    width: 160, height: 160, borderRadius: 80, overflow: "hidden",
    shadowColor: "#6be4c5", shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6, shadowRadius: 24, elevation: 12,
  },
  subtitle: { fontSize: FONT_SIZE.md, color: COLORS.storm },
  form: { gap: SPACING.lg },
  errorBanner: {
    backgroundColor: COLORS.dangerMuted, borderRadius: 8,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.danger,
  },
  errorBannerText: { color: COLORS.danger, fontSize: FONT_SIZE.sm },

  // Biometric button
  bioBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: COLORS.primary + "18",
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.primary + "55",
    padding: SPACING.lg,
  },
  bioBtnIcon: { fontSize: 32 },
  bioBtnTitle: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.primary },
  bioBtnSub: { fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 2 },

  // Divider
  divider: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: GLASS.separator },
  dividerText: { fontSize: FONT_SIZE.xs, color: COLORS.storm },

  submitButton: { marginTop: SPACING.sm },
  forgotLink: { alignItems: "center", paddingVertical: SPACING.sm },
  linkText: { color: COLORS.primary, fontSize: FONT_SIZE.sm },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { color: COLORS.storm, fontSize: FONT_SIZE.sm },
  footerLink: { color: COLORS.primary, fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold },

  // Enable biometric dialog
  dialogOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center", justifyContent: "center", padding: SPACING.xl,
  },
  dialogCard: {
    width: "100%", backgroundColor: COLORS.mist,
    borderRadius: RADIUS.xl, padding: SPACING.xl,
    borderWidth: 1, borderColor: GLASS.sheetBorder,
    alignItems: "center", gap: SPACING.sm,
  },
  dialogIcon: { fontSize: 48, marginBottom: SPACING.xs },
  dialogTitle: {
    fontSize: FONT_SIZE.lg, fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink, textAlign: "center",
  },
  dialogBody: {
    fontSize: FONT_SIZE.sm, color: COLORS.storm,
    textAlign: "center", lineHeight: 20, marginBottom: SPACING.sm,
  },
  dialogConfirm: {
    width: "100%", backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: "center",
  },
  dialogConfirmText: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.textInverse },
  dialogCancel: {
    width: "100%", paddingVertical: SPACING.sm, alignItems: "center",
  },
  dialogCancelText: { fontSize: FONT_SIZE.md, color: COLORS.storm },
});
