import React from "react";
import { DetectedMovementCard, DuplicateDecision } from "../DetectedMovementCard";
import { DetectedMovementReviewSheet } from "../DetectedMovementReviewSheet";
import { Button } from "../../../../components/ui/Button";
import type { DetectedMovementReview } from "../../hooks/useDetectedMovementReview";
import type { DetectedMovementSuggestion } from "../../../../services/queries/notification-detection";
import type { MovementRecord } from "../../../../types/domain";
import type { DetectionDraft } from "../../lib/review-draft";

const { create, act } = require("react-test-renderer");
jest.mock("../../../../components/ui/ResourceCard", () => ({ ResourceCard: ({ trailing, footer }: any) => footer ? require("react").createElement(require("react-native").View, null, require("react").createElement(require("react-native").View, { testID: "detection-header" }, trailing), footer) : null }));
jest.mock("../../../../components/ui/DetailFieldRow", () => ({ DetailFieldRow: () => null }));
jest.mock("../../../../components/ui/DetailActionBar", () => ({ DetailActionBar: ({ secondary }: any) => secondary ? require("react").createElement(require("../../../../components/ui/Button").Button, { label: secondary.label, onPress: secondary.onPress, disabled: secondary.disabled }) : null }));
jest.mock("../../../../components/ui/BottomSheet", () => ({ BottomSheet: ({ footer }: any) => footer ?? null }));
jest.mock("../../../../components/ui/Button", () => ({ Button: () => null }));
jest.mock("../../../../components/ui/SearchableSelectSheet", () => ({ SearchableSelectSheet: () => null }));
jest.mock("../../../../components/ui/DateTimeSheet", () => ({ DateTimeSheet: () => null }));
jest.mock("../../../../components/ui/InlineFormSheet", () => ({ InlineFormSheet: () => null }));

const candidate = { id: 22, description: "Compra manual", movementType: "expense", sourceAmount: 15, occurredAt: "2026-10-07T18:00:00Z" } as MovementRecord;

it.each([[false, false], [true, false], [false, true], [true, true]])("Omitir aparece solo en la cabecera (ocupado: %s, duplicado: %s)", async (busy, duplicate) => {
  const onDiscard = jest.fn();
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(DetectedMovementCard, {
    suggestion: { currencyCode: "PEN", movementType: "expense", status: "pending", occurredAt: candidate.occurredAt } as DetectedMovementSuggestion,
    draft: { movementType: "expense", amount: "15.00", description: "Compra", date: "2026-10-07", time: "13:00", accountId: null, destinationAccountId: null, destinationAmount: "", fxRate: "", categoryId: null } satisfies DetectionDraft,
    count: 1, accounts: [], categories: [], readyToSave: false, missing: ["Elige una cuenta"], busy, error: null,
    onReview: jest.fn(), onSave: jest.fn(), onDiscard, onViewAll: jest.fn(),
    duplicate: duplicate ? { candidate, currency: "PEN", busy, onOpen: jest.fn(), onSame: jest.fn(), onSaveAnyway: jest.fn(), onDiscard } : null,
  })); });
  const button = renderer!.root.findAllByType(Button).find((node: any) => node.props.label === "Omitir");
  expect(button).toBeDefined();
  expect(renderer!.root.findAllByType(Button).filter((node: any) => node.props.label === "Omitir")).toHaveLength(1);
  expect(renderer!.root.findByProps({ testID: "detection-header" }).findAllByType(Button)).toContain(button);
  expect(button.props.disabled).toBe(busy);
  if (!busy) { button.props.onPress(); expect(onDiscard).toHaveBeenCalledTimes(1); }
  await act(async () => renderer!.unmount());
});

it("se puede omitir un posible duplicado sin elegir Es el mismo ni Guardar igual", async () => {
  const onDiscard = jest.fn(), onSame = jest.fn(), onSaveAnyway = jest.fn();
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(DuplicateDecision, { candidate, currency: "PEN", busy: false, onOpen: jest.fn(), onSame, onSaveAnyway, onDiscard })); });
  renderer!.root.findAllByType(Button).find((node: any) => node.props.label === "Omitir").props.onPress();
  expect(onDiscard).toHaveBeenCalledTimes(1);
  expect(onSame).not.toHaveBeenCalled(); expect(onSaveAnyway).not.toHaveBeenCalled();
  await act(async () => renderer!.unmount());
});

it.each([null, candidate])("la revisión también permite Omitir con y sin duplicado", async duplicateCandidate => {
  const discard = jest.fn();
  const review = { activeAccounts: [], categories: [], missing: [], date: "2026-10-07", time: "13:00", movementType: "expense", initialized: true, busy: false, discard, duplicateCandidate } as unknown as DetectedMovementReview;
  let renderer: ReturnType<typeof create>;
  await act(async () => { renderer = create(React.createElement(DetectedMovementReviewSheet, { visible: true, onClose: jest.fn(), review })); });
  renderer!.root.findAllByType(Button).find((node: any) => node.props.label === "Omitir").props.onPress();
  expect(discard).toHaveBeenCalledTimes(1);
  await act(async () => renderer!.unmount());
});
