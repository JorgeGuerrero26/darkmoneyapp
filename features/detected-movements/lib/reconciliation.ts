import type { AccountSummary, MovementRecord } from "../../../types/domain";
import type { DetectedMovementSuggestion } from "../../../services/queries/notification-detection";
import { buildDetectionDraft, type DetectionDraft } from "./review-draft";
import { parsePositiveAmountInput } from "../../../lib/amount-parsing";

/** Un candidato de la detección original no se impone sobre datos ya editados. */
export function reconciliationCandidateForDraft(suggestion: DetectedMovementSuggestion, draft: DetectionDraft, accounts: readonly AccountSummary[]): MovementRecord | null {
  const candidate = suggestion.duplicateCandidate;
  if (!candidate || candidate.workspaceId !== suggestion.workspaceId || candidate.status !== "posted") return null;
  const original = buildDetectionDraft(suggestion, [], [], []);
  if (draft.movementType !== original.movementType || draft.description !== original.description ||
      draft.date !== original.date || draft.time !== original.time ||
      parsePositiveAmountInput(draft.amount) !== suggestion.amount) return null;
  const primaryId = candidate.movementType === "income" ? candidate.destinationAccountId : candidate.sourceAccountId;
  if (draft.accountId != null && draft.accountId !== primaryId) return null;
  const account = accounts.find((item) => item.id === primaryId);
  if (account && account.currencyCode !== suggestion.currencyCode) return null;
  if (draft.movementType === "transfer" && draft.destinationAccountId != null && draft.destinationAccountId !== candidate.destinationAccountId) return null;
  return candidate;
}
