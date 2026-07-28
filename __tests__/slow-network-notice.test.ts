import { MIN_BLOCKED_FOR_NETWORK_WARNING, isBlockingQuery } from "../components/layout/OfflineBanner";

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

describe("umbral para culpar a la red", () => {
  /**
   * Medido el 28-07: `list-shared-obligations` acumuló 18 timeouts de 20 s en una semana
   * mientras el ping a la BD era de 115 ms. Un endpoint colgado no es una red lenta, y decirle
   * lo contrario al usuario es mentirle sobre algo que además no puede arreglar.
   */
  it("una sola query colgada no acusa a la red", () => {
    expect(1 >= MIN_BLOCKED_FOR_NETWORK_WARNING).toBe(false);
  });

  it("varias a la vez sí: es la firma de un problema de conexión real", () => {
    // El incidente de 06:42 abortó ~10 queries en dos segundos.
    expect(2 >= MIN_BLOCKED_FOR_NETWORK_WARNING).toBe(true);
    expect(10 >= MIN_BLOCKED_FOR_NETWORK_WARNING).toBe(true);
  });
});
