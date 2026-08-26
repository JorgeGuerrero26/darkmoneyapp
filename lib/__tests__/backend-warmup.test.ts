import { isBackendWarmingUp, isAmbiguousTransportError } from "../idempotency";

/**
 * Al abrir la app tras horas en segundo plano, PostgREST devuelve PGRST002 mientras recarga su
 * caché de esquema. El statement NO llega a ejecutarse, así que reintentar es seguro incluso en
 * escrituras no idempotentes — el propio mensaje dice "Retrying".
 *
 * Antes se mostraba como fallo definitivo porque `isAmbiguousTransportError` descarta todo lo
 * que traiga código, y las mutaciones no reintentan. El usuario lo reportó el 2026-08-25: abre
 * la app, va rápido a registrar algo y le sale el error; espera, reintenta y ya funciona.
 */
describe("isBackendWarmingUp", () => {
  it.each(["PGRST001", "PGRST002", "PGRST003"])("reconoce %s por código", (code) => {
    expect(isBackendWarmingUp({ code, message: "algo" })).toBe(true);
  });

  it("lo reconoce aunque venga envuelto en el mensaje", () => {
    const wrapped = new Error("PGRST002 | Could not query the database for the schema cache. Retrying.");
    expect(isBackendWarmingUp(wrapped)).toBe(true);
  });

  it("reconoce el texto del schema cache sin código", () => {
    expect(isBackendWarmingUp(new Error("Could not query the database for the schema cache."))).toBe(true);
  });

  it.each([
    { code: "42501", message: "new row violates row-level security" },
    { code: "23505", message: "duplicate key" },
  ])("NO reintenta errores reales: $code", (error) => {
    expect(isBackendWarmingUp(error)).toBe(false);
  });

  it("un abort no es el backend despertando: es ambiguo y va por la otra vía", () => {
    const abort = { message: "AbortError: Aborted" };
    expect(isBackendWarmingUp(abort)).toBe(false);
    expect(isAmbiguousTransportError(abort)).toBe(true);
  });

  it("las dos vías no se solapan para PGRST002", () => {
    const warmup = { code: "PGRST002", message: "schema cache" };
    expect(isBackendWarmingUp(warmup)).toBe(true);
    // Tiene código, así que la vía de confirmación por clave idempotente lo ignora a propósito:
    // no hace falta confirmar nada cuando el statement no se ejecutó.
    expect(isAmbiguousTransportError(warmup)).toBe(false);
  });
});
