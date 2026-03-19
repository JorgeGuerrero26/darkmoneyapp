import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../lib/auth-context";
import { humanizeError } from "../lib/errors";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../constants/theme";

const POPULAR_CURRENCIES = ["PEN", "USD", "EUR", "MXN", "COP", "ARS", "BRL", "CLP"];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, saveProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [baseCurrencyCode, setBaseCurrencyCode] = useState(profile?.baseCurrencyCode ?? "PEN");
  const [nameError, setNameError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState<string | undefined>();

  async function handleSave() {
    setNameError(undefined);
    setGeneralError(undefined);
    if (!fullName.trim()) { setNameError("El nombre es requerido"); return; }
    if (!baseCurrencyCode.trim()) return;

    setIsLoading(true);
    try {
      await saveProfile({
        fullName: fullName.trim(),
        baseCurrencyCode: baseCurrencyCode.trim().toUpperCase(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Lima",
      });
      router.replace("/(app)/dashboard");
    } catch (err: unknown) {
      setGeneralError(humanizeError(err));
    } finally {
      setIsLoading(false);
    }
  }

  return (
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
          <Text style={styles.emoji}>🎉</Text>
          <Text style={styles.title}>¡Bienvenido a DarkMoney!</Text>
          <Text style={styles.subtitle}>
            Configura tu perfil para empezar a gestionar tus finanzas.
          </Text>
        </View>

        {generalError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{generalError}</Text>
          </View>
        ) : null}

        <View style={styles.form}>
          <Input
            label="Tu nombre"
            placeholder="Nombre completo"
            value={fullName}
            onChangeText={setFullName}
            error={nameError}
            autoCapitalize="words"
          />

          <View>
            <Text style={styles.currencyLabel}>Moneda base</Text>
            <Text style={styles.currencyHint}>
              Todos los totales del dashboard se mostrarán en esta moneda.
            </Text>
            <View style={styles.currencyGrid}>
              {POPULAR_CURRENCIES.map((code) => (
                <Button
                  key={code}
                  label={code}
                  variant={baseCurrencyCode === code ? "primary" : "secondary"}
                  size="sm"
                  onPress={() => setBaseCurrencyCode(code)}
                  style={styles.currencyButton}
                />
              ))}
            </View>
            <Input
              placeholder="Otro código (ej. GBP)"
              value={POPULAR_CURRENCIES.includes(baseCurrencyCode) ? "" : baseCurrencyCode}
              onChangeText={(v) => setBaseCurrencyCode(v.toUpperCase())}
              autoCapitalize="characters"
              maxLength={3}
              style={styles.customCurrencyInput}
            />
          </View>
        </View>

        <Button label="Comenzar" onPress={handleSave} loading={isLoading} size="lg" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.canvas },
  container: { flexGrow: 1, paddingHorizontal: SPACING.xl, gap: SPACING.xxl },
  header: { alignItems: "center", gap: SPACING.sm },
  emoji: { fontSize: 56 },
  title: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxl, color: COLORS.ink, textAlign: "center" },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm, textAlign: "center", lineHeight: 22 },
  errorBanner: {
    backgroundColor: GLASS.dangerBg, borderRadius: RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: GLASS.dangerBorder,
  },
  errorBannerText: { fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.rosewood, fontSize: FONT_SIZE.sm },
  form: { gap: SPACING.xl },
  currencyLabel: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginBottom: SPACING.xs },
  currencyHint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, opacity: 0.6, marginBottom: SPACING.md },
  currencyGrid: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.md },
  currencyButton: { minWidth: 60 },
  customCurrencyInput: {},
});
