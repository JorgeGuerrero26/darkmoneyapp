import { errorLogMessage } from "../errors";
import { isAuthLikeError } from "../auth-error";

/**
 * Los errores de Supabase NO son instancias de Error: son objetos planos
 * `{ message, details, hint, code }`. Con `String(error)` se registraban como el literal
 * "[object Object]" — 37 de ellos en 21 días, ilegibles.
 *
 * Y lo peor no era el log. `isAuthLikeError("[object Object]")` es false, así que la
 * recuperación de sesión NO se disparaba: un token vencido o un 42501 pasaban de largo.
 */
describe("errorLogMessage", () => {
  it("un error de Supabase deja de ser [object Object]", () => {
    const supabaseError = {
      code: "42501",
      message: "new row violates row-level security policy",
      details: null,
      hint: null,
    };
    expect(String(supabaseError)).toBe("[object Object]"); // el comportamiento viejo
    expect(errorLogMessage(supabaseError)).toContain("42501");
    expect(errorLogMessage(supabaseError)).toContain("row-level security");
  });

  it("y por eso la recuperación de sesión vuelve a dispararse", () => {
    const expiredToken = { code: "PGRST301", message: "JWT expired" };
    expect(isAuthLikeError(String(expiredToken))).toBe(false); // lo que pasaba antes
    expect(isAuthLikeError(errorLogMessage(expiredToken))).toBe(true);
  });

  it("un Error normal conserva su mensaje", () => {
    expect(errorLogMessage(new Error("AbortError: Aborted"))).toBe("AbortError: Aborted");
  });

  it("una cadena se devuelve tal cual", () => {
    expect(errorLogMessage("boom")).toBe("boom");
  });

  it("un objeto sin campos conocidos cae al JSON en vez de perderse", () => {
    expect(errorLogMessage({ status: 500 })).toContain("500");
  });

  it("no revienta con referencias circulares", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => errorLogMessage(circular)).not.toThrow();
  });
});
