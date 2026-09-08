import type { BudgetContribution } from "../../../lib/budget-metrics";

export type BudgetMovementDay = {
  /** `yyyy-MM-dd` en hora de Lima. */
  date: string;
  /** Lo que se gastó ese día contra este presupuesto. */
  subtotal: number;
  movements: BudgetContribution[];
};

export type BudgetMovementList = {
  days: BudgetMovementDay[];
  /** Lo que queda por debajo de lo que se muestra, dicho con sus cifras. */
  rest: { count: number; amount: number };
};

/**
 * Los movimientos del presupuesto, agrupados por día y con subtotal.
 *
 * **Los subtotales por día son lo que distingue esta lista de Movimientos.** La pregunta aquí no
 * es qué pasó, es qué llenó el presupuesto: "Ayer, 101.40" lo señala en una pasada, con el
 * mercado de 86.40 dentro. La lista general no los lleva porque allí la pregunta es otra.
 *
 * **Y la cola es explícita.** "22 movimientos más, S/ 183.92" son cifras que cuadran con el
 * total de arriba: 322.12 sobre 28 filas. Un número que crece al desplazarse no se puede
 * comprobar contra nada — es el defecto que tenía el neto de Movimientos.
 */
export function buildBudgetMovementDays(
  contributions: BudgetContribution[],
  toLimaDate: (iso: string) => string,
  visibleCount: number,
): BudgetMovementList {
  const ordered = [...contributions].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const visible = ordered.slice(0, visibleCount);
  const hidden = ordered.slice(visibleCount);

  const byDay = new Map<string, BudgetMovementDay>();
  for (const contribution of visible) {
    const date = toLimaDate(contribution.occurredAt);
    const day = byDay.get(date);
    if (day) {
      day.movements.push(contribution);
      day.subtotal += contribution.amountInBudgetCurrency;
    } else {
      byDay.set(date, {
        date,
        subtotal: contribution.amountInBudgetCurrency,
        movements: [contribution],
      });
    }
  }

  return {
    days: [...byDay.values()],
    rest: {
      count: hidden.length,
      amount: hidden.reduce((sum, item) => sum + item.amountInBudgetCurrency, 0),
    },
  };
}

/**
 * "22 movimientos más, S/ 183.92." — vacío cuando ya está todo a la vista.
 */
export function budgetMovementsTail(
  rest: { count: number; amount: number },
  formatAmount: (value: number) => string,
): string {
  if (rest.count <= 0) return "";
  const movimientos = rest.count === 1 ? "1 movimiento más" : `${rest.count} movimientos más`;
  return `${movimientos}, ${formatAmount(rest.amount)}.`;
}
