const { act, create } = require("react-test-renderer");
import { Text } from "react-native";

import type { MovementRecord } from "../../../types/domain";
import { MovementRow } from "../MovementRow";

const movement: MovementRecord = {
  id: 1, workspaceId: 1, movementType: "expense", status: "posted", description: "Taxi", category: "Transporte",
  counterparty: "", occurredAt: "2026-10-14T13:56:00.000Z", sourceAccountId: 1, sourceAccountName: "Cuenta Principal",
  sourceCurrencyCode: "PEN", sourceAmount: 15, destinationAccountId: null, destinationAccountName: null, destinationAmount: null,
};

const texts = (tree: { root: { findAllByType: (t: unknown) => Array<{ props: { children: unknown } }> } }) =>
  tree.root.findAllByType(Text).map((node) => node.props.children).flat().map(String).join("|");

describe("MovementRow: marcador de pendiente de envío", () => {
  let tree: ReturnType<typeof create>;
  afterEach(() => act(() => tree?.unmount()));

  it("una fila ya enviada no dice nada de enviar", () => {
    act(() => { tree = create(<MovementRow movement={movement} baseCurrencyCode="PEN" />); });
    expect(texts(tree)).not.toContain("Por enviar");
  });

  it("una fila guardada solo en el teléfono dice 'Por enviar' con la hora en que se guardó", () => {
    // Una hora local fija, sin depender de la zona horaria de quien corra la prueba.
    const at = new Date(2026, 9, 14, 8, 56).toISOString();
    act(() => { tree = create(<MovementRow movement={movement} baseCurrencyCode="PEN" pendingAt={at} />); });
    expect(texts(tree)).toContain("Por enviar");
    expect(texts(tree)).toContain("8:56");
    expect(texts(tree)).toContain("Taxi");
  });
});
