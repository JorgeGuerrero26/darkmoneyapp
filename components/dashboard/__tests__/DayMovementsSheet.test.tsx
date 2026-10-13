import { Text, TouchableOpacity } from "react-native";
import { DayMovementsSheet } from "../DayMovementsSheet";
import type { DashboardDayMovement } from "../../../services/queries/dashboard-day";
import { formatCurrency } from "../../ui/AmountDisplay";

const { act, create } = require("react-test-renderer");
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock("../../ui/useDismissibleSheet", () => ({ useDismissibleSheet: () => ({ backdropStyle: {}, sheetStyle: {}, panHandlers: {} }) }));
jest.mock("../../../services/queries/attachments", () => ({ useMovementAttachmentCountsQuery: () => ({ data: { 1: 2 } }) }));

const row = (id: number, patch: Partial<DashboardDayMovement> = {}): DashboardDayMovement => ({
  id, movementType: "expense", status: "posted", occurredAt: "2026-09-30T17:00:00Z", description: `Pago ${id}`,
  sourceAmount: 10, destinationAmount: null, sourceAccountId: 1, destinationAccountId: null,
  categoryId: 1, spendTypeId: null, counterpartyId: null, ...patch,
});
const props = {
  visible: true, dayStart: new Date(2026, 8, 30), dayEnd: new Date(2026, 8, 30, 23, 59, 59), mode: "all" as const,
  ctx: { accountCurrencyMap: new Map([[1, "PEN"], [2, "USD"], [3, "EUR"]]), exchangeRateMap: new Map([["USD:PEN", 3.75]]), displayCurrency: "PEN", baseCurrency: "PEN" },
  categoryMap: new Map([[1, "Transporte"]]), accountMap: new Map([[1, "Principal"], [2, "Dólares"]]), workspaceId: 8,
};
describe("daily movement sheet", () => {
  let tree: ReturnType<typeof create>;
  const onClose = jest.fn(), onMovementPress = jest.fn(), onRetry = jest.fn();
  const texts = () => tree.root.findAllByType(Text).map((node: any) => [node.props.children].flat(Infinity).join(""));
  function render(extra = {}) {
    act(() => { tree = create(<DayMovementsSheet {...props} movements={[row(1), row(2, { sourceAccountId: 2, sourceAmount: 4 }), row(3, { sourceAccountId: 3 }), row(4, { movementType: "transfer", sourceAmount: 500, destinationAmount: 100, destinationAccountId: 2 })]} onClose={onClose} onMovementPress={onMovementPress} onRetry={onRetry} {...extra} />); });
  }
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => act(() => tree?.unmount()));

  test("groups rows, keeps native currency and labels partial totals", () => {
    render();
    expect(texts()).toEqual(expect.arrayContaining(["Ingresos (0)", "Gastos (3)", "Transferencias (1)", "Ahorro del día (parcial)", formatCurrency(4, "USD"), formatCurrency(25, "PEN")]));
    expect(texts().join(" ")).toContain("1 sin conversión");
    expect(texts()).toContain(formatCurrency(-25, "PEN")); // Transfers do not change savings.
    const selected = tree.root.findAllByType(TouchableOpacity).find((node: any) => node.findAllByType(Text).some((text: any) => text.props.children === "Pago 1"));
    act(() => selected.props.onPress()); expect(onMovementPress).toHaveBeenCalledWith(1);
  });
  test("loading never displays a zero or old summary as the result", () => {
    render({ loading: true });
    expect(texts()).toContain("Cargando el día completo…");
    expect(texts().join(" ")).not.toContain("Ahorro del día");
    expect(texts()).not.toContain("Pago 1");
  });
  test("an error hides stale money and retries without any financial action", () => {
    render({ error: "No se pudo cargar el día completo." });
    expect(texts()).toContain("No se pudo cargar el día completo.");
    expect(texts().join(" ")).not.toContain("Ahorro del día");
    const retry = tree.root.findAllByType(TouchableOpacity).find((node: any) => node.props.onPress === onRetry);
    act(() => retry.props.onPress()); expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onMovementPress).not.toHaveBeenCalled();
  });
  test("mode expense shows only its group and subtotal", () => {
    render({ mode: "expense" });
    expect(texts()).toContain("Gastos (3)");
    expect(texts().join(" ")).not.toContain("Transferencias (1)");
    expect(texts().join(" ")).not.toContain("Ingresos (0)");
  });
  test("empty days and Peru times are explicit", () => {
    render({ movements: [] });
    expect(texts().filter((value: string) => value === "Nada que mostrar este día.")).toHaveLength(3);
    act(() => tree.update(<DayMovementsSheet {...props} movements={[row(1, { occurredAt: "2026-10-01T04:59:59Z" })]} onClose={onClose} onMovementPress={onMovementPress} />));
    expect(texts().join(" ")).toContain("23:59");
  });
});
