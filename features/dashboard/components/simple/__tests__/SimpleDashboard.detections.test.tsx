const { act, create } = require("react-test-renderer");
import { Text } from "react-native";
import { SimpleDashboard } from "../SimpleDashboard";

it("muestra cuentas y resumen sin un bloque de detecciones en el modo simple", () => {
  const noop = () => {};
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<SimpleDashboard
    now={new Date(2026, 9, 30)} currency="PEN" currencyOptions={[]} onCurrencyChange={noop}
    accountTotal={100} accounts={[{ id: 1, name: "Cuenta principal", amount: 100, nativeAmount: 100, nativeCurrency: "PEN" }]}
    period="month" onPeriodChange={noop} income={0} expense={0}
    budgets={[]} agenda={[]} receivables={{ count: 0, peopleCount: 0, firstDate: null, total: null }} categories={[]}
    onOpenAccount={noop} onOpenAccounts={noop} onOpenBudgets={noop} onOpenAgenda={noop} onOpenReceivables={noop} onOpenAdvanced={noop}
  />); });
  const labels = tree!.root.findAllByType(Text).map((node: any) => typeof node.props.children === "string" ? node.props.children : "");
  expect(labels.indexOf("Cuenta principal")).toBeLessThan(labels.indexOf("Entró"));
  expect(labels).not.toContain("Detección pendiente");
  act(() => tree!.unmount());
});
