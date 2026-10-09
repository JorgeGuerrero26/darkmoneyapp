import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Archive } from "lucide-react-native";
import { ResourceSectionList } from "../../../components/ui/ResourceSectionList";
import { ResourceCard } from "../../../components/ui/ResourceCard";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import type { DetectionDraft } from "../lib/review-draft";
import type { DetectedMovementSuggestion } from "../../../services/queries/notification-detection";
import { detectionAmount, detectionContext, detectionTone } from "../lib/presentation";

export type DetectionListItem = { suggestion: DetectedMovementSuggestion; draft: DetectionDraft; warning: string | null };
type Props = { items: DetectionListItem[]; onSelect: (id: number) => void; onOmit: (id: number) => void; busy: boolean; omittingId: number | null; error: string | null };
export function DetectedMovementsList({ items, onSelect, onOmit, busy, omittingId, error }: Props) {
  // The list is inside a native Modal, which needs its own gesture root on Android.
  return <GestureHandlerRootView style={styles.root}><ResourceSectionList<DetectionListItem> sections={[{ key: "pending", label: "Por revisar", headerVariant: "hidden", data: items }]} keyExtractor={(item) => String(item.suggestion.id)} loading={{ isLoading: false }} empty={null}
    contentContainerStyle={styles.list}
    listHeaderComponent={<View><Text style={styles.meta}>{items.length} detecciones por revisar · los posibles duplicados pueden corresponder a movimientos ya registrados</Text>{error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}</View>}
    listFooterComponent={<Text style={styles.meta}>Toca uno para revisarlo o desliza hacia la izquierda para omitirlo.</Text>}
    renderItem={({ item }) => <SwipeActionRow revealWidth={80} borderRadius={0}
      rightAction={busy ? null : { label: "Omitir", icon: Archive, color: COLORS.fog, backgroundColor: SURFACE.cardActive, haptic: "light", onPress: () => onOmit(item.suggestion.id) }}>
      {({ close, isOpen }) => <ResourceCard variant="row" disabled={busy} title={item.draft.description || "Movimiento detectado"} subtitle={item.warning ?? detectionContext(item.suggestion, item.draft)} subtitleTone={item.warning ? "warning" : "muted"}
        trailing={<View style={styles.trailing}>{omittingId === item.suggestion.id ? <ActivityIndicator size="small" color={COLORS.storm} accessibilityLabel="Omitiendo detección" /> : null}<Text style={[styles.amount, { color: detectionTone(item.draft.movementType) }]}>{detectionAmount(item.draft.amount, item.suggestion.currencyCode, item.draft.movementType)}</Text></View>}
        onPress={() => { if (isOpen()) { close(); return; } if (!busy) onSelect(item.suggestion.id); }} />}
    </SwipeActionRow>}
  /></GestureHandlerRootView>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { paddingBottom: SPACING.xl },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20, color: COLORS.storm, paddingVertical: SPACING.md },
  amount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  trailing: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  error: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.danger, paddingBottom: SPACING.md },
});
