import React from "react";
import { DetectedMovementsList, type DetectionListItem } from "../DetectedMovementsList";
import { ResourceSectionList } from "../../../../components/ui/ResourceSectionList";
import { ResourceCard } from "../../../../components/ui/ResourceCard";
import { SwipeActionRow } from "../../../../components/ui/SwipeActionRow";

const { create, act } = require("react-test-renderer");
jest.mock("../../../../components/ui/ResourceSectionList", () => ({ ResourceSectionList: ({ sections, renderItem }: any) => require("react").createElement(require("react-native").View, null, sections[0].data.map((item: any) => require("react").createElement(require("react-native").View, { key: item.suggestion.id }, renderItem({ item })))) }));
jest.mock("../../../../components/ui/ResourceCard", () => ({ ResourceCard: ({ trailing }: any) => trailing }));
const mockClose = jest.fn(), mockIsOpen = jest.fn(() => false);
jest.mock("../../../../components/ui/SwipeActionRow", () => ({ SwipeActionRow: ({ children }: any) => children({ close: mockClose, isOpen: mockIsOpen }) }));
jest.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: require("react-native").View }));
const item = { suggestion: { id: 7, currencyCode: "PEN", appLabel: "Yape", packageName: "email:inbound", occurredAt: "2026-10-09T12:00:00Z" }, draft: { description: "Rappi", movementType: "expense", amount: "41.32", date: "2026-10-09", time: "07:00" }, warning: null } as DetectionListItem;

beforeEach(() => { jest.clearAllMocks(); mockIsOpen.mockReturnValue(false); });

it("omitir por swipe actúa sobre la fila sin abrir la revisión y bloquea otra acción en curso", async () => {
  const onOmit = jest.fn(), onSelect = jest.fn();
  let renderer: ReturnType<typeof create>;
  const props = { items: [item], onOmit, onSelect, busy: false, omittingId: null, error: null };
  await act(async () => { renderer = create(React.createElement(DetectedMovementsList, props)); });
  renderer!.root.findByType(SwipeActionRow).props.rightAction.onPress();
  expect(onOmit).toHaveBeenCalledWith(7);
  expect(onSelect).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType(ResourceSectionList)).toHaveLength(1);
  await act(async () => renderer!.update(React.createElement(DetectedMovementsList, { ...props, busy: true, omittingId: 7 })));
  expect(renderer!.root.findByType(SwipeActionRow).props.rightAction).toBeNull();
  expect(renderer!.root.findByType(ResourceCard).props.disabled).toBe(true);
  await act(async () => renderer!.unmount());
});

it("tocar una fila abierta cierra el swipe y solo abre la revisión cuando está cerrada", async () => {
  const onSelect = jest.fn();
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(DetectedMovementsList, { items: [item], onOmit: jest.fn(), onSelect, busy: false, omittingId: null, error: null })); });
  mockIsOpen.mockReturnValue(true);
  renderer!.root.findByType(ResourceCard).props.onPress();
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(onSelect).not.toHaveBeenCalled();
  mockIsOpen.mockReturnValue(false);
  renderer!.root.findByType(ResourceCard).props.onPress();
  expect(onSelect).toHaveBeenCalledWith(7);
  await act(async () => renderer!.unmount());
});
