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
  /** El nombre que le puso la persona. Si existe, manda sobre el que sale de la primera pregunta. */
  customTitle?: string;
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

const CUSTOM_TITLE_MAX = 60;

function cleanCustomTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, CUSTOM_TITLE_MAX);
  return trimmed || undefined;
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
      const customTitle = cleanCustomTitle(e.customTitle);
      chats.push({
        id: e.id,
        title: customTitle ?? chatTitle(items),
        ...(customTitle ? { customTitle } : {}),
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
  const customTitle = previous?.customTitle;
  const next: StoredChat = {
    id,
    title: customTitle ?? chatTitle(kept),
    ...(customTitle ? { customTitle } : {}),
    updatedAt,
    items: [...kept],
  };
  return [...others, next].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
}

export function removeChat(chats: readonly StoredChat[], id: string): StoredChat[] {
  return chats.filter((chat) => chat.id !== id);
}

/**
 * Le pone nombre a una conversación. Un nombre vacío devuelve al automático (tu primera pregunta).
 * No cambia `updatedAt`: renombrar no es hablar, y no debe mandar el chat al principio de la lista.
 */
export function renameChat(chats: readonly StoredChat[], id: string, title: string): StoredChat[] {
  const customTitle = cleanCustomTitle(title);
  return chats.map((chat) => {
    if (chat.id !== id) return chat;
    const { customTitle: _previous, ...rest } = chat;
    return { ...rest, title: customTitle ?? chatTitle(chat.items), ...(customTitle ? { customTitle } : {}) };
  });
}

function fold(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Las conversaciones cuyo nombre o cuyos mensajes contienen lo buscado (sin importar tildes). */
export function searchChats(chats: readonly StoredChat[], query: string): StoredChat[] {
  const needle = fold(query).trim();
  if (!needle) return [...chats];
  return chats.filter(
    (chat) => fold(chat.title).includes(needle) || chat.items.some((item) => fold(item.content).includes(needle)),
  );
}
