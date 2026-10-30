const { act, create } = require("react-test-renderer");
import { Text } from "react-native";
import { SpendTypeSwipeRow } from "../SpendTypeSwipeRow";

jest.mock("../../../../components/ui/SwipeActionRow", () => ({ SwipeActionRow: ({ children }: any) => children({ close: () => undefined, isOpen: () => false }) }));

it("marca el tipo de gasto que espera envío", () => {
  const at = new Date(2026, 9, 14, 8, 56).toISOString();
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<SpendTypeSwipeRow item={{ id: 1, name: "Necesidades", isActive: true } as any} pendingAt={at} categoryCount={0} onPress={() => undefined} onDelete={() => undefined} />); });
  const content = tree!.root.findAllByType(Text).map((node: any) => node.props.children).flat().map(String).join("|");
  expect(content).toContain("Por enviar · 8:56");
  act(() => tree!.unmount());
});
