const mockForgetUser = jest.fn(async () => undefined);
const mockClearSession = jest.fn(async () => undefined);
const mockDeleteSecure = jest.fn(async () => undefined);
const mockClearStorage = jest.fn(async () => undefined);
const mockDetection = {
  isAvailable: jest.fn(() => true),
  setDetectionEnabled: jest.fn(),
  setAllowedPackages: jest.fn(),
  setRuntimeContext: jest.fn(),
  getSuggestions: jest.fn(async () => [{ id: "s1" }, { id: "s2" }]),
  ignoreSuggestion: jest.fn(),
};

jest.mock("../offline/instance", () => ({ offlineRuntime: { forgetUser: (...args: unknown[]) => mockForgetUser(...(args as [])) } }));
jest.mock("../session-data-reset", () => ({ clearSessionScopedClientState: () => mockClearSession() }));
jest.mock("../notification-detection-native", () => ({
  get notificationDetection() {
    return mockDetection;
  },
}));
jest.mock("expo-secure-store", () => ({ deleteItemAsync: (...args: unknown[]) => mockDeleteSecure(...(args as [])) }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { clear: () => mockClearStorage(), getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined), removeItem: jest.fn(async () => undefined) },
}));

// eslint-disable-next-line import/first
import { wipeDeviceAfterAccountDeletion } from "../account-deletion-local";
// eslint-disable-next-line import/first
import { useUiStore } from "../../store/ui-store";

describe("borrar el teléfono tras eliminar la cuenta", () => {
  it("borra la base sin conexión, la caché, las credenciales guardadas y lo de la detección de Android", async () => {
    useUiStore.getState().setBiometricEnabled(true);
    await wipeDeviceAfterAccountDeletion("u1");

    expect(mockForgetUser).toHaveBeenCalledWith("u1");
    expect(mockClearSession).toHaveBeenCalled();
    expect(mockClearStorage).toHaveBeenCalled();
    expect(mockDeleteSecure.mock.calls.map((call) => (call as unknown[])[0]).sort()).toEqual([
      "darkmoney_bio_email",
      "darkmoney_bio_password",
      "darkmoney_remember_email",
      "darkmoney_remember_me",
      "darkmoney_remember_password",
    ]);
    expect(mockDetection.setDetectionEnabled).toHaveBeenCalledWith(false);
    expect(mockDetection.setAllowedPackages).toHaveBeenCalledWith([]);
    expect(mockDetection.setRuntimeContext).toHaveBeenCalledWith({ notifCleanupKey: "account-deleted" });
    expect(mockDetection.ignoreSuggestion.mock.calls).toEqual([["s1"], ["s2"]]);
    expect(useUiStore.getState().biometricEnabled).toBe(false);
  });

  it("si un paso falla, los demás se hacen igual", async () => {
    mockForgetUser.mockRejectedValueOnce(new Error("sqlite"));
    mockClearStorage.mockClear();
    await wipeDeviceAfterAccountDeletion("u1");
    expect(mockClearStorage).toHaveBeenCalled();
  });
});
