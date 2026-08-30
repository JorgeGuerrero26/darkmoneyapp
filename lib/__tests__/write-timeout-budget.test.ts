/**
 * Las escrituras de tabla tienen un plazo más largo que las lecturas.
 *
 * Abortar es una decisión del cliente: el servidor no se entera y termina el INSERT igual.
 * El 2026-08-26 a las 19:37 el movimiento "Moto" se guardó en la base justo cuando el
 * temporizador de 12 s lo daba por muerto, y el usuario vio "No pudimos confirmar si se
 * guardó" sobre un registro que existía.
 */
import {
  READ_TIMEOUT_MS,
  SAVE_CEILING_MS,
  WRITE_TIMEOUT_MS,
  resolveFetchTimeoutMs,
} from "../fetch-timeout-budget";
import { IDEMPOTENT_CONFIRM_BACKOFF_MS, isAmbiguousTransportError } from "../idempotency";
import { TimeoutError } from "../promise-utils";

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

/**
 * El techo de punta a punta existe para otra cosa que los plazos de `fetch`: supabase-js
 * serializa las operaciones de sesión, así que una que no termina nunca deja a la escritura
 * esperando un turno que no llega — sin fetch, sin abort y sin error. Incidente del 2026-08-30
 * a las 11:02: diez minutos de botón girando y ni una línea en los logs.
 */
describe("techo de un guardado completo", () => {
  it("da margen a la escritura y a su confirmación antes de rendirse", () => {
    const confirmBudget = IDEMPOTENT_CONFIRM_BACKOFF_MS.reduce((a, b) => a + b, 0);
    expect(SAVE_CEILING_MS).toBeGreaterThan(WRITE_TIMEOUT_MS + confirmBudget);
  });

  it("el mensaje al vencer se lee como ambiguo, no como un fallo", () => {
    // El servidor pudo haber guardado: decir "no se guardó" sería mentir. Con "timeout" dentro,
    // el formulario muestra "no pudimos confirmar si se guardó".
    expect(new TimeoutError("guardar movimiento", SAVE_CEILING_MS).message.toLowerCase()).toContain("timeout");
    expect(
      isAmbiguousTransportError({ message: new TimeoutError("guardar movimiento", SAVE_CEILING_MS).message }),
    ).toBe(true);
  });
});
