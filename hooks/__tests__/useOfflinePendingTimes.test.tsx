const { act, create } = require("react-test-renderer");
import { Text } from "react-native";

import type { OfflineState } from "../../lib/offline/runtime";

let mockState: OfflineState;
const mockTimes = jest.fn();

jest.mock("../../lib/offline/react", () => ({ useOfflineStatus: () => mockState }));
jest.mock("../../lib/offline/instance", () => ({ offlineRuntime: { pendingRowTimes: (...args: unknown[]) => mockTimes(...args) } }));

// eslint-disable-next-line import/first
import { usePendingRowTimes } from "../useOfflinePendingTimes";

const base: OfflineState = {
  availability: "ready", online: false, syncing: false, hydrated: true, workspaceId: 1, pending: 2, sendingTotal: 0,
  rejected: 0, review: 0, lastSyncAt: null, lastError: null,
};

function Probe({ workspaceId = 1 as number | null }) {
  const times = usePendingRowTimes("movements", workspaceId);
  return <Text>{[...times.entries()].map(([id, at]) => `${id}@${at}`).join(",") || "(vacío)"}</Text>;
}
const shown = (tree: { root: { findByType: (t: unknown) => { props: { children: unknown } } } }) => String(tree.root.findByType(Text).props.children);
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe("usePendingRowTimes", () => {
  let tree: ReturnType<typeof create>;
  beforeEach(() => mockTimes.mockReset());
  afterEach(() => act(() => tree?.unmount()));

  it("devuelve la hora de cada fila pendiente", async () => {
    mockState = base;
    mockTimes.mockResolvedValue([{ id: 7, at: "2026-10-14T13:56:00.000Z" }]);
    act(() => { tree = create(<Probe />); });
    await flush();
    expect(shown(tree)).toBe("7@2026-10-14T13:56:00.000Z");
    expect(mockTimes).toHaveBeenCalledWith(1, "movements");
  });

  it("con el modo apagado o nada pendiente no consulta nada", async () => {
    mockState = { ...base, pending: 0 };
    act(() => { tree = create(<Probe />); });
    await flush();
    expect(shown(tree)).toBe("(vacío)");
    mockState = { ...base, availability: "disabled" };
    act(() => tree.update(<Probe />));
    await flush();
    expect(mockTimes).not.toHaveBeenCalled();
  });

  it("no muestra pendientes de otro espacio mientras carga el actual", async () => {
    mockState = base;
    mockTimes.mockResolvedValueOnce([{ id: 7, at: "anterior" }]);
    let resolveNext!: (rows: { id: number; at: string }[]) => void;
    mockTimes.mockReturnValueOnce(new Promise((resolve) => { resolveNext = resolve; }));
    act(() => { tree = create(<Probe workspaceId={1} />); });
    await flush();
    expect(shown(tree)).toBe("7@anterior");

    act(() => tree.update(<Probe workspaceId={2} />));
    expect(shown(tree)).toBe("(vacío)");
    await act(async () => { resolveNext([{ id: 8, at: "actual" }]); });
    expect(shown(tree)).toBe("8@actual");
  });

  it("al quedar todo enviado vuelve a vacío", async () => {
    mockState = base;
    mockTimes.mockResolvedValue([{ id: 7, at: "2026-10-14T13:56:00.000Z" }]);
    act(() => { tree = create(<Probe />); });
    await flush();
    mockState = { ...base, pending: 0 };
    act(() => tree.update(<Probe />));
    await flush();
    expect(shown(tree)).toBe("(vacío)");
  });
});
