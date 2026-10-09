import { ActivityIndicator, Text, View, StyleSheet } from "react-native";
import { useRef } from "react";
import { Button } from "../../../components/ui/Button";
import { QuickDetectedMovementEntry } from "../../../components/domain/QuickDetectedMovementEntry";
import { useDetectedMovementInbox } from "../hooks/useDetectedMovementInbox";
import { DetectedMovementCard } from "./DetectedMovementCard";
import { DetectedMovementsList } from "./DetectedMovementsList";
import { buildDetectionDraft, detectionMissingFields } from "../lib/review-draft";
import { useNotificationDetectionSettingsQuery } from "../../../services/queries/notification-detection";
import type { AccountSummary, CategorySummary } from "../../../types/domain";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../constants/theme";

type Props = { userId: string | null; workspaceId: number | null; accounts: AccountSummary[]; categories: CategorySummary[]; privacyMode: boolean };
export function DetectedMovementInbox({ userId, workspaceId, accounts, categories, privacyMode }: Props) {
  const inbox = useDetectedMovementInbox(userId, workspaceId);
  const settings = useNotificationDetectionSettingsQuery(userId, workspaceId).data ?? [];
  const lastSelection = useRef<{ id: number; userId: string; workspaceId: number } | null>(null);
  if (inbox.selected) lastSelection.current = { id: inbox.selected.id, userId: inbox.selected.userId, workspaceId: inbox.selected.workspaceId };
  const retainedId = lastSelection.current?.userId === userId && lastSelection.current.workspaceId === workspaceId ? lastSelection.current.id : null;
  if (privacyMode || !userId || !workspaceId) return null;
  // El controlador y su Modal permanecen montados al resolver el último pendiente.
  // visible=false deja cerrar la ventana nativa; quitarla inmediatamente puede bloquear iOS.
  const feedback = !inbox.selected ? inbox.error ? <View style={styles.spacing}>
      <Text style={styles.status} accessibilityRole="alert">{inbox.error}</Text>
      <Button label="Reintentar" variant="ghost" onPress={inbox.retry} />
    </View> : inbox.loading ? <View style={styles.loading}>
      <ActivityIndicator color={COLORS.storm} />
      <Text style={styles.status}>Buscando movimientos por revisar…</Text>
    </View> : null : null;
  const items = inbox.pending.map((suggestion) => {
    const draft = inbox.drafts.get(suggestion.id) ?? buildDetectionDraft(suggestion, accounts, categories, settings);
    return { suggestion, draft, warning: suggestion.duplicateCandidate ? "Posible duplicado · revisa el movimiento existente" : detectionMissingFields(draft, accounts)[0] ?? null };
  });
  return <View style={inbox.selected ? styles.spacing : undefined}>
    {feedback}
    <QuickDetectedMovementEntry suggestionId={inbox.selected?.id ?? retainedId} visible={Boolean(inbox.selected) && inbox.mode !== "closed"} previewEnabled={Boolean(inbox.selected)} origin="dashboard" onClose={inbox.close} onResolved={inbox.resolve}
      initialDraft={inbox.selected ? inbox.drafts.get(inbox.selected.id) : undefined} onDraftChange={inbox.rememberDraft}
      position={inbox.selected ? `${Math.max(1, inbox.pending.findIndex((item) => item.id === inbox.selected!.id) + 1)} de ${Math.max(1, inbox.pending.length)}` : undefined}
      list={inbox.mode === "list" ? <DetectedMovementsList items={items} onSelect={inbox.select} /> : undefined}
      renderPreview={inbox.selected ? (r) => r.suggestion ? <DetectedMovementCard suggestion={r.suggestion} draft={r.draft} count={inbox.pending.length} accounts={r.activeAccounts} categories={r.categories} readyToSave={r.readyToSave} missing={r.cardMissing} busy={r.busy} omitting={r.isDiscarding} error={r.saveError} learningHint={r.learningHint}
        onReview={inbox.openReview} onViewAll={inbox.openList} onSave={() => { if (r.saveError) void r.retry(); else void r.submit(false); }} onDiscard={() => { void r.discard(); }}
        duplicate={r.duplicateCandidate ? { candidate: r.duplicateCandidate, currency: r.selectedBudgetAccount?.currencyCode ?? r.suggestion.currencyCode, busy: r.busy, omitting: r.isDiscarding, onOpen: r.openDuplicate, onSame: () => { void r.useExistingDuplicate(); }, onSaveAnyway: () => { void r.submit(true); }, onDiscard: () => { void r.discard(); } } : undefined} /> : null : undefined}
    />
  </View>;
}
const styles = StyleSheet.create({
  spacing: { marginTop: SPACING.lg, marginBottom: SPACING.md },
  loading: { marginVertical: SPACING.md, flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  status: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
});
