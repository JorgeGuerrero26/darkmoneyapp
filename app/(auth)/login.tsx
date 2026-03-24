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
import { Eye, EyeOff, CheckSquare, Square } from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { useUiStore } from "../../store/ui-store";
import { humanizeError } from "../../lib/errors";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const SECURE_EMAIL_KEY = "darkmoney_bio_email";
const SECURE_PASS_KEY = "darkmoney_bio_password";
const REMEMBER_EMAIL_KEY = "darkmoney_remember_email";
const REMEMBER_PASS_KEY = "darkmoney_remember_password";
const REMEMBER_FLAG_KEY = "darkmoney_remember_me";

type FormErrors = { email?: string; password?: string; general?: string };

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const { biometricEnabled, setBiometricEnabled } = useUiStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
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

  // On mount: check biometric hardware + stored credentials + remember me
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

      // Load remembered credentials
      const flag = await SecureStore.getItemAsync(REMEMBER_FLAG_KEY);
      if (flag === "true") {
        const savedEmail = await SecureStore.getItemAsync(REMEMBER_EMAIL_KEY);
        const savedPass = await SecureStore.getItemAsync(REMEMBER_PASS_KEY);
        if (savedEmail) setEmail(savedEmail);
        if (savedPass) setPassword(savedPass);
        setRememberMe(true);
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

      // Persist or clear "remember me" credentials
      if (rememberMe) {
        await SecureStore.setItemAsync(REMEMBER_EMAIL_KEY, email.trim());
        await SecureStore.setItemAsync(REMEMBER_PASS_KEY, password);
        await SecureStore.setItemAsync(REMEMBER_FLAG_KEY, "true");
      } else {
        await SecureStore.deleteItemAsync(REMEMBER_EMAIL_KEY);
        await SecureStore.deleteItemAsync(REMEMBER_PASS_KEY);
        await SecureStore.deleteItemAsync(REMEMBER_FLAG_KEY);
      }

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
            <Text style={styles.appName}>DarkMoney</Text>
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
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="off"
              importantForAutofill="no"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              rightElement={
                <TouchableOpacity
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  {showPassword
                    ? <EyeOff size={18} color={COLORS.storm} />
                    : <Eye size={18} color={COLORS.storm} />
                  }
                </TouchableOpacity>
              }
            />

            {/* Remember me */}
            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe((v) => !v)}
              activeOpacity={0.7}
            >
              {rememberMe
                ? <CheckSquare size={18} color={COLORS.pine} />
                : <Square size={18} color={COLORS.storm} />
              }
              <Text style={[styles.rememberText, rememberMe && styles.rememberTextActive]}>
                Recordar contraseña
              </Text>
            </TouchableOpacity>

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
  flex: { flex: 1, backgroundColor: COLORS.canvas },
  container: { flexGrow: 1, paddingHorizontal: SPACING.xl, gap: SPACING.xxl },
  header: { alignItems: "center", gap: SPACING.md },
  logo: {
    width: 160, height: 160, borderRadius: 80, overflow: "hidden",
    shadowColor: COLORS.pine, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 32, elevation: 12,
  },
  appName: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxl, color: COLORS.ink, letterSpacing: 0.5 },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm },
  form: { gap: SPACING.lg },
  errorBanner: {
    backgroundColor: GLASS.dangerBg, borderRadius: RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: GLASS.dangerBorder,
  },
  errorBannerText: { fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.rosewood, fontSize: FONT_SIZE.sm },

  // Biometric button
  bioBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    backgroundColor: GLASS.cardActive,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: GLASS.cardActiveBorder,
    padding: SPACING.lg,
  },
  bioBtnIcon: { fontSize: 32 },
  bioBtnTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.pine },
  bioBtnSub: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 2 },

  // Divider
  divider: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: GLASS.separator },
  dividerText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },

  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: -SPACING.xs,
  },
  rememberText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  rememberTextActive: {
    color: COLORS.pine,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  submitButton: { marginTop: SPACING.xs },
  forgotLink: { alignItems: "center", paddingVertical: SPACING.sm },
  linkText: { fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.pine, fontSize: FONT_SIZE.sm },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontFamily: FONT_FAMILY.body, color: COLORS.storm, fontSize: FONT_SIZE.sm },
  footerLink: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.pine, fontSize: FONT_SIZE.sm },

  // Enable biometric dialog
  dialogOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.75)",
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
    fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg,
    color: COLORS.ink, textAlign: "center",
  },
  dialogBody: {
    fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm,
    textAlign: "center", lineHeight: 20, marginBottom: SPACING.sm,
  },
  dialogConfirm: {
    width: "100%", backgroundColor: COLORS.pine,
    borderRadius: RADIUS.md, paddingVertical: SPACING.md, alignItems: "center",
  },
  dialogConfirmText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.textInverse },
  dialogCancel: {
    width: "100%", paddingVertical: SPACING.sm, alignItems: "center",
  },
  dialogCancelText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm },
});
