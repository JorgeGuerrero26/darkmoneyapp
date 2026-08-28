import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Pencil } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Button } from "../../components/ui/Button";
import { CurrencySelector } from "../../components/ui/CurrencySelector";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { Input } from "../../components/ui/Input";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useToast } from "../../hooks/useToast";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useSyncExchangeRatePairMutation } from "../../services/queries/exchange-rates";
import { DEFAULT_EXCHANGE_CURRENCY, normalizeSupportedCurrencyCode } from "../../constants/currencies";
import { COLORS, EXTENDED_PALETTE, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";

/**
 * Los datos de la cuenta, fuera de Configuración.
 *
 * Antes eran 620 px de formulario —foto, nombre, correo, moneda base y "Guardar perfil"— delante
 * de la primera preferencia, para algo que se toca una vez al año. Aquí tienen su propia pantalla
 * y en Configuración queda una fila.
 */
function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({ originRoutes: { settings: "/(app)/settings" } });
  const { profile, saveProfile, saveAvatar, removeAvatar } = useAuth();
  const { showToast } = useToast();
  const syncExchangeRatePair = useSyncExchangeRatePairMutation();

  const [fullName, setFullName] = useState(profile?.fullName ?? "");
  const [baseCurrencyCode, setBaseCurrencyCode] = useState(
    normalizeSupportedCurrencyCode(profile?.baseCurrencyCode),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  async function syncDefaultExchangeCurrency(currencyCode: string) {
    const normalized = normalizeSupportedCurrencyCode(currencyCode);
    if (normalized === DEFAULT_EXCHANGE_CURRENCY) return;
    try {
      await syncExchangeRatePair.mutateAsync({
        fromCurrencyCode: normalized,
        toCurrencyCode: DEFAULT_EXCHANGE_CURRENCY,
      });
    } catch (err: unknown) {
      showToast(
        `No se pudo sincronizar ${normalized}/${DEFAULT_EXCHANGE_CURRENCY}: ${humanizeError(err)}`,
        "warning",
      );
    }
  }

  async function handleSave() {
    if (!fullName.trim()) return;
    setIsSaving(true);
    try {
      await saveProfile({
        fullName: fullName.trim(),
        baseCurrencyCode,
        timezone: profile?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      await syncDefaultExchangeCurrency(baseCurrencyCode);
      showToast("Perfil guardado", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAvatarPress() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      showToast("Se necesita permiso para acceder a la galería", "error");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setIsUploadingAvatar(true);
    try {
      await saveAvatar(result.assets[0].uri);
      showToast("Foto de perfil actualizada", "success");
    } catch (err: unknown) {
      showToast(humanizeError(err), "error");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function handleAvatarRemove() {
    setIsUploadingAvatar(true);
    try {
      await removeAvatar();
      showToast("Foto de perfil eliminada", "success");
    } catch {
      showToast("No se pudo eliminar la foto", "error");
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Perfil" onBack={handleBack} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xxxl }]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.avatarWrap}
            onPress={handleAvatarPress}
            activeOpacity={0.8}
            disabled={isUploadingAvatar}
          >
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarText}>{profile?.initials ?? "DM"}</Text>
              </View>
            )}
            <View style={styles.avatarOverlay}>
              {isUploadingAvatar ? (
                <ActivityIndicator size="small" color={EXTENDED_PALETTE.white} />
              ) : (
                <Pencil size={20} color={EXTENDED_PALETTE.white} strokeWidth={2} />
              )}
            </View>
          </TouchableOpacity>
          {profile?.avatarUrl ? (
            <TouchableOpacity onPress={handleAvatarRemove} disabled={isUploadingAvatar}>
              <Text style={styles.avatarRemoveText}>Eliminar foto</Text>
            </TouchableOpacity>
          ) : null}

          <Input label="Nombre completo" value={fullName} onChangeText={setFullName} autoCapitalize="words" />

          {/* El correo no se edita: como campo deshabilitado se leía en gris de placeholder y no
              se distinguía de uno vacío. Como texto se ve que está puesto. */}
          <View style={styles.readonlyField}>
            <Text style={styles.readonlyLabel}>Correo electrónico</Text>
            <Text style={styles.readonlyValue}>{profile?.email ?? "—"}</Text>
          </View>

          <CurrencySelector
            label="Moneda base"
            value={baseCurrencyCode}
            onChange={setBaseCurrencyCode}
            variant="row"
            hint={`Se sincronizará automáticamente contra ${DEFAULT_EXCHANGE_CURRENCY}.`}
          />

          <Button label="Guardar perfil" onPress={handleSave} loading={isSaving} style={styles.saveButton} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function ProfileScreenRoot() {
  return (
    <ErrorBoundary>
      <ProfileScreen />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  flex: { flex: 1 },
  content: { padding: SPACING.xl, gap: SPACING.md },
  avatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignSelf: "center",
    marginBottom: SPACING.sm,
    overflow: "hidden",
  },
  avatarImage: { width: 80, height: 80, borderRadius: 40 },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SURFACE.imageScrim,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRemoveText: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    textAlign: "center",
  },
  avatarText: { fontSize: FONT_SIZE.xxl, fontFamily: FONT_FAMILY.heading, color: EXTENDED_PALETTE.white },
  readonlyField: { gap: SPACING.xs },
  readonlyLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  readonlyValue: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.fog,
  },
  saveButton: { marginTop: SPACING.lg },
});
