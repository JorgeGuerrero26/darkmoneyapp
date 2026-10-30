const { act, create } = require("react-test-renderer");
import { Text } from "react-native";

import type { AccountSummary } from "../../../types/domain";
import { AccountCard } from "../AccountCard";

jest.mock("../../ui/SwipeActionRow", () => ({
  SwipeActionRow: ({ children }: { children: (actions: { close: () => void; isOpen: () => boolean }) => unknown }) =>
    children({ close: () => undefined, isOpen: () => false }),
}));

const account: AccountSummary = {
  id: 1, workspaceId: 1, name: "Cuenta Principal", type: "bank", currencyCode: "PEN",
  openingBalance: 0, currentBalance: 15, includeInNetWorth: true, lastActivity: "",
  color: "#123456", icon: "bank", isArchived: false,
};

const text = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text)
  .map((node: { props: { children: unknown } }) => node.props.children).flat().map(String).join("|");

describe("AccountCard: pendiente de envío", () => {
  let tree: ReturnType<typeof create>;
  afterEach(() => act(() => tree?.unmount()));

  it("no muestra el indicador si la cuenta ya se envió", () => {
    act(() => { tree = create(<AccountCard account={account} />); });
    expect(text(tree)).not.toContain("Por enviar");
  });

  it.each([false, true])("muestra la hora pendiente con gestos (archivada: %s)", (isArchived) => {
    const at = new Date(2026, 9, 14, 8, 56).toISOString();
    act(() => { tree = create(<AccountCard account={{ ...account, isArchived }} pendingAt={at} onArchive={() => undefined} onRestore={() => undefined} />); });
    expect(text(tree)).toContain("Por enviar · 8:56");
  });
});
