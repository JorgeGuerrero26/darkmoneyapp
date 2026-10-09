import { StyleSheet, Text, View } from "react-native";
import { Button } from "../../../components/ui/Button";
import { ResourceSectionList } from "../../../components/ui/ResourceSectionList";
import { ResourceCard } from "../../../components/ui/ResourceCard";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";
import type { DetectionDraft } from "../lib/review-draft";
import type { DetectedMovementSuggestion } from "../../../services/queries/notification-detection";
import { detectionAmount, detectionContext, detectionTone } from "../lib/presentation";

export type DetectionListItem = { suggestion: DetectedMovementSuggestion; draft: DetectionDraft; warning: string | null };
type Props = { items: DetectionListItem[]; onSelect: (id: number) => void; onOmit: (id: number) => void; busy: boolean; omittingId: number | null; error: string | null };
export function DetectedMovementsList({ items, onSelect, onOmit, busy, omittingId, error }: Props) {
  return <ResourceSectionList<DetectionListItem> sections={[{ key: "pending", label: "Por revisar", headerVariant: "hidden", data: items }]} keyExtractor={(item) => String(item.suggestion.id)} loading={{ isLoading: false }} empty={null}
    contentContainerStyle={styles.list}
    listHeaderComponent={<View><Text style={styles.meta}>{items.length} detecciones por revisar · los posibles duplicados pueden corresponder a movimientos ya registrados</Text>{error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}</View>}
    listFooterComponent={<Text style={styles.meta}>Toca uno para revisarlo o elige Omitir si no quieres registrarlo.</Text>}
    renderItem={({ item }) => <ResourceCard variant="row" disabled={busy} title={item.draft.description || "Movimiento detectado"} subtitle={item.warning ?? detectionContext(item.suggestion, item.draft)} subtitleTone={item.warning ? "warning" : "muted"}
      trailing={<View style={styles.trailing}><Text style={[styles.amount, { color: detectionTone(item.draft.movementType) }]}>{detectionAmount(item.draft.amount, item.suggestion.currencyCode, item.draft.movementType)}</Text><Button label="Omitir" accessibilityLabel={`Omitir ${item.draft.description || "detección"}`} variant="ghost" size="sm" disabled={busy} loading={omittingId === item.suggestion.id} loadingLabel="Omitiendo…" onPress={(event) => { event.stopPropagation(); onOmit(item.suggestion.id); }} /></View>}
      onPress={() => onSelect(item.suggestion.id)} />}
  />;
}
const styles = StyleSheet.create({
  list: { paddingBottom: SPACING.xl },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20, color: COLORS.storm, paddingVertical: SPACING.md },
  amount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  trailing: { alignItems: "flex-end" },
  error: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.danger, paddingBottom: SPACING.md },
});
