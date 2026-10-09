import React from "react";
import { DetectedMovementsList, type DetectionListItem } from "../DetectedMovementsList";
import { ResourceSectionList } from "../../../../components/ui/ResourceSectionList";
import { ResourceCard } from "../../../../components/ui/ResourceCard";
import { Button } from "../../../../components/ui/Button";

const { create, act } = require("react-test-renderer");
jest.mock("../../../../components/ui/ResourceSectionList", () => ({ ResourceSectionList: ({ sections, renderItem }: any) => require("react").createElement(require("react-native").View, null, sections[0].data.map((item: any) => require("react").createElement(require("react-native").View, { key: item.suggestion.id }, renderItem({ item })))) }));
jest.mock("../../../../components/ui/ResourceCard", () => ({ ResourceCard: ({ trailing }: any) => trailing }));
jest.mock("../../../../components/ui/Button", () => ({ Button: () => null }));
const item = { suggestion: { id: 7, currencyCode: "PEN", appLabel: "Yape", packageName: "email:inbound", occurredAt: "2026-10-09T12:00:00Z" }, draft: { description: "Rappi", movementType: "expense", amount: "41.32", date: "2026-10-09", time: "07:00" }, warning: null } as DetectionListItem;

it("Omitir actúa sobre la fila sin abrir su revisión y bloquea otra acción en curso", async () => {
  const onOmit = jest.fn(), onSelect = jest.fn(), stopPropagation = jest.fn();
  let renderer: ReturnType<typeof create>;
  const props = { items: [item], onOmit, onSelect, busy: false, omittingId: null, error: null };
  await act(async () => { renderer = create(React.createElement(DetectedMovementsList, props)); });
  renderer!.root.findByType(Button).props.onPress({ stopPropagation });
  expect(stopPropagation).toHaveBeenCalledTimes(1);
  expect(onOmit).toHaveBeenCalledWith(7);
  expect(onSelect).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType(ResourceSectionList)).toHaveLength(1);
  await act(async () => renderer!.update(React.createElement(DetectedMovementsList, { ...props, busy: true, omittingId: 7 })));
  expect(renderer!.root.findByType(Button).props.disabled).toBe(true);
  expect(renderer!.root.findByType(Button).props.loading).toBe(true);
  expect(renderer!.root.findByType(ResourceCard).props.disabled).toBe(true);
  await act(async () => renderer!.unmount());
});
