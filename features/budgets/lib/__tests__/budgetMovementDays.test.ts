import { buildBudgetMovementDays, budgetMovementsTail } from "../budgetMovementDays";
import type { BudgetContribution } from "../../../../lib/budget-metrics";

const money = (amount: number) => `S/ ${amount.toFixed(2)}`;
const lima = (iso: string) => iso.slice(0, 10);

function mov(description: string, amount: number, date: string): BudgetContribution {
  return {
    movementId: Math.random(),
    occurredAt: `${date}T12:00:00.000Z`,
    movementType: "expense",
    description,
    categoryName: "Alimentación",
    accountName: "Cuenta Principal",
    nativeAmount: amount,
    nativeCurrencyCode: "PEN",
    amountInBudgetCurrency: amount,
    shareOfBudget: 0,
    shareOfSpent: 0,
  };
}

/** Las cifras del mockup BH: 28 movimientos que suman 322.12. */
const BH = [
  mov("Almuerzo", 15, "2026-09-08"),
  mov("Mercado", 86.4, "2026-09-07"),
  mov("Almuerzo", 15, "2026-09-07"),
  mov("Chicle", 1.5, "2026-09-05"),
  mov("Panadería", 8.3, "2026-09-05"),
  mov("Almuerzo", 12, "2026-09-05"),
  ...Array.from({ length: 22 }, (_, i) => mov("Otro", 183.92 / 22, `2026-09-0${(i % 4) + 1}`)),
];

describe("buildBudgetMovementDays", () => {
  it("agrupa por dia con su subtotal: los tres del mockup", () => {
    const { days } = buildBudgetMovementDays(BH, lima, 6);
    expect(days.map((d) => [d.date, Number(d.subtotal.toFixed(2))])).toEqual([
      ["2026-09-08", 15],
      ["2026-09-07", 101.4],
      ["2026-09-05", 21.8],
    ]);
  });

  it("el mercado de 86.40 esta dentro del 101.40 de ayer", () => {
    const { days } = buildBudgetMovementDays(BH, lima, 6);
    const ayer = days.find((d) => d.date === "2026-09-07");
    expect(ayer?.movements.map((m) => m.description)).toEqual(["Mercado", "Almuerzo"]);
  });

  it("la cola cuadra con el total de arriba: 6 visibles + 22 = 28", () => {
    const { days, rest } = buildBudgetMovementDays(BH, lima, 6);
    const visibles = days.reduce((n, d) => n + d.movements.length, 0);
    expect(visibles).toBe(6);
    expect(rest.count).toBe(22);
    expect(Number((rest.amount + days.reduce((s, d) => s + d.subtotal, 0)).toFixed(2))).toBe(322.12);
  });

  it("lo mas reciente primero, aunque llegue desordenado", () => {
    const desordenado = [mov("Viejo", 5, "2026-09-01"), mov("Nuevo", 5, "2026-09-08")];
    const { days } = buildBudgetMovementDays(desordenado, lima, 10);
    expect(days[0].date).toBe("2026-09-08");
  });

  it("si cabe todo, no hay cola", () => {
    const { rest } = buildBudgetMovementDays(BH.slice(0, 3), lima, 10);
    expect(rest).toEqual({ count: 0, amount: 0 });
  });
});

describe("budgetMovementsTail", () => {
  it("dice cuantos quedan y cuanto suman", () => {
    expect(budgetMovementsTail({ count: 22, amount: 183.92 }, money)).toBe("22 movimientos más, S/ 183.92.");
  });

  it("respeta el singular", () => {
    expect(budgetMovementsTail({ count: 1, amount: 6 }, money)).toBe("1 movimiento más, S/ 6.00.");
  });

  it("sin cola no dice nada", () => {
    expect(budgetMovementsTail({ count: 0, amount: 0 }, money)).toBe("");
  });
});
