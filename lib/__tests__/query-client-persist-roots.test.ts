let mockOfflineEnabled = false;

jest.mock("../offline/flag", () => ({ isOfflineFlagEnabled: () => mockOfflineEnabled }));
jest.mock("../supabase", () => ({ supabase: null }));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })) },
}));

// eslint-disable-next-line import/first
import { shouldPersistQueryRoot } from "../query-client";

describe("qué consultas se guardan en disco", () => {
  beforeEach(() => {
    mockOfflineEnabled = false;
  });

  it("las de siempre se guardan, con el modo sin conexión apagado o encendido", () => {
    for (const root of ["workspace-snapshot", "movements", "user-workspaces", "dashboard-movements", "notifications"]) {
      expect(shouldPersistQueryRoot(root)).toBe(true);
    }
    mockOfflineEnabled = true;
    expect(shouldPersistQueryRoot("workspace-snapshot")).toBe(true);
  });

  it("las obligaciones compartidas contigo solo se guardan con el modo sin conexión encendido", () => {
    expect(shouldPersistQueryRoot("shared-obligations")).toBe(false);
    mockOfflineEnabled = true;
    expect(shouldPersistQueryRoot("shared-obligations")).toBe(true);
  });

  it("lo que no está en la lista no se guarda nunca", () => {
    mockOfflineEnabled = true;
    for (const root of ["entitlements", "assistant", "detection-learning", "spend-types"]) {
      expect(shouldPersistQueryRoot(root)).toBe(false);
    }
    expect(shouldPersistQueryRoot(undefined)).toBe(false);
    expect(shouldPersistQueryRoot(42)).toBe(false);
  });
});
