import React from "react";
import { DetectedMovementInbox } from "../DetectedMovementInbox";
import { QuickDetectedMovementEntry } from "../../../../components/domain/QuickDetectedMovementEntry";
import type { DetectedMovementSuggestion } from "../../../../services/queries/notification-detection";

const { create, act } = require("react-test-renderer");
const mockRefetch = jest.fn();
const mockAccessRefetch = jest.fn();
const mockSetQueryData = jest.fn();
let mockResolveMany: (ids: number[]) => void;
let mockAccess = { data: true as boolean | undefined, isError: false, isPending: false, refetch: mockAccessRefetch };
let mockQuery = { data: [] as DetectedMovementSuggestion[], isError: false, isPending: false, refetch: mockRefetch };
jest.mock("expo-router", () => ({ useFocusEffect: () => {} }));
jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ setQueryData: mockSetQueryData }) }));
jest.mock("../../../../services/queries/email-detection-access", () => ({ useEmailDetectionProAccessQuery: () => mockAccess }));
jest.mock("../../../../services/queries/notification-detection", () => ({
  usePendingDetectedMovementsQuery: () => mockQuery,
  useNotificationDetectionSettingsQuery: () => ({ data: [] }),
}));
jest.mock("../../hooks/useDetectionListOmissions", () => ({ useDetectionListOmissions: (_user: unknown, _workspace: unknown, _pending: unknown, onResolved: (ids: number[]) => void) => { mockResolveMany = onResolved; return { confirmation: null, busy: false, omittingId: null, error: null, omitOne: jest.fn(), requestOmitAll: jest.fn(), confirmOmitAll: jest.fn(), cancel: jest.fn() }; } }));
jest.mock("../../../../components/domain/QuickDetectedMovementEntry", () => ({
  QuickDetectedMovementEntry: ({ suggestionId, previewEnabled }: { suggestionId: number; previewEnabled: boolean }) => previewEnabled ? require("react").createElement(require("react-native").Text, { testID: "selected-detection" }, String(suggestionId)) : null,
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
  expect(renderer.root.findAllByProps({ testID: "selected-detection" })).toHaveLength(0);
  expect(renderer.toJSON().props.style).toBeUndefined();
});
it("no muestra la tarjeta a usuarios sin PRO aunque haya datos en caché", async () => {
  mockAccess.data = false;
  mockQuery.data = [receipt(534, "2026-10-09T01:23:10Z")];
  await render();
  expect(renderer.root.findAllByProps({ testID: "selected-detection" })).toHaveLength(0);
  expect(renderer.root.findByType(QuickDetectedMovementEntry).props.visible).toBe(false);
});

it("conserva el controlador y cierra el Modal del último pendiente en vez de desmontarlo", async () => {
  const first = receipt(534, "2026-10-09T01:23:10Z");
  mockQuery.data = [first];
  await render();
  const entry = renderer.root.findByType(QuickDetectedMovementEntry);
  const card = entry.props.renderPreview({ suggestion: first });
  await act(async () => card.props.onReview());
  expect(entry.props.visible).toBe(true);
  // React Query quita la detección antes de que la mutación invoque onResolved.
  mockQuery.data = [];
  await act(async () => renderer.update(React.createElement(DetectedMovementInbox, props)));
  expect(renderer.root.findByType(QuickDetectedMovementEntry)).toBe(entry);
  expect(entry.props.suggestionId).toBe(first.id);
  expect(entry.props.visible).toBe(true);
  await act(async () => entry.props.onResolved(first.id, "registered"));
  expect(renderer.root.findByType(QuickDetectedMovementEntry)).toBe(entry);
  expect(entry.props.visible).toBe(false);
  expect(entry.props.previewEnabled).toBe(false);
  expect(renderer.root.findAllByProps({ testID: "selected-detection" })).toHaveLength(0);
  expect(renderer.toJSON().props.style).toBeUndefined();
});

it("avanza a la siguiente detección sin desmontar una revisión abierta durante la actualización de caché", async () => {
  const first = receipt(534, "2026-10-09T01:23:10Z"), next = receipt(533, "2026-10-08T01:23:10Z");
  mockQuery.data = [first, next];
  await render();
  const entry = renderer.root.findByType(QuickDetectedMovementEntry);
  await act(async () => entry.props.renderPreview({ suggestion: first }).props.onReview());
  mockQuery.data = [next];
  await act(async () => renderer.update(React.createElement(DetectedMovementInbox, props)));
  expect(entry.props.suggestionId).toBe(first.id);
  await act(async () => entry.props.onResolved(first.id, "discarded"));
  expect(renderer.root.findByType(QuickDetectedMovementEntry)).toBe(entry);
  expect(entry.props.suggestionId).toBe(next.id);
  expect(entry.props.visible).toBe(true);
});

it("guardar directamente el último pendiente no presenta una ventana al quedar vacío", async () => {
  mockQuery.data = [receipt(534, "2026-10-09T01:23:10Z")];
  await render();
  const entry = renderer.root.findByType(QuickDetectedMovementEntry);
  mockQuery.data = [];
  await act(async () => renderer.update(React.createElement(DetectedMovementInbox, props)));
  expect(renderer.root.findByType(QuickDetectedMovementEntry)).toBe(entry);
  expect(entry.props.visible).toBe(false);
  expect(entry.props.previewEnabled).toBe(false);
});

it("la lista permite omitir sin cambiar a revisión ni desmontar el controlador", async () => {
  const first = receipt(534, "2026-10-09T01:23:10Z"), next = receipt(533, "2026-10-08T01:23:10Z");
  mockQuery.data = [first, next];
  await render();
  const entry = renderer.root.findByType(QuickDetectedMovementEntry);
  await act(async () => entry.props.renderPreview({ suggestion: first }).props.onViewAll());
  expect(entry.props.list).toBeDefined();
  expect(entry.props.list.props.onOmit).toEqual(expect.any(Function));
  expect(entry.props.listHeaderAction.props.label).toBe("Omitir todos");
  expect(entry.props.listOverlay.props.inline).toBe(true);
  expect(renderer.root.findByType(QuickDetectedMovementEntry)).toBe(entry);
});

it("omitir todos cierra la lista vacía conservando la ventana nativa montada", async () => {
  const first = receipt(534, "2026-10-09T01:23:10Z");
  mockQuery.data = [first];
  await render();
  const entry = renderer.root.findByType(QuickDetectedMovementEntry);
  await act(async () => entry.props.renderPreview({ suggestion: first }).props.onViewAll());
  mockQuery.data = [];
  await act(async () => renderer.update(React.createElement(DetectedMovementInbox, props)));
  await act(async () => mockResolveMany([first.id]));
  expect(renderer.root.findByType(QuickDetectedMovementEntry)).toBe(entry);
  expect(entry.props.visible).toBe(false);
  expect(entry.props.previewEnabled).toBe(false);
});
