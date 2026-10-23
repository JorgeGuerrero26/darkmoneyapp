import React from "react";
import { Text } from "react-native";
import { QuickDetectedMovementEntry } from "../../../../components/domain/QuickDetectedMovementEntry";
import { useDetectedMovementReview, type DetectedMovementReview } from "../useDetectedMovementReview";
import type { AccountSummary, CategorySummary, ExchangeRateSummary, MovementRecord } from "../../../../types/domain";
import type { DetectedMovementSuggestion, NotificationDetectionAppSetting } from "../../../../services/queries/notification-detection";
import type { LearningMovement } from "../../lib/personal-learning";

const { create, act } = require("react-test-renderer");
const mockCreate = jest.fn();
const mockUndo = jest.fn().mockResolvedValue({});
const mockSplit = jest.fn();
const mockDelete = jest.fn();
const mockMark = jest.fn().mockResolvedValue({});
const mockDuplicate = jest.fn().mockResolvedValue(null);
const mockCounts = jest.fn();
const mockDuplicateAi = jest.fn();
let mockProAccess = false;
const mockResolved = jest.fn();
const mockAccounts = [{ id: 1, name: "Principal", currencyCode: "PEN", isArchived: false }] as AccountSummary[];
const mockCategories = [{ id: 2, name: "Compras", kind: "expense", isActive: true }] as CategorySummary[];
let mockSnapshot = { accounts: mockAccounts, categories: mockCategories, counterparties: [], exchangeRates: [] as ExchangeRateSummary[], budgets: [], subscriptions: [], recurringIncome: [] };
const mockReceipt: DetectedMovementSuggestion = { id: 7, userId: "tester", workspaceId: 9, status: "pending", movementType: "expense", currencyCode: "PEN", amount: 12.5, description: "Tambo", occurredAt: "2026-10-07T18:02:00Z", packageName: "com.bcp.test", financialAppKey: "bcp", appLabel: "BCP", metadata: { accountId: 1, categoryId: 2 }, confidence: "high", dedupeKey: "test-7", notificationKey: null, movementId: null, createdAt: "2026-10-07T18:02:00Z", updatedAt: "2026-10-07T18:02:00Z" };
const mockMutation = { mutateAsync: jest.fn().mockResolvedValue({}), mutate: jest.fn(), isPending: false };
const mockToast = { showToast: jest.fn(), showRichToast: jest.fn(), showErrorToast: jest.fn() };
let mockSettingsLoading = false;
let mockSettings: NotificationDetectionAppSetting[] = [];
let mockSuggestion = mockReceipt;
let mockLearning: LearningMovement[] = [];
let mockWorkspaceId = 9;
jest.mock("../../../../services/queries/detection-learning", () => ({ useDetectionLearningQuery: () => ({ data: mockLearning, isPending: false }) }));
jest.mock("../../components/DetectedMovementReviewSheet", () => ({ DetectedMovementReviewSheet: ({ status, visible }: any) => status ? require("react").createElement(require("../../../../components/ui/BottomSheet").BottomSheet, { title: status.title, visible }, status.content) : null }));
jest.mock("../../../../components/ui/BottomSheet", () => ({ BottomSheet: ({ title, children }: any) => require("react").createElement(require("react-native").View, { testID: "status-sheet", title }, children) }));
jest.mock("../../components/DetectedMovementExtras", () => ({ DetectedMovementExtras: () => null }));
jest.mock("../../../movements/components/form/SplitCategoriesSheet", () => ({ SplitCategoriesSheet: () => null }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));
let mockOnline = true;
const mockPending = jest.fn().mockResolvedValue([] as number[]);
const mockHasPending = jest.fn().mockResolvedValue(false);
const mockLocalDelete = jest.fn().mockResolvedValue(true);
let mockRequestSync: () => Promise<unknown> = () => Promise.resolve();
jest.mock("../../../../lib/offline/instance", () => ({
  offlineRuntime: {
    getState: () => ({ online: mockOnline }),
    pendingRowIds: (...args: unknown[]) => mockPending(...args),
    requestSync: () => mockRequestSync(),
    hasPendingInsert: (...args: unknown[]) => mockHasPending(...args),
    deleteMovement: (...args: unknown[]) => mockLocalDelete(...args),
  },
}));
jest.mock("../../../../lib/auth-context", () => ({ useAuth: () => ({ profile: { id: "tester", email: "tester@test.invalid" } }) }));
jest.mock("../../../../lib/workspace-context", () => ({ useWorkspace: () => ({ activeWorkspaceId: mockWorkspaceId, activeWorkspace: { baseCurrencyCode: "PEN" } }) }));
jest.mock("../../../../hooks/useToast", () => ({ useToast: () => mockToast }));
jest.mock("../../../../hooks/useHaptics", () => ({ useHaptics: () => ({ error: jest.fn(), success: jest.fn() }) }));
jest.mock("../../../../services/queries/notification-detection", () => ({
  useDetectedMovementSuggestionQuery: () => ({ data: mockSuggestion, refetch: jest.fn() }),
  useNotificationDetectionSettingsQuery: () => ({ data: mockSettings, isLoading: mockSettingsLoading }),
  useMarkDetectedMovementSuggestionMutation: () => ({ ...mockMutation, mutateAsync: mockMark }),
  useUndoDetectedMovementRegistrationMutation: () => ({ ...mockMutation, mutateAsync: mockUndo }),
  useRegisterDetectedSplitMutation: () => ({ ...mockMutation, mutateAsync: mockSplit }),
  useAiUsageTodayQuery: () => ({ data: null }),
  findPossibleDuplicateMovement: (...args: unknown[]) => mockDuplicate(...args),
  countSameDayDetectionSignals: (...args: unknown[]) => mockCounts(...args),
  confirmDuplicateWithAi: (...args: unknown[]) => mockDuplicateAi(...args),
  recordSuggestionAction: jest.fn().mockResolvedValue(null),
  hideLocallyRegisteredSuggestion: (...args: unknown[]) => mockHide(...args),
  showSuggestionAgain: (...args: unknown[]) => mockShowAgain(...args),
}));
const mockHide = jest.fn();
const mockShowAgain = jest.fn();
jest.mock("../../../../services/queries/workspace-data", () => ({
  useWorkspaceSnapshotQuery: () => ({ data: mockSnapshot }),
  useCreateMovementMutation: () => ({ ...mockMutation, mutateAsync: mockCreate }),
  useDeleteMovementMutation: () => ({ ...mockMutation, mutateAsync: mockDelete, mutate: mockDelete }),
  useCreateCategoryMutation: () => mockMutation,
  useCreateCounterpartyMutation: () => mockMutation,
  useCreateSubscriptionMutation: () => mockMutation,
  useCreateRecurringIncomeMutation: () => mockMutation,
  useMarkNotificationReadMutation: () => mockMutation,
  usePersistLearningFeedbackMutation: () => mockMutation,
  useDashboardAnalyticsQuery: () => ({ data: null }),
  useUserEntitlementQuery: () => ({ data: { proAccessEnabled: mockProAccess } }),
}));
let mockProCheck: () => Promise<unknown> = () => Promise.resolve(true);
let mockEmailAccessData: boolean | undefined = true;
jest.mock("../../../../services/queries/email-detection-access", () => ({
  ProAccessUnverifiedError: class ProAccessUnverifiedError extends Error {},
  useEmailDetectionProAccessQuery: () => ({ data: mockEmailAccessData }),
  assertEmailDetectionProAccess: () => mockProCheck(),
}));
jest.mock("../../../../services/queries/movement-patterns", () => ({ useMovementPatternsQuery: () => ({ data: null }) }));
jest.mock("../../../../services/queries/spend-types", () => ({ useSpendTypesQuery: () => ({ data: [] }) }));
jest.mock("../../../../hooks/useMovementCategoryAiSuggestion", () => ({ useMovementCategoryAiSuggestion: () => ({ recommendation: null }) }));
jest.mock("../../../../hooks/useMovementDescriptionCleanup", () => ({ useMovementDescriptionCleanup: () => ({ cleanup: null }) }));
jest.mock("../../../../hooks/useMovementCounterpartyAiSuggestion", () => ({ useMovementCounterpartyAiSuggestion: () => ({ suggestion: null }) }));
jest.mock("../../../../hooks/useMovementRecurringAiSuggestion", () => ({ useMovementRecurringAiSuggestion: () => ({ suggestion: null }) }));
jest.mock("../../../../hooks/useMovementRiskExplanation", () => ({ useMovementRiskExplanation: () => ({ risk: null }) }));
jest.mock("../../../../hooks/useMovementBudgetImpact", () => ({ useMovementBudgetImpact: () => ({ impact: null }) }));

let current: DetectedMovementReview;
function Harness({ visible = true, previewEnabled = false }: { visible?: boolean; previewEnabled?: boolean }) { current = useDetectedMovementReview({ visible, previewEnabled, suggestionId: 7, onClose: jest.fn(), onResolved: mockResolved }); return null; }
let renderer: ReturnType<typeof create>;
beforeEach(async () => { jest.clearAllMocks(); mockProAccess = false; mockCounts.mockResolvedValue({ sameDaySuggestions: 2, sameDayRegisteredFromSuggestions: 1, sameDayMatchingMovements: 1 }); mockDuplicateAi.mockResolvedValue({ verdict: "distinct", reason: null }); mockWorkspaceId = 9; mockUndo.mockResolvedValue({}); mockSplit.mockResolvedValue({ movementId: 31, movementIds: [31, 32], alreadyRegistered: false }); mockLearning = []; mockSettingsLoading = false; mockSettings = []; mockSuggestion = mockReceipt; mockSnapshot = { ...mockSnapshot, categories: mockCategories, accounts: mockAccounts, exchangeRates: [] }; mockDuplicate.mockResolvedValue(null); mockCreate.mockResolvedValue({ id: 13 }); await act(async () => { renderer = create(React.createElement(Harness)); }); });
afterEach(async () => { await act(async () => renderer.unmount()); });

function learnedMovement(id: number, overrides: Partial<LearningMovement> = {}): LearningMovement {
  return { id, description: "Tambo", movement_type: "expense", status: "posted", source_account_id: 3, destination_account_id: null,
    category_id: 4, created_at: "2026-10-07T12:00:00Z", updated_at: "2026-10-07T12:00:00Z", metadata: {}, ...overrides };
}
it("applies late personal proposals over AI/defaults and protects explicit user corrections", async () => {
  mockSuggestion = { ...mockReceipt, metadata: { categoryId: 2, aiProvider: "deepseek" } };
  mockSnapshot = { ...mockSnapshot, accounts: [...mockAccounts, { ...mockAccounts[0], id: 3, name: "Ahorro" }], categories: [...mockCategories, { ...mockCategories[0], id: 4, name: "Restaurantes" }] };
  await act(async () => renderer.update(React.createElement(Harness, { key: "personal-late" })));
  expect(current.categoryId).toBe(2);
  mockLearning = [learnedMovement(1), learnedMovement(2)];
  await act(async () => renderer.update(React.createElement(Harness, { key: "personal-late" })));
  expect(current.accountId).toBe(3); expect(current.categoryId).toBe(4);
  expect(current.learningHint).toBe("Según tus movimientos anteriores");
  await act(async () => { current.setAccountId(1); current.selectCategoryManually(2); });
  mockLearning = [learnedMovement(1), learnedMovement(2), learnedMovement(3)];
  await act(async () => renderer.update(React.createElement(Harness, { key: "personal-late" })));
  expect(current.accountId).toBe(1); expect(current.categoryId).toBe(2);
  expect(current.draft.manualFields).toEqual(expect.arrayContaining(["account", "category"]));
});
it("keeps an unrecognized receipt reference blank even when there is a default account", async () => {
  mockSuggestion = { ...mockReceipt, metadata: { accountHints: { source: { kind: "account", last4: "6068" } } } };
  mockSettings = [{ financialAppKey: "bcp", enabled: true, defaultAccountId: 1 }];
  await act(async () => renderer.update(React.createElement(Harness, { key: "unmapped-ref" })));
  expect(current.accountId).toBeNull();
  await act(async () => current.setAccountId(1));
  expect(current.accountId).toBe(1);
  await act(async () => current.submit());
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ detectionLearning: expect.objectContaining({
    originalDescription: "Tambo", accountHints: { source: { kind: "account", last4: "6068" }, destination: null }, manualChoices: expect.objectContaining({ account: true }),
  }) }) }));
});
it("removing learning evidence retracts an untouched recommendation", async () => {
  mockSuggestion = { ...mockReceipt, metadata: {} };
  mockSnapshot = { ...mockSnapshot, accounts: [...mockAccounts, { ...mockAccounts[0], id: 3 }], categories: [...mockCategories, { ...mockCategories[0], id: 4 }] };
  mockLearning = [learnedMovement(1), learnedMovement(2)];
  await act(async () => renderer.update(React.createElement(Harness, { key: "retract-learning" })));
  expect(current.accountId).toBe(3); expect(current.categoryId).toBe(4);
  mockLearning = [];
  await act(async () => renderer.update(React.createElement(Harness, { key: "retract-learning" })));
  expect(current.accountId).toBeNull(); expect(current.categoryId).toBeNull();
});
it("learns transfer accounts and computes the new amount with persisted rates", async () => {
  mockSnapshot = { ...mockSnapshot, accounts: [...mockAccounts, { ...mockAccounts[0], id: 3, currencyCode: "USD" }],
    exchangeRates: [{ fromCurrencyCode: "USD", toCurrencyCode: "PEN", rate: 3.8, effectiveAt: "2026-10-08" }] as ExchangeRateSummary[] };
  mockSuggestion = { ...mockReceipt, movementType: "transfer", description: "Ahorro viaje", amount: 20, currencyCode: "USD", metadata: {} };
  mockLearning = [learnedMovement(1, { description: "Ahorro viaje", movement_type: "transfer", source_account_id: 3, destination_account_id: 1 }), learnedMovement(2, { description: "Ahorro viaje", movement_type: "transfer", source_account_id: 3, destination_account_id: 1 })];
  await act(async () => renderer.update(React.createElement(Harness, { key: "learn-transfer" })));
  expect(current.accountId).toBe(3); expect(current.destinationAccountId).toBe(1);
  expect(current.destinationAmount).toBe("76.00"); expect(current.transferFxRate).toBe("3.8");
  await act(async () => current.setDestinationAccountId(null));
  mockLearning = [...mockLearning];
  await act(async () => renderer.update(React.createElement(Harness, { key: "learn-transfer" })));
  expect(current.destinationAccountId).toBeNull();
});

it("muestra la tarjeta del dashboard sin abrir la revisión aunque los ajustes sigan cargando", async () => {
  mockSettingsLoading = true;
  await act(async () => {
    renderer.update(React.createElement(QuickDetectedMovementEntry, {
      visible: false, previewEnabled: true, suggestionId: 7, onClose: jest.fn(),
      renderPreview: (review) => React.createElement(Text, { testID: "dashboard-detection" }, `${review.description}: ${review.amount}`),
    }));
  });
  expect(renderer.root.findByProps({ testID: "dashboard-detection" }).props.children).toBe("Tambo: 12.50");
  expect(mockCreate).not.toHaveBeenCalled();
});

it("aplica la cuenta propuesta cuando llegan los ajustes y conserva una elección manual", async () => {
  mockSettingsLoading = true;
  mockSuggestion = { ...mockReceipt, metadata: { categoryId: 2 } };
  mockSnapshot = { ...mockSnapshot, accounts: [...mockAccounts, { ...mockAccounts[0], id: 3, name: "Ahorros" }] };
  await act(async () => { renderer.update(React.createElement(Harness, { key: "late-settings" })); });
  expect(current.accountId).toBeNull();
  expect(current.initialized).toBe(true);
  mockSettingsLoading = false;
  mockSettings = [{ financialAppKey: "bcp", enabled: true, defaultAccountId: 3 }];
  await act(async () => { renderer.update(React.createElement(Harness, { key: "late-settings" })); });
  expect(current.accountId).toBe(3);
  await act(async () => { current.setAccountId(null); });
  mockSettings = [{ financialAppKey: "bcp", enabled: true, defaultAccountId: 1 }];
  await act(async () => { renderer.update(React.createElement(Harness, { key: "late-settings" })); });
  expect(current.accountId).toBeNull();
});

it("presenta el duplicado conciliado antes de guardar y confirmar no crea otro movimiento", async () => {
  mockSuggestion = { ...mockReceipt, duplicateCandidate: { id: 22, workspaceId: 9, status: "posted", movementType: "expense", sourceAccountId: 1, sourceAmount: 12.5, occurredAt: mockReceipt.occurredAt, description: "Compra manual" } as MovementRecord };
  await act(async () => { renderer.update(React.createElement(Harness, { key: "reconciliation" })); });
  expect(current.duplicateCandidate?.id).toBe(22);
  expect(mockDuplicate).not.toHaveBeenCalled();
  await act(async () => { await current.useExistingDuplicate(); });
  expect(mockMark).toHaveBeenCalledWith({ suggestionId: 7, status: "duplicate", movementId: 22, expectedStatus: "pending" });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockResolved).toHaveBeenCalledWith(7, "duplicate");
});

it("editar el importe elimina un candidato que correspondía a los datos originales", async () => {
  mockSuggestion = { ...mockReceipt, duplicateCandidate: { id: 22, workspaceId: 9, status: "posted", movementType: "expense", sourceAccountId: 1, sourceAmount: 12.5 } as MovementRecord };
  await act(async () => { renderer.update(React.createElement(Harness, { key: "edit-reconciliation" })); });
  expect(current.duplicateCandidate?.id).toBe(22);
  await act(async () => current.setAmount("25.00"));
  expect(current.duplicateCandidate).toBeNull();
  mockSuggestion = { ...mockSuggestion, duplicateCandidate: { ...mockSuggestion.duplicateCandidate! } };
  await act(async () => renderer.update(React.createElement(Harness, { key: "edit-reconciliation" })));
  expect(current.amount).toBe("25.00");
  expect(current.duplicateCandidate).toBeNull();
});

it("Guardar igual conserva la decisión explícita ante un posible duplicado", async () => {
  mockSuggestion = { ...mockReceipt, duplicateCandidate: { id: 22, workspaceId: 9, status: "posted", movementType: "expense", sourceAccountId: 1, sourceAmount: 12.5 } as MovementRecord };
  await act(async () => { renderer.update(React.createElement(Harness, { key: "keep-distinct" })); });
  await act(async () => { await current.submit(true); });
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(mockDuplicate).not.toHaveBeenCalled();
});

it("bloquea dos pulsaciones antes del siguiente render y avanza una vez", async () => {
  let release!: (value: { id: number }) => void;
  mockCreate.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => { first = current.submit(); second = current.submit(); });
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(current.busy).toBe(true);
  await act(async () => { release({ id: 13 }); await Promise.all([first, second]); });
  expect(mockResolved).toHaveBeenCalledTimes(1);
  expect(mockResolved).toHaveBeenCalledWith(7, "registered");
  expect(current.busy).toBe(false);
});

it("conserva las ediciones tras un error y una actualización de los datos", async () => {
  await act(async () => { current.setDescription("Compra revisada"); current.setAmount("15.00"); });
  mockCreate.mockRejectedValueOnce(new Error("Fallo de conexión"));
  await act(async () => { await current.submit(); });
  expect(current.saveError).toBeTruthy();
  mockSnapshot = { ...mockSnapshot, accounts: [...mockAccounts] };
  await act(async () => { renderer.update(React.createElement(Harness)); });
  expect(current.description).toBe("Compra revisada");
  expect(current.amount).toBe("15.00");
  await act(async () => { await current.submit(); });
  expect(mockCreate).toHaveBeenLastCalledWith(expect.objectContaining({ description: "Compra revisada", sourceAmount: 15 }));
});

it("pide resolver el duplicado y permite guardar igual de forma explícita", async () => {
  const candidate = { id: 22, description: "Tambo", occurredAt: mockReceipt.occurredAt, sourceAmount: 12.5, movementType: "expense" };
  mockDuplicate.mockResolvedValue(candidate);
  await act(async () => { await current.submit(); });
  expect(current.duplicateCandidate?.id).toBe(22);
  expect(mockCreate).not.toHaveBeenCalled();
  await act(async () => { await current.submit(true); });
  expect(mockCreate).toHaveBeenCalledTimes(1);
});
it("a failed duplicate lookup never becomes permission to save", async () => {
  mockDuplicate.mockRejectedValueOnce(new Error("offline"));
  await act(async () => { await current.submit(); });
  expect(mockCreate).not.toHaveBeenCalled(); expect(mockDuplicateAi).not.toHaveBeenCalled();
  expect(current.saveError).toBeTruthy();
});
it("a failed count read stays in manual review without calling AI with made-up evidence", async () => {
  mockProAccess = true; await act(async () => renderer.update(React.createElement(Harness)));
  mockDuplicate.mockResolvedValue({ id: 22, description: "Tambo", occurredAt: mockReceipt.occurredAt });
  mockCounts.mockRejectedValueOnce(new Error("offline"));
  await act(async () => { await current.submit(); });
  expect(mockCounts).toHaveBeenCalledWith(expect.objectContaining({ userId: "tester", currencyCode: "PEN", accountId: 1 }));
  expect(mockDuplicateAi).not.toHaveBeenCalled(); expect(mockCreate).not.toHaveBeenCalled();
  expect(current.duplicateCandidate?.id).toBe(22);
});
it("uses scoped evidence for the same AI contract when it confirms a distinct movement", async () => {
  mockProAccess = true; await act(async () => renderer.update(React.createElement(Harness)));
  mockDuplicate.mockResolvedValue({ id: 22, description: "Tambo", occurredAt: mockReceipt.occurredAt });
  await act(async () => { await current.submit(); });
  expect(mockDuplicateAi).toHaveBeenCalledWith(expect.objectContaining({ counts: { sameDaySuggestions: 2, sameDayRegisteredFromSuggestions: 1, sameDayMatchingMovements: 1 } }));
  expect(mockCreate).toHaveBeenCalledTimes(1);
});

it("omitir permite deshacer sin depender de si el aviso se leyó", async () => {
  await act(async () => { await current.discard(); });
  expect(mockResolved).toHaveBeenCalledWith(7, "discarded");
  const banner = mockToast.showRichToast.mock.calls[0][0];
  expect(banner.title).toBe("Detección omitida");
  await act(async () => { banner.onUndo(); });
  expect(mockMark).toHaveBeenLastCalledWith({ suggestionId: 7, status: "pending", expectedStatus: "discarded" });
});

it("abrir la misma detección desde Notificaciones muestra que fue omitida sin permitir guardarla", async () => {
  mockSuggestion = { ...mockReceipt, status: "discarded" };
  await act(async () => renderer.update(React.createElement(QuickDetectedMovementEntry, {
    visible: true, suggestionId: 7, notificationId: 33, origin: "notifications", onClose: jest.fn(),
  })));
  expect(renderer.root.findByProps({ testID: "status-sheet" }).props.title).toBe("Detección omitida");
  expect(renderer.root.findAllByType(Text).some((node: any) => String(node.props.children).includes("No se creó un movimiento"))).toBe(true);
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockMark).not.toHaveBeenCalled();
});

it("dos pulsaciones de Omitir resuelven una vez y Deshacer conserva needs_review", async () => {
  mockSuggestion = { ...mockReceipt, status: "needs_review" };
  await act(async () => renderer.update(React.createElement(Harness, { key: "omit-needs-review" })));
  let release!: () => void;
  mockMark.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => { first = current.discard(); second = current.discard(); });
  expect(mockMark).toHaveBeenCalledTimes(1);
  expect(current.busy).toBe(true);
  await act(async () => { release(); await Promise.all([first, second]); });
  expect(mockResolved).toHaveBeenCalledTimes(1);
  expect(mockCreate).not.toHaveBeenCalled();
  await act(async () => mockToast.showRichToast.mock.calls[0][0].onUndo());
  expect(mockMark).toHaveBeenLastCalledWith({ suggestionId: 7, status: "needs_review", expectedStatus: "discarded" });
});

it("Guardar permanece disponible y explica qué falta en una transferencia", async () => {
  await act(async () => { current.switchMovementType("transfer"); });
  await act(async () => { await current.submit(); });
  expect(current.saveError).toBeNull();
  expect(current.fieldErrors.destinationAccountId).toBe("Elige el destino");
  expect(mockCreate).not.toHaveBeenCalled();
  expect(current.busy).toBe(false);
});

it("cerrar la revisión limpia el error del intento y conserva el borrador en el dashboard", async () => {
  await act(async () => { current.setAccountId(null); current.setDescription("ANTHROPIC*"); });
  await act(async () => { await current.submit(); });
  expect(current.saveError).toBeNull();
  expect(current.fieldErrors.accountId).toBe("Elige una cuenta");
  expect(mockCreate).not.toHaveBeenCalled();
  const editedDraft = current.draft;
  await act(async () => renderer.update(React.createElement(Harness, { visible: false, previewEnabled: true })));
  expect(current.saveError).toBeNull();
  expect(current.draft).toEqual(editedDraft);
  expect(current.cardMissing).toContain("Elige una cuenta");
  expect(current.readyToSave).toBe(false);
  await act(async () => renderer.update(React.createElement(Harness, { visible: true, previewEnabled: true })));
  expect(current.saveError).toBeNull();
  expect(current.draft).toEqual(editedDraft);
});

it("el fallo de guardado directo en la tarjeta conserva su reintento hasta abrir la revisión", async () => {
  await act(async () => renderer.update(React.createElement(Harness, { visible: false, previewEnabled: true })));
  mockCreate.mockRejectedValueOnce(new Error("Sin conexión al guardar"));
  await act(async () => { await current.submit(); });
  expect(current.saveError).toBeTruthy();
  await act(async () => renderer.update(React.createElement(Harness, { visible: false, previewEnabled: true })));
  expect(current.saveError).toBeTruthy();
  await act(async () => renderer.update(React.createElement(Harness, { visible: true, previewEnabled: true })));
  expect(current.saveError).toBeNull();
  expect(current.accountId).toBe(1);
});

it("un fallo al actualizar el aviso no convierte un registro exitoso en error", async () => {
  mockMark.mockRejectedValueOnce(new Error("Sin conexión al actualizar el aviso"));
  await act(async () => { await current.submit(); });
  expect(mockResolved).toHaveBeenCalledWith(7, "registered");
  expect(current.saveError).toBeNull();
});

it("reintentar un descarte fallido vuelve a descartar y nunca registra", async () => {
  mockMark.mockRejectedValueOnce(new Error("Fallo al descartar"));
  await act(async () => { await current.discard(); });
  expect(current.saveError).toBeTruthy();
  await act(async () => { await current.retry(); });
  expect(mockMark).toHaveBeenCalledTimes(2);
  expect(mockMark).toHaveBeenLastCalledWith({ suggestionId: 7, status: "discarded", expectedStatus: "pending" });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockResolved).toHaveBeenCalledWith(7, "discarded");
});

it("una división se guarda en una sola operación del servidor, sin crear partes sueltas", async () => {
  await act(async () => { current.setAccountId(1); current.setSplitLines([{ categoryId: 2, amount: "7.50" }, { categoryId: 4, amount: "5.00" }]); });
  await act(async () => { await current.submit(); });
  expect(mockSplit).toHaveBeenCalledTimes(1);
  const request = mockSplit.mock.calls[0][0];
  expect(request).toMatchObject({ workspaceId: 9, suggestionId: 7, userId: "tester" });
  expect(request.parts).toEqual([{ amount: 7.5, categoryId: 2 }, { amount: 5, categoryId: 4 }]);
  expect(request.header).toMatchObject({ movementType: "expense", accountId: 1, currencyCode: "PEN", amount: 12.5 });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockMark).not.toHaveBeenCalled(); // el servidor ya resolvió la detección dentro de su transacción
  expect(mockResolved).toHaveBeenCalledWith(7, "registered");
});

it("si la división falla no se crea ninguna parte ni se cierra la revisión", async () => {
  mockSplit.mockRejectedValueOnce(new Error("El servidor aún no permite divisiones atómicas."));
  await act(async () => { current.setAccountId(1); current.setSplitLines([{ categoryId: 2, amount: "7.50" }, { categoryId: 4, amount: "5.00" }]); });
  await act(async () => { await current.submit(); });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(mockResolved).not.toHaveBeenCalled();
  expect(current.saveError).toBeTruthy();
});

describe("detección por correo: la verificación de PRO al guardar", () => {
  const { ProAccessUnverifiedError } = require("../../../../services/queries/email-detection-access");
  const emailSuggestion = () => { mockSuggestion = { ...mockReceipt, packageName: "email:inbound" }; };
  afterEach(() => { mockProCheck = () => Promise.resolve(true); mockEmailAccessData = true; });

  it("si la verificación falla por red pero el acceso ya estaba confirmado, el guardado sigue (el servidor vuelve a exigir PRO)", async () => {
    emailSuggestion();
    await act(async () => renderer.update(React.createElement(Harness, { key: "email-ok" })));
    mockProCheck = () => Promise.reject(new ProAccessUnverifiedError("No se pudo verificar tu acceso PRO. Reintenta."));
    await act(async () => { await current.submit(); });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("si nunca se confirmó el acceso, un fallo de verificación bloquea el guardado", async () => {
    emailSuggestion();
    mockEmailAccessData = undefined;
    await act(async () => renderer.update(React.createElement(Harness, { key: "email-unknown" })));
    mockProCheck = () => Promise.reject(new ProAccessUnverifiedError("No se pudo verificar tu acceso PRO. Reintenta."));
    await act(async () => { await current.submit(); });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("si el servidor dice que NO hay PRO, no se guarda aunque antes se hubiera confirmado", async () => {
    emailSuggestion();
    await act(async () => renderer.update(React.createElement(Harness, { key: "email-no" })));
    mockProCheck = () => Promise.reject(new Error("La detección por correo requiere DarkMoney PRO activo."));
    await act(async () => { await current.submit(); });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("con el modo sin conexión, el movimiento guardado aún solo está en el teléfono", () => {
  afterEach(() => { mockRequestSync = () => Promise.resolve(); mockOnline = true; mockPending.mockResolvedValue([]); mockHasPending.mockResolvedValue(false); mockLocalDelete.mockResolvedValue(true); });

  it("no marca la detección ni guarda el aprendizaje antes de que llegue al servidor (chocaban con la llave foránea en cada registro)", async () => {
    mockOnline = false;
    mockPending.mockResolvedValue([13]); // el movimiento 13 sigue sin enviar
    await act(async () => { current.setAccountId(1); current.selectCategoryManually(2); });
    await act(async () => { await current.submit(); });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockMark).not.toHaveBeenCalled();
    expect(mockMutation.mutateAsync).not.toHaveBeenCalledWith(expect.objectContaining({ movementId: 13 }));
    expect(mockResolved).toHaveBeenCalledWith(7, "registered"); // guardar sí terminó
  });

  it("guardar no espera a que el movimiento llegue al servidor (antes tardaba hasta 8 s con una sincronización lenta)", async () => {
    mockPending.mockResolvedValue([13]); // con internet, pero el envío tarda
    mockRequestSync = () => new Promise(() => {}); // una sincronización que no termina
    const started = Date.now();
    await act(async () => { current.setAccountId(1); current.selectCategoryManually(2); });
    await act(async () => { await current.submit(); });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(mockResolved).toHaveBeenCalledWith(7, "registered");
    expect(mockToast.showRichToast).toHaveBeenCalled();
  });

  it("con el movimiento ya en el servidor marca la detección como siempre", async () => {
    await act(async () => { current.setAccountId(1); current.selectCategoryManually(2); });
    await act(async () => { await current.submit(); });
    expect(mockMark).toHaveBeenCalledWith(expect.objectContaining({ suggestionId: 7, status: "registered", movementId: 13 }));
  });

  it("Deshacer un registro que aún no salió del teléfono lo borra allí y no llama al servidor", async () => {
    mockHasPending.mockResolvedValue(true);
    await act(async () => { await current.submit(); });
    const banner = mockToast.showRichToast.mock.calls[0][0];
    await act(async () => { banner.onUndo(); });
    expect(mockLocalDelete).toHaveBeenCalledWith(9, 13);
    expect(mockUndo).not.toHaveBeenCalled();
    expect(mockShowAgain).toHaveBeenCalledWith({ id: 7, userId: "tester", workspaceId: 9 }); // la detección vuelve a la lista
  });

  it("al guardar, la tarjeta «Movimiento detectado» se quita al instante aunque el movimiento no haya salido", async () => {
    mockPending.mockResolvedValue([13]);
    mockRequestSync = () => new Promise(() => {});
    await act(async () => { await current.submit(); });
    expect(mockHide).toHaveBeenCalledWith(expect.objectContaining({ id: 7, userId: "tester", workspaceId: 9 }), 13);
  });
});

it("Deshacer usa una sola mutación con el registro original tras cambiar de espacio", async () => {
  await act(async () => { await current.submit(); });
  const banner = mockToast.showRichToast.mock.calls[0][0];
  mockMark.mockClear();
  mockWorkspaceId = 99;
  mockSuggestion = { ...mockReceipt, id: 80, workspaceId: 99 };
  await act(async () => renderer.update(React.createElement(Harness, { key: "another-space" })));
  await act(async () => { banner.onUndo(); });
  expect(mockUndo).toHaveBeenCalledTimes(1);
  expect(mockUndo).toHaveBeenCalledWith({ movementId: 13, suggestionId: 7, workspaceId: 9, userId: "tester" });
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockMark).not.toHaveBeenCalled();
});

it("un fallo de Deshacer se muestra aunque la revisión ya esté cerrada y no hace fallback", async () => {
  await act(async () => { await current.submit(); });
  const banner = mockToast.showRichToast.mock.calls[0][0];
  const error = new Error("El registro tiene un comprobante");
  mockMark.mockClear();
  mockUndo.mockRejectedValueOnce(error);
  await act(async () => renderer.update(null));
  await act(async () => { banner.onUndo(); });
  expect(mockToast.showErrorToast).toHaveBeenCalledWith("No se pudo deshacer el registro", error);
  expect(mockUndo).toHaveBeenCalledTimes(1);
  expect(mockDelete).not.toHaveBeenCalled();
  expect(mockMark).not.toHaveBeenCalled();
});
