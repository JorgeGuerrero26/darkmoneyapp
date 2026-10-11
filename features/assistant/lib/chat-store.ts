/**
 * Varias conversaciones del asistente, guardadas en el teléfono.
 *
 * El servidor no guarda nada: en cada pregunta la app le manda el historial del chat abierto, así
 * que "un contexto distinto" es simplemente otra lista de mensajes. Este módulo solo decide cómo
 * se guardan esas listas; la pantalla no necesita saber el formato.
 */

export type StoredMessage = { id: string; role: "user" | "assistant"; content: string };

export type StoredChat = {
  id: string;
  title: string;
  updatedAt: number;
  items: StoredMessage[];
};

export type ChatStore = { activeId: string | null; chats: StoredChat[] };

/** Más antiguos se descartan: el teléfono no es un archivo y la lista tiene que seguir siendo corta. */
export const MAX_CHATS = 20;
/** Por encima del historial que acepta el servidor, sin llenar el disco. */
export const MAX_STORED_ITEMS = 40;

export const EMPTY_CHAT_TITLE = "Conversación nueva";
const TITLE_MAX = 42;

export function newChatId(now: number = Date.now()): string {
  return `c${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** El título es tu primera pregunta: no se gasta una llamada a la IA en ponerle nombre. */
export function chatTitle(items: readonly StoredMessage[]): string {
  const first = items.find((item) => item.role === "user")?.content.replace(/\s+/g, " ").trim();
  if (!first) return EMPTY_CHAT_TITLE;
  return first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX - 1).trimEnd()}…` : first;
}

function isMessage(value: unknown): value is StoredMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.content === "string" &&
    (v.role === "user" || v.role === "assistant")
  );
}

function cleanItems(raw: unknown): StoredMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isMessage)
    .slice(-MAX_STORED_ITEMS)
    .map(({ id, role, content }) => ({ id, role, content }));
}

/** Lee lo guardado. Un JSON roto o de otra forma da una lista vacía: nunca rompe la pantalla. */
export function parseChatStore(raw: string | null): ChatStore {
  const empty: ChatStore = { activeId: null, chats: [] };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as { activeId?: unknown; chats?: unknown };
    if (!parsed || !Array.isArray(parsed.chats)) return empty;
    const chats: StoredChat[] = [];
    for (const entry of parsed.chats) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      const items = cleanItems(e.items);
      if (typeof e.id !== "string" || items.length === 0) continue;
      chats.push({
        id: e.id,
        title: chatTitle(items),
        updatedAt: typeof e.updatedAt === "number" ? e.updatedAt : 0,
        items,
      });
    }
    return {
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : null,
      chats: chats.slice(0, MAX_CHATS),
    };
  } catch {
    return empty;
  }
}

/** El chat único de antes (una lista de mensajes) pasa a ser la primera conversación. */
export function chatFromLegacy(raw: string | null, now: number = Date.now()): StoredChat | null {
  if (!raw) return null;
  try {
    const items = cleanItems(JSON.parse(raw));
    if (items.length === 0) return null;
    return { id: newChatId(now), title: chatTitle(items), updatedAt: now, items };
  } catch {
    return null;
  }
}

function sameItems(a: readonly StoredMessage[], b: readonly StoredMessage[]): boolean {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id && item.content === b[i].content);
}

/**
 * Deja la conversación `id` con estos mensajes. Una conversación vacía no se guarda (abrir "Nuevo
 * chat" y salir no deja un hueco en la lista), y `updatedAt` solo avanza si algo cambió: abrir un
 * chat viejo para leerlo no lo manda arriba de la lista.
 */
export function upsertChat(
  chats: readonly StoredChat[],
  id: string,
  items: readonly StoredMessage[],
  now: number = Date.now(),
): StoredChat[] {
  const others = chats.filter((chat) => chat.id !== id);
  if (items.length === 0) return others;
  const previous = chats.find((chat) => chat.id === id);
  const kept = items.slice(-MAX_STORED_ITEMS);
  const updatedAt = previous && sameItems(previous.items, kept) ? previous.updatedAt : now;
  const next: StoredChat = { id, title: chatTitle(kept), updatedAt, items: [...kept] };
  return [...others, next].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
}

export function removeChat(chats: readonly StoredChat[], id: string): StoredChat[] {
  return chats.filter((chat) => chat.id !== id);
}
