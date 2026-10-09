import React from "react";
import { DetectedMovementInbox } from "../DetectedMovementInbox";
import type { DetectedMovementSuggestion } from "../../../../services/queries/notification-detection";

const { create, act } = require("react-test-renderer");
const mockRefetch = jest.fn();
const mockAccessRefetch = jest.fn();
const mockSetQueryData = jest.fn();
let mockAccess = { data: true as boolean | undefined, isError: false, isPending: false, refetch: mockAccessRefetch };
let mockQuery = { data: [] as DetectedMovementSuggestion[], isError: false, isPending: false, refetch: mockRefetch };
jest.mock("expo-router", () => ({ useFocusEffect: () => {} }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ setQueryData: mockSetQueryData }) }));
jest.mock("../../../../services/queries/email-detection-access", () => ({ useEmailDetectionProAccessQuery: () => mockAccess }));
jest.mock("../../../../services/queries/notification-detection", () => ({
  usePendingDetectedMovementsQuery: () => mockQuery,
  useNotificationDetectionSettingsQuery: () => ({ data: [] }),
}));
jest.mock("../../../../components/domain/QuickDetectedMovementEntry", () => ({
  QuickDetectedMovementEntry: ({ suggestionId }: { suggestionId: number }) => require("react").createElement(require("react-native").Text, { testID: "selected-detection" }, String(suggestionId)),
}));

function receipt(id: number, createdAt: string): DetectedMovementSuggestion {
  return { id, createdAt, updatedAt: createdAt, userId: "tester", workspaceId: 1,
    status: "pending", amount: 15, currencyCode: "PEN", movementType: "expense",
    description: "Yape", occurredAt: createdAt, packageName: "email:inbound", appLabel: "Yape",
    financialAppKey: "yape", metadata: {}, confidence: "high", dedupeKey: String(id),
    notificationKey: null, movementId: null };
}
const props = { userId: "tester", workspaceId: 1, accounts: [], categories: [], privacyMode: false };
let renderer: ReturnType<typeof create>;
beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = { data: [], isError: false, isPending: false, refetch: mockRefetch };
  mockAccess = { data: true, isError: false, isPending: false, refetch: mockAccessRefetch };
});
afterEach(async () => { if (renderer) await act(async () => renderer.unmount()); });
async function render() { await act(async () => { renderer = create(React.createElement(DetectedMovementInbox, props)); }); }

it("presenta la detección nueva antes de pendientes antiguos de la caché", async () => {
  mockQuery.data = [receipt(13, "2026-05-14T22:01:15Z"), receipt(534, "2026-10-09T01:23:10Z")];
  await render();
  expect(renderer.root.findByProps({ testID: "selected-detection" }).props.children).toBe("534");
  expect(mockQuery.data[0].id).toBe(13);
});
it("muestra el error de consulta y permite reintentar", async () => {
  mockQuery.isError = true;
  await render();
  expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toBe("No pudimos cargar los movimientos por revisar");
  await act(async () => renderer.root.findByProps({ label: "Reintentar" }).props.onPress());
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});
it("un fallo al verificar PRO se muestra y reintenta la verificación", async () => {
  mockAccess = { ...mockAccess, data: undefined, isError: true };
  await render();
  expect(renderer.root.findByProps({ accessibilityRole: "alert" }).props.children).toBe("No pudimos verificar tu acceso PRO");
  await act(async () => renderer.root.findByProps({ label: "Reintentar" }).props.onPress());
  expect(mockAccessRefetch).toHaveBeenCalledTimes(1);
  expect(mockRefetch).not.toHaveBeenCalled();
});
it("la carga tiene feedback mientras una respuesta vacía no deja hueco", async () => {
  mockQuery.isPending = true;
  await render();
  expect(JSON.stringify(renderer.toJSON())).toContain("Buscando movimientos por revisar");
  mockQuery.isPending = false;
  await act(async () => renderer.update(React.createElement(DetectedMovementInbox, props)));
  expect(renderer.toJSON()).toBeNull();
});
it("no muestra la tarjeta a usuarios sin PRO aunque haya datos en caché", async () => {
  mockAccess.data = false;
  mockQuery.data = [receipt(534, "2026-10-09T01:23:10Z")];
  await render();
  expect(renderer.toJSON()).toBeNull();
});
