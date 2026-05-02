import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { Eye, EyeOff, CheckSquare, Square, Fingerprint } from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { useUiStore } from "../../store/ui-store";
import { humanizeError } from "../../lib/errors";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { SafeBlurView } from "../../components/ui/SafeBlurView";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import {
  REMEMBER_EMAIL_KEY,
  REMEMBER_FLAG_KEY,
  REMEMBER_PASS_KEY,
  SECURE_EMAIL_KEY,
  SECURE_PASS_KEY,
} from "../../lib/device-auth-state";

type FormErrors = { email?: string; password?: string; general?: string };
const EASTER_EGG_TAP_COUNT = 7;
const EASTER_EGG_TAP_WINDOW_MS = 2_200;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{ fromWelcome?: string }>();
  const { signIn } = useAuth();
  const { biometricEnabled, setBiometricEnabled } = useUiStore();
  const logoFlipScale = useRef(new Animated.Value(1)).current;
  const logoFlipDepth = useRef(new Animated.Value(1)).current;
  const logoBounceScale = useRef(new Animated.Value(1)).current;
  const logoBounceLift = useRef(new Animated.Value(0)).current;
  const logoBounceTilt = useRef(new Animated.Value(0)).current;
  const logoFlipInFlightRef = useRef(false);
  const logoBounceInFlightRef = useRef(false);
  const logoTapTimesRef = useRef<number[]>([]);

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
  const [showLogoBack, setShowLogoBack] = useState(false);

  useEffect(() => {
    if (params.fromWelcome === "1") return;
    router.replace({ pathname: "/(auth)/login", params: { fromWelcome: "1" } });
  }, [params.fromWelcome, router]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      router.replace("/(auth)/welcome");
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    setShowLogoBack(false);
    logoTapTimesRef.current = [];
  }, []);

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

  const triggerLogoFlip = useCallback(() => {
    if (logoFlipInFlightRef.current) return;
    logoFlipInFlightRef.current = true;

    Animated.parallel([
      Animated.timing(logoFlipScale, {
        toValue: 0.08,
        duration: 170,
        useNativeDriver: true,
      }),
      Animated.timing(logoFlipDepth, {
        toValue: 1.08,
        duration: 170,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowLogoBack((current) => !current);
      Animated.parallel([
        Animated.spring(logoFlipScale, {
          toValue: 1,
          friction: 7,
          tension: 120,
          useNativeDriver: true,
        }),
        Animated.spring(logoFlipDepth, {
          toValue: 1,
          friction: 7,
          tension: 110,
          useNativeDriver: true,
        }),
      ]).start(() => {
        logoFlipInFlightRef.current = false;
      });
    });
  }, [logoFlipDepth, logoFlipScale]);

  const playLogoBounce = useCallback((onDone?: () => void) => {
    if (logoBounceInFlightRef.current) {
      onDone?.();
      return;
    }

    logoBounceInFlightRef.current = true;
    Animated.parallel([
      Animated.sequence([
        Animated.timing(logoBounceScale, {
          toValue: 1.08,
          duration: 95,
          useNativeDriver: true,
        }),
        Animated.spring(logoBounceScale, {
          toValue: 1,
          friction: 5,
          tension: 130,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(logoBounceLift, {
          toValue: -8,
          duration: 90,
          useNativeDriver: true,
        }),
        Animated.spring(logoBounceLift, {
          toValue: 0,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(logoBounceTilt, {
          toValue: 1,
          duration: 70,
          useNativeDriver: true,
        }),
        Animated.timing(logoBounceTilt, {
          toValue: -0.65,
          duration: 95,
          useNativeDriver: true,
        }),
        Animated.spring(logoBounceTilt, {
          toValue: 0,
          friction: 6,
          tension: 120,
          useNativeDriver: true,
        }),
      ]),
    ]).start(() => {
      logoBounceInFlightRef.current = false;
      onDone?.();
    });
  }, [logoBounceLift, logoBounceScale, logoBounceTilt]);

  const handleLogoPress = useCallback(() => {
    const now = Date.now();
    logoTapTimesRef.current = logoTapTimesRef.current
      .filter((tapTime) => now - tapTime <= EASTER_EGG_TAP_WINDOW_MS)
      .concat(now);

    const shouldFlip = logoTapTimesRef.current.length >= EASTER_EGG_TAP_COUNT;
    if (shouldFlip) {
      logoTapTimesRef.current = [];
      playLogoBounce(() => {
        triggerLogoFlip();
      });
      return;
    }

    playLogoBounce();
  }, [playLogoBounce, triggerLogoFlip]);

  const showBioButton = bioAvailable && bioCredsStored;
  const compact = height < 740;
  const logoTilt = logoBounceTilt.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-7deg", "7deg"],
  });

  return (
    <>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.container,
            compact && styles.containerCompact,
            { paddingTop: insets.top + SPACING.xxxl + SPACING.md, paddingBottom: insets.bottom + SPACING.xl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              activeOpacity={0.94}
              hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }}
              onPress={handleLogoPress}
            >
              <Animated.View
                style={[
                  styles.logoFrame,
                  compact && styles.logoFrameCompact,
                  showLogoBack && styles.logoFrameBackActive,
                  {
                    transform: [
                      { translateY: logoBounceLift },
                      { rotate: logoTilt },
                      { scaleX: logoFlipScale },
                      { scaleY: logoFlipDepth },
                      { scale: logoBounceScale },
                    ],
                  },
                ]}
              >
                <Image
                  source={require("../../assets/images/logo-sin-fondo.png")}
                  style={[styles.logoFace, showLogoBack && styles.logoFaceBack]}
                  resizeMode="contain"
                />
                {showLogoBack ? (
                  <>
                    <Image
                      source={require("../../assets/images/logo-sin-fondo.png")}
                      style={[styles.logoFace, styles.logoFaceBackBoost]}
                      resizeMode="contain"
                    />
                    <View style={styles.logoFaceBackContrast} />
                  </>
                ) : null}
              </Animated.View>
            </TouchableOpacity>
            <Text style={styles.appName}>DarkMoney</Text>
            <Text style={styles.subtitle}>Inicia sesión en tu cuenta</Text>
          </View>

          <View style={styles.formCard}>
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
                <View style={styles.bioBtnIconWrap}>
                  <Fingerprint size={26} color={COLORS.primary} strokeWidth={1.5} />
                </View>
                <View style={styles.bioBtnContent}>
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

            <View style={styles.formFooterLinks}>
              <Link href="/(auth)/recovery" asChild>
                <TouchableOpacity style={styles.forgotLink}>
                  <Text style={styles.linkText}>¿Olvidaste tu contraseña?</Text>
                </TouchableOpacity>
              </Link>
            </View>
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
          <SafeBlurView intensity={30} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View style={styles.dialogCard}>
            <View style={styles.dialogIconRing}>
              <View style={styles.dialogIconInner}>
                <Fingerprint size={40} color={COLORS.primary} strokeWidth={1.5} />
              </View>
            </View>
            <View style={styles.dialogTextBlock}>
              <Text style={styles.dialogTitle}>Acceso rápido con huella</Text>
              <Text style={styles.dialogBody}>
                Activa el acceso con huella digital para no tener que escribir tu contraseña cada vez que abras la app.
              </Text>
            </View>
            <Button
              label="Activar huella digital"
              variant="primary"
              size="lg"
              style={styles.dialogBtn}
              onPress={() => void handleEnableBiometric()}
            />
            <Button
              label="Ahora no"
              variant="ghost"
              size="md"
              style={styles.dialogBtn}
              onPress={handleDeclineBiometric}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.canvas },
  container: { flexGrow: 1, paddingHorizontal: SPACING.xl, gap: SPACING.xxl },
  containerCompact: { gap: SPACING.md },
  header: { alignItems: "center", gap: SPACING.xs },
  logoFrame: {
    width: 136,
    height: 156,
    marginBottom: -SPACING.xs,
  },
  logoFrameCompact: { width: 122, height: 142 },
  logoFrameBackActive: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  logoFace: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  logoFaceBack: {
    opacity: 1,
  },
  logoFaceBackBoost: {
    opacity: 0.12,
  },
  logoFaceBackContrast: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.07)",
  },
  appName: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxl, color: COLORS.ink, letterSpacing: 0.5 },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm },
  formCard: {
    gap: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: "rgba(10,14,20,0.78)",
  },
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
    padding: SPACING.md,
    paddingRight: SPACING.lg,
  },
  bioBtnIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(107,228,197,0.12)",
    borderWidth: 1,
    borderColor: GLASS.cardActiveBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  bioBtnContent: { flex: 1 },
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
  formFooterLinks: { alignItems: "center" },
  forgotLink: { alignItems: "center", paddingVertical: SPACING.xs },
  linkText: { fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.pine, fontSize: FONT_SIZE.sm },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  footerText: { fontFamily: FONT_FAMILY.body, color: COLORS.storm, fontSize: FONT_SIZE.sm },
  footerLink: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.pine, fontSize: FONT_SIZE.sm },

  // Enable biometric dialog
  dialogOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  dialogCard: {
    width: "100%",
    backgroundColor: "rgba(9,13,18,0.96)",
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xxxl,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    alignItems: "center",
    gap: SPACING.xl,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 30,
    elevation: 20,
  },
  dialogIconRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: GLASS.cardActive,
    borderWidth: 1.5,
    borderColor: GLASS.cardActiveBorder,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  dialogIconInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "rgba(107,228,197,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  dialogTextBlock: { alignItems: "center", gap: SPACING.xs },
  dialogTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
    color: COLORS.ink,
    textAlign: "center",
  },
  dialogBody: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    lineHeight: 20,
  },
  dialogBtn: { alignSelf: "stretch" },
});
