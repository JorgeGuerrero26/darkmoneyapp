export type SubscriptionReceiptMovement = {
  id: number; workspaceId: number; subscriptionId?: number | null; status: string; movementType: string;
  occurredAt: string; sourceAccountId: number | null; destinationAccountId: number | null;
  sourceAmount: number | null; destinationAmount: number | null; createdByUserId?: string | null;
  sourceAmountInBaseCurrency?: number | null; destinationAmountInBaseCurrency?: number | null;
  metadata?: unknown; description?: string;
};
export type SubscriptionReceiptIssue = { group: string; subscriptionIds: number[]; reason: string };
export type SubscriptionPaymentReceipt<T extends SubscriptionReceiptMovement> =
  Omit<T, "sourceAmountInBaseCurrency" | "destinationAmountInBaseCurrency"> & {
    sourceAmountInBaseCurrency?: number | null; destinationAmountInBaseCurrency?: number | null; receiptPartIds: number[];
  };
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function identity(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value !== 0;
}
function integer(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (!/^[1-9][0-9]{0,2}$/.test(String(value))) return null;
  const n = Number(value);
  return n <= 100 ? n : null;
}
function cents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 ||
      !/^[0-9]+(\.[0-9]{1,2})?$/.test(String(value))) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) ? result : null;
}
function instant(value: string): string {
  const fraction = /\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] ?? "";
  return `${Date.parse(value)}:${fraction.padEnd(6,"0").slice(3)}`;
}

/**
 * Read-only payment projection. Never use these virtual totals to save movements
 * or compute ledger/account balances. Input MUST include every part, including
 * unlinked/voided parts, not just rows filtered by subscription_id or status.
 */
export function buildSubscriptionPaymentReceipts<T extends SubscriptionReceiptMovement>(
  movements: readonly T[], workspaceId: number,
  convertReceipt?: (head: T, total: number) => number | null,
): { payments: Array<SubscriptionPaymentReceipt<T>>; issues: SubscriptionReceiptIssue[] } {
  const payments: Array<SubscriptionPaymentReceipt<T>> = [], issues: SubscriptionReceiptIssue[] = [];
  const groups = new Map<string, T[]>();
  const scope = movements.filter(row => row.workspaceId === workspaceId);
  const unique = new Set(scope.map(row => row.id));
  if (unique.size !== scope.length) return { payments: [], issues: [{
    group: "", subscriptionIds: [...new Set(scope.map(row=>row.subscriptionId).filter(identity))],
    reason: "El historial contiene filas repetidas. Actualiza antes de usar sus totales.",
  }] };
  for (const row of scope) {
    const meta = object(row.metadata), group = meta.split_group;
    if (typeof group === "string" && group.trim()) {
      const items = groups.get(group) ?? []; items.push(row); groups.set(group, items);
    } else if (row.status === "posted" && identity(row.subscriptionId)) {
      if ("split_group" in meta || "split_index" in meta || "split_total" in meta || !identity(row.id) ||
          (cents(row.sourceAmount) === null && cents(row.destinationAmount) === null)) {
        issues.push({ group: "", subscriptionIds: [row.subscriptionId], reason: "El pago contiene un importe o una división inválida." });
      } else payments.push({ ...row, receiptPartIds: [row.id] });
    }
  }
  for (const [group, items] of groups) {
    const subscriptionIds = [...new Set(items.map(row => row.subscriptionId).filter(identity))];
    if (!subscriptionIds.length || items.every(row => row.status !== "posted")) continue;
    const heads = items.filter(row => integer(object(row.metadata).split_index) === 1);
    const head = heads.length === 1 ? heads[0] : null;
    const n = integer(object(head?.metadata).split_total);
    const index = new Set<number>();
    let sum = 0;
    let valid = head !== null && n !== null && n >= 2 && items.length === n &&
      identity(head.subscriptionId) && subscriptionIds.length === 1 && identity(head.id) &&
      identity(head.sourceAccountId) && head.destinationAccountId === null && head.destinationAmount === null &&
      ["expense", "subscription_payment"].includes(head.movementType) &&
      typeof head.createdByUserId === "string" && Boolean(head.createdByUserId) &&
      Number.isFinite(Date.parse(head.occurredAt));
    for (const row of items) {
      const meta = object(row.metadata), i = integer(meta.split_index), amount = cents(row.sourceAmount);
      if (!head || i === null || n === null || i > n || index.has(i) || integer(meta.split_total) !== n ||
          !identity(row.id) || row.status !== "posted" || row.movementType !== head.movementType ||
          row.createdByUserId !== head.createdByUserId || row.sourceAccountId !== head.sourceAccountId ||
          row.destinationAccountId !== null || row.destinationAmount !== null ||
          instant(row.occurredAt) !== instant(head.occurredAt) || amount === null ||
          (row.subscriptionId != null && row.subscriptionId !== head.subscriptionId)) valid = false;
      if (i !== null) index.add(i);
      if (amount !== null) sum += amount;
    }
    if (!valid || !head || !Number.isSafeInteger(sum) || sum <= 0) {
      issues.push({ group, subscriptionIds, reason: "División incompleta o incompatible; su total no está confirmado." });
      continue;
    }
    const receiptPartIds = [...items]
      .sort((a, b) => integer(object(a.metadata).split_index)! - integer(object(b.metadata).split_index)!)
      .map(row => row.id);
    const description = head.description?.endsWith(` (1/${n})`) ? head.description.slice(0, -(` (1/${n})`.length)) : head.description;
    // Convert the receipt once. Summing converted parts changes cent rounding
    // (e.g. 0.01 + 1.49 at 3.83). Without a current currency context, retain null.
    const converted = convertReceipt?.(head,sum / 100) ?? null;
    payments.push({ ...head, description, sourceAmount: sum / 100, destinationAmount: null,
      sourceAmountInBaseCurrency: converted != null && Number.isFinite(converted) && converted > 0 ? converted : null,
      destinationAmountInBaseCurrency: null, receiptPartIds });
  }
  payments.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || b.id - a.id);
  return { payments, issues };
}
