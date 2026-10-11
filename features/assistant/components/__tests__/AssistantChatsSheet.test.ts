import React from "react";
import { Text, TextInput } from "react-native";

import { AssistantChatsSheet } from "../AssistantChatsSheet";
import type { StoredChat } from "../../lib/chat-store";

const { create, act } = require("react-test-renderer");

/* La hoja real pinta un Modal; aquí solo importa su contenido y la capa de encima. */
jest.mock("../../../../components/ui/BottomSheet", () => ({
  BottomSheet: ({ children, overlay }: any) =>
    require("react").createElement(require("react-native").View, null, children, overlay),
}));
jest.mock("../../../../components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({ visible, title }: any) =>
    visible ? require("react").createElement(require("react-native").Text, { testID: "confirm" }, title) : null,
}));

const chat = (id: string, title: string, content = "hola"): StoredChat => ({
  id,
  title,
  updatedAt: 1,
  items: [{ id: `${id}-1`, role: "user", content }],
});

function props(over: Partial<React.ComponentProps<typeof AssistantChatsSheet>> = {}) {
  return {
    visible: true,
    chats: [chat("a", "Gastos de octubre"), chat("b", "Proyección a 6 meses")],
    activeId: "a",
    locked: false,
    pendingDelete: null,
    onSelect: jest.fn(),
    onNew: jest.fn(),
    onRename: jest.fn(),
    onAskDelete: jest.fn(),
    onCancelDelete: jest.fn(),
    onConfirmDelete: jest.fn(),
    onClose: jest.fn(),
    ...over,
  };
}

async function render(p: ReturnType<typeof props>) {
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(React.createElement(AssistantChatsSheet, p));
  });
  return renderer!;
}

const byLabel = (renderer: any, label: string) =>
  renderer.root.findAll((n: any) => n.props.accessibilityLabel === label && typeof n.props.onPress === "function")[0];

const texts = (renderer: any): string[] =>
  renderer.root.findAllByType(Text).map((n: any) => [n.props.children].flat().join(""));

describe("AssistantChatsSheet", () => {
  it("lista las conversaciones y abre la que se toca", async () => {
    const p = props();
    const r = await render(p);
    expect(texts(r)).toEqual(expect.arrayContaining(["Gastos de octubre", "Proyección a 6 meses"]));
    byLabel(r, "Abrir conversación: Proyección a 6 meses").props.onPress();
    expect(p.onSelect).toHaveBeenCalledWith("b");
  });

  it("sin conversaciones lo dice con palabras", async () => {
    const r = await render(props({ chats: [] }));
    expect(texts(r).join(" ")).toContain("Aún no hay conversaciones guardadas");
  });

  it("mientras responde no deja cambiar de conversación", async () => {
    const r = await render(props({ locked: true }));
    expect(byLabel(r, "Abrir conversación: Proyección a 6 meses").props.disabled).toBe(true);
    expect(texts(r).join(" ")).toContain("Espera a que termine de responder");
  });

  it("la búsqueda solo aparece con varias conversaciones y filtra por lo hablado", async () => {
    expect(await render(props()).then((r) => r.root.findAllByType(TextInput))).toHaveLength(0);

    const many = [
      chat("a", "Uno", "hablamos de Kevin"),
      chat("b", "Dos", "otra cosa"),
      chat("c", "Tres", "otra más"),
      chat("d", "Cuatro", "y otra"),
    ];
    const r = await render(props({ chats: many }));
    const search = r.root.findAllByType(TextInput)[0];
    await act(async () => search.props.onChangeText("kevin"));
    expect(texts(r)).toContain("Uno");
    expect(texts(r)).not.toContain("Dos");
    await act(async () => search.props.onChangeText("zzz"));
    expect(texts(r).join(" ")).toContain("Ninguna conversación menciona");
  });

  it("renombrar abre un campo con el nombre actual y guarda el nuevo", async () => {
    const p = props();
    const r = await render(p);
    await act(async () => byLabel(r, "Renombrar conversación: Gastos de octubre").props.onPress());
    const field = r.root.findAllByType(TextInput)[0];
    expect(field.props.value).toBe("Gastos de octubre");
    await act(async () => field.props.onChangeText("Octubre"));
    await act(async () => byLabel(r, "Guardar el nombre").props.onPress());
    expect(p.onRename).toHaveBeenCalledWith("a", "Octubre");
  });

  it("pedir borrar muestra la confirmación de esa conversación", async () => {
    const p = props();
    const r = await render(p);
    byLabel(r, "Borrar conversación: Gastos de octubre").props.onPress();
    expect(p.onAskDelete).toHaveBeenCalledWith("a");

    const confirming = await render(props({ pendingDelete: chat("a", "Gastos de octubre") }));
    expect(texts(confirming)).toContain("¿Borrar esta conversación?");
  });
});
