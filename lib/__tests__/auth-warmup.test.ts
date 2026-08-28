/**
 * El calentamiento del token existe para que el reloj de una consulta no cuente la espera de un
 * lock. Lo que de verdad hay que garantizar es que **se coalesce**: si las tres consultas de
 * obligaciones piden el token a la vez y cada una toma el lock por su cuenta, la última espera
 * el triple — que es justo el problema que se está arreglando.
 */
let getSessionCalls = 0;
let resolveSession: (() => void) | null = null;

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: () => {
        getSessionCalls += 1;
        return new Promise<void>((resolve) => {
          resolveSession = resolve;
        });
      },
    },
  },
}));

import { resetAuthWarmupForTests, warmAuthToken } from "../auth-warmup";

beforeEach(() => {
  getSessionCalls = 0;
  resolveSession = null;
  resetAuthWarmupForTests();
});

describe("calentar el token de auth", () => {
  it("tres consultas a la vez toman el lock UNA sola vez", async () => {
    const a = warmAuthToken();
    const b = warmAuthToken();
    const c = warmAuthToken();

    expect(getSessionCalls).toBe(1);

    resolveSession?.();
    await Promise.all([a, b, c]);
  });

  it("no vuelve a pedirlo si acaba de resolverse", async () => {
    const first = warmAuthToken();
    resolveSession?.();
    await first;
    expect(getSessionCalls).toBe(1);

    await warmAuthToken();
    // Un token recién resuelto sigue valiendo: pedir el lock otra vez sería el mismo coste que
    // se está evitando.
    expect(getSessionCalls).toBe(1);
  });

  it("no se cuelga para siempre si el lock no se libera", async () => {
    jest.useFakeTimers();
    const pending = warmAuthToken();
    // La sesión NUNCA resuelve: es el caso malo que motivó el techo.
    jest.advanceTimersByTime(9_000);
    await expect(pending).resolves.toBeUndefined();
    // Se cierra la promesa a mano: si no, queda pendiente y Jest no termina.
    resolveSession?.();
    jest.useRealTimers();
  });
});
