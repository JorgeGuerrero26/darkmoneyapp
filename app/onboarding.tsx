import { FormFeedbackProvider, FormScrollView, FormSubmitBar } from "../components/ui/FormFeedback";
import { requiredField } from "../lib/form-field-rules";
import { authFormError } from "../lib/form-errors";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../lib/auth-context";
import { Input } from "../components/ui/Input";
import { CurrencySelector } from "../components/ui/CurrencySelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../constants/theme";
import { DEFAULT_EXCHANGE_CURRENCY, normalizeSupportedCurrencyCode } from "../constants/currencies";

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile, saveProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [baseCurrencyCode, setBaseCurrencyCode] = useState(normalizeSupportedCurrencyCode(profile?.baseCurrencyCode));
  const [isLoading, setIsLoading] = useState(false);

  async function handleSave() {
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
      throw authFormError(err);
    } finally {
      setIsLoading(false);
    }
  }

  const validationFields = { fullName: requiredField(fullName, "Escribe tu nombre") };

  return (
    <FormFeedbackProvider onSubmit={handleSave} busy={isLoading} fields={validationFields}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <FormScrollView
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


        <View style={styles.form}>
          <Input fieldId="fullName"
            label="Tu nombre"
            placeholder="Nombre completo"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          <CurrencySelector
            label="Moneda base"
            value={baseCurrencyCode}
            onChange={setBaseCurrencyCode}
            hint={`Todos los totales se mostraran en esta moneda y se compararan contra ${DEFAULT_EXCHANGE_CURRENCY}.`}
          />
        </View>

        <FormSubmitBar label="Comenzar" onSubmit={handleSave} loading={isLoading} />
      </FormScrollView>
    </KeyboardAvoidingView>
    </FormFeedbackProvider>
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
    backgroundColor: SURFACE.dangerBg, borderRadius: RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: SURFACE.dangerBorder,
  },
  errorBannerText: { fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.rosewood, fontSize: FONT_SIZE.sm },
  form: { gap: SPACING.xl },
});
