import { buildBridgeSegments } from "../features/dashboard/components/advanced/bridge-rows";

/**
 * Rediseño fase 4 — el puente de cierre tiene que leerse como un recorrido.
 *
 * Antes las cuatro barras salían del mismo eje central, así que no contaban cómo se pasa del
 * saldo de hoy al cierre esperado: parecían cuatro datos sueltos. Un puente solo funciona si
 * cada tramo arranca donde acabó el anterior.
 *
 * Es geometría de una cifra de dinero, así que se prueba: una barra mal colocada le dice al
 * usuario que va a cerrar el mes mejor o peor de lo que va a cerrar.
 */
const rows = [
  { key: "hoy", label: "Saldo visible hoy", amount: 4703.4, kind: "total" as const },
  { key: "agenda", label: "Agenda comprometida", amount: 0, kind: "delta" as const },
  { key: "ritmo", label: "Ritmo variable", amount: 687.24, kind: "delta" as const },
  { key: "cierre", label: "Cierre esperado", amount: 5390.64, kind: "total" as const },
];

describe("puente de cierre", () => {
  it("cada tramo arranca donde acabo el anterior", () => {
    const [hoy, , ritmo] = buildBridgeSegments(rows);
    // El ritmo variable empieza justo donde termina el saldo de hoy (la agenda no mueve nada).
    expect(ritmo.left).toBeCloseTo(hoy.left + hoy.width, 5);
  });

  it("el cierre esperado cae donde termina el ultimo tramo", () => {
    const segments = buildBridgeSegments(rows);
    const ritmo = segments[2];
    const cierre = segments[3];
    expect(cierre.left + cierre.width).toBeCloseTo(ritmo.left + ritmo.width, 5);
  });

  it("todas las filas comparten la misma posicion del cero", () => {
    const zeros = new Set(buildBridgeSegments(rows).map((s) => s.zero.toFixed(6)));
    expect(zeros.size).toBe(1);
  });

  it("un tramo que resta queda marcado y se dibuja a la izquierda del anterior", () => {
    const conGasto = [
      { key: "hoy", label: "Saldo", amount: 1000, kind: "total" as const },
      { key: "agenda", label: "Agenda", amount: -400, kind: "delta" as const },
    ];
    const [hoy, agenda] = buildBridgeSegments(conGasto);
    expect(agenda.negative).toBe(true);
    expect(agenda.left).toBeLessThan(hoy.left + hoy.width);
    expect(agenda.left + agenda.width).toBeCloseTo(hoy.left + hoy.width, 5);
  });

  it("con saldos negativos el cero deja de estar pegado al borde", () => {
    const enRojo = [
      { key: "hoy", label: "Saldo", amount: -500, kind: "total" as const },
      { key: "cierre", label: "Cierre", amount: 500, kind: "total" as const },
    ];
    const [seg] = buildBridgeSegments(enRojo);
    expect(seg.zero).toBeGreaterThan(0);
    expect(seg.zero).toBeLessThan(100);
  });

  it("un tramo de cero sigue siendo visible", () => {
    const segments = buildBridgeSegments(rows);
    for (const s of segments) expect(s.width).toBeGreaterThan(0);
  });

  it("ninguna barra se sale de la pista", () => {
    for (const s of buildBridgeSegments(rows)) {
      expect(s.left).toBeGreaterThanOrEqual(0);
      expect(s.left + s.width).toBeLessThanOrEqual(100.001);
    }
  });
});
