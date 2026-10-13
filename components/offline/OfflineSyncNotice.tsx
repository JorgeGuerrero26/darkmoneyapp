import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { useOfflineStatus } from "../../lib/offline/react";
import { describeOfflineNotice } from "../../lib/offline/status-copy";

/**
 * Aviso del estado de sincronización dentro de la lista de Movimientos. No aparece cuando todo
 * está al día (o con el modo sin conexión apagado): solo informa cuando hay algo que decir —
 * sin internet, cambios por enviar, o cambios que el servidor no aceptó.
 */
export function OfflineSyncNotice() {
  const router = useRouter();
  const status = useOfflineStatus();
  const notice = describeOfflineNotice(status);
  if (!notice) return null;

  return (
    <View style={styles.outer}>
      <Pressable
        style={[styles.container, notice.tone === "attention" && styles.attention]}
        onPress={() => router.push("/(app)/offline?from=movements" as never)}
        accessibilityRole="button"
        accessibilityLabel={`${notice.title}. ${notice.body}`}
      >
        {notice.busy ? <ActivityIndicator size="small" color={COLORS.storm} /> : null}
        <View style={styles.textWrap}>
          <Text style={styles.title} maxFontSizeMultiplier={1.3}>
            {notice.title}
          </Text>
          <Text style={styles.body} maxFontSizeMultiplier={1.3}>
            {notice.body}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { paddingHorizontal: SPACING.lg },
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: SURFACE.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  attention: { borderColor: COLORS.gold },
  textWrap: { flex: 1, gap: 2 },
  title: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm },
  body: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, lineHeight: 16 },
});
