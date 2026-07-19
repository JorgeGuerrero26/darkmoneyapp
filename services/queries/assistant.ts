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

export type AssistantReply = {
  reply: string;
  evidence: AssistantEvidence[];
  remainingToday: number | null;
};

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
    remainingToday:
      typeof response.remainingToday === "number" ? response.remainingToday : null,
  };
}
