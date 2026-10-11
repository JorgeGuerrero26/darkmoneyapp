import {
  MAX_CHATS,
  chatFromLegacy,
  chatTitle,
  parseChatStore,
  removeChat,
  upsertChat,
  type StoredMessage,
} from "../chat-store";

const msg = (id: string, role: "user" | "assistant", content: string): StoredMessage => ({ id, role, content });

describe("chatTitle", () => {
  it("usa la primera pregunta y la recorta", () => {
    expect(chatTitle([msg("1", "user", "¿Cuánto gasté este mes?")])).toBe("¿Cuánto gasté este mes?");
    const largo = "a".repeat(100);
    const title = chatTitle([msg("1", "user", largo)]);
    expect(title.length).toBe(42);
    expect(title.endsWith("…")).toBe(true);
  });

  it("sin pregunta del usuario queda con el título genérico", () => {
    expect(chatTitle([msg("1", "assistant", "Hola")])).toBe("Conversación nueva");
  });
});

describe("upsertChat", () => {
  const a = [msg("1", "user", "uno")];

  it("una conversación vacía no se guarda", () => {
    expect(upsertChat([], "x", [], 10)).toEqual([]);
  });

  it("deja arriba la que más recientemente cambió", () => {
    let chats = upsertChat([], "a", a, 10);
    chats = upsertChat(chats, "b", [msg("2", "user", "dos")], 20);
    expect(chats.map((c) => c.id)).toEqual(["b", "a"]);
    chats = upsertChat(chats, "a", [...a, msg("3", "assistant", "r")], 30);
    expect(chats.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("releer un chat sin cambiarlo no lo sube en la lista", () => {
    let chats = upsertChat([], "a", a, 10);
    chats = upsertChat(chats, "b", [msg("2", "user", "dos")], 20);
    chats = upsertChat(chats, "a", a, 99);
    expect(chats.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("guarda a lo más MAX_CHATS", () => {
    let chats: ReturnType<typeof upsertChat> = [];
    for (let i = 0; i < MAX_CHATS + 5; i++) chats = upsertChat(chats, `c${i}`, a, i);
    expect(chats).toHaveLength(MAX_CHATS);
    expect(chats[0].id).toBe(`c${MAX_CHATS + 4}`);
  });
});

describe("removeChat", () => {
  it("quita solo esa conversación", () => {
    const chats = upsertChat(upsertChat([], "a", [msg("1", "user", "x")], 1), "b", [msg("2", "user", "y")], 2);
    expect(removeChat(chats, "a").map((c) => c.id)).toEqual(["b"]);
  });
});

describe("parseChatStore", () => {
  it("un guardado roto o vacío da una lista vacía", () => {
    expect(parseChatStore(null)).toEqual({ activeId: null, chats: [] });
    expect(parseChatStore("{no json")).toEqual({ activeId: null, chats: [] });
    expect(parseChatStore('{"chats":"x"}')).toEqual({ activeId: null, chats: [] });
  });

  it("ida y vuelta, descartando mensajes y chats inválidos", () => {
    const raw = JSON.stringify({
      activeId: "a",
      chats: [
        { id: "a", updatedAt: 5, items: [{ id: "1", role: "user", content: "hola" }, { id: "2", role: "system", content: "x" }] },
        { id: "vacío", updatedAt: 6, items: [] },
        { items: [{ id: "1", role: "user", content: "sin id de chat" }] },
      ],
    });
    const store = parseChatStore(raw);
    expect(store.activeId).toBe("a");
    expect(store.chats).toHaveLength(1);
    expect(store.chats[0].items).toEqual([msg("1", "user", "hola")]);
    expect(store.chats[0].title).toBe("hola");
  });
});

describe("chatFromLegacy", () => {
  it("el chat único de antes pasa a ser una conversación", () => {
    const chat = chatFromLegacy(JSON.stringify([{ id: "u1", role: "user", content: "¿cuánto tengo?" }]), 50);
    expect(chat?.title).toBe("¿cuánto tengo?");
    expect(chat?.items).toHaveLength(1);
  });

  it("sin nada guardado no inventa una conversación", () => {
    expect(chatFromLegacy(null)).toBeNull();
    expect(chatFromLegacy("[]")).toBeNull();
    expect(chatFromLegacy("roto")).toBeNull();
  });
});
