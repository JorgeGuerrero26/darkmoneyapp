import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { AlertCircle, ChevronRight, CloudOff } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import { setPendingSheetOpen } from "../../lib/offline/pending-sheet";
import type { SyncLine } from "../../lib/offline/status-copy";

type Tone = { color: string; background: string; borderColor: string };

const TONES: Record<SyncLine["kind"], Tone> = {
  offline: { color: COLORS.gold, background: COLORS.gold + "1F", borderColor: COLORS.gold + "40" },
  pending: { color: COLORS.gold, background: COLORS.gold + "1F", borderColor: COLORS.gold + "40" },
  review: { color: COLORS.danger, background: COLORS.danger + "1F", borderColor: COLORS.danger + "40" },
  sending: { color: COLORS.storm, background: "transparent", borderColor: "transparent" },
};

/**
 * Estado global de sincronización, en el hueco de "Actualizado hace…" del encabezado (Revisión 54).
 * Se puede tocar (salvo mientras envía) y abre la hoja con todo lo pendiente de todos los módulos.
 */
export function SyncStatusLine({ line }: { line: SyncLine }) {
  const tone = TONES[line.kind];
  const content = (
    <>
      {line.kind === "sending" ? <ActivityIndicator size="small" color={tone.color} /> : null}
      {line.kind === "offline" || line.kind === "pending" ? <CloudOff size={13} color={tone.color} /> : null}
      {line.kind === "review" ? <AlertCircle size={13} color={tone.color} /> : null}
      <Text style={[styles.text, { color: tone.color }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {line.text}
      </Text>
      {line.tappable ? <ChevronRight size={13} color={tone.color} /> : null}
    </>
  );
  if (!line.tappable) return <Pressable disabled style={[styles.base, styles.plain]}>{content}</Pressable>;
  return (
    <Pressable
      onPress={() => setPendingSheetOpen(true)}
      accessibilityRole="button"
      accessibilityLabel={line.text}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[styles.base, { backgroundColor: tone.background, borderColor: tone.borderColor, borderWidth: 1 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: SPACING.xs,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    maxWidth: "100%",
  },
  plain: { paddingHorizontal: 0 },
  text: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, flexShrink: 1 },
});
