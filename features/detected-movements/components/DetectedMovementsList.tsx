import { StyleSheet, Text } from "react-native";
import { ResourceSectionList } from "../../../components/ui/ResourceSectionList";
import { ResourceCard } from "../../../components/ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";
import type { DetectionDraft } from "../lib/review-draft";
import type { DetectedMovementSuggestion } from "../../../services/queries/notification-detection";
import { detectionAmount, detectionContext, detectionTone } from "../lib/presentation";

export type DetectionListItem = { suggestion: DetectedMovementSuggestion; draft: DetectionDraft; warning: string | null };
export function DetectedMovementsList({ items, onSelect }: { items: DetectionListItem[]; onSelect: (id: number) => void }) {
  return <ResourceSectionList<DetectionListItem> sections={[{ key: "pending", label: "Por revisar", headerVariant: "hidden", data: items }]} keyExtractor={(item) => String(item.suggestion.id)} loading={{ isLoading: false }} empty={null}
    contentContainerStyle={styles.list}
    listHeaderComponent={<Text style={styles.meta}>{items.length} detecciones por revisar · los posibles duplicados pueden corresponder a movimientos ya registrados</Text>}
    listFooterComponent={<Text style={styles.meta}>Toca uno para revisarlo. Al guardar o descartar, pasas al siguiente.</Text>}
    renderItem={({ item }) => <ResourceCard variant="row" title={item.draft.description || "Movimiento detectado"} subtitle={item.warning ?? detectionContext(item.suggestion, item.draft)} subtitleTone={item.warning ? "warning" : "muted"}
      trailing={<Text style={[styles.amount, { color: detectionTone(item.draft.movementType) }]}>{detectionAmount(item.draft.amount, item.suggestion.currencyCode, item.draft.movementType)}</Text>}
      onPress={() => onSelect(item.suggestion.id)} />}
  />;
}
const styles = StyleSheet.create({
  list: { paddingBottom: SPACING.xl },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20, color: COLORS.storm, paddingVertical: SPACING.md },
  amount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  warning: { color: COLORS.warning },
});
