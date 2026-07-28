import { isBlockingQuery } from "../components/layout/OfflineBanner";

/**
 * El aviso de "red lenta" salía con el dashboard entero ya cargado y 143 Mbps de fibra, porque
 * contaba cualquier petición en vuelo — incluidas las refetch en segundo plano de datos que ya
 * estaban en pantalla. Estos casos fijan la única señal que importa: si el usuario está
 * esperando algo que todavía no puede ver.
 */
describe("isBlockingQuery", () => {
  it("bloquea cuando la query aún no tiene datos (el usuario ve un esqueleto)", () => {
    expect(isBlockingQuery({ state: { data: undefined } })).toBe(true);
  });

  it("NO bloquea una refetch en segundo plano de datos ya visibles", () => {
    expect(isBlockingQuery({ state: { data: [{ id: 1 }] } })).toBe(false);
  });

  it("NO bloquea aunque los datos en caché estén vacíos o sean falsy", () => {
    // Una lista vacía o un 0 son datos válidos: la pantalla ya puede pintarlos.
    expect(isBlockingQuery({ state: { data: [] } })).toBe(false);
    expect(isBlockingQuery({ state: { data: 0 } })).toBe(false);
    expect(isBlockingQuery({ state: { data: null } })).toBe(false);
  });
});
