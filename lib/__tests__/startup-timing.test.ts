/**
 * El desglose del arranque. Lo que se protege aquí es que los hitos midan el ARRANQUE y no el
 * re-render: los efectos de React vuelven a correr, y si la segunda pasada pisara la primera el
 * desglose diría que todo ocurrió al final.
 */
const mockLogInfo = jest.fn();

jest.mock("expo-updates", () => ({ updateId: null, isEmbeddedLaunch: true }));
jest.mock("../error-logger", () => ({ logInfo: (...args: unknown[]) => mockLogInfo(...args) }));
jest.mock("../secure-session-storage", () => ({ sessionStorageReadStats: () => ({ reads: 0 }) }));

import { isStartupComplete, markStartupPhase, markStartupReady } from "../startup-timing";

function contextoRegistrado() {
  return mockLogInfo.mock.calls[0][2] as { ms: number; phases: Record<string, number> };
}

describe("desglose del arranque", () => {
  it("todos los hitos viajan en la ÚNICA línea que se escribe", () => {
    markStartupPhase("cacheHydrated");
    markStartupPhase("sessionResolved");
    markStartupReady("ready");

    // Una sola fila por arranque: el desglose no puede costar una inserción por hito.
    expect(mockLogInfo).toHaveBeenCalledTimes(1);
    const { phases } = contextoRegistrado();
    expect(Object.keys(phases).sort()).toEqual(["cacheHydrated", "sessionResolved"]);
  });

  it("un re-render no mueve un hito ya marcado", () => {
    const { phases } = contextoRegistrado();
    const primera = phases.cacheHydrated;

    markStartupPhase("cacheHydrated");

    expect(phases.cacheHydrated).toBe(primera);
  });

  it("los hitos son ms desde el arranque, nunca negativos ni mayores que el total", () => {
    const { ms, phases } = contextoRegistrado();
    for (const valor of Object.values(phases)) {
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThanOrEqual(ms);
    }
  });

  it("después de reportar, marcar de nuevo no escribe otra línea ni añade hitos", () => {
    markStartupPhase("tardio");
    markStartupReady("timeout");

    expect(mockLogInfo).toHaveBeenCalledTimes(1);
    expect(contextoRegistrado().phases.tardio).toBeUndefined();
    expect(isStartupComplete()).toBe(true);
  });
});
