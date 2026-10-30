const { act, create } = require("react-test-renderer");
import { Text } from "react-native";

import type { OfflineState } from "../../../lib/offline/runtime";
import type { PendingChange } from "../../../lib/offline/pending";
import { setPendingSheetOpen } from "../../../lib/offline/pending-sheet";

let mockState: OfflineState;
const mockPush = jest.fn();
const mockRequestSync = jest.fn();
const mockResolve = jest.fn(async (_id: number) => undefined);
let mockChanges: PendingChange[] = [];
let mockInbox: unknown[] = [];
let mockReadFailure = false;

jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("../../../lib/offline/react", () => ({ useOfflineStatus: () => mockState }));
jest.mock("../../../lib/offline/instance", () => ({
  offlineRuntime: {
    listPendingChanges: async () => { if (mockReadFailure) throw new Error("lectura fallida"); return mockChanges; },
    inbox: async () => mockInbox,
    requestSync: (...args: unknown[]) => mockRequestSync(...args),
    resolveInboxEntry: (id: number) => mockResolve(id),
  },
}));
jest.mock("../../ui/BottomSheet", () => ({
  BottomSheet: ({ visible, children, title }: { visible: boolean; children: React.ReactNode; title?: string }) => {
    const { Text: T, View } = require("react-native");
    return visible ? (<View><T>{title}</T>{children}</View>) : null;
  },
}));

// eslint-disable-next-line import/first
import { PendingChangesSheet } from "../PendingChangesSheet";

const base: OfflineState = {
  availability: "ready", online: false, syncing: false, hydrated: true, workspaceId: 1, pending: 2, sendingTotal: 0,
  rejected: 0, review: 0, lastSyncAt: null, lastError: null,
};
const change = (extra: Partial<PendingChange>): PendingChange => ({
  opId: "op", table: "movements", kind: "insert", workspaceId: 1, rowId: 5, createdAt: new Date(2026, 9, 14, 8, 56).toISOString(),
  label: "Taxi", changedFields: [], ...extra,
});

const texts = (tree: { root: { findAllByType: (t: unknown) => Array<{ props: { children: unknown } }> } }) =>
  tree.root.findAllByType(Text).map((node) => [node.props.children].flat().map(String).join(""));
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

describe("PendingChangesSheet", () => {
  let tree: ReturnType<typeof create>;
  beforeEach(() => {
    jest.clearAllMocks();
    mockState = base;
    mockInbox = [];
    mockReadFailure = false;
    mockChanges = [
      change({ opId: "a", table: "movements", kind: "insert", rowId: 5, label: "Taxi" }),
      change({ opId: "b", table: "accounts", kind: "update", rowId: 2, label: "Principal", changedFields: ["name"] }),
    ];
    act(() => setPendingSheetOpen(false));
  });
  afterEach(() => {
    act(() => tree?.unmount());
    act(() => setPendingSheetOpen(false));
  });

  it("cerrada no pinta nada", async () => {
    act(() => { tree = create(<PendingChangesSheet />); });
    await flush();
    expect(texts(tree)).toEqual([]);
  });

  it("permanece abierta sin conexión aunque no haya cambios pendientes", async () => {
    mockState = { ...base, pending: 0 };
    mockChanges = [];
    act(() => { tree = create(<PendingChangesSheet />); });
    act(() => setPendingSheetOpen(true));
    await flush();
    expect(texts(tree).join("\n")).toContain("No hay cambios pendientes de enviar.");
  });

  it("abierta lista los cambios de todos los módulos con su hora, la nota de saldos y el botón de enviar", async () => {
    act(() => { tree = create(<PendingChangesSheet />); });
    act(() => setPendingSheetOpen(true));
    await flush();
    const all = texts(tree).join("\n");
    expect(all).toContain("Pendientes de enviar");
    expect(all).toContain("2 cambios por enviar");
    expect(all).toContain("Nuevo movimiento · Taxi");
    expect(all).toContain("Cuenta editada · Principal");
    expect(all).toContain("nombre");
    expect(all).toContain("8:56");
    expect(all).toContain("los saldos ya incluyen estos cambios");
    expect(all).toContain("Intentar enviar ahora");
  });

  it("tocar un cambio cierra la hoja y abre su pantalla", async () => {
    act(() => { tree = create(<PendingChangesSheet />); });
    act(() => setPendingSheetOpen(true));
    await flush();
    const row = tree.root.findAll((node: any) => node.props.accessibilityRole === "button" && String(node.props.accessibilityLabel).startsWith("Nuevo movimiento · Taxi"))[0];
    act(() => row.props.onPress());
    expect(mockPush).toHaveBeenCalledWith("/movement/5?from=movements");
    await flush();
    expect(texts(tree)).toEqual([]); // se cerró
  });

  it("no abre en el espacio actual un cambio de otro espacio", async () => {
    mockChanges = [change({ workspaceId: 2 })];
    act(() => { tree = create(<PendingChangesSheet />); });
    act(() => setPendingSheetOpen(true));
    await flush();
    expect(texts(tree).join("\n")).toContain("De otro espacio · cambia de espacio para abrirlo");
    const row = tree.root.findAll((node: any) => node.props.accessibilityRole === "button" && String(node.props.accessibilityLabel).includes("pertenece a otro espacio"))[0];
    expect(row.props.disabled).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("lo que necesita revisión sale arriba, con su explicación y su salida", async () => {
    mockState = { ...base, rejected: 1 };
    mockInbox = [{ id: 9, opId: "x", table: "movements", rowId: 3, kind: "update", status: "rejected", code: "row_not_found", message: null, previous: null, summary: "Editar «Café»", createdAt: "2026-10-14T10:00:00Z", resolved: 0 }];
    act(() => { tree = create(<PendingChangesSheet />); });
    act(() => setPendingSheetOpen(true));
    await flush();
    const all = texts(tree);
    expect(all.join("\n")).toContain("Necesitan tu revisión");
    expect(all.join("\n")).toContain("Editar «Café»");
    const discard = tree.root.findAll((node: any) => node.props.label === "Descartar")[0];
    await act(async () => { await discard.props.onPress(); });
    expect(mockResolve).toHaveBeenCalledWith(9);
  });

  it("ofrece reintentar si falla la lectura de pendientes", async () => {
    mockReadFailure = true;
    act(() => { tree = create(<PendingChangesSheet />); });
    act(() => setPendingSheetOpen(true));
    await flush();
    expect(texts(tree).join("\n")).toContain("No se pudieron cargar los cambios pendientes.");
    expect(texts(tree).join("\n")).not.toContain("Cargando cambios pendientes…");
    mockReadFailure = false;
    const retry = tree.root.findAll((node: any) => node.props.label === "Reintentar lectura")[0];
    await act(async () => { retry.props.onPress(); await Promise.resolve(); await Promise.resolve(); });
    expect(texts(tree).join("\n")).toContain("Nuevo movimiento · Taxi");
  });

  it("el botón de enviar pide un envío manual", async () => {
    act(() => { tree = create(<PendingChangesSheet />); });
    act(() => setPendingSheetOpen(true));
    await flush();
    const send = tree.root.findAll((node: any) => node.props.label === "Intentar enviar ahora")[0];
    act(() => send.props.onPress());
    expect(mockRequestSync).toHaveBeenCalledWith("manual");
  });
});
