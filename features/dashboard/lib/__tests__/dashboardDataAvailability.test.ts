import { isDashboardDataUnavailable } from "../dashboardDataAvailability";

const WS = [{ id: 1 }];

describe("isDashboardDataUnavailable", () => {
  it("con todo cargado, el dashboard puede afirmar lo que muestra", () => {
    expect(isDashboardDataUnavailable({
      knownWorkspaces: WS,
      activeWorkspaceId: 1,
      hasSnapshot: true,
    })).toBe(false);
  });

  /**
   * El caso que se rompió: la válvula de 15 s soltó la UI con `user-workspaces` en pending, el
   * store seguía en su `[]` inicial, y el dashboard mostró S/ 0.00 + "aún no hay cuentas
   * activas" a un usuario con 10 cuentas y 730 movimientos.
   */
  it("no afirma nada si todavía no sabe si el usuario tiene workspaces", () => {
    expect(isDashboardDataUnavailable({
      knownWorkspaces: undefined,
      activeWorkspaceId: null,
      hasSnapshot: false,
    })).toBe(true);
  });

  it("no afirma nada si hay workspaces pero ninguno resolvió como activo", () => {
    expect(isDashboardDataUnavailable({
      knownWorkspaces: WS,
      activeWorkspaceId: null,
      hasSnapshot: false,
    })).toBe(true);
  });

  it("no afirma nada si hay workspace activo pero falta el snapshot", () => {
    expect(isDashboardDataUnavailable({
      knownWorkspaces: WS,
      activeWorkspaceId: 1,
      hasSnapshot: false,
    })).toBe(true);
  });

  /**
   * La contraparte imprescindible: un usuario nuevo SÍ debe ver el estado vacío. Si este caso
   * devolviera true, se le mostraría "no pudimos cargar" para siempre y no podría empezar.
   */
  it("un usuario confirmado sin workspaces sí ve el estado vacío", () => {
    expect(isDashboardDataUnavailable({
      knownWorkspaces: [],
      activeWorkspaceId: null,
      hasSnapshot: false,
    })).toBe(false);
  });
});
