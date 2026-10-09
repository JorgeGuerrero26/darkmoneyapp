import type { AccountSummary, CategorySummary } from "../../../types/domain";

export type ReceiptAccountHint = { kind: "account" | "card"; last4: string };
export type ReceiptAccountHints = { source?: ReceiptAccountHint; destination?: ReceiptAccountHint };
export type LearningMovement = {
  id: number; description: string; movement_type: string; status: string;
  source_account_id: number | null; destination_account_id: number | null;
  category_id: number | null; created_at: string; updated_at: string;
  metadata: unknown; client_dedupe_key?: string | null;
};
export type LearningReceipt = {
  movement_id: number | null; description: string; movement_type: string;
  financial_app_key: string; metadata: unknown; status: string;
};
export type PersonalProposal = {
  accountId: number | null; destinationAccountId: number | null; categoryId: number | null;
  accountEvidence: "receipt" | "history" | null;
  destinationEvidence: "receipt" | "history" | null;
};
export function learningObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function receiptAccountHints(value: unknown): ReceiptAccountHints {
  const hints = learningObject(value);
  const hint = (raw: unknown): ReceiptAccountHint | undefined => {
    const item = learningObject(raw);
    return (item.kind === "account" || item.kind === "card") && typeof item.last4 === "string" && /^\d{4}$/.test(item.last4)
      ? { kind: item.kind, last4: item.last4 } : undefined;
  };
  return { source: hint(hints.source), destination: hint(hints.destination) };
}
function bank(key: string) { return key.toLowerCase().replace(/_email$/, ""); }

/** Removes payment boilerplate, accents and changing terminal/order numbers, not merchant words. */
export function learningDescription(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(?:consumo|compra|pago|abono)\s+(?:con\s+)?(?:tarjeta\s+)?(?:de\s+debito\s+|de\s+credito\s+)?(?:bcp|bbva|interbank|scotiabank)?\s*(?:en\s+)?/g, " ")
    .replace(/\b(?:nro|numero|operacion|terminal|pedido)\s*\d+\b/g, " ")
    .replace(/\b\d+\b/g, " ").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}
function specific(description: string) {
  return description.length >= 3 && !/^(?:transferencia(?: entre mis cuentas| bcp| bbva| interbank)?|pago|compra|consumo|gasto|ingreso|abono|yape|plin|transferencia a terceros)$/.test(description);
}

/** Resolved receipts supply aliases/references only. Current live ledger values remain the truth. */
export function attachLearningReceipts(movements: LearningMovement[], receipts: LearningReceipt[]): LearningMovement[] {
  const byId = new Map<number, LearningReceipt[]>();
  for (const receipt of receipts) {
    if (!receipt.movement_id || !["registered", "duplicate"].includes(receipt.status)) continue;
    if (learningObject(learningObject(receipt.metadata).reconciliation).mode === "automatic") continue;
    byId.set(receipt.movement_id, [...(byId.get(receipt.movement_id) ?? []), receipt]);
  }
  return movements.map((movement) => ({ ...movement, metadata: { ...learningObject(movement.metadata), learningReceipts: byId.get(movement.id) ?? [] } }));
}

function samples(history: readonly LearningMovement[]) {
  const ids = new Set<number>(), dedupe = new Set<string>();
  return history.filter((m) => {
    const meta = learningObject(m.metadata);
    const key = m.client_dedupe_key;
    if (m.status !== "posted" || !["expense", "income", "transfer"].includes(m.movement_type) || ids.has(m.id) || (key && dedupe.has(key))) return false;
    if (meta.split_group || meta.isDuplicate || meta.duplicateOf || meta.balanceAdjustment || meta.source === "balance_adjustment" || /^(?:correcci[oó]n|correci[oó]n|ajuste)\b/i.test(m.description.trim())) return false;
    ids.add(m.id); if (key) dedupe.add(key);
    return true;
  }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
function references(m: LearningMovement): LearningReceipt[] {
  const meta = learningObject(m.metadata), saved = learningObject(meta.detectionLearning);
  const receipts = Array.isArray(meta.learningReceipts) ? meta.learningReceipts as LearningReceipt[] : [];
  return typeof saved.originalDescription === "string" ? [...receipts, {
    movement_id: m.id, description: saved.originalDescription,
    movement_type: String(saved.movementType ?? m.movement_type), financial_app_key: String(saved.financialAppKey ?? ""),
    metadata: { accountHints: saved.accountHints }, status: "registered",
  }] : receipts;
}
function corrected(m: LearningMovement, field: "account" | "destination" | "category") {
  const choices = learningObject(learningObject(learningObject(m.metadata).detectionLearning).manualChoices);
  const chosenField = m.movement_type === "income" && field === "destination" ? "account" : field;
  return choices[chosenField] === true || Date.parse(m.updated_at) > Date.parse(m.created_at) + 1000;
}
function choose(matches: LearningMovement[], getId: (m: LearningMovement) => number | null, field: "account" | "destination" | "category", minimum = 2): number | null {
  const valid = matches.filter((m) => getId(m) != null);
  if (valid.length < minimum) return null;
  const latest = valid[0];
  // A recent explicit correction supersedes an older habit, until a newer decision conflicts.
  if (corrected(latest, field)) return getId(latest);
  const counts = new Map<number, number>();
  for (const m of valid) { const id = getId(m)!; counts.set(id, (counts.get(id) ?? 0) + 1); }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  return ranked[0][1] >= minimum && ranked[0][1] / valid.length >= 0.8 ? ranked[0][0] : null;
}

/** Per-user history is supplied by the query. No global habits, amounts, FX or auto-save. */
export function proposeFromPersonalHistory(input: {
  history: readonly LearningMovement[]; description: string; movementType: "expense" | "income" | "transfer";
  currencyCode: string; financialAppKey: string; accountHints?: unknown; accountId?: number | null;
  accounts: readonly AccountSummary[]; categories: readonly CategorySummary[];
}): PersonalProposal {
  const result: PersonalProposal = { accountId: null, destinationAccountId: null, categoryId: null, accountEvidence: null, destinationEvidence: null };
  const history = samples(input.history), hints = receiptAccountHints(input.accountHints);
  const primaryId = (m: LearningMovement) => m.movement_type === "income" ? m.destination_account_id : m.source_account_id;
  const active = (id: number | null) => input.accounts.find((a) => a.id === id && !a.isArchived);
  const primaryEligible = (id: number | null) => active(id)?.currencyCode === input.currencyCode;
  const resolveHint = (hint: ReceiptAccountHint | undefined, side: "source" | "destination") => {
    if (!hint) return null;
    const matches = history.filter((m) => references(m).some((r) => {
      if (r.movement_type !== m.movement_type || bank(r.financial_app_key) !== bank(input.financialAppKey)) return false;
      const found = receiptAccountHints(learningObject(r.metadata).accountHints)[side];
      return found?.kind === hint.kind && found.last4 === hint.last4;
    }));
    const idFor = (m: LearningMovement) => side === "destination" ? m.destination_account_id : m.source_account_id;
    // A single confirmed link is enough for an explicit bank reference; conflicting links stay blank.
    const eligible = matches.filter((m) => active(idFor(m)));
    if (!eligible.length) return null;
    if (corrected(eligible[0], side === "source" ? "account" : "destination")) return idFor(eligible[0]);
    const ids = new Set(eligible.map(idFor));
    return ids.size === 1 ? idFor(eligible[0]) : null;
  };
  const primaryHint = input.movementType === "income" ? hints.destination : hints.source;
  const receiptPrimary = resolveHint(primaryHint, input.movementType === "income" ? "destination" : "source");
  if (receiptPrimary != null && primaryEligible(receiptPrimary)) {
    result.accountId = receiptPrimary; result.accountEvidence = "receipt";
  }
  const normalized = learningDescription(input.description);
  const matches = specific(normalized) ? history.filter((m) => m.movement_type === input.movementType &&
    [m.description, ...references(m).map((r) => r.description)].some((d) => learningDescription(d) === normalized)) : [];
  if (result.accountId == null && !primaryHint) {
    const knownBank = bank(input.financialAppKey);
    const bankMatches = (id: number | null) => {
      const institution = active(id)?.institutionCode;
      return !institution || !["bcp", "bbva", "interbank", "scotiabank"].includes(knownBank) || institution === knownBank;
    };
    const id = choose(matches.filter((m) => primaryEligible(primaryId(m)) && bankMatches(primaryId(m))), primaryId, "account");
    if (id != null) { result.accountId = id; result.accountEvidence = "history"; }
  }
  if (input.movementType !== "transfer") {
    result.categoryId = choose(matches, (m) => {
      const category = input.categories.find((c) => c.id === m.category_id && c.isActive && (c.kind === "both" || c.kind === input.movementType));
      return category?.id ?? null;
    }, "category");
  } else {
    const source = input.accountId ?? result.accountId;
    const receiptDestination = resolveHint(hints.destination, "destination");
    if (receiptDestination != null && receiptDestination !== source) {
      result.destinationAccountId = receiptDestination; result.destinationEvidence = "receipt";
    } else if (!hints.destination && source != null) {
      const pair = matches.filter((m) => m.source_account_id === source && active(m.destination_account_id) && m.destination_account_id !== source);
      const id = choose(pair, (m) => m.destination_account_id, "destination");
      if (id != null) { result.destinationAccountId = id; result.destinationEvidence = "history"; }
    }
  }
  return result;
}
