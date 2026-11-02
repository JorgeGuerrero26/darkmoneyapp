const { act, create } = require("react-test-renderer");

const mockDelete = jest.fn();
const mockPreview = jest.fn();
jest.mock("../../../../services/queries/account-deletion", () => ({
  DELETE_CONFIRM_WORD: "ELIMINAR",
  deleteMyAccount: (...args: unknown[]) => mockDelete(...args),
  fetchAccountDeletionPreview: () => mockPreview(),
}));
jest.mock("../../../../components/ui/SafeBlurView", () => ({ SafeBlurView: () => null }));

// eslint-disable-next-line import/first
import { Text, TextInput } from "react-native";
// eslint-disable-next-line import/first
import { DeleteAccountDialog } from "../DeleteAccountDialog";

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

function texts(tree: { root: { findAllByType: (type: unknown) => Array<{ props: { children: unknown } }> } }) {
  return tree.root.findAllByType(Text).map((node) => [].concat(node.props.children as never).join(""));
}
function deleteButton(tree: { root: { findAll: (fn: (node: { props: Record<string, unknown> }) => boolean) => Array<{ props: Record<string, unknown> }> } }) {
  return tree.root.findAll((node) => node.props.label === "Eliminar cuenta" && typeof node.props.onPress === "function")[0];
}

async function render(onDeleted = jest.fn(async () => undefined)) {
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<DeleteAccountDialog visible onClose={jest.fn()} onDeleted={onDeleted} />); });
  await settle();
  return { tree: tree!, onDeleted };
}

describe("diálogo Eliminar tu cuenta", () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockPreview.mockReset();
    mockPreview.mockResolvedValue({ mustCancelPro: false, manageUrl: "https://darkmoney.company/settings", transfers: [{ workspaceName: "Casa", newOwnerName: "Ana" }] });
  });

  it("explica qué se borra, avisa qué espacio pasa a otra persona y el botón se enciende solo al escribir ELIMINAR", async () => {
    const { tree } = await render();
    const all = texts(tree).join("\n");
    expect(all).toContain("No se puede deshacer");
    expect(all).toContain("«Casa» no se borra: pasará a ser de Ana");
    expect(deleteButton(tree).props.disabled).toBe(true);
    act(() => tree.root.findByType(TextInput).props.onChangeText("elimina"));
    expect(deleteButton(tree).props.disabled).toBe(true);
    act(() => tree.root.findByType(TextInput).props.onChangeText("eliminar"));
    expect(deleteButton(tree).props.disabled).toBe(false);
  });

  it("al eliminar llama al servidor y luego a onDeleted (que borra el teléfono)", async () => {
    mockDelete.mockResolvedValue({ kind: "deleted" });
    const { tree, onDeleted } = await render();
    act(() => tree.root.findByType(TextInput).props.onChangeText("ELIMINAR"));
    await act(async () => { await (deleteButton(tree).props.onPress as () => void)(); });
    await settle();
    expect(mockDelete).toHaveBeenCalledWith("ELIMINAR");
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });

  it("un error se queda dentro del diálogo y no llama a onDeleted", async () => {
    mockDelete.mockResolvedValue({ kind: "error", message: "No pudimos eliminar tu cuenta." });
    const { tree, onDeleted } = await render();
    act(() => tree.root.findByType(TextInput).props.onChangeText("ELIMINAR"));
    await act(async () => { await (deleteButton(tree).props.onPress as () => void)(); });
    await settle();
    expect(texts(tree)).toContain("No pudimos eliminar tu cuenta.");
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("con Pro cobrándose (409) muestra «Primero cancela Pro»", async () => {
    mockDelete.mockResolvedValue({ kind: "cancel_pro_first", message: "Cancela Pro primero.", manageUrl: "https://darkmoney.company/settings" });
    const { tree } = await render();
    act(() => tree.root.findByType(TextInput).props.onChangeText("ELIMINAR"));
    await act(async () => { await (deleteButton(tree).props.onPress as () => void)(); });
    await settle();
    const all = texts(tree);
    expect(all).toContain("Primero cancela Pro");
    expect(all).toContain("Cancela Pro primero.");
  });

  it("si la vista previa ya dice que Pro se cobra, pide cancelarlo antes de pedir la palabra", async () => {
    mockPreview.mockResolvedValue({ mustCancelPro: true, manageUrl: "https://darkmoney.company/settings", transfers: [] });
    const { tree } = await render();
    expect(texts(tree)).toContain("Primero cancela Pro");
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
  });
});
