const { act, create } = require("react-test-renderer");
import { Text } from "react-native";
import { DarkMoneyToast } from "../DarkMoneyToast";

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("../ui/SafeBlurView", () => ({ SafeBlurView: () => null }));

it("ofrece Ver y ejecuta la acción del aviso", () => {
  const view = jest.fn();
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<DarkMoneyToast config={{ type: "info", title: "Guardado", onView: view }} onHide={jest.fn()} />); });
  const label = tree!.root.findAllByType(Text).find((node: any) => node.props.children === "Ver");
  expect(label).toBeDefined();
  const action = tree!.root.findAll((node: any) => node.props.accessibilityRole === "button")[0];
  act(() => action.props.onPress());
  expect(view).toHaveBeenCalledTimes(1);
  act(() => tree!.unmount());
});
