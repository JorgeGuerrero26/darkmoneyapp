/**
 * Las escrituras de tabla tienen un plazo más largo que las lecturas.
 *
 * Abortar es una decisión del cliente: el servidor no se entera y termina el INSERT igual.
 * El 2026-08-26 a las 19:37 el movimiento "Moto" se guardó en la base justo cuando el
 * temporizador de 12 s lo daba por muerto, y el usuario vio "No pudimos confirmar si se
 * guardó" sobre un registro que existía.
 */
import { READ_TIMEOUT_MS, WRITE_TIMEOUT_MS, resolveFetchTimeoutMs } from "../fetch-timeout-budget";

const REST = "https://proj.supabase.co/rest/v1/movements";
const RPC = "https://proj.supabase.co/rest/v1/rpc/list_shared_obligations";
const AUTH = "https://proj.supabase.co/auth/v1/token?grant_type=refresh_token";
const STORAGE = "https://proj.supabase.co/storage/v1/object/comprobantes/x.jpg";

describe("resolveFetchTimeoutMs", () => {
  it("da plazo largo a los writes de tabla", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE", "post"]) {
      expect(resolveFetchTimeoutMs(REST, method)).toBe(WRITE_TIMEOUT_MS);
    }
  });

  it("mantiene el plazo corto en lecturas", () => {
    expect(resolveFetchTimeoutMs(REST, "GET")).toBe(READ_TIMEOUT_MS);
    expect(resolveFetchTimeoutMs(REST, undefined)).toBe(READ_TIMEOUT_MS);
    expect(resolveFetchTimeoutMs(REST, "HEAD")).toBe(READ_TIMEOUT_MS);
  });

  it("los RPC siguen cortos aunque viajen por POST", () => {
    expect(resolveFetchTimeoutMs(RPC, "POST")).toBe(READ_TIMEOUT_MS);
  });

  it("auth sigue corto: un refresh colgado congelaria el arranque", () => {
    expect(resolveFetchTimeoutMs(AUTH, "POST")).toBe(READ_TIMEOUT_MS);
  });

  it("storage no cambia de plazo con este cambio", () => {
    expect(resolveFetchTimeoutMs(STORAGE, "POST")).toBe(READ_TIMEOUT_MS);
  });
});
