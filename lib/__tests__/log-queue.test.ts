import { appendBounded, MAX_PENDING_LOGS } from "../log-queue";

describe("appendBounded", () => {
  it("guarda en orden mientras cabe", () => {
    expect(appendBounded([1, 2], 3, 5)).toEqual([1, 2, 3]);
  });

  it("al llenarse tira los mas viejos: el fallo que se investiga es el ultimo", () => {
    expect(appendBounded([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
  });

  it("una cola que ya venia pasada de tope se recorta, no crece", () => {
    expect(appendBounded([1, 2, 3, 4, 5], 6, 3)).toEqual([4, 5, 6]);
  });

  it("no muta la cola que recibe", () => {
    const original = [1, 2];
    appendBounded(original, 3, 2);
    expect(original).toEqual([1, 2]);
  });

  it("el tope por defecto aguanta una rafaga de arranque entera", () => {
    // La del 2026-09-06 fueron once registros en veinte segundos.
    expect(MAX_PENDING_LOGS).toBeGreaterThanOrEqual(11);
  });
});
