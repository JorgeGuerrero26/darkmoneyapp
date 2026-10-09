import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight, Check, Pencil } from "lucide-react-native";
import { ResourceCard } from "../../../components/ui/ResourceCard";
import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { DetailActionBar } from "../../../components/ui/DetailActionBar";
import { Button } from "../../../components/ui/Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";
import type { AccountSummary, CategorySummary, MovementRecord } from "../../../types/domain";
import type { DetectionDraft } from "../lib/review-draft";
import type { DetectedMovementSuggestion } from "../../../services/queries/notification-detection";
import { detectionAmount, detectionContext, detectionTone } from "../lib/presentation";

export type DuplicateDecisionProps = {
  candidate: MovementRecord; currency: string; busy: boolean; omitting?: boolean;
  onOpen: () => void; onSame: () => void; onSaveAnyway: () => void; onDiscard: () => void;
};
export function DuplicateDecision({ candidate, currency, busy, omitting = false, onOpen, onSame, onSaveAnyway, onDiscard }: DuplicateDecisionProps) {
  return <View style={styles.duplicate}>
    <Text style={styles.warning}>Posible duplicado</Text>
    <ResourceCard variant="row" title={candidate.description || "Movimiento parecido"}
      subtitle={new Date(candidate.occurredAt).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}
      trailing={<Text style={styles.value}>{formatCandidate(candidate, currency)}</Text>}
      onPress={onOpen} disabled={busy} />
    <View style={styles.decision}>
      <Button label="Es el mismo" variant="secondary" onPress={onSame} disabled={busy} />
      <Button label="Guardar igual" onPress={onSaveAnyway} loading={busy && !omitting} disabled={busy} />
    </View>
    <Button label="Omitir" accessibilityLabel="Omitir detección" variant="ghost" onPress={onDiscard} disabled={busy} loading={omitting} loadingLabel="Omitiendo…" />
  </View>;
}
function formatCandidate(candidate: MovementRecord, currency: string) {
  return detectionAmount(candidate.sourceAmount ?? candidate.destinationAmount ?? 0, currency, candidate.movementType);
}

type Props = {
  suggestion: DetectedMovementSuggestion; draft: DetectionDraft; count: number;
  accounts: readonly AccountSummary[]; categories: readonly CategorySummary[];
  readyToSave: boolean; missing: string[]; busy: boolean; omitting?: boolean; error: string | null;
  duplicate?: DuplicateDecisionProps | null; privacyMode?: boolean;
  onReview: () => void; onSave: () => void; onDiscard: () => void; onViewAll: () => void;
};
export function DetectedMovementCard({ suggestion, draft, count, accounts, categories, readyToSave, missing, busy, omitting = false, error, duplicate, privacyMode = false, onReview, onSave, onDiscard, onViewAll }: Props) {
  const source = accounts.find((a) => a.id === draft.accountId);
  const destination = accounts.find((a) => a.id === draft.destinationAccountId);
  const category = categories.find((c) => c.id === draft.categoryId);
  const warning = missing[0] ?? (suggestion.status === "needs_review" ? "Confirma los datos del comprobante" : suggestion.movementType === "unknown" ? "Confirma el tipo de movimiento" : null);
  const headerActions = <View style={styles.header}>
    {count > 1 ? <Pressable onPress={onViewAll} disabled={busy} accessibilityRole="button" style={styles.tap}><Text style={styles.link}>Ver los {count}</Text></Pressable> : null}
  </View>;
  return <ResourceCard variant="card" title={`POR REVISAR · ${count}`} titleStyle={styles.kicker} trailing={headerActions}
    footer={<View style={styles.body}>
      <View style={styles.headline}><Text style={styles.title}>{draft.description || "Movimiento detectado"}</Text><Text style={[styles.amount, { color: detectionTone(draft.movementType) }]}>{privacyMode ? "••••" : detectionAmount(draft.amount, source?.currencyCode ?? suggestion.currencyCode, draft.movementType)}</Text></View>
      <Text style={styles.meta}>{detectionContext(suggestion, draft)}</Text>
      {draft.movementType === "transfer" ? <Pressable style={styles.transfer} onPress={onReview} disabled={busy} accessibilityRole="button"><Text style={styles.value}>{source?.name ?? "Elige el origen"}</Text><ArrowRight size={16} color={COLORS.transfer} /><Text style={[styles.value, !destination && styles.warning]}>{destination?.name ?? "Elige el destino"}</Text></Pressable> : <View>
        <DetailFieldRow label="Cuenta" value={source?.name ?? "Elegir cuenta"} onPress={onReview} />
        <DetailFieldRow label="Categoría" value={category?.name ?? "Sin categoría"} onPress={onReview} last />
      </View>}
      {warning ? <Pressable onPress={onReview} disabled={busy} accessibilityRole="button"><Text style={styles.warning}>{warning}</Text></Pressable> : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      {duplicate ? <DuplicateDecision {...duplicate} /> : <DetailActionBar horizontalInset={0} primarySide="right"
        secondary={readyToSave || error ? { label: "Revisar", accessibilityLabel: "Revisar detección", icon: Pencil, disabled: busy, onPress: onReview } : undefined}
        primary={{ label: busy && !omitting ? "Guardando…" : error ? "Reintentar" : readyToSave ? "Guardar" : "Revisar y guardar", accessibilityLabel: readyToSave ? "Guardar movimiento detectado" : "Revisar y guardar movimiento detectado", icon: Check, loading: busy && !omitting, disabled: busy, onPress: readyToSave || error ? onSave : onReview }}
      />}
      {!duplicate ? <Button label="Omitir" accessibilityLabel="Omitir detección" variant="ghost" disabled={busy} loading={omitting} loadingLabel="Omitiendo…" onPress={onDiscard} /> : null}
    </View>} />;
}
const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  tap: { minHeight: 44, justifyContent: "center" },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.storm, letterSpacing: 1 },
  body: { gap: SPACING.sm },
  headline: { flexDirection: "row", alignItems: "baseline", gap: SPACING.md, flexWrap: "wrap" },
  title: { flex: 1, minWidth: 140, fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl },
  value: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink, flexShrink: 1 },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 20 },
  link: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  transfer: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, minHeight: 54 },
  warning: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.warning, lineHeight: 20 },
  error: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.danger, lineHeight: 20 },
  duplicate: { gap: SPACING.sm },
  decision: { flexDirection: "row", gap: SPACING.sm },
});
