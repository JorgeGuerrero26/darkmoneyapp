const mockLookup = jest.fn(), mockCounts = jest.fn(), mockAi = jest.fn(), mockFrom = jest.fn();
const mockNative = {
  tryClaimSuggestionRegistration: jest.fn().mockResolvedValue(true),
  getSuggestions: jest.fn().mockResolvedValue([{ id: "native-1", text: "Pago Taxi", amountLabel: "S/ 20.00" }]),
  setLastSaveError: jest.fn(), showSuggestionNotification: jest.fn(), releaseSuggestionRegistrationClaim: jest.fn(),
  enqueueSaveRetry: jest.fn(), clearSaveRetry: jest.fn(), markSuggestionRegistered: jest.fn(), requestCancelBankNotification: jest.fn(),
};
const mockReceipt = { id: 90, userId: "u", workspaceId: 8, status: "pending", movementType: "expense", amount: 20, currencyCode: "PEN",
  description: "Taxi", occurredAt: "2026-10-13T12:00:00Z", financialAppKey: "bcp", metadata: {}, confidence: "high", dedupeKey: "receipt-90" };
jest.mock("react-native", () => ({ NativeModules: { NotificationDetection: mockNative } }));
jest.mock("../supabase", () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args), auth: { getSession: async () => ({ data: {
  session: { user: { id: "u" }, expires_at: Math.floor(Date.now() / 1000) + 3600 },
} }) } } }));
jest.mock("../../services/queries/notification-detection", () => ({
  findPossibleDuplicateMovement: (...args: unknown[]) => mockLookup(...args),
  countSameDayDetectionSignals: (...args: unknown[]) => mockCounts(...args), confirmDuplicateWithAi: (...args: unknown[]) => mockAi(...args),
  syncNativeDetectedSuggestion: async () => mockReceipt, recordSuggestionAction: async () => {},
}));
jest.mock("../movement-ai-orchestrator", () => ({}));
jest.mock("../error-logger", () => ({ logWarn: jest.fn(), logError: jest.fn() }));
jest.mock("../promise-utils", () => ({ withRetry: (run: () => Promise<unknown>) => run(), withTimeout: (promise: Promise<unknown>) => promise }));
const payload = { suggestionId: "native-1", workspaceId: 8, movementType: "expense" as const, accountId: 1, amount: "20", description: "Taxi" };
// The module captures NativeModules at import time, after this fixture is initialized.
const { notificationDetectionHeadlessTask } = require("../notification-detection-headless");
let updates: { table: string; value: Record<string, unknown> }[];
beforeEach(() => {
  jest.clearAllMocks(); updates = [];
  mockLookup.mockReset(); mockCounts.mockReset(); mockAi.mockReset();
  mockLookup.mockResolvedValue({ id: 20, description: "Taxi", occurredAt: "2026-10-13T10:00:00Z" });
  mockCounts.mockResolvedValue({ sameDaySuggestions: 2, sameDayRegisteredFromSuggestions: 1, sameDayMatchingMovements: 1 });
  mockAi.mockResolvedValue({ verdict: "distinct", reason: null });
  mockFrom.mockImplementation((table: string) => {
    const query = {
      select: () => query, eq: () => query,
      update: (value: Record<string, unknown>) => { updates.push({ table, value }); return query; },
      insert: () => { throw new Error("Unexpected insert in failure test"); },
      maybeSingle: () => Promise.resolve({ data: table === "accounts" ? { currency_code: "PEN" } : null, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve),
    }; return query;
  });
});
it("a failed lookup stops the overlay save and leaves the existing retry/error path", async () => {
  mockLookup.mockRejectedValueOnce(new Error("offline"));
  await notificationDetectionHeadlessTask(payload);
  expect(mockCounts).not.toHaveBeenCalled(); expect(mockAi).not.toHaveBeenCalled();
  expect(mockFrom).not.toHaveBeenCalledWith("movements"); expect(updates).toEqual([]);
  expect(mockNative.setLastSaveError).toHaveBeenCalledWith("native-1", "offline");
  expect(mockNative.enqueueSaveRetry).toHaveBeenCalled(); expect(mockNative.releaseSuggestionRegistrationClaim).toHaveBeenCalled();
});
it("a failed count does not close or create a movement and is left for manual review", async () => {
  mockCounts.mockRejectedValueOnce(new Error("offline"));
  await notificationDetectionHeadlessTask(payload);
  expect(mockCounts).toHaveBeenCalledWith(expect.objectContaining({ userId: "u", currencyCode: "PEN", workspaceId: 8, accountId: 1 }));
  expect(mockAi).not.toHaveBeenCalled(); expect(mockFrom).not.toHaveBeenCalledWith("movements");
  expect(updates.find(item => item.table === "notification_detected_movement_suggestions")?.value).toMatchObject({ status: "needs_review", metadata: { duplicateAi: { verdict: "unknown" } } });
  expect(updates.find(item => item.table === "notifications")?.value.status).toBeUndefined();
  expect(mockNative.markSuggestionRegistered).not.toHaveBeenCalled();
});
it("a vanished ledger match does not become fake evidence for the overlay AI", async () => {
  mockCounts.mockResolvedValueOnce({ sameDaySuggestions: 1, sameDayRegisteredFromSuggestions: 0, sameDayMatchingMovements: 0 });
  await notificationDetectionHeadlessTask(payload);
  expect(mockAi).not.toHaveBeenCalled(); expect(mockFrom).not.toHaveBeenCalledWith("movements");
  expect(updates[0].value.status).toBe("needs_review");
});
