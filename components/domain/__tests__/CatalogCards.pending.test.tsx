const { act, create } = require("react-test-renderer");
import { Text } from "react-native";
import { ContactCard } from "../ContactCard";
import { CategorySwipeRow } from "../../../features/categories/components/CategorySwipeRow";

jest.mock("../../ui/SwipeActionRow", () => ({ SwipeActionRow: ({ children }: any) => children({ close: () => undefined, isOpen: () => false }) }));
const noop = () => undefined;
const at = new Date(2026, 9, 14, 8, 56).toISOString();
const content = (tree: ReturnType<typeof create>) => tree.root.findAllByType(Text)
  .map((node: { props: { children: unknown } }) => node.props.children).flat().map(String).join("|");

it.each([false, true])("muestra el indicador en categorías con selección %s", (selectMode) => {
  const category = { id: 1, name: "Comida", kind: "expense", isActive: true, isSystem: false, movementCount: 0 } as any;
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<CategorySwipeRow category={category} pendingAt={at} kindLabel="Gasto" canDelete onPress={noop} onToggle={noop} onDelete={noop} selectMode={selectMode} />); });
  expect(content(tree!)).toContain("Por enviar · 8:56");
  act(() => tree!.unmount());
});

it.each([false, true])("muestra el indicador en contactos con selección %s", (selectMode) => {
  const contact = { id: 1, name: "Contacto", type: "person", isArchived: false } as any;
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<ContactCard contact={contact} pendingAt={at} canDelete onPress={noop} onArchive={noop} onDelete={noop} onRestore={noop} selectMode={selectMode} />); });
  expect(content(tree!)).toContain("Por enviar · 8:56");
  act(() => tree!.unmount());
});
