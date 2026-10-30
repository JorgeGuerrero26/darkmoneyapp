const { act, create } = require("react-test-renderer");
import { Text } from "react-native";

import type { OfflineState } from "../../lib/offline/runtime";

let mockState: OfflineState;

jest.mock("../../lib/offline/react", () => ({ useOfflineStatus: () => mockState }));

// eslint-disable-next-line import/first
import { OFFLINE_LINE_DELAY_MS, lineNeedsDelay, useSyncLine } from "../useSyncLine";

const base: OfflineState = {
  availability: "ready", online: true, syncing: false, hydrated: true, workspaceId: 1, pending: 0, sendingTotal: 0,
  rejected: 0, review: 0, lastSyncAt: null, lastError: null,
};

function Probe() {
  const line = useSyncLine();
  return <Text>{line ? line.text : "(nada)"}</Text>;
}
const shown = (tree: { root: { findByType: (t: unknown) => { props: { children: unknown } } } }) => String(tree.root.findByType(Text).props.children);

describe("useSyncLine", () => {
  let tree: ReturnType<typeof create>;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    act(() => tree?.unmount());
    jest.useRealTimers();
  });

  it("con el modo apagado o todo al día no muestra nada", () => {
    mockState = { ...base, availability: "disabled" };
    act(() => { tree = create(<Probe />); });
    expect(shown(tree)).toBe("(nada)");
    mockState = base;
    act(() => tree.update(<Probe />));
    expect(shown(tree)).toBe("(nada)");
  });

  it("'Sin conexión' sin nada pendiente espera unos segundos: un corte breve no hace parpadear el encabezado", () => {
    mockState = { ...base, online: false };
    act(() => { tree = create(<Probe />); });
    expect(shown(tree)).toBe("(nada)");
    act(() => { jest.advanceTimersByTime(OFFLINE_LINE_DELAY_MS - 100); });
    expect(shown(tree)).toBe("(nada)");
    act(() => { jest.advanceTimersByTime(200); });
    expect(shown(tree)).toBe("Sin conexión");
  });

  it("si la red vuelve antes del retardo, nunca se llegó a mostrar", () => {
    mockState = { ...base, online: false };
    act(() => { tree = create(<Probe />); });
    act(() => { jest.advanceTimersByTime(1000); });
    mockState = base;
    act(() => tree.update(<Probe />));
    act(() => { jest.advanceTimersByTime(5000); });
    expect(shown(tree)).toBe("(nada)");
  });

  it("muestra los pendientes de inmediato y espera antes de anunciar la desconexión", () => {
    mockState = { ...base, online: false, pending: 2 };
    act(() => { tree = create(<Probe />); });
    expect(shown(tree)).toBe("2 por enviar");
    act(() => { jest.advanceTimersByTime(OFFLINE_LINE_DELAY_MS); });
    expect(shown(tree)).toBe("Sin conexión · 2 por enviar");
  });

  it("un cambio que necesita revisión se muestra al instante", () => {
    mockState = { ...base, rejected: 1 };
    act(() => { tree = create(<Probe />); });
    expect(shown(tree)).toBe("1 cambio necesita revisión");
  });
});

describe("lineNeedsDelay", () => {
  it("retrasa cualquier aviso de desconexión", () => {
    expect(lineNeedsDelay({ kind: "offline", text: "Sin conexión", tappable: true })).toBe(true);
    expect(lineNeedsDelay({ kind: "offline", text: "x", tappable: true })).toBe(true);
    expect(lineNeedsDelay({ kind: "sending", text: "x", tappable: false })).toBe(false);
    expect(lineNeedsDelay(null)).toBe(false);
  });
});
