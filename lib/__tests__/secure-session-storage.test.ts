const mockSecureGetItemAsync = jest.fn();
const mockSecureDeleteItemAsync = jest.fn();
const mockAsyncRemoveItem = jest.fn().mockResolvedValue(undefined);

jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: unknown[]) => mockSecureGetItemAsync(...args),
  setItemAsync: jest.fn(),
  deleteItemAsync: (...args: unknown[]) => mockSecureDeleteItemAsync(...args),
}));

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: (...args: unknown[]) => mockAsyncRemoveItem(...args),
  },
}));

import { secureSessionStorage } from "../secure-session-storage";

describe("secureSessionStorage.removeItem", () => {
  it("hace autoritativo el logout antes de esperar el borrado del Keychain", async () => {
    let resolveOldMeta: (value: string) => void = () => {};
    let resolveChunkDelete: () => void = () => {};
    const oldMeta = new Promise<string>((resolve) => { resolveOldMeta = resolve; });
    const chunkDelete = new Promise<void>((resolve) => { resolveChunkDelete = resolve; });
    let metaReads = 0;

    mockSecureGetItemAsync.mockImplementation((key: string) => {
      if (key === "session.meta") {
        metaReads += 1;
        return metaReads === 1 ? oldMeta : Promise.resolve("1");
      }
      if (key === "session.0") return Promise.resolve("sesion-anterior");
      return Promise.resolve(null);
    });
    mockSecureDeleteItemAsync
      .mockImplementationOnce(() => chunkDelete)
      .mockResolvedValue(undefined);

    const staleRead = secureSessionStorage.getItem("session");
    const removal = secureSessionStorage.removeItem("session");

    // Aunque secureRemove siga esperando al Keychain, los callers ya observan logout.
    await expect(secureSessionStorage.getItem("session")).resolves.toBeNull();

    resolveOldMeta("1");
    await expect(staleRead).resolves.toBeNull();

    resolveChunkDelete();
    await removal;
    expect(mockAsyncRemoveItem).toHaveBeenCalledWith("session");
  });
});
