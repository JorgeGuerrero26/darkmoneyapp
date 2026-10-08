import { View, StyleSheet } from "react-native";
import { QuickDetectedMovementEntry } from "../../../components/domain/QuickDetectedMovementEntry";
import { useDetectedMovementInbox } from "../hooks/useDetectedMovementInbox";
import { DetectedMovementCard } from "./DetectedMovementCard";
import { DetectedMovementsList } from "./DetectedMovementsList";
import { buildDetectionDraft, detectionMissingFields } from "../lib/review-draft";
import { useNotificationDetectionSettingsQuery } from "../../../services/queries/notification-detection";
import type { AccountSummary, CategorySummary } from "../../../types/domain";
import { SPACING } from "../../../constants/theme";

type Props = { userId: string | null; workspaceId: number | null; accounts: AccountSummary[]; categories: CategorySummary[]; privacyMode: boolean };
export function DetectedMovementInbox({ userId, workspaceId, accounts, categories, privacyMode }: Props) {
  const inbox = useDetectedMovementInbox(userId, workspaceId);
  const settings = useNotificationDetectionSettingsQuery(userId, workspaceId).data ?? [];
  if (!inbox.selected || privacyMode) return null;
  const items = inbox.pending.map((suggestion) => {
    const draft = inbox.drafts.get(suggestion.id) ?? buildDetectionDraft(suggestion, accounts, categories, settings);
    return { suggestion, draft, warning: detectionMissingFields(draft, accounts)[0] ?? null };
  });
  return <View style={styles.spacing}>
    <QuickDetectedMovementEntry suggestionId={inbox.selected.id} visible={inbox.mode !== "closed"} previewEnabled origin="dashboard" onClose={inbox.close} onResolved={inbox.resolve}
      initialDraft={inbox.drafts.get(inbox.selected.id)} onDraftChange={inbox.rememberDraft}
      position={`${inbox.pending.findIndex((item) => item.id === inbox.selected!.id) + 1} de ${inbox.pending.length}`}
      list={inbox.mode === "list" ? <DetectedMovementsList items={items} onSelect={inbox.select} /> : undefined}
      renderPreview={(r) => r.suggestion ? <DetectedMovementCard suggestion={r.suggestion} draft={r.draft} count={inbox.pending.length} accounts={r.activeAccounts} categories={r.categories} readyToSave={r.readyToSave} missing={r.cardMissing} busy={r.busy} error={r.saveError}
        onReview={inbox.openReview} onViewAll={inbox.openList} onSave={() => { if (r.saveError) void r.retry(); else void r.submit(false); }} onDiscard={() => { void r.discard(); }}
        duplicate={r.duplicateCandidate ? { candidate: r.duplicateCandidate, currency: r.selectedBudgetAccount?.currencyCode ?? r.suggestion.currencyCode, busy: r.busy, onOpen: r.openDuplicate, onSame: () => { void r.useExistingDuplicate(); }, onSaveAnyway: () => { void r.submit(true); } } : undefined} /> : null}
    />
  </View>;
}
const styles = StyleSheet.create({ spacing: { marginTop: SPACING.lg, marginBottom: SPACING.md } });
