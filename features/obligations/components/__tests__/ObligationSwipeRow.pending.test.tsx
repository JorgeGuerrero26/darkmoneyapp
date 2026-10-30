const { act, create } = require("react-test-renderer");
import { Text } from "react-native";
import { ObligationSwipeRow } from "../ObligationSwipeRow";

jest.mock("../../../../components/ui/SwipeActionRow", () => ({ SwipeActionRow: ({ children }: any) => children({ close: () => undefined, isOpen: () => false }) }));
const noop = () => undefined;
const obligation = { id: 1, title: "Préstamo", counterparty: "Contacto", status: "active", direction: "receivable", progressPercent: 20, pendingAmount: 100, currencyCode: "PEN" } as any;

it.each([false, true])("muestra el cambio por enviar en créditos y deudas con selección %s", (selectMode) => {
  const at = new Date(2026, 9, 14, 8, 56).toISOString();
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<ObligationSwipeRow obligation={obligation} pendingAt={at} selectMode={selectMode} onOpenDetail={noop} onPayment={noop} onDelete={noop} onAnalytics={noop} />); });
  const content = tree!.root.findAllByType(Text).map((node: any) => node.props.children).flat().map(String).join("|");
  expect(content).toContain("Por enviar · 8:56");
  act(() => tree!.unmount());
});
