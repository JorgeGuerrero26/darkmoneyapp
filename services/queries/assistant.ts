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

export type AssistantReply = {
  reply: string;
  evidence: AssistantEvidence[];
  draft: AssistantDraft | null;
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
    remainingToday:
      typeof response.remainingToday === "number" ? response.remainingToday : null,
  };
}
