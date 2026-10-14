const { act, create } = require("react-test-renderer");
import { Text } from "react-native";

import type { OfflineState } from "../../../lib/offline/runtime";

let mockState: Partial<OfflineState> = { availability: "disabled" };

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("../../../lib/offline/react", () => ({ useOfflineStatus: () => mockState }));

// eslint-disable-next-line import/first
import { OfflineContextSlot } from "../OfflineSyncNotice";

const texts = (tree: { root: { findAllByType: (type: unknown) => Array<{ props: { children: unknown } }> } }) =>
  tree.root.findAllByType(Text).map((node) => String(node.props.children));

describe("OfflineContextSlot", () => {
  let tree: ReturnType<typeof create>;
  afterEach(() => act(() => tree?.unmount()));

  it("modo apagado: deja el módulo exactamente como era (solo sus hijos)", () => {
    mockState = { availability: "disabled" };
    act(() => {
      tree = create(<OfflineContextSlot from="accounts"><Text>nota del módulo</Text></OfflineContextSlot>);
    });
    expect(texts(tree)).toEqual(["nota del módulo"]);
  });

  it("todo al día: tampoco agrega nada", () => {
    mockState = { availability: "ready", online: true, pending: 0, rejected: 0, syncing: false };
    act(() => {
      tree = create(<OfflineContextSlot from="accounts"><Text>nota del módulo</Text></OfflineContextSlot>);
    });
    expect(texts(tree)).toEqual(["nota del módulo"]);
  });

  it("sin conexión: el aviso va encima de lo que el módulo ya ponía", () => {
    mockState = { availability: "ready", online: false, pending: 2, rejected: 0, syncing: false };
    act(() => {
      tree = create(<OfflineContextSlot from="budgets"><Text>nota del módulo</Text></OfflineContextSlot>);
    });
    const all = texts(tree);
    expect(all[0]).toBe("Sin conexión");
    expect(all[all.length - 1]).toBe("nota del módulo");
  });
});
