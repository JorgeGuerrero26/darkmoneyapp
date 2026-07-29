import { shouldConfirmIdempotentWrite } from "../idempotency";

describe("shouldConfirmIdempotentWrite", () => {
  it.each([
    { code: "", message: "AbortError: Aborted" },
    { message: "TypeError: Network request failed" },
    { message: "FetchError: failed to fetch" },
    { message: "request timeout" },
    { message: "falló", hint: "Request was aborted (timeout or manual cancellation)" },
  ])("confirma un POST ambiguo con dedupe key: $message", (error) => {
    expect(shouldConfirmIdempotentWrite("movement:abc", error)).toBe(true);
  });

  it("no consulta sin dedupe key", () => {
    expect(shouldConfirmIdempotentWrite(null, { message: "AbortError: Aborted" })).toBe(false);
  });

  it.each([
    { code: "42501", message: "new row violates row-level security" },
    { code: "23514", message: "check constraint failed" },
    { code: "PGRST116", message: "JSON object requested, multiple rows returned" },
    { message: "valor inválido" },
  ])("no convierte errores definitivos en reintentos: $code $message", (error) => {
    expect(shouldConfirmIdempotentWrite("movement:abc", error)).toBe(false);
  });
});
