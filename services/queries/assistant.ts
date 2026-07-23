import { invokeEdgeFunction } from "./workspace-data";

/**
 * Cliente del asistente IA de consulta (edge function assistant-chat).
 * Spec: docs/superpowers/specs/2026-07-19-assistant-chat-consulta-design.md
 * La conversación es efímera: la pantalla guarda el historial en memoria y lo
 * manda como contexto; aquí no hay persistencia ni React Query.
 */

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AssistantEvidence = {
  label: string;
  movementIds: number[];
};

export type AssistantDraft = {
  operation: "expense" | "income" | "transfer" | "pay_subscription" | "pay_debt";
  amount: number;
  currency: string;
  accountName: string | null;
  destinationAccountName: string | null;
  categoryName: string | null;
  counterpartyName: string | null;
  subscriptionId: number | null;
  subscriptionName: string | null;
  obligationId: number | null;
  obligationCounterparty: string | null;
  occurredAt: string | null;
  description: string | null;
  missing: string[];
};

export type BudgetDraft = {
  name: string;
  limitAmount: number;
  currency: string;
  categoryName: string | null;
  periodStart: string;
  periodEnd: string;
  alertPercent: number;
};

export type ObligationDraft = {
  direction: "receivable" | "payable";
  title: string;
  counterpartyName: string | null;
  principalAmount: number;
  currency: string;
  startDate: string;
  dueDate: string | null;
  description: string | null;
};

export type RecurringDraft = {
  kind: "subscription" | "recurring_income";
  name: string;
  amount: number;
  currency: string;
  frequency: "weekly" | "monthly" | "yearly";
  dayOfMonth: number | null;
  nextDate: string;
  categoryName: string | null;
  accountName: string | null;
  description: string | null;
};

export type AssistantReply = {
  reply: string;
  evidence: AssistantEvidence[];
  draft: AssistantDraft | null;
  budgetDraft: BudgetDraft | null;
  obligationDraft: ObligationDraft | null;
  recurringDraft: RecurringDraft | null;
  remainingToday: number | null;
};

function parseDraft(raw: unknown): AssistantDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const ops = ["expense", "income", "transfer", "pay_subscription", "pay_debt"];
  const amount = Number(d.amount);
  if (typeof d.operation !== "string" || !ops.includes(d.operation) || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return {
    operation: d.operation as AssistantDraft["operation"],
    amount,
    currency: str(d.currency) ?? "PEN",
    accountName: str(d.accountName),
    destinationAccountName: str(d.destinationAccountName),
    categoryName: str(d.categoryName),
    counterpartyName: str(d.counterpartyName),
    subscriptionId: num(d.subscriptionId),
    subscriptionName: str(d.subscriptionName),
    obligationId: num(d.obligationId),
    obligationCounterparty: str(d.obligationCounterparty),
    occurredAt: str(d.occurredAt),
    description: str(d.description),
    missing: Array.isArray(d.missing) ? d.missing.filter((m): m is string => typeof m === "string") : [],
  };
}

function parseBudgetDraft(raw: unknown): BudgetDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const limitAmount = Number(d.limitAmount);
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!Number.isFinite(limitAmount) || limitAmount <= 0) return null;
  if (typeof d.periodStart !== "string" || !DATE_RE.test(d.periodStart)) return null;
  if (typeof d.periodEnd !== "string" || !DATE_RE.test(d.periodEnd)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const alert = Number(d.alertPercent);
  return {
    name: str(d.name) ?? "Presupuesto",
    limitAmount,
    currency: str(d.currency) ?? "PEN",
    categoryName: str(d.categoryName),
    periodStart: d.periodStart,
    periodEnd: d.periodEnd,
    alertPercent: Number.isFinite(alert) && alert >= 1 && alert <= 100 ? alert : 80,
  };
}

function parseObligationDraft(raw: unknown): ObligationDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const principalAmount = Number(d.principalAmount);
  if (d.direction !== "receivable" && d.direction !== "payable") return null;
  if (!Number.isFinite(principalAmount) || principalAmount <= 0) return null;
  if (typeof d.startDate !== "string" || !DATE_RE.test(d.startDate)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const due = typeof d.dueDate === "string" && DATE_RE.test(d.dueDate) ? d.dueDate : null;
  return {
    direction: d.direction,
    title: str(d.title) ?? (d.direction === "receivable" ? "Crédito a favor" : "Deuda"),
    counterpartyName: str(d.counterpartyName),
    principalAmount,
    currency: str(d.currency) ?? "PEN",
    startDate: d.startDate,
    dueDate: due,
    description: str(d.description),
  };
}

function parseRecurringDraft(raw: unknown): RecurringDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const amount = Number(d.amount);
  if (d.kind !== "subscription" && d.kind !== "recurring_income") return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (typeof d.nextDate !== "string" || !DATE_RE.test(d.nextDate)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const freq = d.frequency === "weekly" || d.frequency === "yearly" ? d.frequency : "monthly";
  const day = Number(d.dayOfMonth);
  return {
    kind: d.kind,
    name: str(d.name) ?? "Recurrente",
    amount,
    currency: str(d.currency) ?? "PEN",
    frequency: freq,
    dayOfMonth: Number.isFinite(day) && day >= 1 && day <= 31 ? day : null,
    nextDate: d.nextDate,
    categoryName: str(d.categoryName),
    accountName: str(d.accountName),
    description: str(d.description),
  };
}

function parseEvidence(raw: unknown): AssistantEvidence[] {
  if (!Array.isArray(raw)) return [];
  const out: AssistantEvidence[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { label, movementIds } = item as Record<string, unknown>;
    const ids = Array.isArray(movementIds)
      ? movementIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (typeof label === "string" && ids.length > 0) {
      out.push({ label, movementIds: ids });
    }
  }
  return out;
}

export async function askAssistant(input: {
  message: string;
  history: AssistantChatMessage[];
  workspaceId: number;
}): Promise<AssistantReply> {
  const response = await invokeEdgeFunction<Record<string, unknown>>("assistant-chat", {
    message: input.message,
    history: input.history,
    workspaceId: input.workspaceId,
  });

  if (response.ok === false) {
    throw new Error(String(response.error ?? "No se pudo responder. Inténtalo de nuevo."));
  }

  return {
    reply: String(response.reply ?? ""),
    evidence: parseEvidence(response.evidence),
    draft: parseDraft(response.draft),
    budgetDraft: parseBudgetDraft(response.budgetDraft),
    obligationDraft: parseObligationDraft(response.obligationDraft),
    recurringDraft: parseRecurringDraft(response.recurringDraft),
    remainingToday:
      typeof response.remainingToday === "number" ? response.remainingToday : null,
  };
}
