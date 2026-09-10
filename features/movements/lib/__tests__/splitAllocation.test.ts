import { allocateSplit, splitBlockingReason, splitStatusLabel } from "../splitAllocation";
import type { SplitLine } from "../split-movement";

const money = (amount: number) => `S/ ${amount.toFixed(2)}`;
const linea = (amount: string, categoryId: number | null = 5): SplitLine => ({ categoryId, amount });

describe("allocateSplit", () => {
  it("el caso del mockup BJ: 62.40 de 86.40 deja 24 por asignar", () => {
    const a = allocateSplit([linea("62.40"), linea("", null)], 86.4);
    expect(a.assigned).toBe(62.4);
    expect(a.remaining).toBe(24);
    expect(Math.round(a.progress * 100)).toBe(72);
    expect(a.balanced).toBe(false);
  });

  it("y el renglon vacio llega propuesto con lo que sobra", () => {
    const a = allocateSplit([linea("62.40"), linea("", null)], 86.4);
    expect(a.proposalIndex).toBe(1);
    expect(a.proposalAmount).toBe("24.00");
  });

  it("BK: cuadrado, sin propuesta y con la barra llena", () => {
    const a = allocateSplit([linea("650.00"), linea("40.00")], 690);
    expect(a.remaining).toBe(0);
    expect(a.progress).toBe(1);
    expect(a.proposalIndex).toBeNull();
    expect(a.balanced).toBe(true);
  });

  it("no propone nada si ya escribiste todos los montos: corregir es cosa tuya", () => {
    const a = allocateSplit([linea("10.00"), linea("20.00")], 86.4);
    expect(a.proposalIndex).toBeNull();
    expect(a.remaining).toBe(56.4);
  });

  it("pasarse da resto negativo y no cuadra", () => {
    const a = allocateSplit([linea("80.00"), linea("20.00")], 86.4);
    expect(a.remaining).toBe(-13.6);
    expect(a.balanced).toBe(false);
  });

  it("recien abierto: nada asignado, la propuesta es el total entero", () => {
    const a = allocateSplit([linea("", null), linea("", null)], 86.4);
    expect(a.assigned).toBe(0);
    expect(a.proposalIndex).toBe(0);
    expect(a.proposalAmount).toBe("86.40");
  });

  it("un centimo de redondeo no impide guardar", () => {
    expect(allocateSplit([linea("28.80"), linea("28.80"), linea("28.80")], 86.4).balanced).toBe(true);
  });
});

describe("splitStatusLabel", () => {
  it("en positivo mientras falta: no regaña, informa", () => {
    const a = allocateSplit([linea("62.40"), linea("", null)], 86.4);
    expect(splitStatusLabel(a, money)).toEqual({ label: "Falta asignar", value: "S/ 24.00", tone: "pending" });
  });

  it("cuadrado lo dice y enseña el cero", () => {
    const a = allocateSplit([linea("650.00"), linea("40.00")], 690);
    expect(splitStatusLabel(a, money)).toEqual({ label: "Todo asignado", value: "S/ 0.00", tone: "done" });
  });

  it("pasado dice por cuanto", () => {
    const a = allocateSplit([linea("100.00"), linea("20.00")], 86.4);
    expect(splitStatusLabel(a, money)).toMatchObject({ label: "Te pasaste por", tone: "over" });
  });
});

describe("splitBlockingReason", () => {
  it("recien abierto ya tiene motivo, pero solo se enseña al intentar guardar", () => {
    const lines = [linea("", null), linea("", null)];
    expect(splitBlockingReason(lines, allocateSplit(lines, 86.4))).toBe("Ponle un monto a cada categoría.");
  });

  it("con montos pero sin categoria, lo dice", () => {
    const lines = [linea("62.40", null), linea("24.00", null)];
    expect(splitBlockingReason(lines, allocateSplit(lines, 86.4))).toBe("Elige la categoría de cada parte.");
  });

  it("cuadrado no bloquea", () => {
    const lines = [linea("62.40"), linea("24.00", 9)];
    expect(splitBlockingReason(lines, allocateSplit(lines, 86.4))).toBeNull();
  });
});
