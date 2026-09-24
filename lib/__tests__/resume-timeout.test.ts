/**
 * El plazo corto tras volver del segundo plano. iOS mata las conexiones de una app congelada; las
 * primeras peticiones al volver cuelgan el plazo entero. Medido: 72% de los fallos de 30 días son
 * abortos por plazo, 1% de token.
 */
import {
  READ_TIMEOUT_MS,
  RESUME_TIMEOUT_MS,
  RESUME_WINDOW_MS,
  WRITE_TIMEOUT_MS,
  noteAppResumed,
  resetResumeState,
  resolveFetchTimeoutMs,
} from "../fetch-timeout-budget";

const BASE = "https://x.supabase.co";
const T0 = 1_000_000;

describe("plazo tras volver del segundo plano", () => {
  beforeEach(() => resetResumeState());

  it("sin regreso, todo sigue como antes", () => {
    expect(resolveFetchTimeoutMs(`${BASE}/rest/v1/movements`, "GET", T0)).toBe(READ_TIMEOUT_MS);
    expect(resolveFetchTimeoutMs(`${BASE}/rest/v1/movements`, "POST", T0)).toBe(WRITE_TIMEOUT_MS);
  });

  it("justo tras volver, lecturas y renovación de sesión van con plazo corto", () => {
    noteAppResumed(T0);
    expect(resolveFetchTimeoutMs(`${BASE}/rest/v1/movements`, "GET", T0 + 1_000)).toBe(RESUME_TIMEOUT_MS);
    // La renovación del token: es por la que espera el guardado.
    expect(resolveFetchTimeoutMs(`${BASE}/auth/v1/token?grant_type=refresh_token`, "POST", T0 + 1_000)).toBe(
      RESUME_TIMEOUT_MS,
    );
    expect(resolveFetchTimeoutMs(`${BASE}/rest/v1/rpc/list_shared_obligations`, "POST", T0 + 1_000)).toBe(
      RESUME_TIMEOUT_MS,
    );
  });

  /** Cortar una escritura pronto fabrica "no pudimos confirmar si se guardó" sobre algo que sí entró. */
  it("las escrituras de tabla NUNCA se acortan, ni justo al volver", () => {
    noteAppResumed(T0);
    expect(resolveFetchTimeoutMs(`${BASE}/rest/v1/movements`, "POST", T0 + 1_000)).toBe(WRITE_TIMEOUT_MS);
    expect(resolveFetchTimeoutMs(`${BASE}/rest/v1/movements?id=eq.1`, "PATCH", T0 + 1_000)).toBe(WRITE_TIMEOUT_MS);
  });

  it("pasada la ventana vuelve el plazo normal, para no cortar consultas lentas de verdad", () => {
    noteAppResumed(T0);
    expect(resolveFetchTimeoutMs(`${BASE}/rest/v1/movements`, "GET", T0 + RESUME_WINDOW_MS)).toBe(READ_TIMEOUT_MS);
  });

  it("el plazo corto sigue dando margen de sobra a una conexión sana", () => {
    expect(RESUME_TIMEOUT_MS).toBeGreaterThanOrEqual(4_000);
    expect(RESUME_TIMEOUT_MS).toBeLessThan(READ_TIMEOUT_MS);
  });
});
