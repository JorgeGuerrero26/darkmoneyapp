// Se importa el módulo puro, NO el componente: importar OfflineBanner arrastra error-logger →
// supabase → AsyncStorage, que bajo jest es null y tumbaba la suite entera.
import {
  MIN_BLOCKED_FOR_NETWORK_WARNING,
  countBlockedFamilies,
  isBlockingQuery,
  queryFamily,
} from "../lib/slow-network-signal";

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

  it("NO bloquea consultas auxiliares marcadas como no críticas para la UX", () => {
    expect(
      isBlockingQuery({
        state: { data: undefined },
        meta: { uxBlocking: false },
      }),
    ).toBe(false);
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

/**
 * Medido en `app_error_logs`: 28 de los 31 avisos de la última semana llevaban
 * `shared-obligations` dentro, con la red del usuario perfectamente bien. La pantalla de
 * obligaciones monta tres consultas de la misma familia y caen juntas por la misma causa, así
 * que pasaban un umbral que existe justo para no culpar a la red por un endpoint colgado.
 */
describe("familias", () => {
  const q = (root: string) => ({ queryKey: [root, 1] });

  it("las tres consultas de obligaciones son un solo endpoint colgado", () => {
    const blocked = [
      q("shared-obligations"),
      q("obligation-shares"),
      q("obligation-payment-request-counts"),
    ];
    expect(countBlockedFamilies(blocked)).toBe(1);
    expect(countBlockedFamilies(blocked) >= MIN_BLOCKED_FOR_NETWORK_WARNING).toBe(false);
  });

  it("un corte de verdad tumba varias familias y sí cruza el umbral", () => {
    // Incidente del 28-07 a las 06:42: ~10 queries abortadas en dos segundos.
    const blocked = [
      q("workspace-snapshot"),
      q("dashboard-movements"),
      q("user-workspaces"),
      q("shared-obligations"),
    ];
    expect(countBlockedFamilies(blocked)).toBe(2);
    expect(countBlockedFamilies(blocked) >= MIN_BLOCKED_FOR_NETWORK_WARNING).toBe(true);
  });

  it("una query desconocida es su propia familia", () => {
    expect(queryFamily(["notification-detection-settings", 1])).toBe("notification-detection-settings");
    expect(countBlockedFamilies([q("shared-obligations"), q("notification-detection-settings")])).toBe(2);
  });
});
