const { act, create } = require("react-test-renderer");
import { Text } from "react-native";
import { BudgetSwipeRow } from "../BudgetSwipeRow";
import { SubscriptionSwipeRow } from "../../../subscriptions/components/SubscriptionSwipeRow";
import { RecurringIncomeSwipeRow } from "../../../recurring-income/components/RecurringIncomeSwipeRow";

jest.mock("../../../../components/ui/SwipeActionRow", () => ({
  SwipeActionRow: ({ children }: any) => children({ close: () => undefined, isOpen: () => false }),
}));
jest.mock("../../../../components/domain/BudgetCard", () => ({ BudgetCard: ({ pendingAt }: any) => require("react").createElement(require("react-native").Text, null, pendingAt) }));
jest.mock("../../../../components/domain/SubscriptionCard", () => ({ SubscriptionCard: ({ pendingAt }: any) => require("react").createElement(require("react-native").Text, null, pendingAt) }));
jest.mock("../../../../components/domain/RecurringIncomeCard", () => ({ RecurringIncomeCard: ({ pendingAt }: any) => require("react").createElement(require("react-native").Text, null, pendingAt) }));

const noop = () => undefined;
const at = "2026-10-14T13:56:00.000Z";
const data = { id: 1, status: "active" } as any;

it.each([false, true])("transmite el indicador en suscripciones e ingresos con selección %s", (selectMode) => {
  let subscription: ReturnType<typeof create>;
  let income: ReturnType<typeof create>;
  act(() => {
    subscription = create(<SubscriptionSwipeRow subscription={data} pendingAt={at} onPress={noop} onDelete={noop} onTogglePause={noop} onPay={noop} selectMode={selectMode} />);
    income = create(<RecurringIncomeSwipeRow item={data} pendingAt={at} onPress={noop} onDelete={noop} onConfirmArrival={noop} selectMode={selectMode} />);
  });
  expect(subscription!.root.findByType(Text).props.children).toBe(at);
  expect(income!.root.findByType(Text).props.children).toBe(at);
  act(() => { subscription!.unmount(); income!.unmount(); });
});

it("transmite el indicador en presupuestos", () => {
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<BudgetSwipeRow budget={data} pendingAt={at} onPress={noop} onDelete={noop} onDuplicate={noop} />); });
  expect(tree!.root.findByType(Text).props.children).toBe(at);
  act(() => tree!.unmount());
});
