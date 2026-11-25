import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { AppState } from "react-native";
import { useNotificationDetectionForegroundReconcile } from "../hooks/useNotificationDetectionForegroundReconcile";

const { create, act } = require("react-test-renderer");
const mockInvalidate = jest.fn().mockResolvedValue(undefined);
const mockClient = { invalidateQueries: mockInvalidate };
const mockAvailable = jest.fn();
const mockRetries = jest.fn();
const mockSuggestions = jest.fn();
const mockScan = jest.fn();
const mockRecover = jest.fn();
const mockHeadless = jest.fn();
const mockEnqueue = jest.fn();
const mockClear = jest.fn();
const mockRegistered = jest.fn();
const mockMarkRegistered = jest.fn();
const mockCancel = jest.fn();

jest.mock("@tanstack/react-query", () => ({ useQueryClient: () => mockClient }));
jest.mock("../lib/auth-context", () => ({ useAuth: () => ({ profile: { id: "tester" } }) }));
jest.mock("../lib/workspace-context", () => ({ useWorkspace: () => ({ activeWorkspaceId: 1 }) }));
jest.mock("../lib/query-client", () => ({ recoverSession: () => mockRecover() }));
jest.mock("../lib/notification-detection-headless", () => ({ notificationDetectionHeadlessTask: (payload: unknown) => mockHeadless(payload) }));
jest.mock("../services/queries/notification-detection", () => ({ findRegisteredNativeSuggestionIds: (...args: unknown[]) => mockRegistered(...args) }));
jest.mock("../lib/notification-detection-native", () => ({
  notificationDetection: {
    isAvailable: () => mockAvailable(),
    getAllSaveRetries: () => mockRetries(),
    getSuggestions: () => mockSuggestions(),
    requestActiveNotificationScan: () => mockScan(),
    enqueueSaveRetry: (...args: unknown[]) => mockEnqueue(...args),
    clearSaveRetry: (...args: unknown[]) => mockClear(...args),
    markSuggestionRegistered: (...args: unknown[]) => mockMarkRegistered(...args),
    requestCancelBankNotification: (...args: unknown[]) => mockCancel(...args),
  },
}));

function Harness() {
  useNotificationDetectionForegroundReconcile();
  return null;
}

let renderer: ReturnType<typeof create>;
beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable.mockReturnValue(true);
  mockRetries.mockResolvedValue([]);
  mockSuggestions.mockResolvedValue([]);
  mockRecover.mockResolvedValue(undefined);
  mockHeadless.mockResolvedValue(undefined);
  mockRegistered.mockResolvedValue(new Set());
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
});

async function mount() {
  await act(async () => { renderer = create(React.createElement(Harness)); });
}

describe("notification foreground reconcile", () => {
  it.each([
    ["vacía", []],
    ["con reintentos agotados", [{ suggestionId: "exhausted", payloadJson: "" }]],
  ])("no recupera la sesión con una cola %s y conserva el escaneo y la conciliación nativa", async (_label, retries) => {
    mockRetries.mockResolvedValue(retries);
    mockSuggestions.mockResolvedValue([{ id: "native-1", status: "pending", notificationId: 42 }]);
    mockRegistered.mockResolvedValue(new Set(["native-1"]));
    await mount();
    expect(mockRecover).not.toHaveBeenCalled();
    expect(mockHeadless).not.toHaveBeenCalled();
    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["movements"] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["workspace-snapshot"] });
    expect(mockRegistered).toHaveBeenCalledWith(1, ["native-1"]);
    expect(mockMarkRegistered).toHaveBeenCalledWith("native-1", 42);
    expect(mockCancel).toHaveBeenCalledWith("native-1");
  });

  it("espera la recuperación del token antes de reintentar y refresca después de guardar", async () => {
    const payload = { suggestionId: "retry-1" };
    const payloadJson = JSON.stringify(payload);
    mockRetries.mockResolvedValue([
      { suggestionId: "exhausted", payloadJson: "" },
      { suggestionId: "retry-1", payloadJson },
    ]);
    let finishRecovery!: () => void;
    mockRecover.mockImplementationOnce(() => new Promise<void>((resolve) => { finishRecovery = resolve; }));
    await mount();
    expect(mockRecover).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockHeadless).not.toHaveBeenCalled();
    await act(async () => finishRecovery());
    expect(mockEnqueue).toHaveBeenCalledWith("retry-1", payloadJson);
    expect(mockHeadless).toHaveBeenCalledWith(payload);
    expect(mockInvalidate).toHaveBeenCalledTimes(4);
    expect(mockSuggestions).toHaveBeenCalledTimes(1);
  });

  it("mantiene el escaneo al volver a primer plano sin recuperar una sesión sin reintentos", async () => {
    const now = jest.spyOn(Date, "now").mockReturnValue(10_000);
    const listener = jest.spyOn(AppState, "addEventListener");
    try {
      await mount();
      const onChange = listener.mock.calls.find(([event]) => event === "change")![1];
      now.mockReturnValue(16_000);
      await act(async () => onChange("active"));
      expect(mockScan).toHaveBeenCalledTimes(2);
      expect(mockRetries).toHaveBeenCalledTimes(2);
      expect(mockRecover).not.toHaveBeenCalled();
    } finally {
      listener.mockRestore();
      now.mockRestore();
    }
  });

  it("no inicia lecturas ni invalidaciones cuando el módulo nativo no está disponible", async () => {
    mockAvailable.mockReturnValue(false);
    await mount();
    expect(mockInvalidate).not.toHaveBeenCalled();
    expect(mockRetries).not.toHaveBeenCalled();
    expect(mockScan).not.toHaveBeenCalled();
    expect(mockRecover).not.toHaveBeenCalled();
  });

  it("sale en iOS antes de registrar AppState o invalidar queries", () => {
    const source = readFileSync(
      join(__dirname, "..", "hooks", "useNotificationDetectionForegroundReconcile.ts"),
      "utf8",
    );
    const effectStart = source.indexOf("useEffect(() => {");
    const availabilityGuard = source.indexOf("if (!notificationDetection.isAvailable()) return;", effectStart);
    const firstInvalidation = source.indexOf("queryClient.invalidateQueries", effectStart);
    const appStateListener = source.indexOf("AppState.addEventListener", effectStart);

    expect(effectStart).toBeGreaterThanOrEqual(0);
    expect(availabilityGuard).toBeGreaterThan(effectStart);
    expect(availabilityGuard).toBeLessThan(firstInvalidation);
    expect(availabilityGuard).toBeLessThan(appStateListener);
  });
});
