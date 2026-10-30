const { act, create } = require("react-test-renderer");
import { UndoBanner } from "../UndoBanner";
import { TOAST_DURATION_MS } from "../../../constants/config";

const mockShow = jest.fn();
jest.mock("../../../hooks/useToast", () => ({ useToast: () => ({ showRichToast: mockShow }) }));

it("ofrece deshacer durante el plazo común de confirmación", () => {
  const undo = jest.fn();
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<UndoBanner visible message="Eliminado" onUndo={undo} />); });
  expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ duration: TOAST_DURATION_MS, title: "Eliminado" }));
  act(() => mockShow.mock.calls[0][0].onUndo());
  expect(undo).toHaveBeenCalledTimes(1);
  act(() => tree!.unmount());
});
