import { Stack } from "expo-router";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { useUiStore } from "../../store/ui-store";

/**
 * Aviso tras una salida que la persona no eligió en esta pantalla (p. ej. "Eliminamos tu cuenta y tus datos").
 * Se queda hasta que lo cierra: un aviso que desaparece solo se pierde justo cuando cambia la pantalla.
 */
function AuthNotice() {
  const notice = useUiStore((state) => state.authNotice);
  const setAuthNotice = useUiStore((state) => state.setAuthNotice);
  const insets = useSafeAreaInsets();
  if (!notice) return null;
  return (
    <View style={[styles.notice, { top: insets.top + SPACING.sm }]} accessibilityRole="alert">
      <Text style={styles.noticeText}>{notice}</Text>
      <TouchableOpacity onPress={() => setAuthNotice(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.noticeAction}>Entendido</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AuthLayout() {
  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
          animation: "fade",
        }}
      />
      <AuthNotice />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  notice: {
    position: "absolute",
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  noticeText: { flex: 1, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  noticeAction: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.primary },
});
