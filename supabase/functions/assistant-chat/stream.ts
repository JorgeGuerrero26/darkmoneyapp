/**
 * Piezas puras de la respuesta en vivo del asistente (sin Deno ni red: se prueban con Jest).
 *
 * Con `stream: true` en el cuerpo, la función responde `text/event-stream` con eventos JSON:
 *   status  { tool: string | null }  qué está consultando de verdad (null = pensando)
 *   delta   { text }                 un trozo de la respuesta, en orden
 *   reset   {}                       descartar el texto mostrado (reintento o el modelo pasó a consultar)
 *   done    { ...respuesta completa } el mismo JSON que sin stream; manda sobre lo mostrado
 *   error   { error }
 * Sin `stream` responde JSON como siempre: los teléfonos con la app vieja no cambian.
 */

/** Línea final con las preguntas sugeridas. Se quita del texto antes de mostrarlo. */
export const SUGGESTIONS_MARKER = "[[SIGUE]]";
const MAX_SUGGESTIONS = 3;
const MAX_SUGGESTION_CHARS = 70;

export function sseEvent(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** Separa la respuesta de la línea de sugerencias que el modelo pone al final. */
export function splitSuggestions(text: string): { reply: string; suggestions: string[] } {
  const index = text.indexOf(SUGGESTIONS_MARKER);
  if (index < 0) return { reply: text.trim(), suggestions: [] };
  const raw = text.slice(index + SUGGESTIONS_MARKER.length);
  const seen = new Set<string>();
  const suggestions = raw
    .split(/[|\n]/)
    .map((item) => item.replace(/^[\s\-•*\d.)]+/, "").replace(/\*\*/g, "").trim())
    .filter((item) => item.length >= 4 && item.length <= MAX_SUGGESTION_CHARS)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS);
  return { reply: text.slice(0, index).trim(), suggestions };
}

/**
 * Deja pasar el texto en vivo pero nunca la línea de sugerencias: retiene lo que podría ser el
 * comienzo del marcador hasta saber si lo es, y desde el marcador no deja pasar nada más.
 */
export function createMarkerFilter(marker = SUGGESTIONS_MARKER) {
  let pending = "";
  let stopped = false;
  return {
    push(chunk: string): string {
      if (stopped) return "";
      pending += chunk;
      const index = pending.indexOf(marker);
      if (index >= 0) {
        stopped = true;
        const out = pending.slice(0, index);
        pending = "";
        return out;
      }
      let keep = 0;
      for (let k = Math.min(marker.length - 1, pending.length); k > 0; k -= 1) {
        if (pending.endsWith(marker.slice(0, k))) {
          keep = k;
          break;
        }
      }
      const out = pending.slice(0, pending.length - keep);
      pending = pending.slice(pending.length - keep);
      return out;
    },
    flush(): string {
      const out = stopped ? "" : pending;
      pending = "";
      return out;
    },
  };
}

/** Parte un flujo SSE en los `data:` completos; tolera trozos cortados en cualquier punto. */
export function createSseLineReader() {
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

type StreamedToolCall = {
  id?: string;
  type?: string;
  function: { name?: string; arguments: string };
  [key: string]: unknown;
};

/**
 * Arma el mensaje final a partir de los trozos del endpoint compatible con OpenAI.
 *
 * Copia también los campos extra de cada tool_call: Gemini 3 manda ahí su firma de razonamiento
 * (`extra_content.google.thought_signature`) y la exige de vuelta en la siguiente ronda; sin
 * ella responde 400 justo después de la primera consulta.
 */
export function createChatStreamAccumulator() {
  let content = "";
  const calls: StreamedToolCall[] = [];
  const byIndex = new Map<number, StreamedToolCall>();
  const byId = new Map<string, StreamedToolCall>();

  return {
    /** Devuelve el texto nuevo de este trozo ("" si no trae texto). */
    push(chunk: unknown): string {
      // deno-lint-ignore no-explicit-any
      const delta = (chunk as any)?.choices?.[0]?.delta;
      if (!delta || typeof delta !== "object") return "";
      const text = typeof delta.content === "string" ? delta.content : "";
      content += text;
      for (const raw of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
        if (!raw || typeof raw !== "object") continue;
        const index = typeof raw.index === "number" ? raw.index : null;
        const id = typeof raw.id === "string" && raw.id ? raw.id : null;
        let call = (index != null ? byIndex.get(index) : undefined) ?? (id ? byId.get(id) : undefined);
        if (!call) {
          if (index == null && !id && calls.length > 0) {
            call = calls[calls.length - 1];
          } else {
            call = { function: { arguments: "" } };
            calls.push(call);
          }
        }
        if (index != null) byIndex.set(index, call);
        if (id) {
          call.id = id;
          byId.set(id, call);
        }
        for (const [key, value] of Object.entries(raw)) {
          if (key === "index" || key === "id" || key === "function") continue;
          call[key] = value;
        }
        const fn = raw.function ?? {};
        if (typeof fn.name === "string" && fn.name) call.function.name = fn.name;
        if (typeof fn.arguments === "string") call.function.arguments += fn.arguments;
      }
      return text;
    },
    message(): { role: "assistant"; content: string | null; tool_calls?: StreamedToolCall[] } {
      const toolCalls = calls
        .filter((call) => call.function.name)
        .map((call) => ({ type: "function", ...call, function: { ...call.function, arguments: call.function.arguments || "{}" } }));
      // Con tool_calls y sin texto va null, igual que lo devuelve el endpoint sin stream.
      return toolCalls.length > 0
        ? { role: "assistant", content: content || null, tool_calls: toolCalls }
        : { role: "assistant", content };
    },
  };
}
