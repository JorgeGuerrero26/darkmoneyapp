import { isAmbiguousTransportError, shouldConfirmIdempotentWrite } from "../idempotency";

/**
 * La misma pregunta sirve para dos decisiones opuestas: en un insert, si conviene confirmar por
 * clave idempotente; en un update, si es seguro revertir el cambio optimista. Revertir tras un
 * abort le enseñaba al usuario sus datos viejos junto a un error mientras el servidor ya tenía
 * los nuevos (reportado el 2026-08-13 al editar un movimiento).
 */
describe("isAmbiguousTransportError", () => {
  it.each([
    { message: "AbortError: Aborted" },
    { message: "TypeError: Network request failed" },
    { message: "Timeout (12000ms) at list_shared_obligations" },
  ])("un corte de transporte NO prueba que no se guardara: $message", (error) => {
    expect(isAmbiguousTransportError(error)).toBe(true);
  });

  it.each([
    { code: "42501", message: "new row violates row-level security" },
    { code: "23514", message: "check constraint failed" },
    { message: "valor inválido" },
  ])("un error con causa conocida sí prueba que no se guardo: $code $message", (error) => {
    expect(isAmbiguousTransportError(error)).toBe(false);
  });

  it("sin error no hay ambigüedad", () => {
    expect(isAmbiguousTransportError(null)).toBe(false);
  });
});

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
