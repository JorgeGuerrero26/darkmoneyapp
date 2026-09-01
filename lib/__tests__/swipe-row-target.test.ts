import { resolveSwipeTarget } from "../swipe-row-target";

const W = 90;
const both = { hasLeftAction: true, hasRightAction: true, revealWidth: W };

describe("dónde queda la fila al soltarla", () => {
  it("un impulso hacia el centro cierra la fila abierta a la izquierda", () => {
    // Reportado el 2026-09-01: en créditos y deudas la fila saltaba de un extremo al otro y no
    // había manera de dejarla en el medio. La velocidad abría el lado contrario aunque el dedo
    // estuviera cerrando.
    expect(resolveSwipeTarget({ ...both, grabbedAt: -W, dx: 40, vx: 1.2, openDir: "left" })).toBe(0);
  });

  it("un impulso hacia el centro cierra la fila abierta a la derecha", () => {
    expect(resolveSwipeTarget({ ...both, grabbedAt: W, dx: -40, vx: -1.2, openDir: "right" })).toBe(0);
  });

  it("desde el centro, un impulso abre el lado hacia el que va el dedo", () => {
    expect(resolveSwipeTarget({ ...both, grabbedAt: 0, dx: 20, vx: 1.2, openDir: null })).toBe(W);
    expect(resolveSwipeTarget({ ...both, grabbedAt: 0, dx: -20, vx: -1.2, openDir: null })).toBe(-W);
  });

  it("sin impulso manda dónde quedó el dedo", () => {
    expect(resolveSwipeTarget({ ...both, grabbedAt: 0, dx: 60, vx: 0.1, openDir: null })).toBe(W);
    expect(resolveSwipeTarget({ ...both, grabbedAt: 0, dx: -60, vx: 0.1, openDir: null })).toBe(-W);
    expect(resolveSwipeTarget({ ...both, grabbedAt: 0, dx: 20, vx: 0.1, openDir: null })).toBe(0);
  });

  it("arrastrar despacio una fila abierta hasta pasar la mitad la cierra", () => {
    expect(resolveSwipeTarget({ ...both, grabbedAt: -W, dx: 50, vx: 0.1, openDir: "left" })).toBe(0);
  });

  it("no abre un lado que no tiene acción", () => {
    const soloDerecha = { hasLeftAction: false, hasRightAction: true, revealWidth: W };
    expect(resolveSwipeTarget({ ...soloDerecha, grabbedAt: 0, dx: 80, vx: 1.5, openDir: null })).toBe(0);
    expect(resolveSwipeTarget({ ...soloDerecha, grabbedAt: 0, dx: -80, vx: -1.5, openDir: null })).toBe(-W);
  });

  it("agarrada a mitad de camino, cuenta desde donde estaba", () => {
    // Con la posición deducida del destino de la animación —0 o ±90— este gesto salía mal.
    expect(resolveSwipeTarget({ ...both, grabbedAt: -45, dx: -10, vx: 0.1, openDir: "left" })).toBe(-W);
  });
});
