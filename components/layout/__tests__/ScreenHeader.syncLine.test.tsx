const { act, create } = require("react-test-renderer");
import { Text } from "react-native";

import type { SyncLine } from "../../../lib/offline/status-copy";

let mockLine: SyncLine | null = null;
const mockOpen = jest.fn();

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../../../hooks/useHaptics", () => ({ useHaptics: () => ({ light: jest.fn() }) }));
jest.mock("../../../hooks/useSyncLine", () => ({ useSyncLine: () => mockLine }));
jest.mock("../../../lib/offline/pending-sheet", () => ({ setPendingSheetOpen: (value: boolean) => mockOpen(value) }));
jest.mock("../../ui/PlanStatusBadge", () => ({ PlanStatusBadge: () => null }));

// eslint-disable-next-line import/first
import { ScreenHeader } from "../ScreenHeader";

const texts = (tree: { root: { findAllByType: (t: unknown) => Array<{ props: { children: unknown } }> } }) =>
  tree.root.findAllByType(Text).map((node) => String(node.props.children));

describe("ScreenHeader y la línea de sincronización", () => {
  let tree: ReturnType<typeof create>;
  beforeEach(() => {
    mockLine = null;
    mockOpen.mockClear();
  });
  afterEach(() => act(() => tree?.unmount()));

  it("sin nada que decir muestra 'Actualizado hace…' como siempre", () => {
    act(() => { tree = create(<ScreenHeader title="Movimientos" subtitle="Actualizado hace 42s" />); });
    expect(texts(tree)).toEqual(["Movimientos", "Actualizado hace 42s"]);
  });

  it("con la línea de estado, esta REEMPLAZA al subtítulo (no se muestran los dos)", () => {
    mockLine = { kind: "offline", text: "Sin conexión · 3 por enviar", tappable: true };
    act(() => { tree = create(<ScreenHeader title="Movimientos" subtitle="Actualizado hace 42s" />); });
    expect(texts(tree)).toEqual(["Movimientos", "Sin conexión · 3 por enviar"]);
  });

  it("tocar la línea abre la hoja de pendientes", () => {
    mockLine = { kind: "offline", text: "Sin conexión · 3 por enviar", tappable: true };
    act(() => { tree = create(<ScreenHeader title="Movimientos" subtitle="Actualizado hace 42s" />); });
    const button = tree.root.findAll((node: any) => node.props.accessibilityRole === "button" && node.props.accessibilityLabel === "Sin conexión · 3 por enviar")[0];
    act(() => button.props.onPress());
    expect(mockOpen).toHaveBeenCalledWith(true);
  });

  it("mientras envía no se puede tocar", () => {
    mockLine = { kind: "sending", text: "Enviando 2 de 3…", tappable: false };
    act(() => { tree = create(<ScreenHeader title="Movimientos" subtitle="Actualizado hace 42s" />); });
    expect(texts(tree)).toEqual(["Movimientos", "Enviando 2 de 3…"]);
    expect(tree.root.findAll((node: any) => node.props.accessibilityRole === "button" && node.props.accessibilityLabel === "Enviando 2 de 3…")).toHaveLength(0);
  });

  it("también aparece en un encabezado sin subtítulo, y se puede apagar por pantalla", () => {
    mockLine = { kind: "review", text: "1 cambio necesita revisión", tappable: true };
    act(() => { tree = create(<ScreenHeader title="Cuentas" />); });
    expect(texts(tree)).toEqual(["Cuentas", "1 cambio necesita revisión"]);
    act(() => tree.update(<ScreenHeader title="Cuentas" hideSyncStatus />));
    expect(texts(tree)).toEqual(["Cuentas"]);
  });
});
