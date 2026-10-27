/**
 * Abrir la app con mala señal (2026-10-27, 3G): el permiso de acceso caducó y renovarlo por red falla o tarda. Antes la app
 * mandaba a iniciar sesión (que también necesita red) aunque la sesión siguiera guardada y viva. Ahora entra con la guardada.
 */
const { act, create } = require("react-test-renderer");
import React from "react";
import { AuthRetryableFetchError } from "@supabase/supabase-js";

const STORED = {
  access_token: "viejo", refresh_token: "r1", expires_at: 1, expires_in: 3600, token_type: "bearer",
  user: { id: "u-1", email: "dueno@test.invalid", user_metadata: {}, app_metadata: {}, aud: "authenticated", created_at: "2026-01-01" },
};
let mockGetSession: () => Promise<unknown> = async () => ({ data: { session: null }, error: null });
let mockStoredRaw: string | null = JSON.stringify(STORED);
const mockOnAuth = jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } }));

jest.mock("../supabase", () => ({
  isSupabaseConfigured: true,
  supabaseUrl: "https://proyecto.supabase.co",
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: (...args: unknown[]) => mockOnAuth(...(args as [])),
      storageKey: "sb-proyecto-auth-token",
    },
    // Sin red: traer el perfil también falla.
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error("Network request failed") }) }) }) }),
  },
}));
jest.mock("../secure-session-storage", () => ({ secureSessionStorage: { getItem: async () => mockStoredRaw } }));
jest.mock("../profile-cache", () => ({
  readCachedProfile: async (id: string) => (id === "u-1" ? { id, email: "dueno@test.invalid", fullName: "Dueño", initials: "D", baseCurrencyCode: "PEN", timezone: "America/Lima", avatarUrl: null } : null),
  writeCachedProfile: async () => undefined,
}));
jest.mock("../offline/instance", () => ({ offlineRuntime: { signOutCleanup: async () => undefined } }));
jest.mock("../session-data-reset", () => ({ clearSessionScopedClientState: jest.fn(async () => undefined) }));
jest.mock("../avatar-utils", () => ({ uploadAvatar: jest.fn(), deleteAvatarFile: jest.fn() }));
jest.mock("../error-logger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
jest.mock("../../hooks/useTabPersistence", () => ({ clearLastTabRoute: jest.fn() }));
jest.mock("../startup-timing", () => ({ markStartupPhase: jest.fn() }));

// eslint-disable-next-line import/first
import { AuthProvider, useAuth } from "../auth-context";

let current: ReturnType<typeof useAuth>;
function Probe() {
  current = useAuth();
  return null;
}
const flush = async (ms = 20) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); };

describe("abrir la app con mala señal", () => {
  beforeEach(() => { mockStoredRaw = JSON.stringify(STORED); });

  it("la renovación falla por la red: entra con la sesión guardada en vez de pedir iniciar sesión", async () => {
    mockGetSession = async () => ({ data: { session: null }, error: new AuthRetryableFetchError("Network request failed", 0) });
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<AuthProvider><Probe /></AuthProvider>); });
    await flush();
    expect(current.session?.user.id).toBe("u-1");
    expect(current.profile?.fullName).toBe("Dueño");
    expect(current.hadSessionAtLaunchRef.current).toBe(true); // el bloqueo con huella sigue pidiéndose
    await act(async () => tree.unmount());
  });

  it("la renovación tarda más que el plazo del arranque: también entra con la guardada", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    try {
      mockGetSession = () => new Promise(() => {}); // 3G: nunca responde a tiempo
      let tree: ReturnType<typeof create>;
      await act(async () => { tree = create(<AuthProvider><Probe /></AuthProvider>); });
      await act(async () => { jest.advanceTimersByTime(6_000); });
      jest.useRealTimers();
      await flush();
      expect(current.session?.user.id).toBe("u-1");
      expect(current.isLoading).toBe(false);
      await act(async () => tree!.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  it("si la sesión de verdad terminó (rechazo que no es de red), se pide iniciar sesión como siempre", async () => {
    mockGetSession = async () => ({ data: { session: null }, error: Object.assign(new Error("Invalid Refresh Token: Already Used"), { __isAuthError: true, status: 400 }) });
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<AuthProvider><Probe /></AuthProvider>); });
    await flush();
    expect(current.session).toBeNull();
    await act(async () => tree.unmount());
  });

  it("sin nada guardado en el teléfono, se pide iniciar sesión", async () => {
    mockStoredRaw = null;
    mockGetSession = async () => ({ data: { session: null }, error: new AuthRetryableFetchError("Network request failed", 0) });
    let tree: ReturnType<typeof create>;
    await act(async () => { tree = create(<AuthProvider><Probe /></AuthProvider>); });
    await flush();
    expect(current.session).toBeNull();
    expect(current.isLoading).toBe(false);
    await act(async () => tree.unmount());
  });
});
