const { act, create } = require("react-test-renderer");
import { InteractionManager } from "react-native";
import { useToast } from "../useToast";

const mockShow = jest.fn();
jest.mock("../../components/DarkMoneyToast", () => ({ useDarkMoneyToast: () => ({ show: mockShow }) }));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), ImpactFeedbackStyle: { Light: "light" }, NotificationFeedbackType: { Success: "success", Error: "error", Warning: "warning" } }));

it("muestra inmediatamente la acción de deshacer aunque haya animaciones pendientes", () => {
  const delayed = jest.spyOn(InteractionManager, "runAfterInteractions").mockImplementation(() => ({ cancel: jest.fn(), then: jest.fn() } as any));
  let send!: ReturnType<typeof useToast>["showRichToast"];
  function Probe() { send = useToast().showRichToast; return null; }
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<Probe />); });
  const undo = jest.fn();
  act(() => send({ type: "delete", title: "Eliminado", onUndo: undo }));
  expect(mockShow).toHaveBeenCalledWith(expect.objectContaining({ title: "Eliminado", onUndo: undo }));
  expect(delayed).not.toHaveBeenCalled();
  act(() => tree!.unmount());
  delayed.mockRestore();
});
