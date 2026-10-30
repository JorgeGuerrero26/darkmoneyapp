jest.mock("expo-linking", () => ({ createURL: (path: string) => `darkmoney://${path}`, openURL: jest.fn() }));
jest.mock("../supabase", () => ({ supabase: null, supabaseUrl: "https://proyecto.supabase.co", supabaseAnonKey: "anon" }));
jest.mock("../secure-session-storage", () => ({ secureSessionStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(async () => undefined) } }));

// eslint-disable-next-line import/first
import { googleRedirectUrl, isGoogleSignInEnabled, readOAuthCallback, resetGoogleSignInCheck } from "../google-sign-in";

describe("vuelta desde Google", () => {
  it("vuelve a la app por darkmoney://auth-callback", () => {
    expect(googleRedirectUrl()).toBe("darkmoney://auth-callback");
  });

  it("con el código, sigue; sin él, explica qué hacer", () => {
    expect(readOAuthCallback({ code: "abc" })).toEqual({ code: "abc" });
    expect(readOAuthCallback({ code: ["abc", "x"] })).toEqual({ code: "abc" });
    expect(readOAuthCallback({})).toEqual({ error: expect.stringContaining("llegó incompleto") });
  });

  it("si la persona cancela en Google se lo dice claro; otros errores llevan el detalle", () => {
    expect(readOAuthCallback({ error: "access_denied" })).toEqual({ error: "Cancelaste el inicio de sesión con Google." });
    expect(readOAuthCallback({ error: "server_error", error_description: "Unable to exchange external code" }))
      .toEqual({ error: "Google no permitió entrar: Unable to exchange external code" });
  });
});

describe("el botón solo aparece con Google activado en Supabase", () => {
  beforeEach(() => resetGoogleSignInCheck());
  const settings = (body: unknown, ok = true) => jest.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

  it("activado: sí, y no vuelve a preguntar", async () => {
    const fetcher = settings({ external: { email: true, google: true } });
    expect(await isGoogleSignInEnabled(fetcher)).toBe(true);
    expect(await isGoogleSignInEnabled(fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("desactivado (como hoy): no", async () => {
    expect(await isGoogleSignInEnabled(settings({ external: { email: true, google: false } }))).toBe(false);
  });

  it("sin red: no, y vuelve a preguntar la próxima vez", async () => {
    const offline = jest.fn(async () => { throw new Error("Network request failed"); });
    expect(await isGoogleSignInEnabled(offline as unknown as typeof fetch)).toBe(false);
    await Promise.resolve();
    const fetcher = settings({ external: { google: true } });
    expect(await isGoogleSignInEnabled(fetcher)).toBe(true);
  });
});
