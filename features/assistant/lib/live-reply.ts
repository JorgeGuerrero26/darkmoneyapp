/**
 * Lectura de la respuesta en vivo del asistente (eventos SSE de la edge function assistant-chat;
 * el contrato está en supabase/functions/assistant-chat/stream.ts).
 */

export type AssistantStreamEvent =
  | { type: "status"; tool: string | null }
  | { type: "delta"; text: string }
  | { type: "reset" }
  | { type: "done"; payload: Record<string, unknown> }
  | { type: "error"; error: string };

/** Parte el flujo en los `data:` completos; tolera trozos cortados en cualquier punto. */
export function createSseDataReader() {
  let buffer = "";
  return {
    push(text: string): string[] {
      buffer += text.replace(/\r\n/g, "\n");
      const out: string[] = [];
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) out.push(line.slice(5).trim());
        newline = buffer.indexOf("\n");
      }
      return out;
    },
  };
}

/** Un `data:` del servidor como evento tipado; null si no se entiende (se ignora). */
export function parseStreamEvent(data: string): AssistantStreamEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const event = raw as Record<string, unknown>;
  switch (event.type) {
    case "status":
      return { type: "status", tool: typeof event.tool === "string" ? event.tool : null };
    case "delta":
      return typeof event.text === "string" && event.text ? { type: "delta", text: event.text } : null;
    case "reset":
      return { type: "reset" };
    case "done": {
      const { type: _type, ...payload } = event;
      return { type: "done", payload };
    }
    case "error":
      return {
        type: "error",
        error: typeof event.error === "string" && event.error ? event.error : "No se pudo responder. Inténtalo de nuevo.",
      };
    default:
      return null;
  }
}
